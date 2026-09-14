'use strict';
/**
 * روت‌های چت: لیست، ساخت گروه/کانال، عضویت، مدیریت اعضا، پین، بی‌صدا کردن، جست‌وجو
 */
const router = require('../middleware/router')();
const multer = require('multer');
const db = require('../db');
const config = require('../config');
const { HttpError } = require('../middleware/error');
const { requireAuth } = require('../middleware/auth');
const {
  shapeChat, shapeMessage, shapeUser, q, isMember, canManage,
  addMember, removeMember, memberIds, systemMessage,
} = require('../utils/chat');
const { cleanText, inviteCode } = require('../utils/helpers');
const { safeStoredName, isBlocked, deleteUpload } = require('../utils/files');
const { emitToChat } = require('../utils/emitter');


const chatAvatarUpload = multer({
  storage: multer.diskStorage({
    destination: (_r, _f, cb) => cb(null, config.UPLOAD_DIR),
    filename: (_r, f, cb) => cb(null, safeStoredName(f.originalname)),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_r, f, cb) => {
    if (!f.mimetype.startsWith('image/') || isBlocked(f.originalname)) return cb(new HttpError(400, 'فقط تصویر مجاز است.'));
    cb(null, true);
  },
});

/** دسترسی به چت + بررسی عضویت */
function loadChat(req) {
  const chatId = parseInt(req.params.id, 10);
  if (!chatId) throw new HttpError(400, 'شناسه‌ی چت نامعتبر است.');
  const chat = q.chatById.get(chatId);
  if (!chat) throw new HttpError(404, 'چت پیدا نشد.');
  if (!isMember(chatId, req.user.id) && !(chat.is_public && chat.type !== 'dm')) {
    throw new HttpError(403, 'شما عضو این چت نیستید.');
  }
  return chat;
}

/* ------------------------- لیست چت‌های من ------------------------- */
router.get('/', requireAuth, (req, res) => {
  const chats = db.prepare(`
    SELECT c.* FROM chats c
    JOIN chat_members m ON m.chat_id = c.id AND m.user_id = ?
    ORDER BY c.id DESC LIMIT 500`).all(req.user.id);

  const shaped = chats.map((c) => shapeChat(c, req.user.id));
  shaped.sort((a, b) => (b.lastActivity || 0) - (a.lastActivity || 0));
  res.json({ chats: shaped });
});

/* --------------------- ساخت گروه یا کانال ------------------------ */
router.post('/create', requireAuth, (req, res) => {
  const { type, title, about, memberIds: ids, isPublic } = req.body || {};
  const chatType = type === 'channel' ? 'channel' : 'group';
  const t = cleanText(title, 64);
  if (t.length < 2) throw new HttpError(400, 'عنوان باید حداقل ۲ کاراکتر باشد.');

  const now = Date.now();
  const info = db.prepare(`INSERT INTO chats (type, title, about, invite_code, created_by, is_public, created_at)
                           VALUES (?,?,?,?,?,?,?)`)
    .run(chatType, t, cleanText(about, 200), inviteCode(), req.user.id, isPublic ? 1 : 0, now);
  const chatId = info.lastInsertRowid;

  addMember(chatId, req.user.id, 'owner');

  const added = [];
  for (const raw of Array.isArray(ids) ? ids.slice(0, 200) : []) {
    const uid = parseInt(raw, 10);
    if (!uid || uid === req.user.id) continue;
    const u = q.userPublic.get(uid);
    if (!u) continue;
    addMember(chatId, uid, 'member');
    added.push(u);
  }

  if (added.length) {
    systemMessage(chatId, `${req.user.name} گروه را ساخت و ${added.length} نفر را اضافه کرد`);
  } else {
    systemMessage(chatId, `${req.user.name} ${chatType === 'channel' ? 'کانال' : 'گروه'} را ساخت`);
  }

  const chat = q.chatById.get(chatId);
  emitToChat(chatId, 'chat:created', { chat: shapeChat(chat, req.user.id) }, memberIds(chatId));
  res.json({ chat: shapeChat(chat, req.user.id) });
});

/* ------------------- پیام‌های ذخیره‌شده (چت با خود) ------------------- */
router.get('/saved', requireAuth, (req, res) => {
  const now = Date.now();
  let chat = db.prepare(`SELECT c.* FROM chats c
                         JOIN chat_members m ON m.chat_id = c.id AND m.user_id = ?
                         WHERE c.is_saved = 1 LIMIT 1`).get(req.user.id);
  if (!chat) {
    const info = db.prepare(`INSERT INTO chats (type, title, created_by, is_saved, created_at)
                             VALUES ('dm', 'پیام‌های ذخیره‌شده', ?, 1, ?)`).run(req.user.id, now);
    addMember(info.lastInsertRowid, req.user.id, 'owner');
    systemMessage(info.lastInsertRowid, 'اینجا می‌توانید پیام‌ها، فایل‌ها و یادداشت‌های خود را ذخیره کنید.');
    chat = q.chatById.get(info.lastInsertRowid);
  }
  res.json({ chat: shapeChat(chat, req.user.id) });
});

/* ------------------- پیوستن با لینک/کد دعوت ------------------- */
router.post('/join/:code', requireAuth, (req, res) => {
  const code = cleanText(req.params.code, 64).replace(/^.*\//, '').replace(/[^A-Za-z0-9_-]/g, '');
  const chat = db.prepare('SELECT * FROM chats WHERE invite_code = ?').get(code);
  if (!chat) throw new HttpError(404, 'لینک دعوت معتبر نیست.');
  if (chat.type === 'dm') throw new HttpError(400, 'این لینک برای چت خصوصی است.');
  if (isMember(chat.id, req.user.id)) return res.json({ chat: shapeChat(chat, req.user.id), already: true });

  addMember(chat.id, req.user.id, 'member');
  const msg = systemMessage(chat.id, `${req.user.name} به ${chat.type === 'channel' ? 'کانال' : 'گروه'} پیوست`);
  emitToChat(chat.id, 'chat:memberAdded', {
    chatId: chat.id,
    member: shapeUser(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id), req.user.id),
    memberCount: q.memberCount.get(chat.id).c,
    message: shapeMessage(msg, req.user.id),
  }, memberIds(chat.id));
  res.json({ chat: shapeChat(q.chatById.get(chat.id), req.user.id) });
});

/* ------------------------ جزئیات یک چت ------------------------ */
router.get('/:id', requireAuth, (req, res) => {
  const chat = loadChat(req);
  res.json({ chat: shapeChat(chat, req.user.id) });
});

/* -------------------------- لیست اعضا -------------------------- */
router.get('/:id/members', requireAuth, (req, res) => {
  const chat = loadChat(req);
  const rows = q.members.all(chat.id);
  res.json({
    members: rows.map((m) => ({
      ...shapeUser(m, req.user.id),
      role: m.role,
      muted: !!m.muted,
      joinedAt: m.joined_at,
    })),
  });
});

/* ----------------------- افزودن عضو --------------------------- */
router.post('/:id/members', requireAuth, (req, res) => {
  const chat = loadChat(req);
  if (chat.type === 'dm') throw new HttpError(400, 'به چت خصوصی نمی‌توان عضو اضافه کرد.');
  if (!canManage(chat.id, req.user.id) && chat.type === 'channel') {
    throw new HttpError(403, 'فقط مدیران می‌توانند عضو اضافه کنند.');
  }
  const uid = parseInt(req.body.userId, 10);
  const target = q.userPublic.get(uid);
  if (!target) throw new HttpError(404, 'کاربر پیدا نشد.');
  if (isMember(chat.id, uid)) throw new HttpError(409, 'این کاربر قبلاً عضو است.');

  addMember(chat.id, uid, 'member');
  const msg = systemMessage(chat.id, `${req.user.name}، ${target.name} را اضافه کرد`);
  emitToChat(chat.id, 'chat:memberAdded', {
    chatId: chat.id, member: shapeUser(target, req.user.id),
    memberCount: q.memberCount.get(chat.id).c,
    message: shapeMessage(msg, uid),
  }, memberIds(chat.id));
  res.json({ ok: true, member: shapeUser(target, req.user.id) });
});

/* ----------------------- حذف عضو / ترک ------------------------ */
router.delete('/:id/members/:userId', requireAuth, (req, res) => {
  const chat = loadChat(req);
  const uid = parseInt(req.params.userId, 10);
  const me = q.member.get(chat.id, req.user.id);
  const target = q.member.get(chat.id, uid);
  if (!target) throw new HttpError(404, 'عضو پیدا نشد.');

  const isSelf = uid === req.user.id;
  if (!isSelf) {
    if (!canManage(chat.id, req.user.id)) throw new HttpError(403, 'اجازه‌ی حذف این عضو را ندارید.');
    if (target.role === 'owner') throw new HttpError(403, 'مالک چت قابل حذف نیست.');
    if (target.role === 'admin' && me.role !== 'owner') throw new HttpError(403, 'فقط مالک می‌تواند مدیر را حذف کند.');
  }
  if (target.role === 'owner' && isSelf) {
    // مالک قبل از ترک باید مالکیت را واگذار کند
    const admins = db.prepare(`SELECT user_id FROM chat_members WHERE chat_id = ? AND role != 'owner' LIMIT 1`).all(chat.id);
    if (admins.length) db.prepare(`UPDATE chat_members SET role='owner' WHERE chat_id=? AND user_id=?`).run(chat.id, admins[0].user_id);
  }

  const targetUser = q.userPublic.get(uid);
  removeMember(chat.id, uid);
  const msg = systemMessage(chat.id, isSelf
    ? `${targetUser ? targetUser.name : 'کاربر'} چت را ترک کرد`
    : `${req.user.name}، ${targetUser ? targetUser.name : 'کاربر'} را حذف کرد`);
  emitToChat(chat.id, 'chat:memberRemoved', {
    chatId: chat.id, userId: uid, memberCount: q.memberCount.get(chat.id).c,
    message: shapeMessage(msg, req.user.id),
  }, memberIds(chat.id));
  res.json({ ok: true });
});

/* ----------------------- تغییر نقش عضو ------------------------ */
router.patch('/:id/members/:userId/role', requireAuth, (req, res) => {
  const chat = loadChat(req);
  const uid = parseInt(req.params.userId, 10);
  const role = ['admin', 'member'].includes(req.body.role) ? req.body.role : null;
  if (!role) throw new HttpError(400, 'نقش نامعتبر است.');
  const me = q.member.get(chat.id, req.user.id);
  if (me.role !== 'owner') throw new HttpError(403, 'فقط مالک چت می‌تواند نقش‌ها را تغییر دهد.');
  const target = q.member.get(chat.id, uid);
  if (!target) throw new HttpError(404, 'عضو پیدا نشد.');
  if (target.role === 'owner') throw new HttpError(403, 'نقش مالک قابل تغییر نیست.');

  db.prepare('UPDATE chat_members SET role = ? WHERE chat_id = ? AND user_id = ?').run(role, chat.id, uid);
  emitToChat(chat.id, 'chat:updated', { chat: shapeChat(q.chatById.get(chat.id), uid) }, memberIds(chat.id));
  res.json({ ok: true });
});

/* ------------------- واگذاری مالکیت گروه --------------------- */
router.post('/:id/transfer', requireAuth, (req, res) => {
  const chat = loadChat(req);
  const me = q.member.get(chat.id, req.user.id);
  if (me.role !== 'owner') throw new HttpError(403, 'فقط مالک می‌تواند مالکیت را واگذار کند.');
  const uid = parseInt(req.body.userId, 10);
  const target = q.member.get(chat.id, uid);
  if (!target) throw new HttpError(404, 'عضو پیدا نشد.');

  const tx = db.transaction(() => {
    db.prepare(`UPDATE chat_members SET role='admin' WHERE chat_id=? AND user_id=?`).run(chat.id, req.user.id);
    db.prepare(`UPDATE chat_members SET role='owner' WHERE chat_id=? AND user_id=?`).run(chat.id, uid);
    db.prepare('UPDATE chats SET created_by = ? WHERE id = ?').run(uid, chat.id);
  });
  tx();
  const targetUser = q.userPublic.get(uid);
  const msg = systemMessage(chat.id, `مالکیت به ${targetUser ? targetUser.name : 'کاربر'} واگذار شد`);
  emitToChat(chat.id, 'chat:updated', {
    chat: shapeChat(q.chatById.get(chat.id), uid),
    message: shapeMessage(msg, req.user.id),
  }, memberIds(chat.id));
  res.json({ ok: true });
});

/* ------------------- ویرایش اطلاعات چت ---------------------- */
router.patch('/:id', requireAuth, (req, res) => {
  const chat = loadChat(req);
  if (!canManage(chat.id, req.user.id)) throw new HttpError(403, 'فقط مدیران می‌توانند اطلاعات چت را ویرایش کنند.');
  const { title, about, isPublic } = req.body || {};

  if (title !== undefined) {
    const t = cleanText(title, 64);
    if (t.length < 2) throw new HttpError(400, 'عنوان باید حداقل ۲ کاراکتر باشد.');
    db.prepare('UPDATE chats SET title = ? WHERE id = ?').run(t, chat.id);
  }
  if (about !== undefined) db.prepare('UPDATE chats SET about = ? WHERE id = ?').run(cleanText(about, 200), chat.id);
  if (isPublic !== undefined) db.prepare('UPDATE chats SET is_public = ? WHERE id = ?').run(isPublic ? 1 : 0, chat.id);

  const fresh = q.chatById.get(chat.id);
  emitToChat(chat.id, 'chat:updated', { chat: shapeChat(fresh, req.user.id) }, memberIds(chat.id));
  res.json({ chat: shapeChat(fresh, req.user.id) });
});

router.post('/:id/avatar', requireAuth, chatAvatarUpload.single('avatar'), (req, res) => {
  const chat = loadChat(req);
  if (!canManage(chat.id, req.user.id)) throw new HttpError(403, 'فقط مدیران می‌توانند عکس چت را عوض کنند.');
  if (!req.file) throw new HttpError(400, 'فایلی ارسال نشد.');
  const old = chat.avatar;
  db.prepare('UPDATE chats SET avatar = ? WHERE id = ?').run(req.file.filename, chat.id);
  if (old) deleteUpload(old);
  const fresh = q.chatById.get(chat.id);
  emitToChat(chat.id, 'chat:updated', { chat: shapeChat(fresh, req.user.id) }, memberIds(chat.id));
  res.json({ chat: shapeChat(fresh, req.user.id) });
});

/* ------------------------- پین پیام --------------------------- */
router.post('/:id/pin/:messageId', requireAuth, (req, res) => {
  const chat = loadChat(req);
  if (!canManage(chat.id, req.user.id)) throw new HttpError(403, 'فقط مدیران می‌توانند پیام پین کنند.');
  const msg = q.messageById.get(parseInt(req.params.messageId, 10));
  if (!msg || msg.chat_id !== chat.id) throw new HttpError(404, 'پیام پیدا نشد.');
  db.prepare('UPDATE chats SET pinned_message_id = ? WHERE id = ?').run(msg.id, chat.id);
  emitToChat(chat.id, 'chat:pinned', {
    chatId: chat.id, message: shapeMessage(msg, req.user.id),
  }, memberIds(chat.id));
  res.json({ ok: true, message: shapeMessage(msg, req.user.id) });
});

router.delete('/:id/pin', requireAuth, (req, res) => {
  const chat = loadChat(req);
  if (!canManage(chat.id, req.user.id)) throw new HttpError(403, 'فقط مدیران می‌توانند پین را بردارند.');
  db.prepare('UPDATE chats SET pinned_message_id = NULL WHERE id = ?').run(chat.id);
  emitToChat(chat.id, 'chat:pinned', { chatId: chat.id, message: null }, memberIds(chat.id));
  res.json({ ok: true });
});

/* ------------------------ بی‌صدا کردن ------------------------- */
router.post('/:id/mute', requireAuth, (req, res) => {
  const chat = loadChat(req);
  db.prepare('UPDATE chat_members SET muted = ? WHERE chat_id = ? AND user_id = ?')
    .run(req.body.muted ? 1 : 0, chat.id, req.user.id);
  res.json({ ok: true, muted: !!req.body.muted });
});

/* ----------------------- خروج / حذف چت ------------------------ */
router.post('/:id/leave', requireAuth, (req, res) => {
  const chatId = parseInt(req.params.id, 10);
  const chat = q.chatById.get(chatId);
  if (!chat) throw new HttpError(404, 'چت پیدا نشد.');
  if (chat.type === 'dm') {
    // در چت خصوصی = پاک کردن تاریخچه برای من
    db.prepare('UPDATE chat_members SET last_read_message_id = 0 WHERE chat_id = ? AND user_id = ?').run(chatId, req.user.id);
    removeMember(chatId, req.user.id);
    return res.json({ ok: true });
  }
  if (!isMember(chatId, req.user.id)) throw new HttpError(403, 'عضو نیستید.');
  const me = q.member.get(chatId, req.user.id);
  if (me.role === 'owner') {
    const next = db.prepare(`SELECT user_id FROM chat_members WHERE chat_id=? AND user_id!=? LIMIT 1`).get(chatId, req.user.id);
    if (next) db.prepare(`UPDATE chat_members SET role='owner' WHERE chat_id=? AND user_id=?`).run(chatId, next.user_id);
  }
  removeMember(chatId, req.user.id);
  const msg = systemMessage(chatId, `${req.user.name} چت را ترک کرد`);
  emitToChat(chatId, 'chat:memberRemoved', {
    chatId, userId: req.user.id, memberCount: q.memberCount.get(chatId).c,
    message: shapeMessage(msg, req.user.id),
  }, memberIds(chatId));
  res.json({ ok: true });
});

/* ------------------- جست‌وجو در پیام‌های چت ------------------ */
router.get('/:id/search', requireAuth, (req, res) => {
  const chat = loadChat(req);
  const term = cleanText(req.query.q, 100);
  if (!term) return res.json({ messages: [] });
  const rows = db.prepare(`
    SELECT * FROM messages WHERE chat_id = ? AND text LIKE ?
    ORDER BY id DESC LIMIT 60`).all(chat.id, `%${term}%`);
  res.json({ messages: rows.map((m) => shapeMessage(m, req.user.id)).reverse() });
});

module.exports = router;
