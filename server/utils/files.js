'use strict';
/**
 * امن‌سازی و مدیریت فایل‌های آپلودشده
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const config = require('../config');

/** پسوندهایی که اجرای آن‌ها در مرورگر خطرناک است */
const BLOCKED_EXT = new Set([
  '.html', '.htm', '.svg', '.xhtml', '.js', '.mjs', '.cjs', '.json',
  '.php', '.phtml', '.asp', '.aspx', '.jsp', '.cgi', '.exe', '.bat',
  '.cmd', '.sh', '.msi', '.dll', '.jar', '.swf', '.xml', '.xsl',
]);

/** دسته‌بندی نوع رسانه بر اساس MIME */
function mediaKind(mime = '', name = '') {
  const m = mime.toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m === 'audio/webm' || m === 'audio/ogg; codecs=opus') return 'voice';
  if (m.startsWith('audio/')) return 'audio';
  const ext = path.extname(name).toLowerCase();
  if (['.mp3', '.m4a', '.wav', '.ogg', '.aac', '.flac'].includes(ext)) return 'audio';
  if (['.mp4', '.mkv', '.mov', '.webm', '.avi'].includes(ext)) return 'video';
  return 'file';
}

/** نام امن برای ذخیره‌سازی روی دیسک */
function safeStoredName(originalName = '') {
  const ext = path.extname(originalName).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 10);
  return `${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}${ext}`;
}

function isBlocked(name = '') {
  return BLOCKED_EXT.has(path.extname(name).toLowerCase());
}

/** حذف فیزیکی فایل آپلود (با جلوگیری از path traversal) */
function deleteUpload(fileName) {
  if (!fileName) return;
  const clean = path.basename(fileName);
  const full = path.join(config.UPLOAD_DIR, clean);
  fs.promises.unlink(full).catch(() => {});
}

/** بررسی اینکه مسیر واقعاً داخل پوشه‌ی آپلود است */
function resolveInsideUploads(fileName) {
  const full = path.resolve(config.UPLOAD_DIR, path.basename(fileName));
  if (!full.startsWith(path.resolve(config.UPLOAD_DIR))) return null;
  return full;
}

/** تبدیل بایت به متن خوانا */
function humanSize(bytes = 0) {
  if (!bytes) return '۰ بایت';
  const units = ['بایت', 'کیلوبایت', 'مگابایت', 'گیگابایت'];
  let i = 0, n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

module.exports = { mediaKind, safeStoredName, isBlocked, deleteUpload, resolveInsideUploads, humanSize, BLOCKED_EXT };
