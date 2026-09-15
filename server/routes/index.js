'use strict';
/** روت‌های متفرقه: سلامت سرویس، آمار، تنظیمات عمومی */
const router = require('../middleware/router')();
const db = require('../db');
const config = require('../config');
const { requireAuth } = require('../middleware/auth');
const { shapeChat, shapeUser } = require('../utils/chat');


router.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), version: config.VERSION, time: Date.now() });
});

router.get('/config', (_req, res) => {
  res.json({
    appName: config.APP_NAME,
    version: config.VERSION,
    maxUploadMB: config.MAX_UPLOAD_MB,
    allowSignup: config.ALLOW_SIGNUP,
    publicUrl: config.PUBLIC_URL,
  });
});

router.get('/stats', requireAuth, (_req, res) => {
  res.json({
    users: db.prepare('SELECT COUNT(*) c FROM users').get().c,
    chats: db.prepare('SELECT COUNT(*) c FROM chats').get().c,
    messages: db.prepare('SELECT COUNT(*) c FROM messages').get().c,
  });
});

/** چت‌های عمومی پیشنهادی برای کاربران تازه‌وارد */
router.get('/explore', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT c.*, (SELECT COUNT(*) FROM chat_members m WHERE m.chat_id = c.id) AS mc
    FROM chats c WHERE c.is_public = 1 AND c.type IN ('group','channel')
    ORDER BY mc DESC, c.id DESC LIMIT 30`).all();
  res.json({ chats: rows.map((c) => ({
    id: c.id, type: c.type, title: c.title, about: c.about, avatar: c.avatar,
    memberCount: c.mc, inviteCode: c.invite_code, isPublic: true,
    joined: !!db.prepare('SELECT 1 FROM chat_members WHERE chat_id=? AND user_id=?').get(c.id, req.user.id),
  })) });
});

/** مخاطبین ذخیره‌شده */
router.get('/contacts', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT u.id, u.username, u.name, u.bio, u.avatar, u.is_verified, u.last_seen
    FROM contacts ct JOIN users u ON u.id = ct.contact_id
    WHERE ct.user_id = ? ORDER BY u.name`).all(req.user.id);
  res.json({ contacts: rows.map((u) => shapeUser(u, req.user.id)) });
});

router.post('/contacts', requireAuth, (req, res) => {
  const uid = parseInt(req.body.userId, 10);
  if (!uid || uid === req.user.id) return res.status(400).json({ error: 'کاربر نامعتبر' });
  db.prepare('INSERT OR IGNORE INTO contacts (user_id, contact_id, created_at) VALUES (?,?,?)')
    .run(req.user.id, uid, Date.now());
  res.json({ ok: true });
});

router.delete('/contacts/:userId', requireAuth, (req, res) => {
  db.prepare('DELETE FROM contacts WHERE user_id = ? AND contact_id = ?')
    .run(req.user.id, parseInt(req.params.userId, 10));
  res.json({ ok: true });
});

/** صفحه‌ی مدیر: list کامل ثبت‌نام‌کننده‌ها — فقط با توکن ADMIN_TOKEN */
router.get('/admin', (req, res) => {
  const token = process.env.ADMIN_TOKEN || '';
  if (!token || String(req.query.token || '') !== token) {
    return res.status(403).type('text/plain; charset=utf-8').send('دسترسی ممنوع — توکن مدیر لازم است');
  }
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const users = db.prepare('SELECT id, name, username, phone, created_at FROM users ORDER BY id').all();
  const chats = db.prepare('SELECT COUNT(*) c FROM chats').get().c;
  const messages = db.prepare('SELECT COUNT(*) c FROM messages').get().c;
  const fmt = (t) => { try { const d = new Date(t); return d.toLocaleDateString('fa-IR') + ' ' + d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }); } catch { return '—'; } };
  const rows = users.map((u) =>
    `<tr><td>${u.id}</td><td><b>${esc(u.name)}</b></td><td dir="ltr">@${esc(u.username)}</td><td dir="ltr">${esc(u.phone) || '—'}</td><td>${fmt(u.created_at)}</td></tr>`).join('');
  res.type('html').send(`<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>پنل مدیر — رهام گرام</title>
<style>body{font-family:system-ui,sans-serif;background:#0f141a;color:#e8edf2;margin:0;padding:24px;line-height:1.8}
h1{font-size:20px}.cards{display:flex;gap:12px;flex-wrap:wrap;margin:16px 0}.card{background:#1c2733;border-radius:12px;padding:12px 22px;text-align:center}
.card b{display:block;font-size:26px;color:#7cc0ff}table{width:100%;border-collapse:collapse;background:#1c2733;border-radius:12px;overflow:hidden}
th,td{padding:10px 14px;text-align:right;border-bottom:1px solid #2a3a4a;font-size:14px}th{background:#223140}</style></head><body>
<h1>🛡️ پنل مدیر — رهام گرام</h1>
<div class="cards"><div class="card"><b>${users.length}</b>کاربر ثبت‌نام‌شده</div><div class="card"><b>${chats}</b>چت/گروه/کانال</div><div class="card"><b>${messages}</b>پیام</div></div>
<table><tr><th>#</th><th>نام</th><th>نام کاربری</th><th>شماره</th><th>تاریخ ثبت‌نام</th></tr>${rows}</table>
</body></html>`);
});

module.exports = router;
