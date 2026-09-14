'use strict';
/**
 * روت‌های پیام: تاریخچه، ارسال (با فایل)، ویرایش، حذف، واکنش، خوانده‌شدن، فوروارد
 */
const router = require('../middleware/router')();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const db = require('../db');
const config = require('../config');
const { HttpError } = require('../middleware/error');
const { requireAuth } = require('../middleware/auth');
const {
  shapeChat, shapeMessage, q, isMember, canPost, canManage, canDeleteAny, memberIds,
} = require('../utils/chat');
const { cleanText } = require('../utils/helpers');
const { mediaKind, safeStoredName, isBlocked, deleteUpload } = require('../utils/files');
const { emitToUsers, emitToChat } = require('../utils/emitter');

const MAX_BYTES = config.MAX_UPLOAD_MB * 1024 * 1024;

/* ---------------------------- آپلودگر ---------------------------- */
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, config.UPLOAD_DIR),
    filename: (_req, file, cb) => cb(null, safeStoredName(file.originalname)),
  }),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (isBlocked(file.originalname) || isBlocked(file.mimetype)) {
      return cb(new HttpError(400, 'این نوع فایل به دلایل امنیتی مجاز نیست.'));
    }
    cb(null, true);
  },
});

/** استخراج ابعاد تصویر/صوت بدون وابستگی خارجی */
function probeMeta(file) {
  const out = { width: null, height: null, duration: null };
  if (!file) return out;
  try {
    const buf = fs.readFileSync(file.path);
    // PNG
    if (buf.length > 24 && buf.slice(1, 4).toString() === 'PNG') {
      out.width = buf.readUInt32BE(16);
      out.height = buf.readUInt32BE(20);
    }
    // JPEG
    else if (buf[0] === 0xff && buf[1] === 0xd8) {
      let i = 2;
      while (i < buf.length) {
        if (buf[i] !== 0xff) { i++; continue; }
        const marker = buf[i + 1];
        if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
          out.height = buf.readUInt16BE(i + 5);
          out.width = buf.readUInt16BE(i + 7);
          break;
        }
        if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
        i += 2 + buf.readUInt16BE(i + 2);
      }
    }
    // GIF
    else if (buf.slice(0, 3).toString() === 'GIF') {
      out.width = buf.readUInt16LE(6);
      out.height = buf.readUInt16LE(8);
    }
    // WEBP
    else if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') {
      if (buf.slice(12, 16).toString() === 'VP8 ') {
        out.width = buf.readUInt16LE(26) & 0x3fff;
        out.height = buf.readUInt16LE(28) & 0x3fff;
      } else if (buf.slice(12, 16).toString() === 'VP8L') {
        const b = buf.readUInt32LE(21);
        out.width = (b & 0x3fff) + 1;
        out.height = ((b >> 14) & 0x3fff) + 1;
      }
    }
    // WebM/Opus — مدت‌زمان از هدر کلاینت خوانده می‌شود
  } catch {}
  return out;
}

/** چت را بگیر و مجوز نوشتن را بررسی کن */
function writableChat(chatId, userId) {
  const chat = q.chatById.get(chatId);
  if (!chat) throw new HttpError(404, 'چت پیدا نشد.');
  if (!isMember(chatId, userId)) throw new HttpError(403, 'شما عضو این چت نیستید.');
  if (!canPost(chatId, userId)) throw new HttpError(403, chat.type === 'channel' ? 'فقط ادمین‌های کانال می‌توانند پست بگذارند.' : 'شما در این چت بی‌صدا شده‌اید.');
  return chat;
}

