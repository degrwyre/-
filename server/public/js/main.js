'use strict';
/* ==========================================================================
   نقطه‌ی شروع برنامه: بوت‌استرپ، اتصال Socket.IO و مدیریت رویدادها
   ========================================================================== */
const App = (() => {
  const { el, icon } = U;
  let mainEl, sidebarEl, chatAreaEl, connBar;

  /* ============================ راه‌اندازی ============================ */
  async function init() {
    loadLocalSettings();
    applyAppearance();

    // دریافت تنظیمات عمومی سرور
    try {
      const cfg = await API.config();
      Object.assign(State.appConfig, cfg);
      document.title = cfg.appName || 'رهام گرام';
    } catch {}

    // تلاش برای بازیابی نشست
    State.token = U.store.get('token');
    const cachedMe = U.store.get('me');
    if (cachedMe) State.me = cachedMe;

    if (State.token || document.cookie.includes('cg_token')) {
      try {
        const d = await API.me();
        State.me = d.user;
        if (d.settings) Object.assign(State.settings, d.settings);
        U.store.set('me', d.user);
        U.store.set('settings', State.settings);
        applyAppearance();
        await bootstrap();
        return;
      } catch (e) {
        State.token = null; State.me = null;
        U.store.del('token'); U.store.del('me');
      }
    }
    showAuth();
  }

  function loadLocalSettings() {
    const saved = U.store.get('settings');
    if (saved) Object.assign(State.settings, saved);
    // ترجیح سیستم‌عامل برای تم
    if (!saved && window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
      State.settings.theme = 'light';
    }
    document.body.classList.toggle('compact', !!State.settings.compact);
  }

  function showAuth() {
    document.getElementById('boot')?.remove();
    const root = document.getElementById('app');
    root.innerHTML = '';
    Auth.render(root);
  }

  /* ============================ بوت‌استرپ ============================ */
  async function bootstrap() {
    if (State.bootstrapped) return;
    State.bootstrapped = true;

    const app = document.getElementById('app');
    app.innerHTML = '';

    mainEl = el('div', { class: 'main' });
    sidebarEl = el('div', { class: 'sidebar' });
    chatAreaEl = el('div', { class: 'chat-area' });
    mainEl.append(sidebarEl, chatAreaEl);
    app.append(mainEl);

    ChatList.render(sidebarEl);
    Chat.render(chatAreaEl);

    // اسکلت بارگذاری
    document.getElementById('chat-list').append(UI.skeletonList(7));

    try {
      const d = await API.chats();
      for (const c of d.chats) State.chats.set(c.id, c);
      sortChats();
      ChatList.refreshList();
      updateDocumentTitle();
    } catch (e) {
      UI.err('خطا در دریافت چت‌ها: ' + e.message);
    }

    connectSocket();
    registerShortcuts();
    registerServiceWorker();
    handleVisibility();
    handleInviteLinkOnLoad();
  }

  /* ============================ Socket.IO ============================ */
  function connectSocket() {
    if (typeof io === 'undefined') { console.warn('Socket.IO client یافت نشد'); return; }

    const socket = io({
      transports: ['websocket', 'polling'],
      auth: { token: State.token },
      reconnection: true,
      reconnectionDelay: 900,
      reconnectionDelayMax: 6000,
    });
    State.socket = socket;

    socket.on('connect', () => {
      State.connected = true;
      hideConnBar();
      // عضویت مجدد در اتاق چت فعال
      if (State.activeChatId) socket.emit('chat:open', { chatId: State.activeChatId });
    });

    socket.on('disconnect', (reason) => {
      State.connected = false;
      if (reason !== 'io client disconnect') showConnBar('اتصال قطع شد — در حال تلاش مجدد…');
    });
    socket.on('connect_error', () => { State.connected = false; showConnBar('اتصال به سرور برقرار نشد'); });
    socket.on('reconnect', () => hideConnBar());

    /* --- پیام جدید --- */
    socket.on('message:new', (payload) => Chat.onIncoming(payload));

    /* --- تأیید پیام ارسالی --- */
    socket.on('message:sent', ({ tempId, message, chatId }) => {
      const cid = chatId || (message && message.chatId);
      if (!cid || !message) return;
      if (tempId) { Chat.replacePending(tempId, message); return; }
      // بدون tempId = پیام از دستگاه/تب دیگری ارسال شده
      const list = State.messages.get(cid) || [];
      if (list.some((m) => m.id === message.id)) return;
      const chat = State.chats.get(cid);
      if (chat) { chat.lastMessage = message; chat.lastActivity = message.createdAt; upsertChat(chat); }
      Chat.pushMessage(message, cid, cid === State.activeChatId);
    });

    /* --- ویرایش --- */
    socket.on('message:edited', (m) => Chat.updateMessage(m));

    /* --- حذف --- */
    socket.on('message:deleted', ({ chatId, messageId }) => Chat.removeMessage(chatId, messageId));

    /* --- واکنش --- */
    socket.on('message:reaction', ({ messageId, chatId, reactions }) => {
      const list = State.messages.get(chatId) || [];
      const m = list.find((x) => x.id === messageId);
      if (!m) return;
      m.reactions = reactions.map((r) => ({ ...r, mine: (r.users || []).includes(State.me.id) }));
      const chat = State.chats.get(chatId);
      if (chatId === State.activeChatId && chat) Messages.updateMessageNode(m, chat);
    });

    /* --- تایپ کردن --- */
    socket.on('typing', ({ chatId, userId, name, typing }) => Chat.showTyping(chatId, userId, name, typing));

    /* --- وضعیت آنلاین --- */
    socket.on('user:presence', ({ userId, online, user }) => {
      // به‌روزرسانی در چت‌ها و لیست
      for (const c of State.chats.values()) {
        if (c.type === 'dm' && c.peer && c.peer.id === userId) { c.peer.online = online; if (online) c.peer.lastSeen = 'آنلاین'; }
        if (c.type === 'dm' && c.peer && c.peer.id === userId && c.id === State.activeChatId) {
          Chat.renderHeader(c);
        }
      }
      const members = State.members.get(State.activeChatId);
      if (members) members.forEach((m) => { if (m.id === userId) m.online = online; });
      ChatList.refreshList();
    });

    /* --- خوانده‌شدن --- */
    socket.on('chat:read', ({ chatId, userId, lastReadMessageId }) => {
      if (userId === State.me.id) return;
      const chat = State.chats.get(chatId);
      if (!chat) return;
      if (chat.type === 'dm') {
        chat.peerLastRead = lastReadMessageId;
      } else {
        chat.readBy = chat.readBy || {};
        chat.readBy[userId] = lastReadMessageId;
      }
      // به‌روزرسانی تیک‌های پیام‌های من
      if (chatId === State.activeChatId) {
        const list = State.messages.get(chatId) || [];
        list.forEach((m) => {
          if (!m.mine) return;
          const node = document.querySelector(`.msg[data-mid="${m.id}"] .ticks`);
          if (!node) return;
          const read = chat.type === 'dm' ? lastReadMessageId >= m.id : allRead(chat, m.id);
          node.classList.toggle('read', read);
          node.innerHTML = '';
          node.append(icon(read ? 'check-double' : 'check', 'ico ico-sm'));
        });
      }
      ChatList.updateItem(chatId);
    });

    /* --- تغییرات چت --- */
    socket.on('chat:updated', ({ chat, message }) => {
      if (chat) {
        const old = State.chats.get(chat.id);
        chat.unread = old ? old.unread : 0;
        upsertChat(chat);
        ChatList.updateItem(chat.id);
        if (State.activeChatId === chat.id) { Chat.renderHeader(chat); Chat.renderPinBar(chat); }
      }
      if (message) Chat.pushMessage(message, message.chatId, false);
    });

    socket.on('chat:pinned', ({ chatId, message }) => {
      const chat = State.chats.get(chatId);
      if (!chat) return;
      chat.pinnedMessage = message;
      upsertChat(chat);
      if (State.activeChatId === chatId) Chat.open(chatId);
    });

    socket.on('chat:created', ({ chat }) => { upsertChat(chat); ChatList.refreshList(); });

    socket.on('chat:memberAdded', ({ chatId, member, memberCount, message }) => {
      const chat = State.chats.get(chatId);
      if (chat) { chat.memberCount = memberCount; upsertChat(chat); ChatList.updateItem(chatId); }
      State.members.delete(chatId);
      if (message) Chat.pushMessage(message, chatId, false);
      if (chatId === State.activeChatId) Chat.renderHeader(chat);
    });

    socket.on('chat:memberRemoved', ({ chatId, userId, memberCount, message }) => {
      const chat = State.chats.get(chatId);
      if (chat) { chat.memberCount = memberCount; upsertChat(chat); }
      State.members.delete(chatId);
      if (userId === State.me.id) {
        State.chats.delete(chatId); sortChats(); ChatList.refreshList();
        if (State.activeChatId === chatId) Chat.closeActive();
        return;
      }
      if (message) Chat.pushMessage(message, chatId, false);
      if (chatId === State.activeChatId && chat) Chat.renderHeader(chat);
    });
  }

  function allRead(chat, messageId) {
    if (!chat.readBy) return false;
    const others = (State.members.get(chat.id) || []).filter((m) => m.id !== State.me.id);
    if (!others.length) return true;
    return others.every((m) => (chat.readBy[m.id] || 0) >= messageId);
  }

  function showConnBar(text) {
    if (connBar) connBar.remove();
    connBar = el('div', { class: 'conn-bar', text });
    document.querySelector('.chat-area')?.append(connBar);
  }
  function hideConnBar() { if (connBar) { connBar.remove(); connBar = null; } }

  /* ============================ میان‌برها ============================ */
  function registerShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Ctrl/Cmd + K = جست‌وجو
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        document.getElementById('global-search')?.focus();
      }
      // Escape = بستن جست‌وجو
      if (e.key === 'Escape') {
        ChatList.clearSearch();
        ChatPanels.close();
        document.getElementById('settings-panel')?.remove();
      }
      // Ctrl+/ = پنل تنظیمات
      if ((e.ctrlKey || e.metaKey) && e.key === '/') { e.preventDefault(); Settings.open(); }
    });

    window.addEventListener('beforeunload', () => {
      if (State.activeChatId && State.socket) State.socket.emit('typing:stop', { chatId: State.activeChatId });
    });
  }

  function handleVisibility() {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && State.activeChatId) {
        const chat = State.chats.get(State.activeChatId);
        if (chat) Chat.markRead(chat);
      }
    });
    window.addEventListener('focus', () => {
      if (State.activeChatId) { const c = State.chats.get(State.activeChatId); if (c) Chat.markRead(c); }
    });
  }

  /** اگر کاربر با لینک دعوت وارد شد و لاگین بود */
  async function handleInviteLinkOnLoad() {
    const code = Auth.pendingInvite();
    if (!code || !State.me) return;
    try {
      const d = await API.joinByCode(code);
      upsertChat(d.chat); ChatList.refreshList();
      history.replaceState({}, '', '/');
      Chat.open(d.chat.id);
      UI.ok('به چت پیوستید 🎉');
    } catch (e) { history.replaceState({}, '', '/'); }
  }

  /** ثبت سرویس‌ورکر (PWA) — اختیاری و بی‌خطر اگر فایل نباشد */
  function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      // وقتی نسخه‌ی جدید منتشر شد، بدون نیاز به رفرش دستی فعال شود
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            nw.postMessage && nw.postMessage('skipWaiting');
            UI.toast('نسخه‌ی جدید بارگذاری شد — برای اعمال، صفحه را تازه کنید.', 'ok', 6000);
          }
        });
      });
      // هر ۳۰ دقیقه بررسی به‌روزرسانی
      setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
    }).catch(() => {});
  }

  return { init, bootstrap };
})();

/* ------------------------------ اجرا ------------------------------ */
document.addEventListener('DOMContentLoaded', () => {
  App.init().catch((e) => {
    console.error(e);
    const boot = document.getElementById('boot');
    if (boot) boot.innerHTML = `<div style="text-align:center;color:var(--red)"><h3>خطا در راه‌اندازی</h3><p>${U.esc(e.message)}</p></div>`;
  });
});
