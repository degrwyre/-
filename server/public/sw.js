/* ==========================================================================
   Service Worker — استراتژی Network-First
   چرا network-first؟ چون با cache-first بعد از هر دیپلوی، کاربران نسخه‌ی قدیمی
   جاوااسکریپت را می‌گیرند و رابط کاربری خراب می‌شود. با این روش همیشه آخرین
   نسخه از سرور گرفته می‌شود و فقط در حالت آفلاین از کش استفاده می‌شود.
   ========================================================================== */
const CACHE = 'rohamgram-v2';
const SHELL = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/utils.js',
  '/js/state.js',
  '/js/api.js',
  '/js/ui.js',
  '/js/chatlist.js',
  '/js/messages.js',
  '/js/chat.js',
  '/js/panels.js',
  '/js/chatmodals.js',
  '/js/auth.js',
  '/js/settings.js',
  '/js/main.js',
  '/assets/favicon.svg',
  '/manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // درخواست‌های پویا هرگز کش نمی‌شوند
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/socket.io') || url.pathname.startsWith('/media')) return;

  // ناوبری (صفحه‌ی اصلی): network-first با fallback به کش
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => { cachePut(request, res); return res; })
        .catch(() => caches.match(request).then((hit) => hit || caches.match('/index.html')))
    );
    return;
  }

  // سایر فایل‌های استاتیک: network-first
  event.respondWith(
    fetch(request)
      .then((res) => { cachePut(request, res); return res; })
      .catch(() => caches.match(request))
  );
});

function cachePut(request, response) {
  if (!response || response.status !== 200 || response.type !== 'basic') return;
  const copy = response.clone();
  caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
}

/* به‌روزرسانی فوری وقتی نسخه‌ی جدید منتشر شد */
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
