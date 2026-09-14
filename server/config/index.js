'use strict';
/**
 * تنظیمات مرکزی برنامه — همه‌چیز از طریق متغیرهای محیطی قابل تغییر است.
 * برای Railway فقط کافیست PORT و JWT_SECRET را در بخش Variables تنظیم کنید.
 */
require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const NODE_ENV = process.env.NODE_ENV || 'development';

// مسیر ذخیره‌سازی فایل‌ها: در Railway روی Volume سوار می‌شود (/data)
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(DATA_DIR, 'uploads');
const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, 'rohamgram.db');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });

// اگر JWT_SECRET تنظیم نشده باشد، یک کلید موقت تولید می‌شود (فقط برای توسعه!)
let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  JWT_SECRET = crypto.randomBytes(48).toString('hex');
  console.warn('\n⚠️  JWT_SECRET تنظیم نشده است! یک کلید موقت ساخته شد.');
  console.warn('   در محیط واقعی حتماً این متغیر را در Railway تنظیم کنید،\n   وگرنه با هر ری‌استارت همه‌ی کاربران از حساب خارج می‌شوند.\n');
}

module.exports = {
  NODE_ENV,
  IS_PROD: NODE_ENV === 'production',
  PORT: parseInt(process.env.PORT || '3000', 10),

  DATA_DIR,
  UPLOAD_DIR,
  DB_FILE,

  JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '30d',

  // محدودیت حجم آپلود (پیش‌فرض ۵۰ مگابایت)
  MAX_UPLOAD_MB: parseInt(process.env.MAX_UPLOAD_MB || '50', 10),

  // آیا ثبت‌نام باز باشد؟ (برای نسخه‌ی خصوصی می‌توانید false بگذارید)
  ALLOW_SIGNUP: (process.env.ALLOW_SIGNUP || 'true') === 'true',

  // آدرس عمومی برنامه (برای لینک دعوت و اشتراک‌گذاری)
  PUBLIC_URL: process.env.PUBLIC_URL || '',

  APP_NAME: process.env.APP_NAME || 'رهام گرام',
  VERSION: '1.1.1',
};
