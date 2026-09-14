/**
 * تست سناریوی دو کاربر همزمان در دو مرورگر مستقل
 * ─────────────────────────────────────────────
 * این تست‌ها اختیاری‌اند و فقط برای توسعه استفاده می‌شوند (نیازی به آن‌ها در استقرار نیست).
 *
 * پیش‌نیاز:
 *   npm i -D puppeteer
 *   npx puppeteer browsers install chrome
 *
 * اجرا (سرور باید در حال اجرا باشد):
 *   node scripts/e2e-test.js
 */
let puppeteer;
try { puppeteer = require('puppeteer'); }
catch { console.error('❌ puppeteer نصب نیست. ابتدا:\n   npm i -D puppeteer && npx puppeteer browsers install chrome\n'); process.exit(1); }

// ── ایزولاسیون تست: پایه‌ی داده همیشه از seed تازه ساخته می‌شود ──
try { require('child_process').execSync('node scripts/seed.js', { cwd: require('path').join(__dirname, '..'), stdio: 'ignore' }); } catch {}
const wait = ms => new Promise(r => setTimeout(r, ms));
let pass=0, fail=0;
const check = (n,c,x)=>{ c?(console.log('  ✅ '+n),pass++):(console.log('  ❌ '+n, x!==undefined?String(x).slice(0,200):''),fail++); };

// هر کاربر در یک مرورگر کاملاً جدا (پروفایل مستقل) تا localStorage و کوکی قاطی نشود
async function newBrowser(dir) {
  return puppeteer.launch({
    headless: 'new',
    userDataDir: require('os').tmpdir() + '/cg-' + dir,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    defaultViewport: { width: 1280, height: 800 },
  });
}
async function login(browser, user, pass_) {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:3000', { waitUntil: 'networkidle2' });
  await wait(2200);
  await page.type('input[name="identifier"]', user);
  await page.type('input[name="password"]', pass_);
  await page.click('.auth-card button[type="submit"]');
  await wait(4500);
  return page;
}

