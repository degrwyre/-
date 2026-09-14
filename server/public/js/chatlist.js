'use strict';
/* ==========================================================================
   سایدبار: لیست چت‌ها، جست‌وجو، فیلترها و منوی اصلی
   ========================================================================== */
const ChatList = (() => {
  const { el, icon } = U;
  let root, listEl, searchInput, tabsEl, resultsEl;
  let searchTimer = null;

  const FILTERS = [
    { id: 'all', label: 'همه' },
    { id: 'unread', label: 'خوانده‌نشده' },
    { id: 'dm', label: 'خصوصی' },
    { id: 'group', label: 'گروه‌ها' },
    { id: 'channel', label: 'کانال‌ها' },
  ];

  function render(container) {
    root = container;
    root.innerHTML = '';
    root.className = 'sidebar';

    /* ---------- سربرگ ---------- */
    const head = el('div', { class: 'sb-head' });

    const menuBtn = el('button', { class: 'icon-btn', title: 'منو', onclick: (e) => openMainMenu(e.currentTarget) }, icon('menu'));
    head.append(menuBtn);

    const search = el('div', { class: 'search-box' });
    search.append(icon('search'));
    searchInput = el('input', {
      type: 'text', placeholder: 'جست‌وجو در چت‌ها و کاربران…', id: 'global-search',
      oninput: U.debounce(onSearchInput, 260),
      onfocus: () => { if (searchInput.value.trim()) showResults(); },
    });
    search.append(searchInput);
    head.append(search);

    const newChatBtn = el('button', { class: 'icon-btn', title: 'گفت‌گوی جدید', onclick: () => ChatModals.newChat() }, icon('edit'));
    head.append(newChatBtn);
    root.append(head);

    /* ---------- فیلترها ---------- */
    tabsEl = el('div', { class: 'sb-tabs' });
    for (const f of FILTERS) {
      tabsEl.append(el('button', {
        class: State.filter === f.id ? 'on' : '', text: f.label,
        onclick: () => { State.filter = f.id; refreshTabs(); refreshList(); },
      }));
    }
    root.append(tabsEl);

    /* ---------- لیست ---------- */
    listEl = el('div', { class: 'chat-list', id: 'chat-list' });
    root.append(listEl);

    /* ---------- نتایج جست‌وجو ---------- */
    resultsEl = el('div', { class: 'search-results hidden', id: 'search-results' });
    root.append(resultsEl);

    /* ---------- دکمه‌ی ساخت چت ---------- */
    const fab = el('button', { class: 'fab', title: 'چت جدید', onclick: () => ChatModals.newChat() }, icon('plus'));
    root.append(fab);

    refreshList();
    return root;
  }

  function refreshTabs() {
    if (!tabsEl) return;
    [...tabsEl.children].forEach((b, i) => b.classList.toggle('on', FILTERS[i].id === State.filter));
  }

  /** فیلتر کردن چت‌ها بر اساس تب فعال */
  function filteredChats() {
    const f = State.filter;
    return State.chatOrder
      .map((id) => State.chats.get(id))
      .filter(Boolean)
      .filter((c) => {
        if (f === 'unread') return (c.unread || 0) > 0;
        if (f === 'dm') return c.type === 'dm';
        if (f === 'group') return c.type === 'group';
        if (f === 'channel') return c.type === 'channel';
        return true;
      });
  }

  function refreshList() {
    if (!listEl) return;
    const chats = filteredChats();
    listEl.innerHTML = '';

    if (!chats.length) {
      const empty = el('div', { class: 'empty-state' });
      if (State.filter === 'unread') {
        empty.innerHTML = `<svg class="ico" style="width:62px;height:62px;margin:0 auto 14px;opacity:.32"><use href="#i-check"></use></svg>
          <h3>همه‌ی پیام‌ها خوانده شده‌اند</h3><p>پیام خوانده‌نشده‌ای ندارید.</p>`;
      } else if (!State.chats.size) {
        empty.innerHTML = `
          <svg class="ico" style="width:62px;height:62px;margin:0 auto 14px;opacity:.32"><use href="#i-send"></use></svg>
          <h3>${State.filter === 'all' ? 'هنوز چتی ندارید' : 'موردی پیدا نشد'}</h3>
          <p>از دکمه‌ی <b>+</b> یک گروه یا کانال بسازید،<br>یا نام کاربری یک نفر را جست‌وجو کنید تا گفت‌وگو را شروع کنید.</p>`;
      } else {
        empty.innerHTML = `<h3>موردی در این دسته نیست</h3><p>تب دیگری را امتحان کنید.</p>`;
      }
      listEl.append(empty);
      return;
    }

    const frag = document.createDocumentFragment();
    for (const c of chats) frag.append(chatItem(c));
    listEl.append(frag);
  }

  function chatItem(c) {
    const item = el('div', {
      class: `chat-item ${State.activeChatId === c.id ? 'active' : ''}`,
      'data-chat-id': c.id,
      onclick: () => Chat.open(c.id),
      oncontextmenu: (e) => { e.preventDefault(); chatItemMenu(e, c); },
    });

    item.append(U.avatar(c, 'av-m', c.type === 'dm' && c.peer && c.peer.online));

    const body = el('div', { class: 'ci-body' });

    // ردیف اول: نام + زمان
    const r1 = el('div', { class: 'ci-row1' });
    const name = el('span', { class: 'ci-name', text: c.title || '—' });
    r1.append(name);
    if (c.type === 'channel') r1.append(icon('megaphone', 'ico ico-sm'));
    else if (c.type === 'group') r1.append(icon('users', 'ico ico-sm'));
    if (c.peer && c.peer.isVerified) r1.append(icon('verified', 'ico ico-sm'));
    r1.append(el('span', { class: 'ci-time', text: U.fmtShort(c.lastActivity) }));
    body.append(r1);

    // ردیف دوم: پیش‌نمایش + نشان‌ها
    const r2 = el('div', { class: 'ci-row2' });
    const preview = el('div', { class: 'ci-preview' });
    const draft = State.drafts[c.id];
    if (draft && draft.trim()) {
      preview.append(el('span', { class: 'draft', text: 'پیش‌نویس: ' }), document.createTextNode(draft.slice(0, 60)));
    } else if (c.lastMessage) {
      const m = c.lastMessage;
      if (m.system) {
        preview.textContent = m.text;
      } else {
        if (c.type !== 'dm' && m.sender) {
          preview.append(el('span', { class: 'snd', text: m.mine ? 'شما: ' : m.sender.name.split(' ')[0] + ': ' }));
        } else if (m.mine) {
          preview.append(el('span', { class: 'snd', text: 'شما: ' }));
        }
        if (m.media) preview.append(document.createTextNode(`${U.mediaLabel(m.media.type)} ${m.text ? '• ' + m.text : ''}`));
        else preview.append(document.createTextNode(m.text || '…'));
      }
    } else {
      preview.textContent = c.type === 'dm' ? 'گفت‌وگو را شروع کنید' : 'بدون پیام';
    }
    r2.append(preview);

    if (c.muted) r2.append(el('span', { class: 'badge muted-badge', title: 'بی‌صدا' }, icon('mute', 'ico ico-sm')));
    if ((c.unread || 0) > 0) {
      r2.append(el('span', { class: `badge ${c.muted ? 'muted-badge' : ''}`, text: c.unread > 99 ? '99+' : U.faNum(c.unread) }));
    } else if (c.lastMessage && c.lastMessage.mine && !c.lastMessage.system) {
      r2.append(ticksEl(c.lastMessage));
    }
    body.append(r2);
    item.append(body);
    return item;
  }

  function ticksEl(m) {
    const wrap = el('span', { class: 'ticks', style: { color: 'var(--text-3)', display: 'inline-flex' } });
    wrap.append(icon(m.readByAll ? 'check-double' : 'check', 'ico ico-sm'));
    return wrap;
  }

  /** فقط یک آیتم را به‌روز می‌کند (بدون رندر کامل) */
  function updateItem(chatId) {
    if (!listEl) return;
    const c = State.chats.get(chatId);
    const old = listEl.querySelector(`[data-chat-id="${chatId}"]`);
    const shouldBeVisible = filteredChats().some((x) => x.id === chatId);

    if (!c || !shouldBeVisible) { if (old) old.remove(); return; }

    const fresh = chatItem(c);
    if (old) {
      // جایگاه را حفظ می‌کنیم اگر ترتیب عوض نشده باشد
      old.replaceWith(fresh);
    } else {
      listEl.prepend(fresh);
    }
    reorder();
  }

  /** مرتب‌سازی DOM بر اساس State.chatOrder */
  function reorder() {
    if (!listEl) return;
    const order = filteredChats().map((c) => String(c.id));
    const nodes = [...listEl.querySelectorAll('.chat-item')];
    const map = new Map(nodes.map((n) => [n.dataset.chatId, n]));
    for (const id of order) {
      const n = map.get(id);
      if (n) listEl.append(n);
    }
  }

  function markActive(chatId) {
    if (!listEl) return;
    listEl.querySelectorAll('.chat-item').forEach((n) => {
      n.classList.toggle('active', n.dataset.chatId === String(chatId));
    });
  }

  /* --------------------------- جست‌وجو --------------------------- */
  async function onSearchInput() {
    const q = searchInput.value.trim();
    State.searchQuery = q;
    if (!q) { hideResults(); return; }
    showResults(true);
    try {
      const [res, global] = await Promise.all([
        API.search(q).catch(() => ({ users: [], chats: [] })),
        q.length >= 2 ? API.searchAll(q).catch(() => ({ results: [] })) : Promise.resolve({ results: [] }),
      ]);
      renderResults(q, res, global);
    } catch {
      renderResults(q, { users: [], chats: [] }, { results: [] });
    }
  }

  function showResults(loading) {
    resultsEl.classList.remove('hidden');
    if (loading) resultsEl.innerHTML = '<div class="sr-group">در حال جست‌وجو…</div>';
  }
  function hideResults() {
    resultsEl.classList.add('hidden');
    resultsEl.innerHTML = '';
  }

  function renderResults(q, res, global) {
    resultsEl.innerHTML = '';
    const term = q.replace(/^@/, '');

    // ۱) پیام‌های یافت‌شده در چت‌های فعلی
    if (global.results && global.results.length) {
      resultsEl.append(el('div', { class: 'sr-group', text: 'پیام‌ها' }));
      for (const m of global.results.slice(0, 12)) {
        const chat = State.chats.get(m.chatId);
        const it = el('div', { class: 'sr-item', onclick: () => { hideResults(); searchInput.value = ''; Chat.open(m.chatId, m.id); } });
        it.append(U.avatar(chat || { name: m.chatTitle }, 'av-s'));
        const b = el('div', { class: 'sr-body' });
        b.append(el('div', { class: 'sr-t', text: chat ? chat.title : m.chatTitle || 'چت' }));
        b.append(el('div', { class: 'sr-s', html: highlight(m.text || U.mediaLabel(m.media?.type), term) }));
        it.append(b);
        it.append(el('span', { class: 'ci-time', text: U.fmtShort(m.createdAt) }));
        resultsEl.append(it);
      }
    }

    // ۲) کاربران
    if (res.users && res.users.length) {
      resultsEl.append(el('div', { class: 'sr-group', text: 'کاربران' }));
      for (const u of res.users) {
        const it = el('div', { class: 'sr-item', onclick: () => { hideResults(); searchInput.value = ''; Profile.open(u.id); } });
        it.append(U.avatar(u, 'av-s', u.online));
        const b = el('div', { class: 'sr-body' });
        b.append(el('div', { class: 'sr-t', html: highlight(u.name, term) }));
        b.append(el('div', { class: 'sr-s', text: u.username ? '@' + u.username : (u.bio || '—') }));
        it.append(b);
        resultsEl.append(it);
      }
    }

    // ۳) گروه‌ها و کانال‌های عمومی
    if (res.chats && res.chats.length) {
      resultsEl.append(el('div', { class: 'sr-group', text: 'گروه‌ها و کانال‌های عمومی' }));
      for (const c of res.chats) {
        const it = el('div', { class: 'sr-item', onclick: () => { hideResults(); searchInput.value = ''; ChatModals.publicChat(c); } });
        it.append(U.avatar(c, 'av-s'));
        const b = el('div', { class: 'sr-body' });
        b.append(el('div', { class: 'sr-t', html: highlight(c.title, term) }));
        b.append(el('div', { class: 'sr-s', text: `${c.type === 'channel' ? 'کانال' : 'گروه'} • ${U.faNum(c.memberCount)} عضو` }));
        it.append(b);
        resultsEl.append(it);
      }
    }

    // ۴) چت‌های موجود من
    const mine = State.chatOrder.map((id) => State.chats.get(id)).filter((c) =>
      c && (c.title || '').toLowerCase().includes(q.toLowerCase()));
    if (mine.length) {
      resultsEl.append(el('div', { class: 'sr-group', text: 'چت‌های شما' }));
      for (const c of mine.slice(0, 10)) {
        const it = el('div', { class: 'sr-item', onclick: () => { hideResults(); searchInput.value = ''; Chat.open(c.id); } });
        it.append(U.avatar(c, 'av-s'));
        const b = el('div', { class: 'sr-body' });
        b.append(el('div', { class: 'sr-t', html: highlight(c.title, term) }));
        b.append(el('div', { class: 'sr-s', text: c.lastMessage ? (c.lastMessage.text || U.mediaLabel(c.lastMessage.media?.type)) : '—' }));
        it.append(b);
        resultsEl.append(it);
      }
    }

    if (!resultsEl.children.length) {
      resultsEl.innerHTML = `<div class="empty-state" style="padding:40px 20px"><h3>نتیجه‌ای پیدا نشد</h3><p>عبارت دیگری را امتحان کنید.</p></div>`;
    }
  }

  function highlight(text, term) {
    if (!term) return U.esc(text);
    const safe = U.esc(text);
    const re = new RegExp('(' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
    return safe.replace(re, '<mark>$1</mark>');
  }

  /* --------------------------- منوی اصلی --------------------------- */
  function openMainMenu(anchor) {
    UI.dropdown(anchor, [
      { head: State.me ? `${State.me.name}` : '' },
      { label: 'گروه جدید', icon: 'users', onClick: () => ChatModals.createChat('group') },
      { label: 'کانال جدید', icon: 'megaphone', onClick: () => ChatModals.createChat('channel') },
      { label: 'پیام‌های ذخیره‌شده', icon: 'archive', onClick: () => ChatModals.savedMessages() },
      { label: 'مخاطبین', icon: 'user', onClick: () => ChatModals.contacts() },
      { label: 'کاوش گروه‌های عمومی', icon: 'search', onClick: () => ChatModals.explore() },
      { sep: true },
      { label: 'پیوستن با لینک دعوت', icon: 'link', onClick: () => ChatModals.joinByLink() },
      { label: 'تنظیمات', icon: 'settings', onClick: () => Settings.open() },
      { label: State.settings.theme === 'dark' ? 'حالت روشن' : 'حالت تاریک', icon: State.settings.theme === 'dark' ? 'sun' : 'moon', onClick: () => Settings.toggleTheme() },
      { sep: true },
      { label: 'خروج از حساب', icon: 'logout', danger: true, onClick: () => Session.logout() },
    ]);
  }

  function chatItemMenu(e, c) {
    UI.contextMenu(e.clientX, e.clientY, [
      { label: c.muted ? 'باصدا کردن' : 'بی‌صدا کردن', icon: c.muted ? 'megaphone' : 'mute', onClick: async () => {
        try { await API.mute(c.id, !c.muted); c.muted = !c.muted; refreshList(); UI.ok(c.muted ? 'اعلان‌ها خاموش شد' : 'اعلان‌ها روشن شد'); }
        catch (er) { UI.err(er.message); }
      }},
      { label: 'علامت‌گذاری به‌عنوان خوانده‌شده', icon: 'check', onClick: async () => {
        try { await API.markRead(c.id); c.unread = 0; refreshList(); updateDocumentTitle(); } catch {}
      }},
      { label: 'اطلاعات', icon: 'info', onClick: () => Chat.openInfo(c.id) },
      { sep: true },
      { label: c.type === 'dm' ? 'پاک کردن گفت‌وگو' : 'ترک کردن', icon: 'trash', danger: true, onClick: async () => {
        const yes = await UI.confirm({
          title: c.type === 'dm' ? 'پاک کردن گفت‌وگو' : 'ترک کردن',
          text: c.type === 'dm' ? 'این گفت‌وگو از لیست شما حذف می‌شود. ادامه می‌دهید؟' : `آیا مطمئنید که می‌خواهید «${c.title}» را ترک کنید؟`,
          danger: true, confirmText: 'بله',
        });
        if (!yes) return;
        try {
          await API.leave(c.id);
          State.chats.delete(c.id); sortChats();
          if (State.activeChatId === c.id) Chat.closeActive();
          refreshList(); UI.ok('انجام شد');
        } catch (er) { UI.err(er.message); }
      }},
    ]);
  }

  function clearSearch() { if (searchInput) { searchInput.value = ''; hideResults(); } }

  return { render, refreshList, updateItem, markActive, hideResults, clearSearch, reorder };
})();
