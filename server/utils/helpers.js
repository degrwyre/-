'use strict';
/** ابزارهای عمومی سمت سرور */
const crypto = require('crypto');

/** تبدیل متن به شماره‌ی یکسان برای نام‌کاربری (حروف کوچک، بدون فاصله) */
function slugifyUsername(str) {
  return String(str).trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

/** اعتبارسنجی نام‌کاربری: ۴ تا ۳۲ کاراکتر، حروف/عدد/آندرلاین */
function isValidUsername(u) {
  return /^[a-zA-Z0-9_]{4,32}$/.test(u);
}

/** کد دعوت تصادفی */
function inviteCode() {
  return crypto.randomBytes(6).toString('base64url');
}

/** زمان «آخرین بازدید» به شکل خوانا */
function lastSeenLabel(ts) {
  if (!ts) return 'اخیراً آنلاین بوده';
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'آخرین بازدید همین حالا';
  if (m < 60) return `آخرین بازدید ${m} دقیقه پیش`;
  const h = Math.floor(m / 60);
  if (h < 24) return `آخرین بازدید ${h} ساعت پیش`;
  const d = Math.floor(h / 24);
  if (d < 7) return `آخرین بازدید ${d} روز پیش`;
  return 'آخرین بازدید خیلی وقت پیش';
}

/** جدا کردن پسوند فایل */
function extOf(name = '') {
  const i = name.lastIndexOf('.');
  return i > -1 ? name.slice(i).toLowerCase() : '';
}

/** هَش کوتاه و پایدار برای ساخت رنگ آواتار */
function colorSeed(str = '') {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h) % 8;
}

/** پاک‌سازی متن ورودی */
function cleanText(t, max = 8000) {
  if (t === null || t === undefined) return '';
  return String(t).replace(/\u0000/g, '').slice(0, max).trim();
}

/** ساخت کلید JWT بدون وابستگی خارجی (HS256) */
function signToken(payload, secret, expiresInDays = 30) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const body = { ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + expiresInDays * 86400 };
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const data = `${b64(header)}.${b64(body)}`;
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verifyToken(token, secret) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const data = `${parts[0]}.${parts[1]}`;
  const expected = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  const a = Buffer.from(parts[2]);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

module.exports = {
  slugifyUsername, isValidUsername, inviteCode, lastSeenLabel,
  extOf, colorSeed, cleanText, signToken, verifyToken,
};
