'use strict';
/** روت‌های احراز هویت: ثبت‌نام، ورود، خروج و مدیریت نشست‌ها */
const router = require('../middleware/router')();
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const db = require('../db');
const config = require('../config');
const { HttpError } = require('../middleware/error');
const { requireAuth, setAuthCookie, clearAuthCookie } = require('../middleware/auth');
const { signToken, slugifyUsername, isValidUsername, cleanText } = require('../utils/helpers');
const { shapeUser } = require('../utils/chat');


const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'تعداد تلاش‌ها بیش از حد مجاز است. چند دقیقه صبر کنید.' },
});

function makeSession(userId, device, ip) {
  const sid = crypto.randomBytes(12).toString('hex');
  db.prepare('INSERT INTO sessions (id, user_id, device, ip, created_at) VALUES (?,?,?,?,?)')
    .run(sid, userId, device || 'Web', ip || '', Date.now());
  return sid;
}

function deviceFromUA(ua = '') {
  if (/mobile|android|iphone|ipad/i.test(ua)) return 'موبایل — مرورگر';
  if (/windows/i.test(ua)) return 'ویندوز — مرورگر';
  if (/macintosh|mac os/i.test(ua)) return 'مک — مرورگر';
  if (/linux/i.test(ua)) return 'لینوکس — مرورگر';
  return 'دستگاه ناشناس';
}

/* ------------------------------- ثبت‌نام ------------------------------- */
router.post('/register', authLimiter, async (req, res) => {
  if (!config.ALLOW_SIGNUP) throw new HttpError(403, 'ثبت‌نام در این سرویس بسته است.');

  const { name, username, phone, password } = req.body || {};
  const cleanName = cleanText(name, 64);
  const uname = slugifyUsername(username || '');

  if (cleanName.length < 2) throw new HttpError(400, 'نام باید حداقل ۲ کاراکتر باشد.');
  if (!uname) throw new HttpError(400, 'نام کاربری الزامی است.');
  if (!isValidUsername(uname)) throw new HttpError(400, 'نام کاربری باید ۴ تا ۳۲ کاراکتر انگلیسی، عدد یا _ باشد.');
  if (!password || String(password).length < 6) throw new HttpError(400, 'رمز عبور باید حداقل ۶ کاراکتر باشد.');

  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(uname);
  if (exists) throw new HttpError(409, 'این نام کاربری قبلاً گرفته شده است.');

  if (phone) {
    const p = cleanText(phone, 20);
    const dup = db.prepare('SELECT id FROM users WHERE phone = ?').get(p);
    if (dup) throw new HttpError(409, 'این شماره قبلاً ثبت شده است.');
  }

  const hash = await bcrypt.hash(String(password), 10);
  const info = db.prepare(`INSERT INTO users (username, phone, password_hash, name, created_at)
                           VALUES (?,?,?,?,?)`)
    .run(uname, phone ? cleanText(phone, 20) : null, hash, cleanName, Date.now());

  const userId = info.lastInsertRowid;
  const sid = makeSession(userId, deviceFromUA(req.headers['user-agent']), req.ip);
  const token = signToken({ uid: userId, sid }, config.JWT_SECRET, 30);
  setAuthCookie(res, token);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  res.json({ token, user: shapeUser(user, userId) });
});

/* -------------------------------- ورود -------------------------------- */
router.post('/login', authLimiter, async (req, res) => {
  const { identifier, password } = req.body || {};
  const id = cleanText(identifier, 64);
  if (!id || !password) throw new HttpError(400, 'نام کاربری/شماره و رمز عبور الزامی است.');

  const unameGuess = slugifyUsername(id);
  const user = db.prepare(`SELECT * FROM users
                           WHERE username = ? OR phone = ? OR username = ? LIMIT 1`)
    .get(unameGuess, id, id.replace(/^@/, ''));

  const ok = user && (await bcrypt.compare(String(password), user.password_hash));
  if (!ok) throw new HttpError(401, 'نام کاربری یا رمز عبور اشتباه است.');

  const sid = makeSession(user.id, deviceFromUA(req.headers['user-agent']), req.ip);
  const token = signToken({ uid: user.id, sid }, config.JWT_SECRET, 30);
  setAuthCookie(res, token);

  res.json({ token, user: shapeUser(user, user.id) });
});

/* -------------------------------- خروج -------------------------------- */
router.post('/logout', requireAuth, (req, res) => {
  if (req.sessionId) db.prepare('DELETE FROM sessions WHERE id = ?').run(req.sessionId);
  clearAuthCookie(res);
  res.json({ ok: true });
});

/* ---------------------------- کاربر فعلی ------------------------------ */
router.get('/me', requireAuth, (req, res) => {
  const u = shapeUser(req.user, req.user.id);
  let settings = {};
  try { settings = JSON.parse(req.user.settings || '{}'); } catch {}
  res.json({ user: u, settings });
});

/* --------------------------- نشست‌های فعال ---------------------------- */
router.get('/sessions', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT id, device, ip, created_at FROM sessions WHERE user_id = ? ORDER BY created_at DESC')
    .all(req.user.id);
  res.json({
    sessions: rows.map((r) => ({ ...r, current: r.id === req.sessionId })),
  });
});

router.delete('/sessions/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM sessions WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

router.delete('/sessions', requireAuth, (req, res) => {
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').run(req.user.id, req.sessionId || '');
  res.json({ ok: true });
});

module.exports = router;
