'use strict';
/**
 * روت‌های کاربر: جست‌وجو، پروفایل، آواتار، رمز عبور و تنظیمات
 * ⚠️ ترتیب روت‌ها مهم است: روت‌های /me باید قبل از /:idOrName تعریف شوند.
 */
const router = require('../middleware/router')();
const bcrypt = require('bcryptjs');
const multer = require('multer');
const db = require('../db');
const config = require('../config');
const { HttpError } = require('../middleware/error');
const { requireAuth } = require('../middleware/auth');
const { shapeUser, q, getOrCreateDM } = require('../utils/chat');
const { cleanText, slugifyUsername, isValidUsername } = require('../utils/helpers');
const { safeStoredName, isBlocked, deleteUpload } = require('../utils/files');


/* ------------------------- آپلودگر آواتار ------------------------- */
const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, config.UPLOAD_DIR),
    filename: (_req, file, cb) => cb(null, safeStoredName(file.originalname)),
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // ۵ مگابایت
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new HttpError(400, 'فقط تصویر مجاز است.'));
    if (isBlocked(file.originalname)) return cb(new HttpError(400, 'این نوع فایل مجاز نیست.'));
    cb(null, true);
  },
});

/* ---------------------------- جست‌وجو ----------------------------- */
router.get('/search', requireAuth, (req, res) => {
  const term = cleanText(req.query.q, 64);
  if (term.length < 1) return res.json({ users: [], chats: [] });

  const like = `%${term}%`;
  const uname = slugifyUsername(term).replace(/^@/, '');

  const users = db.prepare(`
    SELECT id, username, name, bio, avatar, is_verified, last_seen
    FROM users
    WHERE id != ? AND (username LIKE ? OR name LIKE ?)
    ORDER BY (username = ?) DESC, name ASC
    LIMIT 25`).all(req.user.id, `%${uname}%`, like, uname);

  const chats = db.prepare(`
    SELECT c.*, (SELECT COUNT(*) FROM chat_members m WHERE m.chat_id = c.id) AS mc
    FROM chats c
    WHERE c.type IN ('group','channel') AND c.is_public = 1
      AND (c.title LIKE ? OR c.about LIKE ? OR c.invite_code = ?)
    ORDER BY mc DESC LIMIT 15`).all(like, like, cleanText(term, 32));

  res.json({
    users: users.map((u) => shapeUser(u, req.user.id)),
    chats: chats.map((c) => ({
      id: c.id, type: c.type, title: c.title, about: c.about,
      avatar: c.avatar, memberCount: c.mc, inviteCode: c.invite_code, isPublic: !!c.is_public,
    })),
  });
});

/* ---------------------- پروفایل خودم ---------------------- */
router.patch('/me/profile', requireAuth, (req, res) => {
  const { name, bio, username } = req.body || {};
  const user = req.user;

  if (name !== undefined) {
    const n = cleanText(name, 64);
    if (n.length < 2) throw new HttpError(400, 'نام باید حداقل ۲ کاراکتر باشد.');
    db.prepare('UPDATE users SET name = ? WHERE id = ?').run(n, user.id);
  }
  if (bio !== undefined) db.prepare('UPDATE users SET bio = ? WHERE id = ?').run(cleanText(bio, 200), user.id);
  if (username !== undefined) {
    const u = slugifyUsername(username);
    if (!isValidUsername(u)) throw new HttpError(400, 'نام کاربری نامعتبر است (۴-۳۲ کاراکتر انگلیسی/عدد/_).');
    const dup = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(u, user.id);
    if (dup) throw new HttpError(409, 'این نام کاربری گرفته شده است.');
    db.prepare('UPDATE users SET username = ? WHERE id = ?').run(u, user.id);
  }

  const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  res.json({ user: shapeUser(fresh, fresh.id) });
});

router.post('/me/avatar', requireAuth, avatarUpload.single('avatar'), (req, res) => {
  if (!req.file) throw new HttpError(400, 'فایلی ارسال نشد.');
  const old = req.user.avatar;
  db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(req.file.filename, req.user.id);
  if (old) deleteUpload(old);
  const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({ user: shapeUser(fresh, fresh.id) });
});

router.delete('/me/avatar', requireAuth, (req, res) => {
  if (req.user.avatar) deleteUpload(req.user.avatar);
  db.prepare('UPDATE users SET avatar = NULL WHERE id = ?').run(req.user.id);
  res.json({ ok: true });
});

router.post('/me/password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!newPassword || String(newPassword).length < 6) throw new HttpError(400, 'رمز جدید باید حداقل ۶ کاراکتر باشد.');
  const ok = await bcrypt.compare(String(currentPassword || ''), req.user.password_hash);
  if (!ok) throw new HttpError(401, 'رمز عبور فعلی اشتباه است.');
  const hash = await bcrypt.hash(String(newPassword), 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.user.id);
  res.json({ ok: true });
});

router.put('/me/settings', requireAuth, (req, res) => {
  let current = {};
  try { current = JSON.parse(req.user.settings || '{}'); } catch {}
  const allowed = ['theme', 'lang', 'fontSize', 'enterToSend', 'notifications', 'sound', 'showTyping', 'wallpaper', 'compact'];
  const next = { ...current };
  for (const k of allowed) if (req.body[k] !== undefined) next[k] = req.body[k];
  db.prepare('UPDATE users SET settings = ? WHERE id = ?').run(JSON.stringify(next), req.user.id);
  res.json({ settings: next });
});

/* --------------------- پروفایل دیگران ---------------------- */
router.get('/:idOrName', requireAuth, (req, res) => {
  const key = String(req.params.idOrName).replace(/^@/, '');
  const isNum = /^\d+$/.test(key);
  const user = isNum
    ? db.prepare('SELECT id, username, name, bio, avatar, is_verified, last_seen FROM users WHERE id = ?').get(key)
    : db.prepare('SELECT id, username, name, bio, avatar, is_verified, last_seen FROM users WHERE username = ?').get(key);
  if (!user) throw new HttpError(404, 'کاربر پیدا نشد.');

  const common = db.prepare(`
    SELECT c.* FROM chats c
    JOIN chat_members m1 ON m1.chat_id = c.id AND m1.user_id = ?
    JOIN chat_members m2 ON m2.chat_id = c.id AND m2.user_id = ?
    WHERE c.type IN ('group','channel') LIMIT 20`).all(req.user.id, user.id);

  res.json({
    user: shapeUser(user, req.user.id),
    commonChats: common.map((c) => ({
      id: c.id, type: c.type, title: c.title, avatar: c.avatar,
      memberCount: q.memberCount.get(c.id).c,
    })),
  });
});

/* ---------------- شروع چت خصوصی با یک کاربر ---------------- */
router.post('/:id/dm', requireAuth, (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  if (!targetId || targetId === req.user.id) throw new HttpError(400, 'کاربر نامعتبر است.');
  const target = q.userPublic.get(targetId);
  if (!target) throw new HttpError(404, 'کاربر پیدا نشد.');
  const chat = getOrCreateDM(req.user.id, targetId);
  const { shapeChat } = require('../utils/chat');
  res.json({ chat: shapeChat(chat, req.user.id) });
});

module.exports = router;
