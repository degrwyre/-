'use strict';
/**
 * توابع مشترک کار با چت‌ها و پیام‌ها (هم برای REST و هم Socket.IO)
 */
const db = require('../db');
const { lastSeenLabel } = require('./helpers');

/* ---------------------------- کوئری‌های آماده ---------------------------- */
const q = {
  userPublic: db.prepare('SELECT id, username, name, bio, avatar, is_verified, last_seen FROM users WHERE id = ?'),
  chatById: db.prepare('SELECT * FROM chats WHERE id = ?'),
  member: db.prepare('SELECT * FROM chat_members WHERE chat_id = ? AND user_id = ?'),
  members: db.prepare(`
    SELECT m.*, u.username, u.name, u.avatar, u.is_verified, u.last_seen
    FROM chat_members m JOIN users u ON u.id = m.user_id
    WHERE m.chat_id = ? ORDER BY (m.role='owner') DESC, u.name ASC`),
  memberCount: db.prepare('SELECT COUNT(*) AS c FROM chat_members WHERE chat_id = ?'),
  lastMessage: db.prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY id DESC LIMIT 1'),
  messageById: db.prepare('SELECT * FROM messages WHERE id = ?'),
};

/* ------------------------------- اعضا ---------------------------------- */
function isMember(chatId, userId) {
  return !!q.member.get(chatId, userId);
}

function canPost(chatId, userId) {
  const m = q.member.get(chatId, userId);
  if (!m) return false;
  const chat = q.chatById.get(chatId);
  if (chat && chat.type === 'channel') return m.role === 'owner' || m.role === 'admin';
  return !m.muted;
}

function canManage(chatId, userId) {
  const m = q.member.get(chatId, userId);
  return !!m && (m.role === 'owner' || m.role === 'admin');
}

function canDeleteAny(chatId, userId, msgSenderId) {
  const m = q.member.get(chatId, userId);
  if (!m) return false;
  if (m.role === 'owner' || m.role === 'admin') return true;
  return msgSenderId === userId;
}

/* ---------------------------- شکل‌دهی داده ------------------------------ */
/** اطلاعات عمومی یک کاربر برای ارسال به کلاینت */
function shapeUser(u, viewerId) {
  if (!u) return null;
  const online = require('./presence').isOnline(u.id);
  return {
    id: u.id,
    username: u.username,
    name: u.name,
    bio: u.bio || '',
    avatar: u.avatar || null,
    isVerified: !!u.is_verified,
    online,
    // حریم خصوصی: وضعیت دقیق فقط برای خود کاربر یا وقتی آنلاین است
    lastSeen: online ? 'online' : (u.id === viewerId ? lastSeenLabel(u.last_seen) : lastSeenLabel(u.last_seen)),
    lastSeenAt: u.last_seen,
  };
}

/** ساخت آبجکت چت برای ارسال به کلاینت (شامل آخرین پیام، تعداد خوانده‌نشده و...) */
function shapeChat(chat, userId) {
  if (!chat) return null;
  const me = q.member.get(chat.id, userId);
  const members = q.members.all(chat.id);
  const count = q.memberCount.get(chat.id).c;
  const last = q.lastMessage.get(chat.id);
  const sender = last && last.sender_id ? q.userPublic.get(last.sender_id) : null;

  let peer = null;
  let peerLastRead = 0;
  const readBy = {};
  if (chat.type === 'dm') {
    const other = members.find((m) => m.user_id !== userId);
    peer = other ? shapeUser(other, userId) : null;
    peerLastRead = other ? (other.last_read_message_id || 0) : 0;
  } else {
    for (const m of members) if (m.user_id !== userId) readBy[m.user_id] = m.last_read_message_id || 0;
  }

  const pinned = chat.pinned_message_id ? q.messageById.get(chat.pinned_message_id) : null;

  return {
    id: chat.id,
    type: chat.type,
    title: chat.type === 'dm'
      ? (chat.is_saved ? 'پیام‌های ذخیره‌شده' : (peer ? peer.name : 'کاربر حذف‌شده'))
      : chat.title,
    about: chat.about || '',
    avatar: chat.type === 'dm' ? (peer ? peer.avatar : null) : chat.avatar,
    inviteCode: chat.invite_code,
    createdBy: chat.created_by,
    isPublic: !!chat.is_public,
    isSaved: !!chat.is_saved,
    memberCount: count,
    peer,
    myRole: me ? me.role : null,
    muted: me ? !!me.muted : false,
    lastReadMessageId: me ? me.last_read_message_id : 0,
    unread: countUnread(chat.id, userId, me ? me.last_read_message_id : 0),
    peerLastRead,
    readBy,
    pinnedMessage: pinned ? shapeMessage(pinned, userId) : null,
    lastMessage: last ? shapeMessage(last, userId, sender) : null,
    lastActivity: last ? last.created_at : chat.created_at,
    createdAt: chat.created_at,
  };
}

