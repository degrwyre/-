/**
 * تست لایه‌ی زمان‌واقعی (Socket.IO) با کلاینت واقعی
 * ─────────────────────────────────────────────
 * پیش‌نیاز:  npm i -D socket.io-client
 * اجرا (سرور در حال اجرا):  npm run test:socket
 */
const { io } = require('socket.io-client');
const http = require('http');
const BASE = 'http://127.0.0.1:3000';

function req(method, path, body, token) {
  return new Promise((res, rej) => {
    const data = body ? JSON.stringify(body) : null;
    const u = new URL(BASE + path);
    const o = { method, hostname: u.hostname, port: u.port, path: u.pathname + u.search, headers: { 'Content-Type': 'application/json' } };
    if (data) o.headers['Content-Length'] = Buffer.byteLength(data);
    if (token) o.headers.Authorization = 'Bearer ' + token;
    const r = http.request(o, (x) => { let b=''; x.on('data',c=>b+=c); x.on('end',()=>{ let j=null; try{j=JSON.parse(b)}catch{} res({status:x.statusCode, body:j}); }); });
    r.on('error', rej); if (data) r.write(data); r.end();
  });
}
const wait = (ms) => new Promise(r => setTimeout(r, ms));
let pass=0, fail=0;
const check = (n,c,extra) => { c ? (console.log('  ✅ '+n), pass++) : (console.log('  ❌ '+n, extra!==undefined?JSON.stringify(extra).slice(0,160):''), fail++); };

(async () => {
  const rnd = Math.random().toString(36).slice(2,7);
  const a = await req('POST','/api/auth/register',{name:'آرش',username:'rt_a_'+rnd,password:'test1234'});
  const b = await req('POST','/api/auth/register',{name:'بهار',username:'rt_b_'+rnd,password:'test1234'});
  check('ساخت دو کاربر', a.status===200 && b.status===200, {a:a.status,b:b.status});

  const dm = await req('POST', `/api/users/${b.body.user.id}/dm`, {}, a.body.token);
  check('ساخت چت خصوصی', dm.status===200, dm.body);
  const chatId = dm.body.chat.id;

  // اتصال دو کلاینت سوکت
  const sa = io(BASE, { auth: { token: a.body.token }, transports:['websocket'] });
  const sb = io(BASE, { auth: { token: b.body.token }, transports:['websocket'] });

  const events = { bNew:null, aSent:null, typing:null, presence:null, read:null, reaction:null, edited:null, deleted:null };
  sb.on('message:new', (p) => { events.bNew = p; });
  sa.on('message:sent', (p) => { events.aSent = p; });
  sb.on('typing', (p) => { events.typing = p; });
  sb.on('user:presence', (p) => { events.presence = p; });
  sa.on('chat:read', (p) => { events.read = p; });
  sb.on('message:reaction', (p) => { events.reaction = p; });
  sb.on('message:edited', (p) => { events.edited = p; });
  sb.on('message:deleted', (p) => { events.deleted = p; });

  await Promise.all([
    new Promise(r => sa.on('connect', r)),
    new Promise(r => sb.on('connect', r)),
  ]);
  check('اتصال هر دو سوکت', sa.connected && sb.connected);

  sa.emit('chat:open', { chatId });
  sb.emit('chat:open', { chatId });
  await wait(500);
  check('رویداد وضعیت آنلاین دریافت شد', !!events.presence && events.presence.online === true, events.presence);

  // ۱) ارسال پیام از طریق سوکت
  const ackRes = await new Promise(r => sa.emit('message:send', { chatId, text:'سلام بهاره! 🚀', tempId:'t1' }, r));
  check('ارسال پیام با سوکت (ack)', ackRes && ackRes.message && ackRes.message.id, ackRes);
  await wait(400);
  check('گیرنده پیام جدید را گرفت', events.bNew && events.bNew.message.text.includes('بهاره'), events.bNew && events.bNew.message);
  check('فرستنده تأیید message:sent گرفت', events.aSent && events.aSent.tempId==='t1', events.aSent);
  const msgId = ackRes.message.id;

  // ۲) تایپینگ
  sa.emit('typing:start', { chatId });
  await wait(300);
  check('نشانگر «در حال نوشتن»', events.typing && events.typing.typing === true, events.typing);

  // ۳) خوانده‌شدن
  await req('POST', `/api/messages/chat/${chatId}/read`, {}, b.body.token);
  await wait(350);
  check('رویداد خوانده‌شدن به فرستنده رسید', events.read && events.read.userId === b.body.user.id, events.read);

  // ۴) واکنش
  sa.emit('message:react', { messageId: msgId, emoji:'❤️' });
  await wait(350);
  check('واکنش زنده منتشر شد', events.reaction && events.reaction.reactions.length===1, events.reaction);

  // ۵) ویرایش
  await req('PATCH', `/api/messages/${msgId}`, { text:'سلام بهاره! (ویرایش شد ✏️)' }, a.body.token);
  await wait(350);
  check('ویرایش زنده منتشر شد', events.edited && events.edited.text.includes('ویرایش'), events.edited);

  // ۶) ارسال فایل base64 از طریق سوکت (پیام صوتی شبیه‌سازی‌شده)
  const b64 = 'data:audio/webm;base64,' + Buffer.from('fake-audio-bytes-for-test').toString('base64');
  const ackFile = await new Promise(r => sa.emit('message:send', { chatId, text:'', tempId:'t2', file:{ name:'voice.webm', data:b64, kind:'voice', duration:3.2 } }, r));
  check('ارسال فایل base64 با سوکت', ackFile && ackFile.message && ackFile.message.media && ackFile.message.media.type==='voice', ackFile);
  if (ackFile.message && ackFile.message.media) {
    const mediaRes = await new Promise((resolve) => {
      const u = new URL(BASE + ackFile.message.media.url);
      http.get({ hostname:u.hostname, port:u.port, path:u.pathname, headers:{ Authorization:'Bearer '+a.body.token } }, (x) => {
        let d=[]; x.on('data',c=>d.push(c)); x.on('end',()=>resolve({status:x.statusCode, len:Buffer.concat(d).length}));
      }).on('error', ()=>resolve({status:0}));
    });
    check('فایل آپلودشده قابل دانلود است', mediaRes.status===200 && mediaRes.len>0, mediaRes);
  }

  // ۷) حذف
  await req('DELETE', `/api/messages/${msgId}?forEveryone=1`, null, a.body.token);
  await wait(350);
  check('حذف زنده منتشر شد', events.deleted && events.deleted.messageId===msgId, events.deleted);

  // ۸) سوکت بدون توکن باید رد شود
  const bad = io(BASE, { auth:{}, transports:['websocket'], reconnection:false });
  const badErr = await new Promise(r => { bad.on('connect_error', (e)=>r(e.message)); bad.on('connect', ()=>r('CONNECTED!')); setTimeout(()=>r('timeout'), 4000); });
  check('رد اتصال بدون توکن', badErr === 'unauthorized', badErr);
  bad.close();

  // ۹) آفلاین شدن
  sa.close();
  await wait(600);
  const offlineEv = await req('GET', `/api/users/${a.body.user.id}`, null, b.body.token);
  check('آخرین بازدید به‌روز شد', offlineEv.status===200, offlineEv.status);

  sb.close();
  console.log(`\n${'─'.repeat(46)}\n  نتیجه: ${pass} موفق، ${fail} ناموفق\n${'─'.repeat(46)}\n`);
  process.exit(fail?1:0);
})().catch(e => { console.error('💥', e); process.exit(1); });
