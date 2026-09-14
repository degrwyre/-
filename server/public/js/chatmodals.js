'use strict';
/* ==========================================================================
   مودال‌های چت: ساخت گروه/کانال، افزودن عضو، لینک دعوت، هدایت، مخاطبین
   ========================================================================== */
const ChatModals = (() => {
  const { el, icon } = U;

  /* ---------------------- انتخاب چت جدید (منوی اصلی) ---------------------- */
  function newChat() {
    const anchor = document.querySelector('.sb-head .icon-btn:last-child') || document.querySelector('.fab');
    UI.dropdown(anchor, [
      { label: 'گفت‌وگوی جدید', icon: 'user', onClick: () => searchUsersModal('یک کاربر پیدا کنید تا گفت‌وگو را شروع کنید') },
      { label: 'گروه جدید', icon: 'users', onClick: () => createChat('group') },
      { label: 'کانال جدید', icon: 'megaphone', onClick: () => createChat('channel') },
      { sep: true },
      { label: 'پیوستن با لینک دعوت', icon: 'link', onClick: () => joinByLink() },
      { label: 'کاوش چت‌های عمومی', icon: 'search', onClick: () => explore() },
      { label: 'مخاطبین', icon: 'user', onClick: () => contacts() },
    ]);
  }

  /* --------------------------- ساخت گروه/کانال --------------------------- */
  async function createChat(type) {
    const isChannel = type === 'channel';
    const selected = new Map();
    let searchResults = [];

    const body = el('div');
    const titleInput = el('input', { type: 'text', placeholder: isChannel ? 'نام کانال' : 'نام گروه', maxlength: 64 });
    const aboutInput = el('textarea', { rows: 2, placeholder: 'توضیحات (اختیاری)', maxlength: 200, style: { width: '100%', resize: 'none' } });

    body.append(el('div', { class: 'field' }, el('label', { text: isChannel ? 'نام کانال *' : 'نام گروه *' }), titleInput));
    body.append(el('div', { class: 'field' }, el('label', { text: 'توضیحات' }), aboutInput));

    const publicWrap = el('label', { class: 'setting-row', style: { padding: '8px 0' } });
    const cb = el('input', { type: 'checkbox', checked: isChannel ? true : false });
    publicWrap.append(el('div', { class: 'sr-body' },
      el('div', { class: 'sr-t', text: isChannel ? 'کانال عمومی' : 'گروه عمومی' }),
      el('div', { class: 'sr-s', text: 'هر کسی می‌تواند با جست‌وجو آن را پیدا و عضو شود' })));
    publicWrap.append(el('label', { class: 'switch' }, cb, el('span', { class: 'sl' })));
    body.append(publicWrap);

    body.append(el('div', { class: 'field', style: { marginTop: '10px' } },
      el('label', { text: 'افزودن اعضا (اختیاری)' }),
      (() => { const s = el('input', { type: 'text', placeholder: 'جست‌وجوی کاربر…' }); s.oninput = U.debounce(() => doSearch(s.value), 300); return s; })()));

    const chips = el('div', { class: 'chips' });
    const list = el('div', { class: 'pick-list' });
    body.append(chips, list);

    function renderChips() {
      chips.innerHTML = '';
      for (const [id, u] of selected) {
        chips.append(el('span', { class: 'chip' },
          el('span', { text: u.name }),
          el('button', { onclick: () => { selected.delete(id); renderChips(); renderList(); } }, icon('close'))));
      }
    }

    function renderList() {
      list.innerHTML = '';
      if (!searchResults.length) { list.append(el('div', { style: { padding: '14px', color: 'var(--text-2)', fontSize: '13px', textAlign: 'center' }, text: 'برای دیدن کاربران، نام یا نام کاربری را جست‌وجو کنید.' })); return; }
      for (const u of searchResults) {
        const on = selected.has(u.id);
        const it = el('div', { class: `pick-item ${on ? 'on' : ''}`, onclick: () => {
          if (on) selected.delete(u.id); else selected.set(u.id, u);
          renderChips(); renderList();
        }});
        it.append(el('span', { class: 'cb' }, icon('check')));
        it.append(U.avatar(u, 'av-s', u.online));
        const b = el('div', { class: 'mr-body' });
        b.append(el('div', { class: 'mr-name', text: u.name }));
        b.append(el('div', { class: 'mr-sub', text: u.username ? '@' + u.username : '' }));
        it.append(b);
        list.append(it);
      }
    }

    async function doSearch(q) {
      q = q.trim();
      if (q.length < 2) { searchResults = []; renderList(); return; }
      try {
        const d = await API.search(q);
        searchResults = d.users || [];
        renderList();
      } catch { searchResults = []; renderList(); }
    }

    renderList();
    setTimeout(() => titleInput.focus(), 60);

    const m = UI.modal({
      title: isChannel ? 'ساخت کانال جدید' : 'ساخت گروه جدید',
      body,
      foot: [
        el('button', { class: 'btn ghost', text: 'انصراف', onclick: () => m.close() }),
        el('button', { class: 'btn', text: 'ساختن', onclick: async (e) => {
          const btn = e.currentTarget;
          const title = titleInput.value.trim();
          if (title.length < 2) { titleInput.classList.add('err'); titleInput.focus(); UI.err('نام را وارد کنید (حداقل ۲ کاراکتر)'); return; }
          btn.disabled = true; btn.textContent = 'در حال ساخت…';
          try {
            const d = await API.createChat({
              type, title, about: aboutInput.value.trim(),
              memberIds: [...selected.keys()], isPublic: cb.checked,
            });
            upsertChat(d.chat);
            ChatList.refreshList();
            m.close();
            Chat.open(d.chat.id);
            UI.ok(isChannel ? 'کانال ساخته شد' : 'گروه ساخته شد');
          } catch (er) { UI.err(er.message); btn.disabled = false; btn.textContent = 'ساختن'; }
        }}),
      ],
    });
  }

  /* ------------------------- جست‌وجوی کاربر برای چت ------------------------- */
  function searchUsersModal(title) {
    const body = el('div');
    const input = el('input', { type: 'text', placeholder: 'نام یا @نام‌کاربری…', autofocus: true });
    const out = el('div', { style: { marginTop: '12px', maxHeight: '330px', overflowY: 'auto' } });
    body.append(el('div', { class: 'field' }, input), out);

    async function run() {
      const q = input.value.trim();
      if (q.length < 2) { out.innerHTML = ''; return; }
      out.innerHTML = '<div style="color:var(--text-2);font-size:13px;padding:10px">در حال جست‌وجو…</div>';
      try {
        const d = await API.search(q);
        out.innerHTML = '';
        if (!(d.users || []).length && !(d.chats || []).length) {
          out.innerHTML = '<div style="color:var(--text-2);font-size:13px;padding:10px">کاربری با این مشخصات پیدا نشد.</div>';
          return;
        }
        for (const u of d.users || []) {
          const it = el('div', { class: 'sr-item', onclick: async () => {
            m.close();
            try { const r = await API.startDM(u.id); upsertChat(r.chat); ChatList.refreshList(); Chat.open(r.chat.id); }
            catch (e) { UI.err(e.message); }
          }});
          it.append(U.avatar(u, 'av-s', u.online));
          const b = el('div', { class: 'sr-body' });
          b.append(el('div', { class: 'sr-t', text: u.name }));
          b.append(el('div', { class: 'sr-s', text: (u.username ? '@' + u.username : '') + (u.online ? ' • آنلاین' : '') }));
          it.append(b);
          out.append(it);
        }
        for (const c of d.chats || []) {
          const it = el('div', { class: 'sr-item', onclick: () => { m.close(); publicChat(c); } });
          it.append(U.avatar(c, 'av-s'));
          const b = el('div', { class: 'sr-body' });
          b.append(el('div', { class: 'sr-t', text: c.title }));
          b.append(el('div', { class: 'sr-s', text: `${c.type === 'channel' ? 'کانال' : 'گروه'} • ${U.faNum(c.memberCount)} عضو` }));
          it.append(b);
          out.append(it);
        }
      } catch (e) { out.innerHTML = ''; UI.err(e.message); }
    }
    input.oninput = U.debounce(run, 300);
    const m = UI.modal({ title: title || 'گفت‌وگوی جدید', body });
    setTimeout(() => input.focus(), 60);
  }

  /* ------------------------------ افزودن عضو ------------------------------ */
  async function addMembers(chat) {
    const members = State.members.get(chat.id) || [];
    const memberIds = new Set(members.map((m) => m.id));
    const selected = new Map();
    let results = [];

    const body = el('div');
    const input = el('input', { type: 'text', placeholder: 'جست‌وجوی کاربر…' });
    const chips = el('div', { class: 'chips' });
    const list = el('div', { class: 'pick-list', style: { marginTop: '10px' } });
    body.append(el('div', { class: 'field' }, input), chips, list);

    function render() {
      chips.innerHTML = '';
      for (const [id, u] of selected) {
        chips.append(el('span', { class: 'chip' }, el('span', { text: u.name }),
          el('button', { onclick: () => { selected.delete(id); render(); } }, icon('close'))));
      }
      list.innerHTML = '';
      if (!results.length) { list.append(el('div', { style: { padding: '12px', color: 'var(--text-2)', fontSize: '13px', textAlign: 'center' }, text: 'کاربری را جست‌وجو کنید' })); return; }
      for (const u of results) {
        if (memberIds.has(u.id)) continue;
        const on = selected.has(u.id);
        const it = el('div', { class: `pick-item ${on ? 'on' : ''}`, onclick: () => { on ? selected.delete(u.id) : selected.set(u.id, u); render(); } });
        it.append(el('span', { class: 'cb' }, icon('check')));
        it.append(U.avatar(u, 'av-s', u.online));
        const b = el('div', { class: 'mr-body' });
        b.append(el('div', { class: 'mr-name', text: u.name }));
        b.append(el('div', { class: 'mr-sub', text: u.username ? '@' + u.username : '' }));
        it.append(b);
        list.append(it);
      }
    }
    input.oninput = U.debounce(async () => {
      const q = input.value.trim();
      if (q.length < 2) { results = []; render(); return; }
      try { results = (await API.search(q)).users || []; } catch { results = []; }
      render();
    }, 300);
    render();
    setTimeout(() => input.focus(), 50);

    const m = UI.modal({
      title: 'افزودن عضو به ' + chat.title,
      body,
      foot: [
        el('button', { class: 'btn ghost', text: 'انصراف', onclick: () => m.close() }),
        el('button', { class: 'btn', text: 'افزودن', onclick: async (e) => {
          if (!selected.size) { UI.err('کسی را انتخاب نکرده‌اید'); return; }
          const btn = e.currentTarget; btn.disabled = true; btn.textContent = 'در حال افزودن…';
          let okCount = 0;
          for (const id of selected.keys()) {
            try { await API.addMember(chat.id, id); okCount++; } catch (er) { UI.err(er.message); }
          }
          btn.disabled = false; btn.textContent = 'افزودن';
          if (okCount) { m.close(); UI.ok(`${U.faNum(okCount)} کاربر اضافه شد`); State.members.delete(chat.id); ChatPanels.openInfo(chat.id); ChatList.refreshList(); }
        }}),
      ],
    });
  }

  /* --------------------------- لینک دعوت --------------------------- */
  function inviteLink(chat) {
    const url = ChatPanels.inviteUrl(chat.inviteCode);
    const body = el('div');
    const inp = el('input', { type: 'text', value: url, readonly: true, style: { width: '100%', padding: '11px 13px', background: 'var(--bg-3)', border: 'none', borderRadius: '10px', outline: 'none', direction: 'ltr', textAlign: 'left' } });
    body.append(el('div', { class: 'field' }, el('label', { text: 'لینک دعوت' }), inp));
    body.append(el('p', { style: { color: 'var(--text-2)', fontSize: '13px', lineHeight: '1.8' }, text: 'هر کسی که این لینک را باز کند، می‌تواند عضو چت شود. برای ساختن لینک جدید، اطلاعات چت را ویرایش کنید.' }));

    UI.modal({
      title: 'لینک دعوت',
      body,
      foot: [
        el('button', { class: 'btn ghost', text: 'بستن', onclick: function () { this.closest('.modal-backdrop').remove(); } }),
        el('button', { class: 'btn', text: 'کپی لینک', onclick: async () => { await U.copy(url); UI.ok('لینک کپی شد'); } }),
      ],
    });
  }

  /* ------------------------ تغییر عکس چت ------------------------ */
  function changeChatAvatar(chat) {
    const input = el('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
    input.onchange = async () => {
      const f = input.files[0]; input.remove();
      if (!f) return;
      const load = UI.loading('در حال آپلود…');
      try {
        const d = await API.uploadChatAvatar(chat.id, f);
        upsertChat(d.chat); ChatList.refreshList(); load.close(); UI.ok('عکس چت به‌روز شد');
        ChatPanels.openInfo(chat.id);
      } catch (e) { load.close(); UI.err(e.message); }
    };
    document.body.append(input); input.click();
  }

  /* ------------------------- ویرایش چت ------------------------- */
  function editChat(chat) {
    const body = el('div');
    const title = el('input', { type: 'text', value: chat.title || '', maxlength: 64 });
    const about = el('textarea', { rows: 3, maxlength: 200, style: { width: '100%', resize: 'vertical' } });
    about.value = chat.about || '';
    const cb = el('input', { type: 'checkbox' }); cb.checked = !!chat.isPublic;

    body.append(el('div', { class: 'field' }, el('label', { text: 'نام' }), title));
    body.append(el('div', { class: 'field' }, el('label', { text: 'توضیحات' }), about));

    const pub = el('label', { class: 'setting-row', style: { padding: '8px 0' } });
    pub.append(el('div', { class: 'sr-body' }, el('div', { class: 'sr-t', text: 'عمومی' }), el('div', { class: 'sr-s', text: 'در جست‌وجو نمایش داده شود' })));
    pub.append(el('label', { class: 'switch' }, cb, el('span', { class: 'sl' })));
    body.append(pub);

    const m = UI.modal({
      title: 'ویرایش اطلاعات',
      body,
      foot: [
        el('button', { class: 'btn ghost', text: 'انصراف', onclick: () => m.close() }),
        el('button', { class: 'btn', text: 'ذخیره', onclick: async (e) => {
          const btn = e.currentTarget; btn.disabled = true;
          try {
            const d = await API.updateChat(chat.id, { title: title.value.trim(), about: about.value.trim(), isPublic: cb.checked });
            upsertChat(d.chat); ChatList.refreshList(); m.close(); UI.ok('ذخیره شد'); ChatPanels.openInfo(chat.id);
          } catch (er) { UI.err(er.message); btn.disabled = false; }
        }}),
      ],
    });
  }

  /* ---------------------------- هدایت پیام ---------------------------- */
  async function forward(messageIds) {
    const selected = new Set();
    const body = el('div');
    const input = el('input', { type: 'text', placeholder: 'جست‌وجوی چت…' });
    const list = el('div', { class: 'pick-list', style: { marginTop: '10px', maxHeight: '330px' } });
    body.append(el('p', { style: { color: 'var(--text-2)', fontSize: '13px', marginTop: 0 }, text: `${U.faNum(messageIds.length)} پیام را به کجا هدایت کنید؟` }));
    body.append(el('div', { class: 'field' }, input), list);

    function render(filter = '') {
      list.innerHTML = '';
      const chats = State.chatOrder.map((id) => State.chats.get(id)).filter(Boolean)
        .filter((c) => !filter || (c.title || '').toLowerCase().includes(filter.toLowerCase()));
      if (!chats.length) { list.append(el('div', { style: { padding: '14px', textAlign: 'center', color: 'var(--text-2)', fontSize: '13px' }, text: 'چتی پیدا نشد' })); return; }
      for (const c of chats) {
        const canPost = c.type !== 'channel' || ['owner', 'admin'].includes(c.myRole);
        if (!canPost) continue;
        const on = selected.has(c.id);
        const it = el('div', { class: `pick-item ${on ? 'on' : ''}`, onclick: () => { on ? selected.delete(c.id) : selected.add(c.id); render(input.value.trim()); } });
        it.append(el('span', { class: 'cb' }, icon('check')));
        it.append(U.avatar(c, 'av-s'));
        const b = el('div', { class: 'mr-body' });
        b.append(el('div', { class: 'mr-name', text: c.title }));
        b.append(el('div', { class: 'mr-sub', text: c.type === 'dm' ? 'خصوصی' : (c.type === 'channel' ? 'کانال' : 'گروه') }));
        it.append(b);
        list.append(it);
      }
    }
    input.oninput = U.debounce(() => render(input.value.trim()), 200);
    render();

    const m = UI.modal({
      title: 'هدایت پیام',
      body,
      foot: [
        el('button', { class: 'btn ghost', text: 'انصراف', onclick: () => m.close() }),
        el('button', { class: 'btn', text: 'هدایت', onclick: async (e) => {
          if (!selected.size) { UI.err('مقصدی انتخاب نشده'); return; }
          const btn = e.currentTarget; btn.disabled = true; btn.textContent = 'در حال هدایت…';
          try {
            const d = await API.forward(messageIds, [...selected]);
            m.close(); Chat.clearSelect();
            UI.ok(`${U.faNum(d.forwarded)} پیام هدایت شد`);
          } catch (er) { UI.err(er.message); btn.disabled = false; btn.textContent = 'هدایت'; }
        }}),
      ],
    });
  }

  /* ------------------------ پیوستن با لینک ------------------------ */
  async function joinByLink() {
    const code = await UI.prompt({
      title: 'پیوستن با لینک دعوت',
      label: 'لینک یا کد دعوت را وارد کنید',
      placeholder: 'https://…/join/AbCdEf  یا  AbCdEf',
      okText: 'پیوستن',
    });
    if (!code) return;
    const clean = code.trim().split('/').pop();
    const load = UI.loading();
    try {
      const d = await API.joinByCode(clean);
      upsertChat(d.chat); State.members.delete(d.chat.id);
      ChatList.refreshList(); load.close(); Chat.open(d.chat.id);
      UI.ok(d.already ? 'شما قبلاً عضو بودید' : 'با موفقیت عضو شدید');
    } catch (e) { load.close(); UI.err(e.message); }
  }

  /* ------------------------------ مخاطبین ------------------------------ */
  async function contacts() {
    const body = el('div');
    const list = el('div');
    body.append(list);
    const load = UI.loading();
    let data;
    try { data = await API.contacts(); } catch { data = { contacts: [] }; }
    load.close();

    function render() {
      list.innerHTML = '';
      if (!data.contacts.length) {
        list.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-2)">هنوز مخاطبی ذخیره نکرده‌اید.<br>از پروفایل هر کاربر می‌توانید او را به مخاطبین اضافه کنید.</div>';
        return;
      }
      for (const u of data.contacts) {
        const it = el('div', { class: 'sr-item', onclick: async () => {
          m.close();
          try { const r = await API.startDM(u.id); upsertChat(r.chat); ChatList.refreshList(); Chat.open(r.chat.id); } catch (e) { UI.err(e.message); }
        }});
        it.append(U.avatar(u, 'av-s', u.online));
        const b = el('div', { class: 'sr-body' });
        b.append(el('div', { class: 'sr-t', text: u.name }));
        b.append(el('div', { class: 'sr-s', text: u.username ? '@' + u.username : '' }));
        it.append(b);
        it.append(el('button', { class: 'icon-btn', title: 'حذف از مخاطبین', onclick: async (e) => {
          e.stopPropagation();
          try { await API.removeContact(u.id); data.contacts = data.contacts.filter((x) => x.id !== u.id); render(); } catch {}
        }}, icon('trash', 'ico ico-sm')));
        list.append(it);
      }
    }
    render();
    const m = UI.modal({
      title: 'مخاطبین',
      body,
      foot: [el('button', { class: 'btn ghost', text: 'بستن', onclick: () => m.close() }),
             el('button', { class: 'btn', text: 'کاربر جدید', onclick: () => { m.close(); searchUsersModal('افزودن مخاطب'); } })],
    });
  }

  /* -------------------------- چت‌های عمومی -------------------------- */
  async function explore() {
    const body = el('div');
    const list = el('div');
    body.append(list);
    const load = UI.loading();
    let data;
    try { data = await API.explore(); } catch { data = { chats: [] }; }
    load.close();

    if (!data.chats.length) {
      list.innerHTML = '<div style="padding:26px;text-align:center;color:var(--text-2)">هنوز چت عمومی‌ای ساخته نشده.<br>اولین گروه یا کانال عمومی را خودتان بسازید!</div>';
    }
    for (const c of data.chats) {
      const it = el('div', { class: 'sr-item' });
      it.append(U.avatar(c, 'av-s'));
      const b = el('div', { class: 'sr-body', onclick: () => { m.close(); publicChat(c); } });
      b.append(el('div', { class: 'sr-t', text: c.title }));
      b.append(el('div', { class: 'sr-s', text: `${c.type === 'channel' ? 'کانال' : 'گروه'} • ${U.faNum(c.memberCount)} عضو` }));
      it.append(b);
      it.append(c.joined
        ? el('button', { class: 'btn sm ghost', text: 'باز کردن', onclick: () => { m.close(); Chat.open(c.id); } })
        : el('button', { class: 'btn sm', text: 'پیوستن', onclick: async () => {
            try { const d = await API.joinByCode(c.inviteCode); upsertChat(d.chat); ChatList.refreshList(); m.close(); Chat.open(d.chat.id); UI.ok('عضو شدید'); }
            catch (e) { UI.err(e.message); }
          }}));
      list.append(it);
    }
    const m = UI.modal({ title: 'کاوش چت‌های عمومی', body, wide: false });
  }

  function publicChat(c) {
    const body = el('div');
    const hero = el('div', { class: 'profile-hero', style: { background: 'transparent' } });
    hero.append(U.avatar(c, 'av-l'));
    hero.append(el('h2', { style: { justifyContent: 'center' }, text: c.title }));
    hero.append(el('div', { class: 'sub', text: `${c.type === 'channel' ? 'کانال' : 'گروه'} • ${U.faNum(c.memberCount)} عضو` }));
    body.append(hero);
    if (c.about) body.append(el('p', { style: { color: 'var(--text-2)', textAlign: 'center', fontSize: '13.5px' }, text: c.about }));

    const joined = State.chats.has(c.id);
    const m = UI.modal({
      title: c.title, body,
      foot: joined
        ? [el('button', { class: 'btn', text: 'باز کردن چت', onclick: () => { m.close(); Chat.open(c.id); } })]
        : [el('button', { class: 'btn ghost', text: 'بستن', onclick: () => m.close() }),
           el('button', { class: 'btn', text: 'پیوستن', onclick: async () => {
             try { const d = await API.joinByCode(c.inviteCode); upsertChat(d.chat); ChatList.refreshList(); m.close(); Chat.open(d.chat.id); UI.ok('عضو شدید 🎉'); }
             catch (e) { UI.err(e.message); }
           }})],
    });
  }

  /* ---------------------- پیام‌های ذخیره‌شده ---------------------- */
  async function savedMessages() {
    const load = UI.loading();
    try {
      const d = await API.savedChat();
      upsertChat(d.chat);
      State.members.delete(d.chat.id);
      ChatList.refreshList();
      load.close();
      Chat.open(d.chat.id);
    } catch (e) { load.close(); UI.err(e.message); }
  }

  return {
    newChat, createChat, searchUsersModal, addMembers, inviteLink, changeChatAvatar,
    editChat, forward, joinByLink, contacts, explore, publicChat, savedMessages,
  };
})();