function countUnread(chatId, userId, lastRead) {
  const row = db.prepare(
    'SELECT COUNT(*) AS c FROM messages WHERE chat_id = ? AND id > ? AND sender_id IS NOT ? AND system = 0'
  ).get(chatId, lastRead || 0, userId);
  return row ? row.c : 0;
}

/** ساخت آبجکت پیام */
function shapeMessage(m, userId, senderOverride) {
  if (!m) return null;
  const sender = senderOverride || (m.sender_id ? q.userPublic.get(m.sender_id) : null);
  const reply = m.reply_to_id ? q.messageById.get(m.reply_to_id) : null;
  const reactions = db.prepare(
    'SELECT emoji, user_id FROM reactions WHERE message_id = ?'
  ).all(m.id);

  const grouped = {};
  for (const r of reactions) {
    grouped[r.emoji] = grouped[r.emoji] || { emoji: r.emoji, count: 0, mine: false };
    grouped[r.emoji].count++;
    if (r.user_id === userId) grouped[r.emoji].mine = true;
  }

  let replyShape = null;
  if (reply) {
    const rs = reply.sender_id ? q.userPublic.get(reply.sender_id) : null;
    replyShape = {
      id: reply.id,
      text: (reply.text || '').slice(0, 160),
      mediaType: reply.media_type || null,
      mediaName: reply.media_name || null,
      senderName: rs ? rs.name : (reply.system ? 'سیستم' : 'کاربر حذف‌شده'),
      senderId: reply.sender_id,
    };
  }

  return {
    id: m.id,
    chatId: m.chat_id,
    sender: sender ? shapeUser(sender, userId) : null,
    senderId: m.sender_id,
    text: m.text || '',
    media: m.media_path ? {
      type: m.media_type,
      url: `/media/${m.media_path.replace(/^.*[\\/]/, '')}`,
      name: m.media_name,
      size: m.media_size,
      mime: m.media_mime,
      width: m.media_width,
      height: m.media_height,
      duration: m.duration,
    } : null,
    replyTo: replyShape,
    forwardedFrom: m.forwarded_from || null,
    editedAt: m.edited_at || null,
    system: !!m.system,
    mine: m.sender_id === userId,
    reactions: Object.values(grouped),
    createdAt: m.created_at,
  };
}

/* ------------------------------ عملیات‌ها ------------------------------- */

/** پیدا کردن یا ساختن چت خصوصی بین دو کاربر */
function getOrCreateDM(userA, userB) {
  const existing = db.prepare(`
    SELECT c.* FROM chats c
    JOIN chat_members m1 ON m1.chat_id = c.id AND m1.user_id = ?
    JOIN chat_members m2 ON m2.chat_id = c.id AND m2.user_id = ?
    WHERE c.type = 'dm' LIMIT 1`).get(userA, userB);
  if (existing) return existing;

  const now = Date.now();
  const info = db.prepare(`INSERT INTO chats (type, created_by, created_at) VALUES ('dm', ?, ?)`).run(userA, now);
  const chatId = info.lastInsertRowid;
  const ins = db.prepare('INSERT INTO chat_members (chat_id, user_id, role, joined_at) VALUES (?,?,?,?)');
  ins.run(chatId, userA, 'member', now);
  ins.run(chatId, userB, 'member', now);
  return q.chatById.get(chatId);
}

/** افزودن عضو */
function addMember(chatId, userId, role = 'member') {
  const now = Date.now();
  db.prepare(`INSERT INTO chat_members (chat_id, user_id, role, joined_at)
              VALUES (?,?,?,?)
              ON CONFLICT(chat_id, user_id) DO NOTHING`).run(chatId, userId, role, now);
  return now;
}

function removeMember(chatId, userId) {
  db.prepare('DELETE FROM chat_members WHERE chat_id = ? AND user_id = ?').run(chatId, userId);
}

/** لیست همه‌ی اعضای یک چت (فقط آیدی) — برای انتشار رویداد سوکت */
function memberIds(chatId) {
  return db.prepare('SELECT user_id FROM chat_members WHERE chat_id = ?').all(chatId).map((r) => r.user_id);
}

/** ثبت پیام سیستمی (مثل «علی به گروه پیوست») */
function systemMessage(chatId, text) {
  const now = Date.now();
  const info = db.prepare(`INSERT INTO messages (chat_id, text, system, created_at) VALUES (?,?,1,?)`)
    .run(chatId, text, now);
  db.prepare('UPDATE chats SET last_message_id = ? WHERE id = ?').run(info.lastInsertRowid, chatId);
  return q.messageById.get(info.lastInsertRowid);
}

module.exports = {
  q, isMember, canPost, canManage, canDeleteAny,
  shapeUser, shapeChat, shapeMessage, countUnread,
  getOrCreateDM, addMember, removeMember, memberIds, systemMessage,
};
