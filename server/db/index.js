'use strict';
/**
 * لایه‌ی دیتابیس (SQLite با better-sqlite3)
 * مزیت: بدون نیاز به سرویس جداگانه، سریع و ساده.
 * در Railway با یک Volume (مسیر /data) داده‌ها پایدار می‌مانند.
 */
const Database = require('better-sqlite3');
const config = require('../config');

const db = new Database(config.DB_FILE);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

db.exec(`
-- ============ کاربران ============
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT UNIQUE,
  phone         TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  bio           TEXT DEFAULT '',
  avatar        TEXT,
  is_verified   INTEGER DEFAULT 0,
  last_seen     INTEGER DEFAULT 0,
  settings      TEXT DEFAULT '{}',
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_name ON users(name);

-- ============ نشست‌ها (دستگاه‌های فعال) ============
CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device     TEXT DEFAULT 'Web',
  ip         TEXT DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- ============ چت‌ها (خصوصی / گروه / کانال) ============
CREATE TABLE IF NOT EXISTS chats (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  type         TEXT NOT NULL DEFAULT 'dm',            -- dm | group | channel
  title        TEXT,
  about        TEXT DEFAULT '',
  avatar       TEXT,
  invite_code  TEXT UNIQUE,
  created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  last_message_id INTEGER,
  pinned_message_id INTEGER,
  is_public    INTEGER DEFAULT 0,
  is_saved     INTEGER DEFAULT 0,
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chats_type ON chats(type);

-- ============ اعضای چت ============
CREATE TABLE IF NOT EXISTS chat_members (
  chat_id  INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role     TEXT NOT NULL DEFAULT 'member',            -- owner | admin | member
  muted    INTEGER DEFAULT 0,
  last_read_message_id INTEGER DEFAULT 0,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (chat_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_members_user ON chat_members(user_id);

-- ============ پیام‌ها ============
CREATE TABLE IF NOT EXISTS messages (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id      INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  sender_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  text         TEXT DEFAULT '',
  media_type   TEXT,                                  -- image | video | audio | voice | file
  media_path   TEXT,
  media_name   TEXT,
  media_size   INTEGER DEFAULT 0,
  media_mime   TEXT,
  media_width  INTEGER,
  media_height INTEGER,
  duration     REAL,                                  -- ثانیه (برای صوت/ویدیو)
  reply_to_id  INTEGER REFERENCES messages(id) ON DELETE SET NULL,
  forwarded_from TEXT,
  edited_at    INTEGER,
  system       INTEGER DEFAULT 0,                     -- پیام سیستمی (عضویت، تغییر نام و...)
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, id);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);

-- ============ واکنش‌ها (Reactions) ============
CREATE TABLE IF NOT EXISTS reactions (
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji      TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (message_id, user_id)
);

-- ============ مخاطبین ذخیره‌شده ============
CREATE TABLE IF NOT EXISTS contacts (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, contact_id)
);

-- ============ تنظیمات عمومی سرویس ============
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);
`);

/* ------------------------- مایگریشن خودکار ------------------------- */
/** اگر ستونی در نسخه‌های بعدی اضافه شد، به‌صورت خودکار به دیتابیس موجود افزوده می‌شود */
function ensureColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`🔧 مایگریشن: ستون ${table}.${column} افزوده شد`);
  }
}
ensureColumn('chats', 'is_saved', 'INTEGER DEFAULT 0');
ensureColumn('users', 'settings', "TEXT DEFAULT '{}'");

module.exports = db;
