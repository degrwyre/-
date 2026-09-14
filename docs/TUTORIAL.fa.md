# 🎓 آموزش کامل رهام گرام (RohamGram)

> پیام‌رسان وب شبیه تلگرام — Node.js + Express + Socket.IO + SQLite
> نسخه ۱.۱.۱ — این سند هم در ریپو هست (`docs/TUTORIAL.fa.md`)

---

## فهرست
1. [پروژه چه شکلی است؟ (ساختار فایل‌ها)](#۱-ساختار-فایلها)
2. [معماری: یک پیام چطور از فرستنده به گیرنده می‌رسد؟](#۲-معماری)
3. [اجرای محلی روی کامپیوتر خودتان](#۳-اجرای-محلی)
4. [آپلود روی GitHub](#۴-آپلود-روی-github)
5. [دیپلوی روی Railway](#۵-دیپلوی-روی-railway)
6. [دیپلوی با Docker (اختیاری)](#۶-docker)
7. [تست‌ها](#۷-تستها)
8. [شخصی‌سازی](#۸-شخصیسازی)
9. [عیب‌یابی مشکلات رایج](#۹-عیبیابی)

---

## ۱) ساختار فایل‌ها

```
rohamgram/
├── server/                     ← کل بک‌اند + فرانت‌اند استاتیک
│   ├── index.js                ← نقطه‌ی شروع: ساخت HTTP سرور + اتصال Socket.IO + banner شروع
│   ├── app.js                  ← ساخت اپ Express: helmet، rate-limit، کوکی‌ها، استاتیک، routeها
│   ├── socket.js               ← منطق real-time: auth سوکت، ارسال/ویرایش/حذف پیام، تایپ، خواندن، presence، پیام صوتی
│   ├── config/index.js         ← همه‌ی تنظیمات از env: PORT، JWT_SECRET، APP_NAME، مسیر data و…
│   ├── db/index.js             ← اتصال better-sqlite3 + ساخت جدول‌ها + ایندکس‌ها
│   ├── middleware/
│   │   ├── auth.js             ← خواندن کوکی cg_token، اعتبارسنجی JWT دست‌ساز (HS256)، inject کردن user
│   │   ├── asyncWrap.js        ← گرفتن خودکار خطاهای async و فرستادن به error handler
│   │   ├── error.js            ← error handler مرکزی: تبدیل خطا به JSON فارسی/انگلیسی
│   │   └── router.js           ← نگه‌داشتن ref روتر سوکت برای استفاده در REST (emit سرور→کلاینت)
│   ├── routes/
│   │   ├── index.js            ← مونتاژ routeها زیر /api +endpoint سلامت و config
│   │   ├── auth.js             ← register / login / logout / me
│   │   ├── users.js            ← جست‌وجوی کاربر، پروفایل، تغییر رمز/نام/آواتار، مسدودی
│   │   ├── chats.js            ← ساخت چت/گروه/کانال، عضوها، لینک دعوت، پیون، pin، saved
│   │   ├── messages.js         ← تاریخچه، ویرایش، حذف، واکنش، pin، forward، جست‌وجو
│   │   └── media.js            ← آپلود (multer) + سرو فایل با Range و ?dl=1
│   ├── utils/
│   │   ├── chat.js             ← توابع کمکی چت: آخرین پیام، شمارنده‌خوانده‌نشده، ترتیب
│   │   ├── emitter.js          ← پل REST→Socket: وقتی REST چیزی ساخت، سوکت اطلاع بدهد
│   │   ├── files.js            ← اعتبارسنجی نوع/حجم فایل آپلودی
│   │   ├── helpers.js          ← slugify، ساخت کد دعوت، فرمت زمان و…
│   │   └── presence.js         ← وضعیت آنلاین/آخرین بازدید کاربرها
│   └── public/                 ← فرانت‌اند (بدون build! فقط HTML/CSS/JS خالص)
│       ├── index.html          ← پوسته‌ی صفحه + ترتیب لود اسکریپت‌ها
│       ├── css/style.css       ← کل استایل: تم تاریک/روشن، RTL، حباب پیام، ریسپانسیو
│       ├── manifest.webmanifest← مشخصات PWA (نام، آیکون، رنگ)
│       ├── sw.js               ← سرویس‌ورکر network-first (آفلاین‌خوانی پوسته)
│       ├── assets/favicon.svg  ← آیکون
│       └── js/                 ← ماژول‌های فرانت (ترتیب لود مهم است!)
│           ├── utils.js        ← el()، esc()، فرمت زمان، store، آواتار رنگی
│           ├── state.js        ← استیت سراسری State + تنظیمات محلی + عنوان سند
│           ├── api.js          ← کلاینت REST: fetch با کوکی + تبدیل خطا
│           ├── ui.js           ← توست، مودال، confirm، منوی راست‌کلیک
│           ├── chatlist.js     ← رندر لیست چت‌ها، تب‌ها، جست‌وجو، FAB
│           ├── messages.js     ← رندر حباب پیام، تیک‌ها، واکنش‌ها، ضمیمه‌ها، صدای ضبط‌شده
│           ├── chat.js         ← باز/بسته‌کردن چت، تاریخچه، اسکرول، compose، ارسال Enter
│           ├── panels.js       ← پنل تنظیمات، پروفایل، درباره
│           ├── chatmodals.js   ← مودال ساخت گروه/کانال، اطلاعات چت، اعضا، دعوت، forward
│           ├── auth.js         ← صفحه‌ی ورود/ثبت‌نام + مدیریت نشست (Session)
│           ├── settings.js     ← ذخیره‌ی تنظیمات کاربر (تم، فونت، enterToSend و…)
│           └── main.js         ← bootstrap: بررسی نشست، لود config، وصل سوکت، مسیردهی اولیه
├── scripts/
│   ├── seed.js                 ← ساخت داده‌ی نمونه: demo/sara/reza/mina + گروه + کانال + پیام‌ها
│   ├── smoke-test.js           ← ۳۱ تست API (ثبت‌نام تا مسدودی) — بدون مرورگر
│   ├── rt-test.js              ← ۱۶ تست real-time سوکت با socket.io-client
│   ├── ui-test.js              ← ۳۳ تست رابط کاربری با Puppeteer (مرورگر واقعی)
│   ├── e2e-test.js             ← ۱۲ تست سناریوی دو کاربره زنده
│   └── auth-test.js            ← ۱۰ تست ثبت‌نام/ورود در مرورگر واقعی
├── docs/screenshots/           ← ۸ اسکرین‌شات برای README
├── package.json                ← وابستگی‌ها + اسکریپت‌های npm
├── .env.example                ← نمونه‌ی متغیرهای محیطی (کپی کنید به .env)
├── .gitignore                  ← node_modules و data و .env نادیده گرفته می‌شوند
├── Procfile                    ← برای پلتفرم‌های Heroku-style: web: node server/index.js
├── railway.json / railway.toml ← تنظیمات Railway (start command + volume)
├── Dockerfile                  ← ایمیج داکر سبک (node:20-alpine)
├── docker-compose.yml          ← اجرا با داکر + volume روی ./data
└── LICENSE                     ← MIT
```

**نکته‌ی مهم:** `node_modules/`، `data/` و `.env` هرگز آپلود نمی‌شوند (در `.gitignore` هستند و در zip نیستند).

---

## ۲) معماری

### یک پیام خصوصی، قدم‌به‌قدم:
1. **فرانت:** کاربر در `chat.js` تایپ می‌کند و Enter می‌زند → یک «پیام خوش‌بینانه» (optimistic) با `tempId` فوراً رندر می‌شود تا حس آنی بدهد.
2. **سوکت:** `socket.io` رویداد `message:send` می‌فرستد (نه REST! چون real-time است).
3. **سرور:** `socket.js` با کوکی همان اتصال auth می‌کند، پیام را در SQLite ذخیره می‌کند (`messages` table)، سپس به اتاق چت `chat:<id>` emit می‌کند.
4. **گیرنده:** سوکت گیرنده رویداد `message:new` می‌گیرد → `messages.js` حباب را رندر می‌کند + لیست چت بالا می‌آید + اگر چت باز است، خودکار `message:read` برمی‌گردد.
5. **تیک‌ها:** سرور `sentReadUpTo` را نگه می‌دارد؛ وقتی گیرنده چت را باز کرد، `chat:read` emit می‌شود و تیک فرستنده دوتایی ✓✓ می‌شود.
6. **تأیید فرستنده:** سرور رویداد `message:sent` با `serverId` برمی‌گرداند؛ فرانت پیام موقت را با واقعی **جایگزین** می‌کند (نه اینکه دومی اضافه کند).

### احراز هویت:
- ثبت‌نام → رمز با `bcryptjs` hash می‌شود → توکن JWT (HS256، دست‌ساز در `middleware/auth.js`) با_payload `{uid, sid}` به‌مدت ۳۰ روز در کوکی **httpOnly** به نام `cg_token` ست می‌شود (از دست XSS دور است).
- هر درخواست REST و هر اتصال سوکت، همان کوکی را چک می‌کند.
- `JWT_SECRET` را در Railway حتماً ست کنید وگرنه با هر ری‌استارت، همه بیرون می‌افتند.

### چرا SQLite؟
`better-sqlite3` همگام (سینکرون) و بسیار سریع است و به هیچ سرویس خارجی نیاز ندارد — برای Railway عالی است چون فقط یک **Volume** روی `./data` لازم دارد. جدول‌ها: `users, chats, chat_members, messages, reactions, attachments, blocks, saved_messages, read_state`.

---

## ۳) اجرای محلی

پیش‌نیاز: **Node.js نسخه ۱۸.۱۷ یا بالاتر** (از nodejs.org یا `nvm`).

```bash
# ۱) استخراج zip و رفتن داخل پوشه
unzip RohamGram-Messenger-v1.1.1.zip -d rohamgram
cd rohamgram

# ۲) نصب وابستگی‌ها
npm install

# ۳) (اختیاری) تنظیم متغیرها
cp .env.example .env        # ویرایش کنید اگر خواستید

# ۴) ساخت داده‌ی نمونه (اکانت demo)
npm run seed

# ۵) اجرا
npm start                   # یا: npm run dev  (با reload خودکار)
```

حالا مرورگر: **http://localhost:3000**
ورود نمونه: `demo / demo1234` (یا `sara`, `reza`, `mina` با همان رمز — برای تست دو کاربره در دو مرورگر مختلف).

> برای تست هم‌زمان دو کاربر روی یک کامپیوتر، از دو مرورگر متفاوت (مثلاً Chrome و Firefox) یا حالت Incognito استفاده کنید تا کوکی‌ها قاطی نشوند.

---

## ۴) آپلود روی GitHub

### روش الف — با git (پیشنهادی)
```bash
cd rohamgram
git init -b main
git add .
git commit -m "رهام گرام — پیام‌رسان وب"
# در github.com یک ریپوی خالی (بدون README) بسازید، سپس:
git remote add origin https://github.com/USERNAME/REPO.git
git push -u origin main
```

### روش ب — بدون git (رابط وب)
در github.com → `New repository` → `uploading an existing file` → **کل محتویات پوشه** (نه خود zip!) را drag & drop کنید → commit.

⚠️ هرگز این‌ها را آپلود نکنید: `node_modules/` ، `data/` ، `.env` (خودشان در `.gitignore` هستند).

---

## ۵) دیپلوی روی Railway

1. در [railway.app](https://railway.app) با گیتهاب لاگین کنید.
2. `New Project` → `Deploy from GitHub repo` → ریپوی خود را انتخاب کنید.
3. Railway خودش `railway.json`/`Procfile` را پیدا می‌کند (start command: `node server/index.js`). اگر نپرسید، در تب **Settings → Deploy → Start Command** بنویسید: `node server/index.js`
4. **متغیرهای محیطی** (تب Variables):
   - `JWT_SECRET` = یک رشته‌ی طولانی تصادفی (مثلاً خروجی `openssl rand -hex 32`) ← **اجباری**
   - `NODE_ENV=production`
   - بقیه اختیاری‌اند (نگاه کنید به `.env.example`)
5. **Volume (خیلی مهم):** از منوی سرویس → `Add Volume` → Mount path را بگذارید: `/app/data`
   (اگر مسیر اپ شما فرق دارد، همان مقداری که `DATA_DIR` به آن resolve می‌شود؛ پیش‌فرض `./data` نسبت به ریشه‌ی پروژه است.)
   بدون Volume، با هر ری‌استارت همه‌ی پیام‌ها و کاربرها می‌پرند!
6. تب **Settings → Networking → Generate Domain** → دامنه‌ی شما ساخته می‌شود.
7. اولین اجرا: با دامنه‌ی ساخته‌شده سایت را باز کنید و اولین حساب را از صفحه‌ی **ثبت‌نام** بسازید (ثبت‌نام باز است مگر `ALLOW_SIGNUP=false` ست کنید). اگر داده‌ی نمونه (demo/…) را هم روی سرور می‌خواهید، یک بار داخل کانتینر/محیط اجرا بزنید: `npm run seed`.

### نکته‌ی پورت
Railway متغیر `PORT` را خودش تزریق می‌کند و اپ از `process.env.PORT` پیروی می‌کند — چیزی ننویسید هم درست کار می‌کند.

---

## ۶) Docker

```bash
# اجرای ساده
docker build -t rohamgram .
docker run -p 3000:3000 -v rohamdata:/app/data -e JWT_SECRET=xxx rohamgram

# یا با compose
docker compose up -d
```

---

## ۷) تست‌ها

|فرمان|چه چیزی|پیش‌نیاز|
|---|---|---|
|`npm test`|۳۱ تست API|—|
|`npm run test:socket`|۱۶ تست real-time|—|
|`npm run test:ui`|۳۳ تست UI در مرورگر واقعی|`npm i -D puppeteer`|
|`npm run test:e2e`|۱۲ تست دو کاربره|puppeteer|
|`npm run test:auth`|۱۰ تست ثبت‌نام/ورود|puppeteer|
|`npm run test:all`|همه، پشت‌سرهم|—|

نصب puppeteer (فقط برای تست‌های مرورگری):
```bash
npm i -D puppeteer && npx puppeteer browsers install chrome
```
سرور باید در حال اجرا باشد (`npm start` در ترمینال دیگر). تست‌های مرورگری خودشان اول `seed` می‌کنند تا داده‌ی آلوده نتیجه را خراب نکند.

---

## ۸) شخصی‌سازی

|چه چیزی|کجا|
|---|---|
|نام برنامه|متغیر `APP_NAME` (پیش‌فرض «رهام گرام»)|
|پورت|متغیر `PORT`|
|حداکثر حجم آپلود|`MAX_UPLOAD_MB`|
|بستن ثبت‌نام|`ALLOW_SIGNUP=false`|
|رنگ اصلی/تم|`server/public/css/style.css` (متغیرهای `:root`)|
|پیام‌های خوش‌آمد seed|`scripts/seed.js`|
|مدت توکن|`server/config/index.js` (TOKEN_TTL)|

---

## ۹) عیب‌یابی

|مشکل|علت/راه‌حل|
|---|---|
|با هر ری‌استارت همه بیرون می‌افتند|`JWT_SECRET` ست نشده (هر بار موقت ساخته می‌شود)|
|پیام‌ها بعد از ری‌استارت پریده‌اند|Volume روی `./data` mount نشده|
|دکمه‌ی ثبت‌نام کار نمی‌کند|نسخه‌های قدیمی‌تر باگ فیلد hidden-required داشتند؛ در ≥۱.۱.۰ رفع شده — کش مرورگر را خالی کنید (Ctrl+Shift+R)|
|اموجی‌ها سیاه‌وسفید/جعبه‌اند|فونت اموجی روی سرور/سیستم نیست (فقط ظاهر)|
|`ERR_CONNECTION_REFUSED` در تست‌ها|سرور اجرا نیست؛ اول `npm start`|
|آپلود فایل رد می‌شود|نوع فایل در لیست مجاز `utils/files.js` نیست یا از `MAX_UPLOAD_MB` بزرگ‌تر است|
|پشت proxy کوکی ست نمی‌شود|`trust proxy` فعال است؛ مطمئن شوید کوکی با `SameSite=Lax` و روی HTTPS می‌آید|

---

## تقلب‌برگ دستورات

```bash
npm install          # نصب
npm run seed         # داده‌ی نمونه
npm start            # اجرا
npm run dev          # اجرا با reload
npm run test:all     # همه‌ی تست‌ها
```

سؤالی بود؟Issues ریپو یا همان صفحه‌ی «درباره» داخل تنظیمات برنامه را ببینید. ❤️
