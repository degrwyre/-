/**
 * تست رابط کاربری در مرورگر واقعی (Chrome headless)
 * ─────────────────────────────────────────────
 * این تست‌ها اختیاری‌اند و فقط برای توسعه استفاده می‌شوند (نیازی به آن‌ها در استقرار نیست).
 *
 * پیش‌نیاز:
 *   npm i -D puppeteer
 *   npx puppeteer browsers install chrome
 *
 * اجرا (سرور باید در حال اجرا باشد):
 *   node scripts/ui-test.js
 */
let puppeteer;
try { puppeteer = require('puppeteer'); }
catch { console.error('❌ puppeteer نصب نیست. ابتدا:\n   npm i -D puppeteer && npx puppeteer browsers install chrome\n'); process.exit(1); }

// ── ایزولاسیون تست: پایه‌ی داده همیشه از seed تازه ساخته می‌شود ──
try { require('child_process').execSync('node scripts/seed.js', { cwd: require('path').join(__dirname, '..'), stdio: 'ignore' }); } catch {}
const URL = 'http://127.0.0.1:3000';
let pass = 0, fail = 0;
const check = (n, c, extra) => { c ? (console.log('  ✅ ' + n), pass++) : (console.log('  ❌ ' + n, extra !== undefined ? String(extra).slice(0,200) : ''), fail++); };
const wait = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--lang=fa'],
    defaultViewport: { width: 1366, height: 850 },
  });
  const errors = [];
  const page = await browser.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  page.on('requestfailed', (r) => {
    const u = r.url();
    if (u.includes('fonts.g')) return; // فونت خارجی در سندباکس در دسترس نیست
    errors.push('REQFAIL: ' + u + ' ' + (r.failure() && r.failure().errorText));
  });

  console.log('\n🖥️  تست رابط کاربری در Chrome\n');
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 30000 });
  await wait(2000);

  // ۱) صفحه‌ی ورود
  check('صفحه‌ی ورود نمایش داده شد', await page.$('.auth-card') !== null);
  check('عنوان برنامه درست است', (await page.title()).includes('رهام گرام'), await page.title());

  // ۲) اعتبارسنجی فرم
  await page.type('input[name="identifier"]', 'demo');
  await page.type('input[name="password"]', 'wrongpass');
  await page.click('.auth-card button[type="submit"]');
  await wait(900);
  check('رمز اشتباه → پیام خطا', await page.$('.auth-error') !== null);

  // ۳) ورود موفق
  await page.evaluate(() => { document.querySelector('input[name="password"]').value = ''; });
  await page.type('input[name="password"]', 'demo1234');
  await page.click('.auth-card button[type="submit"]');
  await wait(4200);

  check('ورود موفق → چیدمان اصلی', await page.$('.main') !== null);
  check('سایدبار رندر شد', await page.$('.sidebar') !== null);
  check('لیست چت‌ها پر شد', (await page.$$('.chat-item')).length >= 3, await page.$$eval('.chat-item', n => n.length));

  const titles = await page.$$eval('.ci-name', ns => ns.map(n => n.textContent.trim()));
  console.log('     چت‌ها:', titles.join(' | '));
  check('گروه نمونه در لیست است', titles.some(t => t.includes('توسعه‌دهندگان')));
  check('کانال نمونه در لیست است', titles.some(t => t.includes('اخبار رهام گرام')));

  // ۴) باز کردن چت
  await page.evaluate(() => {
    const items = [...document.querySelectorAll('.chat-item')];
    const g = items.find(i => i.querySelector('.ci-name').textContent.includes('توسعه‌دهندگان'));
    g && g.click();
  });
  await wait(2200);
  check('هدر چت نمایش داده شد', await page.$('.chat-header .ch-name') !== null);
  check('پیام‌ها رندر شدند', (await page.$$('.msg')).length >= 4, await page.$$eval('.msg', n => n.length));
  check('پیام سنجاق‌شده نمایش داده شد', await page.$('.pin-bar') !== null);
  check('کامپوزر فعال است', await page.$('#msg-input') !== null);
  check('جداکننده‌ی روز وجود دارد', await page.$('.day-sep') !== null);

  // ۵) ارسال پیام
  await page.click('#msg-input');
  await page.type('#msg-input', 'سلام از تست خودکار مرورگر! 🎉');
  await wait(700);
  const before = (await page.$$('.msg')).length;
  await page.keyboard.press('Enter');
  await wait(2500);
  const after = (await page.$$('.msg')).length;
  check('پیام با Enter ارسال شد (بدون تکرار)', after === before + 1, `${before} → ${after}`);
  const lastText = await page.$eval('.msg:last-child .m-text', n => n.textContent);
  check('متن پیام درست است', lastText.includes('تست خودکار مرورگر'), lastText);
  check('تیک ارسال نمایش داده شد', await page.$('.msg:last-child .ticks') !== null);

  // ۶) لیست چت به‌روز شد
  const preview = await page.$eval('.chat-item.active .ci-preview', n => n.textContent);
  check('پیش‌نمایش در لیست به‌روز شد', preview.includes('تست خودکار'), preview);

  // ۷) واکنش
  await page.evaluate(() => {
    const btns = document.querySelectorAll('.msg:last-child .quick button');
    btns[1] && btns[1].click();
  });
  await wait(2000);
  check('واکنش 👍 اضافه شد', await page.$('.msg:last-child .react-chip') !== null);

  // ۸) منوی راست‌کلیک
  await page.evaluate(() => {
    const m = document.querySelector('.msg:last-child .bubble');
    const r = m.getBoundingClientRect();
    m.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: r.left + 10, clientY: r.top + 10 }));
  });
  await wait(600);
  check('منوی راست‌کلیک باز شد', await page.$('.ctx-menu') !== null);
  const menuItems = await page.$$eval('.ctx-menu .dd-item', ns => ns.map(n => n.textContent.trim()));
  console.log('     آیتم‌های منو:', menuItems.join(' / '));
  check('منو شامل پاسخ و کپی است', menuItems.some(t => t.includes('پاسخ')) && menuItems.some(t => t.includes('کپی')));
  await page.keyboard.press('Escape');
  await wait(300);

  // ۹) ایموجی‌پیکر
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.composer .icon-btn')];
    const e = btns.find(b => b.title === 'ایموجی'); e && e.click();
  });
  await wait(600);
  check('انتخابگر ایموجی باز شد', await page.$('.emoji-picker') !== null);
  check('ایموجی‌ها رندر شدند', (await page.$$('.ep-grid button')).length > 50);
  await page.evaluate(() => document.querySelector('.ep-grid button').click());
  await wait(400);
  check('ایموجی در ورودی درج شد', (await page.$eval('#msg-input', n => n.value)).length > 0);
  await page.evaluate(() => { document.querySelector('#msg-input').value = ''; document.querySelector('#msg-input').dispatchEvent(new Event('input')); });
  await wait(200);

  // ۱۰) جست‌وجو
  await page.click('#global-search');
  await page.type('#global-search', 'سارا');
  await wait(1600);
  check('نتایج جست‌وجو نمایش داده شد', await page.$('.search-results') !== null);
  check('کاربر در نتایج پیدا شد', (await page.$$('.search-results .sr-item')).length > 0, await page.$$eval('.search-results .sr-item', n=>n.length));
  await page.evaluate(() => { const i=document.querySelector('#global-search'); i.value=''; i.dispatchEvent(new Event('input')); });
  await wait(500);

  // ۱۱) فیلتر تب‌ها
  await page.evaluate(() => {
    const tabs = [...document.querySelectorAll('.sb-tabs button')];
    tabs.find(t => t.textContent.includes('کانال')) && tabs.find(t => t.textContent.includes('کانال')).click();
  });
  await wait(700);
  const chanOnly = await page.$$eval('.chat-item .ci-name', ns => ns.map(n => n.textContent));
  check('فیلتر کانال‌ها کار می‌کند', chanOnly.length >= 1 && chanOnly.every(t => t.includes('اخبار')), chanOnly.join('|'));
  await page.evaluate(() => document.querySelectorAll('.sb-tabs button')[0].click());
  await wait(500);

  // ۱۲) پنل اطلاعات چت
  await page.evaluate(() => document.querySelector('.chat-header .ch-info').click());
  await wait(1800);
  check('پنل اطلاعات چت باز شد', await page.$('.side-panel') !== null);
  check('لیست اعضا نمایش داده شد', (await page.$$('.member-row')).length >= 3, await page.$$eval('.member-row', n=>n.length));
  await page.evaluate(() => document.querySelector('.side-panel .sp-head .icon-btn').click());
  await wait(500);

  // ۱۳) تنظیمات
  await page.evaluate(() => document.querySelector('.sb-head .icon-btn').click());
  await wait(500);
  check('منوی اصلی باز شد', await page.$('.dropdown') !== null);
  await page.evaluate(() => {
    const it = [...document.querySelectorAll('.dropdown .dd-item')].find(x => x.textContent.includes('تنظیمات'));
    it && it.click();
  });
  await wait(1200);
  check('پنل تنظیمات باز شد', await page.$('#settings-panel') !== null);
  const themeBefore = await page.evaluate(() => document.documentElement.dataset.theme);
  await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#settings-panel .setting-row')];
    const r = rows.find(x => x.textContent.includes('حالت شب'));
    r && r.click();
  });
  await wait(700);
  const themeAfter = await page.evaluate(() => document.documentElement.dataset.theme);
  check('تغییر تم کار می‌کند', themeBefore !== themeAfter, `${themeBefore} → ${themeAfter}`);

  // ۱۴) اسکرین‌شات
  await page.evaluate(() => document.querySelector('#settings-panel .sp-head .icon-btn').click());
  await wait(500);
  await page.screenshot({ path: '/home/user/messenger-preview-dark.png' });
  await page.evaluate(() => document.documentElement.dataset.theme = 'light');
  await wait(600);
  await page.screenshot({ path: '/home/user/messenger-preview-light.png' });

  // ۱۵) موبایل
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.evaluate(() => document.documentElement.dataset.theme = 'dark');
  await wait(900);
  check('حالت موبایل: سایدبار دیده می‌شود', await page.$('.chat-item') !== null);
  await page.screenshot({ path: '/home/user/messenger-preview-mobile.png' });

  // گزارش خطاها
  const realErrors = errors.filter(e =>
    !e.includes('favicon') && !e.includes('sw.js') &&
    !e.includes('401') && !e.includes('ERR_FAILED'));
  check('بدون خطای جاوااسکریپت در کنسول', realErrors.length === 0, realErrors.slice(0, 6).join('\n     '));

  await browser.close();
  console.log(`\n${'─'.repeat(50)}\n  نتیجه: ${pass} موفق، ${fail} ناموفق\n${'─'.repeat(50)}\n`);
  process.exit(fail ? 1 : 0);
})().catch(async e => { console.error('💥', e.message); process.exit(1); });
