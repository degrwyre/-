'use strict';
/**
 * تست سریع (smoke test) — بدون نیاز به فریم‌ورک تست
 * اجرا: npm test  (ابتدا سرور باید در حال اجرا باشد، یا خودش بالا می‌آید)
 */
const http = require('http');

const PORT = process.env.PORT || 3000;
const BASE = `http://127.0.0.1:${PORT}`;
let passed = 0, failed = 0;

function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const url = new URL(BASE + path);
    const opts = {
      method, hostname: url.hostname, port: url.port, path: url.pathname + url.search,
      headers: { 'Content-Type': 'application/json' },
    };
    if (data) opts.headers['Content-Length'] = Buffer.byteLength(data);
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;

    const r = http.request(opts, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(raw); } catch {}
        resolve({ status: res.statusCode, body: json, raw });
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

function check(name, cond, extra) {
  if (cond) { console.log(`  ✅ ${name}`); passed++; }
  else { console.log(`  ❌ ${name}`, extra !== undefined ? JSON.stringify(extra).slice(0, 200) : ''); failed++; }
}

(async () => {
  const rnd = Math.random().toString(36).slice(2, 8);
  const u1 = `tester_${rnd}`, u2 = `friend_${rnd}`;

  console.log('\n🧪 تست خودکار پیام‌رسان\n');

  // ۱) سلامت سرویس
  let r = await req('GET', '/api/health');
  check('GET /api/health', r.status === 200 && r.body.status === 'ok', r);

  // ۲) ثبت‌نام
  r = await req('POST', '/api/auth/register', { name: 'تستر یک', username: u1, password: 'test1234' });
  check('ثبت‌نام کاربر اول', r.status === 200 && r.body.token, r.body);
  const t1 = r.body.token;

  r = await req('POST', '/api/auth/register', { name: 'تستر دو', username: u2, password: 'test1234' });
  check('ثبت‌نام کاربر دوم', r.status === 200, r.body);
  const t2 = r.body.token;
  const id2 = r.body.user.id;

  // ۳) نام کاربری تکراری
  r = await req('POST', '/api/auth/register', { name: 'تکراری', username: u1, password: 'test1234' });
  check('رد نام کاربری تکراری (409)', r.status === 409, r.body);

  // ۴) ورود
  r = await req('POST', '/api/auth/login', { identifier: u1, password: 'test1234' });
  check('ورود با نام کاربری', r.status === 200 && r.body.token, r.body);

  r = await req('POST', '/api/auth/login', { identifier: u1, password: 'wrongpass' });
  check('رد رمز اشتباه (401)', r.status === 401, r.body);

  // ۵) بدون توکن
  r = await req('GET', '/api/chats');
  check('رد درخواست بدون احراز هویت (401)', r.status === 401, r.body);

  // ۶) پروفایل
  r = await req('GET', '/api/auth/me', null, t1);
  check('GET /api/auth/me', r.status === 200 && r.body.user.username === u1, r.body);

  // ۷) جست‌وجو
  r = await req('GET', '/api/users/search?q=' + u2, null, t1);
  check('جست‌وجوی کاربر', r.status === 200 && r.body.users.some((x) => x.username === u2), r.body);

  // ۸) چت خصوصی
  r = await req('POST', `/api/users/${id2}/dm`, {}, t1);
  check('ساخت چت خصوصی', r.status === 200 && r.body.chat.type === 'dm', r.body);
  const dmId = r.body.chat.id;

  // ۹) ارسال پیام
  r = await req('POST', `/api/messages/chat/${dmId}`, { text: 'سلام تست! 🚀' }, t1);
  check('ارسال پیام', r.status === 200 && r.body.message.id, r.body);
  const msgId = r.body.message.id;

  // ۱۰) تاریخچه
  r = await req('GET', `/api/messages/chat/${dmId}`, null, t2);
  check('دریافت تاریخچه (کاربر دوم)', r.status === 200 && r.body.messages.length === 1, r.body);

  // ۱۱) ویرایش
  r = await req('PATCH', `/api/messages/${msgId}`, { text: 'سلام تست ویرایش‌شده ✏️' }, t1);
  check('ویرایش پیام', r.status === 200 && r.body.message.text.includes('ویرایش'), r.body);

  r = await req('PATCH', `/api/messages/${msgId}`, { text: 'هک' }, t2);
  check('رد ویرایش پیام دیگران (403)', r.status === 403, r.body);

  // ۱۲) واکنش
  r = await req('POST', `/api/messages/${msgId}/reaction`, { emoji: '❤️' }, t2);
  check('واکنش به پیام', r.status === 200 && r.body.reactions.length === 1, r.body);

  // ۱۳) گروه
  r = await req('POST', '/api/chats/create', { type: 'group', title: 'گروه تست', memberIds: [id2], isPublic: true }, t1);
  check('ساخت گروه', r.status === 200 && r.body.chat.memberCount === 2, r.body);
  const gid = r.body.chat.id;
  const code = r.body.chat.inviteCode;

  // ۱۴) کانال + حق ارسال
  r = await req('POST', '/api/chats/create', { type: 'channel', title: 'کانال تست', memberIds: [id2] }, t1);
  check('ساخت کانال', r.status === 200, r.body);
  const cid = r.body.chat.id;

  r = await req('POST', `/api/messages/chat/${cid}`, { text: 'پست غیرمجاز' }, t2);
  check('رد ارسال عضو عادی در کانال (403)', r.status === 403, r.body);

  r = await req('POST', `/api/messages/chat/${cid}`, { text: 'پست ادمین ✅' }, t1);
  check('ارسال مالک کانال', r.status === 200, r.body);

  // ۱۵) پیوستن با کد دعوت
  const rnd3 = Math.random().toString(36).slice(2, 8);
  r = await req('POST', '/api/auth/register', { name: 'تستر سه', username: `third_${rnd3}`, password: 'test1234' });
  const t3 = r.body.token;
  r = await req('POST', `/api/chats/join/${code}`, {}, t3);
  check('پیوستن با لینک دعوت', r.status === 200 && r.body.chat.memberCount === 3, r.body);

  // ۱۶) پین کردن
  r = await req('GET', `/api/messages/chat/${gid}`, null, t1);
  const gMsgId = r.body.messages[r.body.messages.length - 1].id;
  r = await req('POST', `/api/chats/${gid}/pin/${gMsgId}`, {}, t1);
  check('سنجاق کردن پیام', r.status === 200, r.body);

  r = await req('POST', `/api/chats/${gid}/pin/${gMsgId}`, {}, t3);
  check('رد سنجاق توسط عضو عادی (403)', r.status === 403, r.body);

  // ۱۷) فوروارد
  r = await req('POST', '/api/messages/forward', { messageIds: [msgId], chatIds: [gid] }, t1);
  check('هدایت پیام به گروه', r.status === 200 && r.body.forwarded >= 1, r.body);

  // ۱۸) جست‌وجوی پیام
  r = await req('GET', '/api/messages/search?q=تست', null, t1);
  check('جست‌وجوی سراسری پیام', r.status === 200 && r.body.results.length >= 1, r.body);

  // ۱۹) پیام‌های ذخیره‌شده
  r = await req('GET', '/api/chats/saved', null, t1);
  check('چت پیام‌های ذخیره‌شده', r.status === 200 && r.body.chat.isSaved, r.body);

  // ۲۰) حذف پیام
  r = await req('DELETE', `/api/messages/${msgId}?forEveryone=1`, null, t1);
  check('حذف پیام برای همه', r.status === 200, r.body);

  // ۲۱) ترک گروه
  r = await req('POST', `/api/chats/${gid}/leave`, {}, t3);
  check('ترک گروه', r.status === 200, r.body);

  // ۲۲) نشست‌ها
  r = await req('GET', '/api/auth/sessions', null, t1);
  check('لیست نشست‌های فعال', r.status === 200 && r.body.sessions.length >= 1, r.body);

  // ۲۳) XSS — متن باید بدون اجرا ذخیره شود
  r = await req('POST', `/api/messages/chat/${dmId}`, { text: '<img src=x onerror=alert(1)>' }, t1);
  check('ذخیره‌ی امن متن (XSS)', r.status === 200 && r.body.message.text.includes('<img'), r.body);

  // ۲۴) اعتبارسنجی نام کاربری
  r = await req('POST', '/api/auth/register', { name: 'بد', username: 'ab', password: 'test1234' });
  check('رد نام کاربری کوتاه (400)', r.status === 400, r.body);

  // ۲۵) خروج
  r = await req('POST', '/api/auth/logout', {}, t1);
  check('خروج از حساب', r.status === 200, r.body);

  console.log(`\n${'─'.repeat(46)}`);
  console.log(`  نتیجه: ${passed} موفق، ${failed} ناموفق`);
  console.log(`${'─'.repeat(46)}\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('\n💥 خطای غیرمنتظره:', e.message); console.error('   آیا سرور در حال اجراست؟ (npm start)\n'); process.exit(1); });
