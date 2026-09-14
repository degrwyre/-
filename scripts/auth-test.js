/**
 * تست کامل جریان ثبت‌نام و ورود در مرورگر واقعی
 * ─────────────────────────────────────────────
 * پیش‌نیاز:  npm i -D puppeteer && npx puppeteer browsers install chrome
 * اجرا (سرور در حال اجرا):  node scripts/auth-test.js
 */
let puppeteer;
try { puppeteer = require('puppeteer'); }
catch { console.error('❌ puppeteer نصب نیست. ابتدا:\n   npm i -D puppeteer && npx puppeteer browsers install chrome\n'); process.exit(1); }

// ── ایزولاسیون تست: پایه‌ی داده همیشه از seed تازه ساخته می‌شود ──
try { require('child_process').execSync('node scripts/seed.js', { cwd: require('path').join(__dirname, '..'), stdio: 'ignore' }); } catch {}
const wait = ms => new Promise(r => setTimeout(r, ms));
let pass=0, fail=0;
const check = (n,c,x)=>{ c?(console.log('  ✅ '+n),pass++):(console.log('  ❌ '+n, x!==undefined?String(x).slice(0,220):''),fail++); };
(async () => {
  require('fs').rmSync('/tmp/va1',{recursive:true,force:true});
  require('fs').rmSync('/tmp/va2',{recursive:true,force:true});
  const b1 = await puppeteer.launch({ headless:'new', userDataDir:'/tmp/va1', args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage'], defaultViewport:{width:1280,height:800} });
  const b2 = await puppeteer.launch({ headless:'new', userDataDir:'/tmp/va2', args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage'], defaultViewport:{width:1280,height:800} });
  const uname = 'roham_' + Date.now().toString().slice(-6);
  const phone = '0912' + Date.now().toString().slice(-7);

  console.log('\n🔐 تست ثبت‌نام و ورود\n');

  // ── ثبت‌نام از رابط کاربری ──
  const p1 = await b1.newPage();
  const errs = [];
  p1.on('pageerror', e => errs.push(e.message));
  await p1.goto('http://127.0.0.1:3000', { waitUntil:'networkidle2' });
  await wait(2200);
  check('نام جدید در صفحه‌ی ورود', (await p1.$eval('.auth-head h1', n=>n.textContent)).includes('رهام گرام'));
  await p1.evaluate(() => { [...document.querySelectorAll('.tabs button')].find(b=>b.textContent.includes('ثبت‌نام')).click(); });
  await wait(400);

  // اعتبارسنجی کلاینت: فرم خالی
  await p1.click('.auth-card button[type="submit"]');
  await wait(500);
  check('فرم خالی → پیام خطای فارسی', (await p1.$eval('.auth-error', n=>n.textContent)).includes('نام'), await p1.$eval('.auth-error', n=>n.textContent));

  // ثبت‌نام معتبر
  await p1.type('input[name="name"]', 'رهام آزمایشی');
  await p1.type('input[name="username"]', uname);
  await p1.type('input[name="phone"]', phone);
  await p1.type('input[name="password"]', 'rehram1234');
  await p1.click('.auth-card button[type="submit"]');
  await wait(4000);
  check('ثبت‌نام موفق → ورود خودکار به برنامه', (await p1.$('.main')) !== null);
  check('نام کاربر در سایدبار/تنظیمات درست است', (await p1.evaluate(()=>State.me.username)) === uname);

  // خروج (پاک‌کردن نشست محلی و بارگذاری مجدد)
  await p1.evaluate(() => { localStorage.clear(); });
  await p1.goto('http://127.0.0.1:3000', { waitUntil:'networkidle2' });
  await wait(2500);

  // ── ورود با نام کاربری ──
  await p1.type('input[name="identifier"]', uname);
  await p1.type('input[name="password"]', 'rehram1234');
  await p1.click('.auth-card button[type="submit"]');
  await wait(4000);
  check('ورود با نام کاربری موفق', (await p1.$('.main')) !== null);

  // خروج و ورود با شماره
  await p1.evaluate(() => { localStorage.clear(); });
  await p1.goto('http://127.0.0.1:3000', { waitUntil:'networkidle2' });
  await wait(2500);
  await p1.type('input[name="identifier"]', phone);
  await p1.type('input[name="password"]', 'rehram1234');
  await p1.click('.auth-card button[type="submit"]');
  await wait(4000);
  check('ورود با شماره موبایل موفق', (await p1.$('.main')) !== null);

  // ورود با @نام کاربری
  await p1.evaluate(() => { localStorage.clear(); });
  await p1.goto('http://127.0.0.1:3000', { waitUntil:'networkidle2' });
  await wait(2500);
  await p1.type('input[name="identifier"]', '@' + uname);
  await p1.type('input[name="password"]', 'rehram1234');
  await p1.click('.auth-card button[type="submit"]');
  await wait(4000);
  check('ورود با @نام‌کاربری موفق', (await p1.$('.main')) !== null);

  // رمز اشتباه → پیام فارسی
  await p1.evaluate(() => { localStorage.clear(); });
  await p1.goto('http://127.0.0.1:3000', { waitUntil:'networkidle2' });
  await wait(2500);
  await p1.type('input[name="identifier"]', uname);
  await p1.type('input[name="password"]', 'wrongpass');
  await p1.click('.auth-card button[type="submit"]');
  await wait(1500);
  check('رمز اشتباه → پیام خطای فارسی', (await p1.$eval('.auth-error', n=>n.textContent)).includes('اشتباه'));

  // حساب نمونه هم هنوز کار می‌کند
  const p2 = await b2.newPage();
  await p2.goto('http://127.0.0.1:3000', { waitUntil:'networkidle2' });
  await wait(2200);
  await p2.type('input[name="identifier"]', 'demo');
  await p2.type('input[name="password"]', 'demo1234');
  await p2.click('.auth-card button[type="submit"]');
  await wait(4000);
  check('حساب نمونه demo کار می‌کند', (await p2.$('.main')) !== null);
  check('بدون خطای جاوااسکریپت', errs.length === 0, errs.join(' | '));

  await b1.close(); await b2.close();
  console.log(`\n${'─'.repeat(46)}\n  نتیجه: ${pass} موفق، ${fail} ناموفق\n${'─'.repeat(46)}\n`);
  process.exit(fail?1:0);
})().catch(e=>{ console.error('💥', e.message); process.exit(1); });
