'use strict';
/* ==========================================================================
   ابزارهای عمومی کلاینت
   ========================================================================== */
const U = (() => {

  /** فرار از HTML برای جلوگیری از XSS */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** ساخت المان */
  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k === 'text') node.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
      else node.setAttribute(k, v);
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      node.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return node;
  }

  /** آیکون SVG از اسپرایت */
  function icon(name, cls = 'ico') {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('class', cls);
    const u = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    u.setAttribute('href', `#i-${name}`);
    s.append(u);
    return s;
  }

  const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  function faNum(n) {
    return String(n).replace(/\d/g, (d) => FA_DIGITS[+d]);
  }

  /** تاریخ بر اساس تنظیم زبان */
  function fmtDate(ts, opts) {
    if (!ts) return '';
    const locale = State.settings.lang === 'en' ? 'en-US' : 'fa-IR';
    try {
      return new Intl.DateTimeFormat(locale, opts).format(new Date(ts));
    } catch {
      return new Date(ts).toLocaleDateString();
    }
  }

  function fmtTime(ts) {
    return fmtDate(ts, { hour: '2-digit', minute: '2-digit' });
  }

  function fmtDay(ts) {
    const d = new Date(ts), now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    const yest = new Date(now.getTime() - 864e5).toDateString() === d.toDateString();
    if (sameDay) return State.settings.lang === 'en' ? 'Today' : 'امروز';
    if (yest) return State.settings.lang === 'en' ? 'Yesterday' : 'دیروز';
    return fmtDate(ts, { year: 'numeric', month: 'long', day: 'numeric' });
  }

  /** زمان کوتاه برای لیست چت‌ها */
  function fmtShort(ts) {
    if (!ts) return '';
    const d = new Date(ts), now = new Date();
    const diffDays = Math.floor((now.setHours(0,0,0,0) - new Date(ts).setHours(0,0,0,0)) / 864e5);
    if (diffDays <= 0) return fmtTime(ts);
    if (diffDays === 1) return State.settings.lang === 'en' ? 'Yesterday' : 'دیروز';
    if (diffDays < 7) return fmtDate(ts, { weekday: 'short' });
    return fmtDate(ts, { year: '2-digit', month: '2-digit', day: '2-digit' });
  }

  function fmtSize(b) {
    if (!b) return '۰ بایت';
    const u = State.settings.lang === 'en' ? ['B', 'KB', 'MB', 'GB'] : ['بایت', 'کیلوبایت', 'مگابایت', 'گیگابایت'];
    let i = 0, n = b;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    const v = i === 0 ? n : n.toFixed(1);
    return `${State.settings.lang === 'en' ? v : faNum(v)} ${u[i]}`;
  }

  function fmtDuration(sec) {
    if (!sec && sec !== 0) return '0:00';
    sec = Math.round(sec);
    const m = Math.floor(sec / 60), s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  /** حروف اول نام برای آواتار متنی */
  function initials(name = '') {
    const parts = String(name).trim().split(/\s+/);
    if (!parts[0]) return '?';
    const a = [...parts[0]][0] || '';
    const b = parts[1] ? [...parts[1]][0] : '';
    return (a + b).toUpperCase();
  }

  function hashColor(seed) {
    let h = 0;
    const s = String(seed || '');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h) % 8;
  }

  /**
   * آواتار: اگر عکس داشته باشد تصویر، وگرنه حروف اول با گرادیان رنگی
   */
  function avatar(entity, size = 'av-m', showDot = false) {
    const seed = entity.id || entity.title || entity.name || 'x';
    const name = entity.title || entity.name || '?';
    const wrap = el('div', { class: `avatar ${size} g${hashColor(seed)}` });

    if (entity.avatar) {
      const img = el('img', { src: `/media/${entity.avatar}`, alt: name, loading: 'lazy' });
      img.onerror = () => { img.remove(); wrap.append(el('div', { class: 'ph', text: initials(name) })); };
      wrap.append(img);
    } else {
      wrap.append(el('div', { class: 'ph', text: initials(name) }));
    }

    if (showDot) {
      wrap.append(el('span', { class: `dot ${entity.online ? 'on' : ''}` }));
    }
    return wrap;
  }

  /** تبدیل متن به HTML امن با لینک و منشن */
  function richText(text) {
    if (!text) return '';
    let out = esc(text);
    // لینک‌ها
    out = out.replace(/(https?:\/\/[^\s<]+[^\s<.,;:!؟)"'])/g,
      (m) => `<a href="${m}" target="_blank" rel="noopener noreferrer">${m.length > 60 ? m.slice(0, 57) + '…' : m}</a>`);
    // منشن @username
    out = out.replace(/(^|\s)@([a-zA-Z0-9_]{3,32})/g,
      (_m, p, u) => `${p}<a href="#" class="mention" data-username="${u}">@${u}</a>`);
    // بولد **متن**
    out = out.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
    // کد `متن`
    out = out.replace(/`([^`\n]+)`/g, '<code style="background:rgba(128,128,128,.18);padding:1px 5px;border-radius:4px;font-size:.92em">$1</code>');
    return out;
  }

  /** دیبانس */
  function debounce(fn, wait = 250) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  function throttle(fn, wait = 100) {
    let last = 0, timer = null;
    return function (...args) {
      const now = Date.now();
      const remaining = wait - (now - last);
      if (remaining <= 0) { last = now; fn.apply(this, args); }
      else if (!timer) timer = setTimeout(() => { last = Date.now(); timer = null; fn.apply(this, args); }, remaining);
    };
  }

  /** ذخیره/بازیابی از localStorage با پیشوند */
  const store = {
    get(k, d = null) { try { const v = localStorage.getItem('cg_' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('cg_' + k, JSON.stringify(v)); } catch {} },
    del(k) { try { localStorage.removeItem('cg_' + k); } catch {} },
  };

  /** کپی در کلیپ‌بورد با fallback */
  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = el('textarea', { style: { position: 'fixed', opacity: '0' } });
      ta.value = text; document.body.append(ta); ta.select();
      try { document.execCommand('copy'); } catch {}
      ta.remove();
      return true;
    }
  }

  /** دانلود فایل */
  function download(url, name) {
    const a = el('a', { href: url + (url.includes('?') ? '&' : '?') + 'dl=1&name=' + encodeURIComponent(name || 'file'), download: '' });
    document.body.append(a); a.click(); a.remove();
  }

  /** صدای اعلان با WebAudio (بدون فایل خارجی) */
  let audioCtx = null;
  function playSound(type = 'msg') {
    if (!State.settings.sound) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const notes = type === 'sent' ? [880, 1180] : type === 'out' ? [560, 760] : [660, 990];
      notes.forEach((f, i) => {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = 'sine'; o.frequency.value = f;
        const t0 = audioCtx.currentTime + i * 0.09;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
        o.connect(g); g.connect(audioCtx.destination);
        o.start(t0); o.stop(t0 + 0.2);
      });
    } catch {}
  }

  /** برچسب رسانه بر اساس نوع */
  function mediaLabel(type) {
    const fa = { image: 'تصویر', video: 'ویدیو', audio: 'صوت', voice: 'پیام صوتی', file: 'فایل' };
    const en = { image: 'Photo', video: 'Video', audio: 'Audio', voice: 'Voice message', file: 'File' };
    const d = State.settings.lang === 'en' ? en : fa;
    return d[type] || d.file;
  }

  function t(key) {
    return I18N[State.settings.lang || 'fa'][key] || I18N.fa[key] || key;
  }

  return {
    esc, el, icon, faNum, fmtDate, fmtTime, fmtDay, fmtShort, fmtSize, fmtDuration,
    initials, hashColor, avatar, richText, debounce, throttle, store, copy, download,
    playSound, mediaLabel, t,
  };
})();

/* --------------------------- ترجمه‌های رابط --------------------------- */
const I18N = {
  fa: {
    chats: 'چت‌ها', contacts: 'مخاطبین', settings: 'تنظیمات', search: 'جست‌وجو',
    newChat: 'گفت‌گوی جدید', newGroup: 'گروه جدید', newChannel: 'کانال جدید',
    logout: 'خروج از حساب', writeMessage: 'پیام بنویسید…', online: 'آنلاین',
    members: 'عضو', subscribers: 'مشترک', typing: 'در حال نوشتن…',
    noChats: 'هنوز چتی ندارید', noChatsHint: 'از دکمه‌ی + یک گروه یا کانال بسازید یا نام کاربری کسی را جست‌وجو کنید.',
    selectChat: 'یک چت را انتخاب کنید', reply: 'پاسخ', edit: 'ویرایش', copy: 'کپی متن',
    forward: 'هدایت', pin: 'سنجاق کردن', unpin: 'برداشتن سنجاق', delete: 'حذف',
    today: 'امروز', yesterday: 'دیروز', savedMessages: 'پیام‌های ذخیره‌شده',
  },
  en: {
    chats: 'Chats', contacts: 'Contacts', settings: 'Settings', search: 'Search',
    newChat: 'New chat', newGroup: 'New group', newChannel: 'New channel',
    logout: 'Log out', writeMessage: 'Write a message…', online: 'online',
    members: 'members', subscribers: 'subscribers', typing: 'typing…',
    noChats: 'No chats yet', noChatsHint: 'Use the + button to create a group or channel, or search for a username.',
    selectChat: 'Select a chat', reply: 'Reply', edit: 'Edit', copy: 'Copy text',
    forward: 'Forward', pin: 'Pin', unpin: 'Unpin', delete: 'Delete',
    today: 'Today', yesterday: 'Yesterday', savedMessages: 'Saved messages',
  },
};
