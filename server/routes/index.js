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

module.exports = router;
