'use strict';
/** پیکربندی برنامه‌ی Express */
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const { notFound, errorHandler } = require('./middleware/error');

const app = express();

// پشت پروکسی Railway هستیم
app.set('trust proxy', 1);
app.disable('x-powered-by');

/* ------------------------------ امنیت ------------------------------ */
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'blob:'],
      mediaSrc: ["'self'", 'blob:'],
      connectSrc: ["'self'", 'ws:', 'wss:'],
      objectSrc: ["'none'"],
      frameAncestors: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'same-site' },
}));

/* ---------------------------- بدنه‌ی درخواست ---------------------------- */
app.use(express.json({ limit: '12mb' }));
app.use(express.urlencoded({ extended: true, limit: '12mb' }));

/* ------------------------------ نرخ‌محدود ------------------------------ */
app.use('/api', rateLimit({
  windowMs: 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'درخواست‌های شما بیش از حد مجاز است، کمی صبر کنید.' },
}));

/* ------------------------------ لاگ ساده ------------------------------ */
if (!config.IS_PROD) {
  app.use((req, _res, next) => {
    if (!req.path.startsWith('/media')) console.log(`→ ${req.method} ${req.originalUrl}`);
    next();
  });
}

/* -------------------------------- روت‌ها -------------------------------- */
app.use('/api', require('./routes/index'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/chats', require('./routes/chats'));
app.use('/api/messages', require('./routes/messages'));
app.use('/media', require('./routes/media'));

/* ------------------------------ سلامت سرویس ------------------------------ */
app.get('/healthz', (_req, res) => res.json({ ok: true }));
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

/* --------------------------- فایل‌های استاتیک --------------------------- */
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: config.IS_PROD ? '1h' : 0,
  index: 'index.html',
}));

/* --------------------- SPA fallback (مسیرهای فرانت) -------------------- */
app.get(/^\/(?!api|media|healthz).*/, (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/* ------------------------------- خطاها ------------------------------- */
app.use(notFound);
app.use(errorHandler);

module.exports = app;
