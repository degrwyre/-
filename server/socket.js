'use strict';
/**
 * لایه‌ی زمان‌واقعی (Socket.IO)
 * رویدادها: تایپ کردن، بازدید پیام، آنلاین/آفلاین، واکنش سریع و ارسال پیام
 */
const { Server } = require('socket.io');
const db = require('./db');
const config = require('./config');
const { verifyToken, cleanText } = require('./utils/helpers');
const { emitToUser, emitToUsers, setIO } = require('./utils/emitter');
const presence = require('./utils/presence');
const {
  q, isMember, canPost, canManage, canDeleteAny, shapeUser, shapeChat, shapeMessage, memberIds,
} = require('./utils/chat');
const { mediaKind, safeStoredName, isBlocked, deleteUpload } = require('./utils/files');
const fs = require('fs');
const path = require('path');

/** اتاق‌های چتِ باز شده توسط کاربر: socketId -> Set<chatId> */
const openChats = new Map();

function initSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: true, credentials: true },
    maxHttpBufferSize: 1e7,
    pingTimeout: 25000,
  });
  setIO(io);

  /* ------------------------- احراز هویت سوکت ------------------------- */
  io.use((socket, next) => {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.query?.token ||
      parseCookie(socket.handshake.headers.cookie || '').cg_token;

    const payload = verifyToken(token, config.JWT_SECRET);
    if (!payload || !payload.uid) return next(new Error('unauthorized'));

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.uid);
    if (!user) return next(new Error('unauthorized'));

    socket.data.user = user;
    socket.data.userId = user.id;
    next();
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    const uid = socket.data.userId;

    socket.join(`user:${uid}`);
    presence.goOnline(uid, socket.id);

    // عضویت در اتاق همه‌ی چت‌های کاربر
    const myChats = db.prepare('SELECT chat_id FROM chat_members WHERE user_id = ?').all(uid);
    for (const c of myChats) socket.join(`chat:${c.chat_id}`);

    // اطلاع‌رسانی آنلاین‌شدن به کسانی که این چت را باز دارند
    broadcastPresence(io, uid, true);

    /* ------------------------- تایپ کردن ------------------------- */
    socket.on('typing:start', ({ chatId }) => {
      chatId = parseInt(chatId, 10);
      if (!isMember(chatId, uid)) return;
      socket.to(`chat:${chatId}`).emit('typing', { chatId, userId: uid, name: user.name, typing: true });
    });

    socket.on('typing:stop', ({ chatId }) => {
      chatId = parseInt(chatId, 10);
      socket.to(`chat:${chatId}`).emit('typing', { chatId, userId: uid, name: user.name, typing: false });
    });

    /* ---------------------- باز/بستن چت ----------------------- */
    socket.on('chat:open', ({ chatId }) => {
      chatId = parseInt(chatId, 10);
      if (!chatId) return;
      socket.join(`chat:${chatId}`);
      if (!openChats.has(socket.id)) openChats.set(socket.id, new Set());
      openChats.get(socket.id).add(chatId);

      // ارسال وضعیت فعلی اعضای چت به این کاربر (تا وضعیت آنلاین از دست نرود)
      const peers = db.prepare(`SELECT u.id, u.username, u.name, u.bio, u.avatar, u.is_verified, u.last_seen
                                FROM chat_members m JOIN users u ON u.id = m.user_id
                                WHERE m.chat_id = ?`).all(chatId);
      for (const p of peers) {
        if (p.id === uid) continue;
        socket.emit('user:presence', { userId: p.id, online: presence.isOnline(p.id), user: shapeUser(p, uid) });
      }
      // همچنین اعلام کنیم که این کاربر آنلاین شد (برای دیگر اعضای چت)
      socket.to(`chat:${chatId}`).emit('user:presence', {
        userId: uid, online: true, user: shapeUser(user, uid),
      });
    });

    socket.on('chat:close', ({ chatId }) => {
      chatId = parseInt(chatId, 10);
      socket.leave(`chat:${chatId}`);
      const s = openChats.get(socket.id);
      if (s) s.delete(chatId);
    });

    /* -------------------- ارسال پیام از طریق سوکت -------------------- */
    socket.on('message:send', async (data, ack) => {
      try {
        const chatId = parseInt(data.chatId, 10);
        const chat = q.chatById.get(chatId);
        if (!chat) return ack && ack({ error: 'چت پیدا نشد' });
        if (!isMember(chatId, uid)) return ack && ack({ error: 'عضو این چت نیستید' });
        if (!canPost(chatId, uid)) return ack && ack({ error: 'اجازه‌ی ارسال پیام ندارید' });

        const text = cleanText(data.text, 8000);
        const replyToId = data.replyToId ? parseInt(data.replyToId, 10) : null;
        if (!text && !data.file) return ack && ack({ error: 'پیام خالی است' });

        const reply = replyToId ? q.messageById.get(replyToId) : null;
        if (reply && reply.chat_id !== chatId) return ack && ack({ error: 'پاسخ نامعتبر' });

        let fileFields = {};
        if (data.file && data.file.name && typeof data.file.data === 'string') {
          const saved = saveBase64File(data.file, uid);
          if (saved.error) return ack && ack({ error: saved.error });
          fileFields = saved; // شامل مسیر داخلی است و فقط در سمت سرور استفاده می‌شود
        }

        const now = Date.now();
        const info = db.prepare(`
          INSERT INTO messages (chat_id, sender_id, text, media_type, media_path, media_name, media_size,
                                media_mime, media_width, media_height, duration, reply_to_id, created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
          chatId, uid, text, fileFields.media_type || null, fileFields.media_path || null,
          fileFields.media_name || null, fileFields.media_size || 0, fileFields.media_mime || null,
          fileFields.media_width || null, fileFields.media_height || null, fileFields.duration || null,
          reply ? reply.id : null, now);

        const msgId = info.lastInsertRowid;
        db.prepare('UPDATE chats SET last_message_id = ? WHERE id = ?').run(msgId, chatId);

        const msg = shapeMessage(q.messageById.get(msgId), uid);
        const members = memberIds(chatId);

        socket.to(`chat:${chatId}`).emit('message:new', { message: msg, chat: shapeChat(chat, uid) });
        // تأیید برای فرستنده (همگام‌سازی چند دستگاه)
        io.to(`user:${uid}`).emit('message:sent', { tempId: data.tempId || null, message: msg, chatId });

        ack && ack({ message: msg });
      } catch (e) {
        console.error('message:send error', e);
        ack && ack({ error: 'خطا در ارسال پیام' });
      }
    });

    /* ------------------------ واکنش سریع ------------------------ */
    socket.on('message:react', ({ messageId, emoji }) => {
      const msg = q.messageById.get(parseInt(messageId, 10));
      if (!msg || !isMember(msg.chat_id, uid)) return;
      const set = new Set(['👍', '❤️', '🔥', '🎉', '😂', '😮', '😢', '🙏', '👎', '💯']);
      const e = set.has(emoji) ? emoji : '👍';
      const existing = db.prepare('SELECT emoji FROM reactions WHERE message_id=? AND user_id=?').get(msg.id, uid);
      if (existing && existing.emoji === e) db.prepare('DELETE FROM reactions WHERE message_id=? AND user_id=?').run(msg.id, uid);
      else if (existing) db.prepare('UPDATE reactions SET emoji=? WHERE message_id=? AND user_id=?').run(e, msg.id, uid);
      else db.prepare('INSERT INTO reactions (message_id,user_id,emoji,created_at) VALUES (?,?,?,?)').run(msg.id, uid, e, Date.now());

      const rows = db.prepare('SELECT emoji,user_id FROM reactions WHERE message_id=?').all(msg.id);
      const grouped = {};
      for (const r of rows) { grouped[r.emoji] = grouped[r.emoji] || { emoji: r.emoji, count: 0, users: [] }; grouped[r.emoji].count++; grouped[r.emoji].users.push(r.user_id); }
      io.to(`chat:${msg.chat_id}`).emit('message:reaction', {
        messageId: msg.id, chatId: msg.chat_id, reactions: Object.values(grouped), by: uid,
      });
    });

    /* ------------------------- قطع اتصال ------------------------- */
    socket.on('disconnect', () => {
      openChats.delete(socket.id);
      const fullyOffline = presence.goOffline(uid, socket.id);
      if (fullyOffline) broadcastPresence(io, uid, false);
    });
  });

  return io;
}

/** فایل base64 را روی دیسک ذخیره می‌کند (برای پیام‌های کوچک/صوت) */
function saveBase64File(file, userId) {
  try {
    const match = /^data:([^;]+);base64,(.*)$/.exec(file.data);
    if (!match) return { error: 'فرمت فایل نامعتبر است' };
    const mime = match[1];
    const buf = Buffer.from(match[2], 'base64');
    if (buf.length > config.MAX_UPLOAD_MB * 1024 * 1024) return { error: 'حجم فایل بیش از حد مجاز است' };
    if (isBlocked(file.name)) return { error: 'این نوع فایل مجاز نیست' };

    const name = safeStoredName(file.name || 'file');
    fs.writeFileSync(path.join(config.UPLOAD_DIR, name), buf);
    return {
      media_type: file.kind || mediaKind(mime, file.name),
      media_path: name,
      media_name: cleanText(file.name, 200) || 'file',
      media_size: buf.length,
      media_mime: mime,
      duration: file.duration || null,
    };
  } catch (e) {
    console.error('saveBase64File', e);
    return { error: 'ذخیره‌سازی فایل ناموفق بود' };
  }
}

/** انتشار وضعیت آنلاین به کاربرانی که چت مشترک باز دارند */
function broadcastPresence(io, userId, online) {
  const user = db.prepare('SELECT id, username, name, bio, avatar, is_verified, last_seen FROM users WHERE id = ?').get(userId);
  if (!user) return;
  const chats = db.prepare('SELECT chat_id FROM chat_members WHERE user_id = ?').all(userId);
  const targets = new Set();
  for (const c of chats) for (const uid of memberIds(c.chat_id)) if (uid !== userId) targets.add(uid);
  emitToUsers([...targets], 'user:presence', { userId, online, user: shapeUser(user, userId) });
}

function parseCookie(str) {
  const out = {};
  for (const part of str.split(';')) {
    const i = part.indexOf('=');
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

module.exports = { initSocket };
