'use strict';
/**
 * پل بین لایه‌ی REST و Socket.IO
 * io در زمان اجرا از index.js تزریق می‌شود تا وابستگی حلقوی ایجاد نشود.
 */
let ioRef = null;

function setIO(io) { ioRef = io; }
function getIO() { return ioRef; }

/** ارسال رویداد به همه‌ی سوکت‌های یک کاربر خاص */
function emitToUser(userId, event, payload) {
  if (!ioRef || !userId) return;
  ioRef.to(`user:${userId}`).emit(event, payload);
}

/** ارسال رویداد به اتاق یک چت */
function emitToChatRoom(chatId, event, payload) {
  if (!ioRef) return;
  ioRef.to(`chat:${chatId}`).emit(event, payload);
}

/** ارسال رویداد به مجموعه‌ای از کاربران */
function emitToUsers(userIds, event, payload) {
  if (!ioRef || !Array.isArray(userIds)) return;
  for (const uid of userIds) ioRef.to(`user:${uid}`).emit(event, payload);
}

/** ارسال به اعضای یک چت (با لیست آیدی‌ها) */
function emitToChat(chatId, event, payload, userIds) {
  if (userIds && userIds.length) emitToUsers(userIds, event, payload);
  else emitToChatRoom(chatId, event, payload);
}

module.exports = { setIO, getIO, emitToUser, emitToUsers, emitToChat, emitToChatRoom };