/** هسته‌ی ذخیره و انتشار یک پیام */
function publishMessage(chat, senderId, fields, extraEvent) {
  const now = Date.now();
  const info = db.prepare(`
    INSERT INTO messages
      (chat_id, sender_id, text, media_type, media_path, media_name, media_size, media_mime,
       media_width, media_height, duration, reply_to_id, forwarded_from, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    chat.id, senderId, fields.text || '', fields.media_type || null, fields.media_path || null,
    fields.media_name || null, fields.media_size || 0, fields.media_mime || null,
    fields.media_width || null, fields.media_height || null, fields.duration || null,
    fields.reply_to_id || null, fields.forwarded_from || null, now);

  const msgId = info.lastInsertRowid;
  db.prepare('UPDATE chats SET last_message_id = ? WHERE id = ?').run(msgId, chat.id);

  const msg = shapeMessage(q.messageById.get(msgId), senderId);
  const members = memberIds(chat.id);

  // انتشار به همه‌ی اعضا (به‌جز فرستنده که خودش optimistic render دارد)
  emitToUsers(members.filter((u) => u !== senderId), 'message:new', {
    message: msg,
    chat: shapeChat(q.chatById.get(chat.id), senderId),
  });
  // به خود فرستنده هم تأیید سرور می‌دهیم (برای همگام‌سازی چند دستگاه)
  emitToUsers([senderId], 'message:sent', { tempId: fields.tempId || null, message: msg, chatId: chat.id });

  if (extraEvent) emitToUsers(members, extraEvent.event, extraEvent.payload);
  return msg;
}

/* ------------------------- تاریخچه پیام‌ها ------------------------ */
router.get('/chat/:chatId', requireAuth, (req, res) => {
  const chatId = parseInt(req.params.chatId, 10);
  const chat = q.chatById.get(chatId);
  if (!chat) throw new HttpError(404, 'چت پیدا نشد.');
  if (!isMember(chatId, req.user.id) && !(chat.is_public && chat.type !== 'dm')) {
    throw new HttpError(403, 'عضو این چت نیستید.');
  }

  const limit = Math.min(parseInt(req.query.limit, 10) || 40, 100);
  const before = parseInt(req.query.before, 10) || null;

  const rows = before
    ? db.prepare('SELECT * FROM messages WHERE chat_id = ? AND id < ? ORDER BY id DESC LIMIT ?').all(chatId, before, limit)
    : db.prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY id DESC LIMIT ?').all(chatId, limit);

  const messages = rows.reverse().map((m) => shapeMessage(m, req.user.id));

  // به‌روزرسانی «آخرین پیام خوانده‌شده»
  const lastId = rows.length ? rows[rows.length - 1].id : 0;
  if (lastId) {
    db.prepare(`UPDATE chat_members SET last_read_message_id = MAX(last_read_message_id, ?)
                WHERE chat_id = ? AND user_id = ?`).run(lastId, chatId, req.user.id);
  }

  res.json({
    messages,
    hasMore: rows.length === limit,
    chat: shapeChat(q.chatById.get(chatId), req.user.id),
  });
});

/* ------------------------ ارسال پیام ساده ------------------------ */
router.post('/chat/:chatId', requireAuth, (req, res) => {
  const chat = writableChat(parseInt(req.params.chatId, 10), req.user.id);
  const { text, replyToId, tempId } = req.body || {};
  const clean = cleanText(text, 8000);
  if (!clean) throw new HttpError(400, 'متن پیام خالی است.');

  const reply = replyToId ? q.messageById.get(parseInt(replyToId, 10)) : null;
  if (reply && reply.chat_id !== chat.id) throw new HttpError(400, 'پیام پاسخ نامعتبر است.');

  const msg = publishMessage(chat, req.user.id, { text: clean, reply_to_id: reply ? reply.id : null, tempId });
  res.json({ message: msg });
});

/* --------------------- ارسال با فایل / رسانه -------------------- */
router.post('/chat/:chatId/upload', requireAuth, upload.single('file'), (req, res) => {
  const chat = writableChat(parseInt(req.params.chatId, 10), req.user.id);
  if (!req.file) throw new HttpError(400, 'فایلی ارسال نشد.');

  const caption = cleanText(req.body.text, 4000);
  const replyToId = req.body.replyToId ? parseInt(req.body.replyToId, 10) : null;
  const tempId = req.body.tempId || null;
  const clientDuration = parseFloat(req.body.duration) || null;

  const reply = replyToId ? q.messageById.get(replyToId) : null;
  if (reply && reply.chat_id !== chat.id) { deleteUpload(req.file.filename); throw new HttpError(400, 'پاسخ نامعتبر'); }

  const meta = probeMeta(req.file);
  const kind = mediaKind(req.file.mimetype, req.file.originalname);

  const msg = publishMessage(chat, req.user.id, {
    text: caption,
    media_type: kind,
    media_path: req.file.filename,
    media_name: cleanText(req.file.originalname, 200) || 'file',
    media_size: req.file.size,
    media_mime: req.file.mimetype,
    media_width: meta.width,
    media_height: meta.height,
    duration: clientDuration || meta.duration,
    reply_to_id: reply ? reply.id : null,
    tempId,
  });
  res.json({ message: msg });
});

/* -------------------------- ویرایش پیام -------------------------- */
router.patch('/:id', requireAuth, (req, res) => {
  const msg = q.messageById.get(parseInt(req.params.id, 10));
  if (!msg) throw new HttpError(404, 'پیام پیدا نشد.');
  if (msg.sender_id !== req.user.id) throw new HttpError(403, 'فقط فرستنده می‌تواند پیام را ویرایش کند.');
  if (msg.system) throw new HttpError(400, 'پیام سیستمی قابل ویرایش نیست.');

  const text = cleanText(req.body.text, 8000);
  if (!text && !msg.media_path) throw new HttpError(400, 'متن نمی‌تواند خالی باشد.');

  db.prepare('UPDATE messages SET text = ?, edited_at = ? WHERE id = ?').run(text, Date.now(), msg.id);
  const shaped = shapeMessage(q.messageById.get(msg.id), req.user.id);
  emitToUsers(memberIds(msg.chat_id), 'message:edited', shaped);
  res.json({ message: shaped });
});

/* --------------------------- حذف پیام --------------------------- */
router.delete('/:id', requireAuth, (req, res) => {
  const msg = q.messageById.get(parseInt(req.params.id, 10));
  if (!msg) throw new HttpError(404, 'پیام پیدا نشد.');
  if (!canDeleteAny(msg.chat_id, req.user.id, msg.sender_id)) throw new HttpError(403, 'اجازه‌ی حذف این پیام را ندارید.');

  const forEveryone = req.query.forEveryone === '1' || req.query.forEveryone === 'true'
    || (msg.sender_id === req.user.id);

  if (msg.media_path) deleteUpload(msg.media_path);

  if (forEveryone) {
    db.prepare('DELETE FROM messages WHERE id = ?').run(msg.id);
    const chat = q.chatById.get(msg.chat_id);
    if (chat && chat.pinned_message_id === msg.id) db.prepare('UPDATE chats SET pinned_message_id = NULL WHERE id = ?').run(msg.chat_id);
    emitToUsers(memberIds(msg.chat_id), 'message:deleted', {
      chatId: msg.chat_id, messageId: msg.id, forEveryone: true,
    });
  } else {
    // فقط برای من: پیام را «پنهان» می‌کنیم
    db.prepare(`UPDATE messages SET text = '', media_path = NULL WHERE id = ?`).run(msg.id);
  }
  res.json({ ok: true });
});

/* ----------------------- واکنش به پیام ------------------------- */
const EMOJI_SET = new Set(['👍', '❤️', '🔥', '🎉', '😂', '😮', '😢', '🙏', '👎', '💯']);

router.post('/:id/reaction', requireAuth, (req, res) => {
  const msg = q.messageById.get(parseInt(req.params.id, 10));
  if (!msg) throw new HttpError(404, 'پیام پیدا نشد.');
  if (!isMember(msg.chat_id, req.user.id)) throw new HttpError(403, 'عضو نیستید.');

  const emoji = EMOJI_SET.has(req.body.emoji) ? req.body.emoji : '👍';
  const existing = db.prepare('SELECT emoji FROM reactions WHERE message_id = ? AND user_id = ?').get(msg.id, req.user.id);

  if (existing && existing.emoji === emoji) {
    db.prepare('DELETE FROM reactions WHERE message_id = ? AND user_id = ?').run(msg.id, req.user.id);
  } else if (existing) {
    db.prepare('UPDATE reactions SET emoji = ?, created_at = ? WHERE message_id = ? AND user_id = ?')
      .run(emoji, Date.now(), msg.id, req.user.id);
  } else {
    db.prepare('INSERT INTO reactions (message_id, user_id, emoji, created_at) VALUES (?,?,?,?)')
      .run(msg.id, req.user.id, emoji, Date.now());
  }

  const reactions = db.prepare('SELECT emoji, user_id FROM reactions WHERE message_id = ?').all(msg.id);
  const grouped = {};
  for (const r of reactions) {
    grouped[r.emoji] = grouped[r.emoji] || { emoji: r.emoji, count: 0, users: [] };
    grouped[r.emoji].count++;
    grouped[r.emoji].users.push(r.user_id);
  }
  const payload = { messageId: msg.id, chatId: msg.chat_id, reactions: Object.values(grouped), by: req.user.id };
  emitToUsers(memberIds(msg.chat_id), 'message:reaction', payload);
  res.json({ ok: true, reactions: Object.values(grouped) });
});

/* ------------------------ خوانده‌شدن چت ------------------------ */
router.post('/chat/:chatId/read', requireAuth, (req, res) => {
  const chatId = parseInt(req.params.chatId, 10);
  if (!isMember(chatId, req.user.id)) throw new HttpError(403, 'عضو نیستید.');
  const last = q.lastMessage.get(chatId);
  const lastId = last ? last.id : 0;
  db.prepare(`UPDATE chat_members SET last_read_message_id = ? WHERE chat_id = ? AND user_id = ?`)
    .run(lastId, chatId, req.user.id);
  emitToUsers(memberIds(chatId), 'chat:read', { chatId, userId: req.user.id, lastReadMessageId: lastId });
  res.json({ ok: true });
});

/* --------------------------- فوروارد --------------------------- */
router.post('/forward', requireAuth, (req, res) => {
  const { messageIds, chatIds } = req.body || {};
  if (!Array.isArray(messageIds) || !Array.isArray(chatIds)) throw new HttpError(400, 'داده‌ی نامعتبر');
  if (!messageIds.length || !chatIds.length) throw new HttpError(400, 'چیزی انتخاب نشده است.');

  const results = [];
  const tx = db.transaction(() => {
    for (const rawChatId of chatIds.slice(0, 20)) {
      let chat;
      try { chat = writableChat(parseInt(rawChatId, 10), req.user.id); } catch { continue; }
      for (const rawMsgId of messageIds.slice(0, 30)) {
        const src = q.messageById.get(parseInt(rawMsgId, 10));
        if (!src || src.system) continue;
        if (!isMember(src.chat_id, req.user.id)) continue;
        const senderName = src.sender_id ? (q.userPublic.get(src.sender_id) || {}).name : null;

        const now = Date.now();
        const info = db.prepare(`
          INSERT INTO messages (chat_id, sender_id, text, media_type, media_path, media_name, media_size,
                                media_mime, media_width, media_height, duration, forwarded_from, created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
          chat.id, req.user.id, src.text || '', src.media_type, src.media_path, src.media_name,
          src.media_size, src.media_mime, src.media_width, src.media_height, src.duration,
          senderName || 'ناشناس', now);

        const msgId = info.lastInsertRowid;
        db.prepare('UPDATE chats SET last_message_id = ? WHERE id = ?').run(msgId, chat.id);
        const msg = shapeMessage(q.messageById.get(msgId), req.user.id);
        emitToUsers(memberIds(chat.id).filter((u) => u !== req.user.id), 'message:new', {
          message: msg, chat: shapeChat(q.chatById.get(chat.id), req.user.id),
        });
        results.push({ chatId: chat.id, message: msg });
      }
    }
  });
  tx();
  res.json({ ok: true, forwarded: results.length });
});

