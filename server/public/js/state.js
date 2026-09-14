'use strict';
/* ==========================================================================
   وضعیت سراسری برنامه (State)
   ========================================================================== */
const State = {
  me: null,                 // کاربر فعلی
  token: null,              // توکن JWT (پشتیبان کوکی)
  chats: new Map(),         // chatId -> chat
  chatOrder: [],            // ترتیب چت‌ها در لیست
  activeChatId: null,       // چت باز
  messages: new Map(),      // chatId -> [messages]
  messagesMeta: new Map(),  // chatId -> { hasMore, oldestId }
  members: new Map(),       // chatId -> [members]
  typing: new Map(),        // chatId -> Map<userId, ts>
  drafts: {},               // chatId -> متن پیش‌نویس
  unreadTotal: 0,
  filter: 'all',            // all | unread | groups | channels
  searchQuery: '',
  searching: false,
  replyTo: null,            // پیامی که در حال پاسخ به آن هستیم
  editing: null,            // پیامی که در حال ویرایش آن هستیم
  attachFile: null,         // فایل انتخاب‌شده
  settings: {
    theme: 'dark',
    lang: 'fa',
    fontSize: 14.5,
    enterToSend: true,
    notifications: true,
    sound: true,
    showTyping: true,
    wallpaper: 'pattern',
    compact: false,
  },
  appConfig: { appName: 'رهام گرام', maxUploadMB: 50, allowSignup: true },
  socket: null,
  connected: false,
  bootstrapped: false,
};

/** به‌روزرسانی عنوان صفحه با تعداد پیام‌های خوانده‌نشده */
function updateDocumentTitle() {
  let total = 0;
  for (const c of State.chats.values()) total += (c.unread || 0);
  State.unreadTotal = total;
  const name = State.appConfig.appName || 'رهام گرام';
  document.title = total ? `(${U.faNum(total)}) ${name}` : name;

  // favicon با نشانگر
  const svg = total
    ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" fill="#3390ec"/><path d="M22 50 78 26 66 76l-17-12-8 10-2-14L22 50Z" fill="#fff"/><circle cx="78" cy="24" r="18" fill="#e5544b"/></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" fill="#3390ec"/><path d="M22 50 78 26 66 76l-17-12-8 10-2-14L22 50Z" fill="#fff"/></svg>`;
  const link = document.querySelector('link[rel="icon"]');
  if (link) link.href = 'data:image/svg+xml,' + encodeURIComponent(svg);
}

/** اعمال تنظیمات ظاهری روی سند */
function applyAppearance() {
  const s = State.settings;
  document.documentElement.dataset.theme = s.theme || 'dark';
  document.documentElement.dir = s.lang === 'en' ? 'ltr' : 'rtl';
  document.documentElement.lang = s.lang === 'en' ? 'en' : 'fa';
  document.documentElement.style.setProperty('--fs', `${s.fontSize || 14.5}px`);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = s.theme === 'light' ? '#ffffff' : '#17212b';
}

/** مرتب‌سازی لیست چت‌ها بر اساس آخرین فعالیت */
function sortChats() {
  State.chatOrder = [...State.chats.values()]
    .sort((a, b) => (b.lastActivity || 0) - (a.lastActivity || 0))
    .map((c) => c.id);
}

/** افزودن/به‌روزرسانی یک چت در state */
function upsertChat(chat) {
  if (!chat) return;
  const existed = State.chats.get(chat.id);
  // unread را اگر سرور نفرستاد حفظ کن
  if (existed && chat.unread === undefined) chat.unread = existed.unread;
  State.chats.set(chat.id, chat);
  sortChats();
  updateDocumentTitle();
}

function activeChat() {
  return State.activeChatId ? State.chats.get(State.activeChatId) : null;
}