(async () => {
  require('fs').rmSync(require('os').tmpdir() + '/cg-pA', { recursive: true, force: true });
  require('fs').rmSync(require('os').tmpdir() + '/cg-pB', { recursive: true, force: true });
  const browserA = await newBrowser('pA');
  const browserB = await newBrowser('pB');
  console.log('\n👥 تست دو کاربر همزمان در دو مرورگر مستقل\n');

  const A = await login(browserA, 'demo', 'demo1234');
  const B2 = await login(browserB, 'sara', 'demo1234');
  check('هر دو کاربر وارد شدند', (await A.$('.main')) && (await B2.$('.main')));

  // A یک چت خصوصی با B باز می‌کند
  const opened = await A.evaluate(async () => {
    const r = await fetch('/api/users/search?q=sara', { headers: { Authorization: 'Bearer ' + State.token } });
    const d = await r.json();
    const u = d.users.find(x => x.username === 'sara');
    if (!u) return null;
    const dm = await fetch(`/api/users/${u.id}/dm`, { method:'POST', headers: { Authorization: 'Bearer ' + State.token } });
    return (await dm.json()).chat.id;
  });
  check('چت خصوصی A↔B ساخته شد', !!opened, opened);

  await A.evaluate((id) => Chat.open(id), opened);
  await wait(2000);
  await wait(800);
  await B2.evaluate(() => { [...document.querySelectorAll('.chat-item')].find(i=>i.querySelector('.ci-name').textContent.includes('demo') || i.querySelector('.ci-name').textContent.includes('کاربر نمونه'))?.click(); });
  await wait(2500);
  check('B چت با A را باز کرد', (await B2.$('.chat-header .ch-name')) !== null);

  // A پیام می‌فرستد
  await A.click('#msg-input');
  await A.type('#msg-input', 'سلام سارا! این پیام باید آنی برسد ⚡');
  await wait(500);
  await A.keyboard.press('Enter');
  await wait(2500);

  const bTexts = await B2.$$eval('.msg .m-text', ns => ns.map(n=>n.textContent));
  check('B پیام را آنی دریافت کرد', bTexts.some(t=>t.includes('باید آنی برسد')), JSON.stringify(bTexts));

  const bBadge = await B2.evaluate(() => State.chats.get(State.activeChatId).unread);
  check('چت باز B خوانده‌نشده نگرفت', bBadge === 0, bBadge);

  // B پاسخ می‌دهد با ریپلای
  await B2.evaluate(() => {
    const last = document.querySelector('.msg:last-child .quick button');
    last && last.click();
  });
  await wait(700);
  check('نوار پاسخ برای B ظاهر شد', (await B2.$('.reply-bar')) !== null);
  await B2.click('#msg-input');
  await B2.type('#msg-input', 'رسید! عالی کار می‌کنه 👌');
  await wait(500);
  await B2.keyboard.press('Enter');
  await wait(2500);

  const aReplies = await A.$$eval('.msg .m-reply', ns => ns.length);
  check('A پاسخِ ریپلای‌شده را دید', aReplies >= 1, aReplies);
  const aTexts = await A.$$eval('.msg .m-text', ns => ns.map(n=>n.textContent));
  check('A متن پاسخ B را دید', aTexts.some(t=>t.includes('عالی کار می‌کنه')), JSON.stringify(aTexts.slice(-3)));

  // A نشانگر «در حال نوشتن» را وقتی B تایپ می‌کند می‌بیند
  await B2.click('#msg-input');
  await B2.type('#msg-input', 'دارم تایپ می‌کنم');
  await wait(1200);
  const aTyping = await A.$eval('#ch-status', n=>n.textContent).catch(()=>'');
  check('A وضعیت «در حال نوشتن» را دید', aTyping.includes('نوشتن'), aTyping);
  await B2.evaluate(()=>{ const t=document.querySelector('#msg-input'); t.value=''; t.dispatchEvent(new Event('input')); });

  // تیک خوانده‌شدن
  await A.evaluate(()=>{ [...document.querySelectorAll('.msg')].length; });
  await wait(1500);
  const ticks = await A.$$eval('.msg.out:last-of-type .ticks', ns => ns.map(n=>n.className));
  console.log('     تیک‌های A:', JSON.stringify(ticks));

  // B یک عکس آپلود می‌کند
  const uploaded = await B2.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width=320; canvas.height=200;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle='#3390ec'; ctx.fillRect(0,0,320,200);
    ctx.fillStyle='#fff'; ctx.font='22px sans-serif'; ctx.fillText('RohamGram Test', 60, 105);
    const blob = await new Promise(r=>canvas.toBlob(r,'image/png'));
    const fd = new FormData();
    fd.append('file', new File([blob], 'test-image.png', {type:'image/png'}));
    fd.append('text', 'یک تصویر آزمایشی 🖼️');
    const r = await fetch(`/api/messages/chat/${State.activeChatId}/upload`, { method:'POST', body: fd, headers:{ Authorization:'Bearer '+State.token } });
    return { status: r.status, body: await r.json() };
  });
  check('B تصویر آپلود کرد', uploaded.status===200 && uploaded.body.message.media.type==='image', JSON.stringify(uploaded).slice(0,200));
  await wait(2500);
  const aImg = await A.$$('.msg .m-media img');
  check('A تصویر را آنی دید', aImg.length >= 1, aImg.length);

  // تصویر واقعاً قابل بارگذاری است
  const imgOk = await A.evaluate(async () => {
    const im = document.querySelector('.msg .m-media img');
    if (!im) return 'no img';
    if (im.complete && im.naturalWidth > 0) return 'loaded:' + im.naturalWidth + 'x' + im.naturalHeight;
    return 'pending:' + im.src.slice(0,60);
  });
  check('تصویر در مرورگر A بارگذاری شد', String(imgOk).startsWith('loaded'), imgOk);

  await A.screenshot({ path: '/home/user/messenger-preview-chat.png' });

  await browserA.close(); await browserB.close();
  console.log(`\n${'─'.repeat(50)}\n  نتیجه: ${pass} موفق، ${fail} ناموفق\n${'─'.repeat(50)}\n`);
  process.exit(fail?1:0);
})().catch(e=>{ console.error('💥', e.message); process.exit(1); });
