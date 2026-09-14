'use strict';
/**
 * مدیریت وضعیت آنلاین/آفلاین کاربران (در حافظه)
 * نکته: این ماژول برای یک instance کار می‌کند. اگر در آینده چند instance
 * داشته باشید، باید از Redis Adapter برای Socket.IO استفاده کنید.
 */
const db = require('../db');

/** userId -> Set<socketId> */
const online = new Map();

function goOnline(userId, socketId) {
  if (!userId) return;
  if (!online.has(userId)) online.set(userId, new Set());
  online.get(userId).add(socketId);
  db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(Date.now(), userId);
}

function goOffline(userId, socketId) {
  if (!userId) return;
  const s = online.get(userId);
  if (!s) return;
  s.delete(socketId);
  if (s.size === 0) {
    online.delete(userId);
    db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(Date.now(), userId);
    return true; // کاملاً آفلاین شد
  }
  return false;
}

function isOnline(userId) {
  return online.has(userId) && online.get(userId).size > 0;
}

function onlineIds() {
  return [...online.keys()];
}

function setLastSeen(userId) {
  db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(Date.now(), userId);
}

module.exports = { goOnline, goOffline, isOnline, onlineIds, setLastSeen };