/* ---------------- جست‌وجوی سراسری در پیام‌ها ---------------- */
router.get('/search', requireAuth, (req, res) => {
  const term = cleanText(req.query.q, 100);
  if (term.length < 2) return res.json({ results: [] });
  const rows = db.prepare(`
    SELECT m.*, c.type AS chat_type, c.title AS chat_title
    FROM messages m
    JOIN chat_members cm ON cm.chat_id = m.chat_id AND cm.user_id = ?
    JOIN chats c ON c.id = m.chat_id
    WHERE m.system = 0 AND m.text LIKE ?
    ORDER BY m.id DESC LIMIT 80`).all(req.user.id, `%${term}%`);

  res.json({
    results: rows.map((m) => ({
      ...shapeMessage(m, req.user.id),
      chatType: m.chat_type,
      chatTitle: m.chat_title,
    })),
  });
});

/* ---------------- رسانه‌ها و فایل‌های چت ---------------- */
router.get('/chat/:chatId/media', requireAuth, (req, res) => {
  const chatId = parseInt(req.params.chatId, 10);
  if (!isMember(chatId, req.user.id)) throw new HttpError(403, 'عضو نیستید.');
  const rows = db.prepare(`SELECT * FROM messages WHERE chat_id = ? AND media_path IS NOT NULL
                           ORDER BY id DESC LIMIT 200`).all(chatId);
  res.json({ media: rows.map((m) => shapeMessage(m, req.user.id)) });
});

module.exports = router;
