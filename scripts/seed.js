'use strict';
/**
 * اسکریپت ساخت داده‌ی نمونه (اختیاری)
 * اجرا: npm run seed
 * → ۴ کاربر، ۱ گروه و ۱ کانال با چند پیام می‌سازد تا برنامه را سریع تست کنید.
 */
const path = require('path');
const bcrypt = require('bcryptjs');

// مسیر دیتابیس از روی .env یا پیش‌فرض
require(path.join(__dirname, '..', 'server', 'config'));
const db = require(path.join(__dirname, '..', 'server', 'db'));
const { inviteCode } = require(path.join(__dirname, '..', 'server', 'utils', 'helpers'));

const users = [
  { username: 'demo', name: 'کاربر نمونه', bio: 'سلام! من حساب پیش‌فرض این پیام‌رسان هستم 👋', password: 'demo1234' },
  { username: 'sara', name: 'سارا احمدی', bio: 'طراح رابط کاربری 🎨', password: 'demo1234' },
  { username: 'reza', name: 'رضا کریمی', bio: 'توسعه‌دهنده‌ی بک‌اند ☕', password: 'demo1234' },
  { username: 'mina', name: 'مینا رضایی', bio: 'عاشق عکاسی 📷', password: 'demo1234' },
];

async function main() {
  const now = Date.now();
  const ids = [];

  for (const u of users) {
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(u.username);
    if (existing) { ids.push(existing.id); continue; }
    const hash = await bcrypt.hash(u.password, 10);
    const info = db.prepare(`INSERT INTO users (username, password_hash, name, bio, created_at, last_seen)
                             VALUES (?,?,?,?,?,?)`)
      .run(u.username, hash, u.name, u.bio, now, now - Math.floor(Math.random() * 36e5));
    ids.push(info.lastInsertRowid);
  }
  console.log('✅ کاربران ساخته شدند:', users.map((u) => `${u.username} / ${u.password}`).join('  |  '));

  /* -------- گروه نمونه -------- */
  let group = db.prepare(`SELECT * FROM chats WHERE invite_code = 'demogroup'`).get();
  if (!group) {
    const g = db.prepare(`INSERT INTO chats (type, title, about, invite_code, created_by, is_public, created_at)
                          VALUES ('group','گروه توسعه‌دهندگان','جایی برای گفت‌وگو درباره‌ی برنامه‌نویسی 💻','demogroup',?,1,?)`)
      .run(ids[0], now);
    for (const id of ids) {
      db.prepare('INSERT OR IGNORE INTO chat_members (chat_id,user_id,role,joined_at) VALUES (?,?,?,?)')
        .run(g.lastInsertRowid, id, id === ids[0] ? 'owner' : 'member', now);
    }
    group = db.prepare('SELECT * FROM chats WHERE id = ?').get(g.lastInsertRowid);
    seedMessages(group.id, ids, [
      [ids[0], 'سلام به همه! 👋 به گروه توسعه‌دهندگان خوش اومدید.'],
      [ids[1], 'سلام رضا جان! این پیام‌رسان خیلی خوب شده 🔥'],
      [ids[2], 'آره واقعاً. سرعت سوکت‌ها عالیه. کسی می‌خواد روی نسخه‌ی موبایل کار کنه؟'],
      [ids[3], 'من می‌تونم طراحی رابط کاربری موبایل رو انجام بدم 🎨'],
      [ids[0], 'عالیه! پس از فردا شروع می‌کنیم. این پیام رو سنجاق می‌کنم 📌'],
    ]);
    db.prepare('UPDATE chats SET pinned_message_id = (SELECT MAX(id) FROM messages WHERE chat_id = ?) WHERE id = ?')
      .run(group.id, group.id);
    console.log('✅ گروه «توسعه‌دهندگان» ساخته شد');
  }

  /* -------- کانال نمونه -------- */
  let channel = db.prepare(`SELECT * FROM chats WHERE invite_code = 'demochannel'`).get();
  if (!channel) {
    const c = db.prepare(`INSERT INTO chats (type, title, about, invite_code, created_by, is_public, created_at)
                          VALUES ('channel','اخبار رهام گرام','آخرین تغییرات و به‌روزرسانی‌های پیام‌رسان 📢','demochannel',?,1,?)`)
      .run(ids[0], now);
    db.prepare('INSERT INTO chat_members (chat_id,user_id,role,joined_at) VALUES (?,?,?,?)')
      .run(c.lastInsertRowid, ids[0], 'owner', now);
    for (const id of ids.slice(1)) {
      db.prepare('INSERT OR IGNORE INTO chat_members (chat_id,user_id,role,joined_at) VALUES (?,?,?,?)')
        .run(c.lastInsertRowid, id, 'member', now);
    }
    channel = db.prepare('SELECT * FROM chats WHERE id = ?').get(c.lastInsertRowid);
    seedMessages(channel.id, [ids[0]], [
      [ids[0], '🎉 **رهام گرام نسخه ۱.۱ منتشر شد!**\n\nویژگی‌ها:\n• چت خصوصی و گروهی\n• کانال با ادمین\n• ارسال تصویر، ویدیو، فایل و پیام صوتی\n• واکنش، پاسخ، ویرایش و حذف پیام\n• حالت تاریک و روشن\n• اعلان زنده و وضعیت آنلاین'],
      [ids[0], '💡 نکته: با Ctrl+K سریع جست‌وجو کنید و با کلیک‌راست روی هر پیام، منوی کامل را ببینید.'],
    ]);
    console.log('✅ کانال «اخبار رهام گرام» ساخته شد');
  }

  /* -------- چت خصوصی نمونه -------- */
  const dm = db.prepare(`SELECT c.* FROM chats c
                         JOIN chat_members a ON a.chat_id=c.id AND a.user_id=?
                         JOIN chat_members b ON b.chat_id=c.id AND b.user_id=?
                         WHERE c.type='dm' AND c.is_saved=0 LIMIT 1`).get(ids[0], ids[1]);
  if (!dm) {
    const info = db.prepare(`INSERT INTO chats (type, created_by, created_at) VALUES ('dm', ?, ?)`).run(ids[0], now);
    for (const id of [ids[0], ids[1]]) {
      db.prepare('INSERT INTO chat_members (chat_id,user_id,role,joined_at) VALUES (?,?,?,?)').run(info.lastInsertRowid, id, 'member', now);
    }
    seedMessages(info.lastInsertRowid, ids, [
      [ids[1], 'سلام! حالت چطوره؟ 😊'],
      [ids[0], 'سلام سارا جان، ممنون خوبم. تو چطوری؟'],
      [ids[1], 'منم خوبم. پیام‌رسانت خیلی باحال شده، دستت درد نکنه 👏'],
      [ids[0], 'مرسی! هر بازخوردی داشتی بگو تا بهترش کنم 🙏'],
    ]);
    console.log('✅ چت خصوصی نمونه ساخته شد');
  }

  console.log('\n🔑 برای ورود از این حساب استفاده کنید:');
  console.log('   نام کاربری: demo    رمز عبور: demo1234\n');
}

function seedMessages(chatId, _ids, list) {
  let t = Date.now() - list.length * 6e5;
  for (const [sender, text] of list) {
    const info = db.prepare(`INSERT INTO messages (chat_id, sender_id, text, created_at) VALUES (?,?,?,?)`)
      .run(chatId, sender, text, t);
    db.prepare('UPDATE chats SET last_message_id = ? WHERE id = ?').run(info.lastInsertRowid, chatId);
    t += 6e5 + Math.random() * 6e5;
  }
}

main().then(() => { try { db.close(); } catch {} process.exit(0); })
      .catch((e) => { console.error('❌ خطا:', e); process.exit(1); });
