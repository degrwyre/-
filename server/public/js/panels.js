'use strict';
/* ==========================================================================
   پنل‌ها و مودال‌ها: اطلاعات چت، پروفایل، ساخت گروه/کانال، هدایت، مخاطبین
   ========================================================================== */

/* ------------------------- پنل اطلاعات چت ------------------------- */
const ChatPanels = (() => {
  const { el, icon } = U;
  let panel = null;

  function close() { if (panel) { panel.remove(); panel = null; } }

  async function openInfo(chatId) {
    const chat = State.chats.get(chatId);
    if (!chat) return;
    close();

    panel = el('div', { class: 'side-panel' });
    panel.append(el('div', { class: 'sp-head' },
      el('button', { class: 'icon-btn', onclick: () => close() }, icon('back')),
      el('h3', { text: chat.type === 'dm' ? 'اطلاعات کاربر' : 'اطلاعات ' + (chat.type === 'channel' ? 'کانال' : 'گروه') }),
      el('button', { class: 'icon-btn', onclick: () => UI.dropdown(panel.querySelector('.sp-head .icon-btn:last-child'), moreMenu(chat)) }, icon('menu')),
    ));

    const body = el('div', { class: 'sp-body' });
    panel.append(body);
    document.querySelector('.sidebar').append(panel);

    if (chat.type === 'dm' && chat.peer) return renderPeer(body, chat);
    return renderGroup(body, chat);
  }

  function moreMenu(chat) {
    return [
      { label: 'جست‌وجو در پیام‌ها', icon: 'search', onClick: () => { close(); } },
      { label: chat.muted ? 'باصدا کردن' : 'بی‌صدا کردن', icon: 'mute', onClick: async () => {
        try { await API.mute(chat.id, !chat.muted); chat.muted = !chat.muted; ChatList.refreshList(); openInfo(chat.id); } catch (e) { UI.err(e.message); }
      }},
    ];
  }

  async function renderPeer(body, chat) {
    let data;
    try { data = await API.user(chat.peer.id); } catch { data = { user: chat.peer, commonChats: [] }; }
    const u = data.user;
    chat.peer = u;

    const hero = el('div', { class: 'profile-hero' });
    const av = U.avatar(u, 'av-xl', u.online);
    av.style.cursor = 'pointer';
    av.onclick = () => changePeerAvatar(u, av);
    hero.append(av);
    hero.append(el('h2', {}, el('span', { text: u.name }), u.isVerified ? icon('verified', 'ico ico-sm') : null));
    hero.append(el('div', { class: 'sub', text: u.online ? 'آنلاین' : u.lastSeen }));
    body.append(hero);

    const rows = el('div', { class: 'info-rows' });
    if (u.username) rows.push && null;
    rows.append(infoRow('user', '@' + (u.username || '—'), 'نام کاربری', async () => { await U.copy('@' + u.username); UI.ok('کپی شد'); }));
    if (u.bio) rows.append(infoRow('info', u.bio, 'درباره'));
    body.append(rows);

    const actions = el('div', { class: 'info-rows', style: { borderTop: '8px solid var(--bg-3)' } });
    actions.append(infoRow('archive', 'پیام‌های مشترک', `${U.faNum((data.commonChats || []).length)} چت مشترک`, () => {}));
    actions.append(infoRow('mute', chat.muted ? 'اعلان‌ها خاموش است' : 'خاموش کردن اعلان‌ها', '', async () => {
      try { await API.mute(chat.id, !chat.muted); chat.muted = !chat.muted; ChatList.refreshList(); openInfo(chat.id); } catch (e) { UI.err(e.message); }
    }));
    body.append(actions);
  }

  function changePeerAvatar() { /* آواتار دیگران قابل تغییر نیست */ }

  async function renderGroup(body, chat) {
    const hero = el('div', { class: 'profile-hero' });
    const av = U.avatar(chat, 'av-xl');
    av.style.cursor = ['owner', 'admin'].includes(chat.myRole) ? 'pointer' : 'default';
    av.onclick = () => {
      if (!['owner', 'admin'].includes(chat.myRole)) return;
      ChatModals.changeChatAvatar(chat);
    };
    hero.append(av);
    hero.append(el('h2', { text: chat.title }));
    hero.append(el('div', {
      class: 'sub',
      text: `${U.faNum(chat.memberCount)} ${chat.type === 'channel' ? 'مشترک' : 'عضو'}`,
    }));
    body.append(hero);

    const rows = el('div', { class: 'info-rows' });
    if (chat.about) rows.append(infoRow('info', chat.about, 'درباره'));
    if (chat.inviteCode) {
      rows.append(infoRow('link', inviteUrl(chat.inviteCode), 'لینک دعوت', async () => {
        await U.copy(inviteUrl(chat.inviteCode)); UI.ok('لینک دعوت کپی شد');
      }));
    }
    body.append(rows);

    // اعضا
    const secTitle = el('div', { class: 'sec-title', text: `${U.faNum(chat.memberCount || 0)} عضو` });
    body.append(secTitle);
    const listBox = el('div', { class: 'info-rows' });
    body.append(listBox);

    try {
      const d = await API.members(chat.id);
      State.members.set(chat.id, d.members);
      listBox.innerHTML = '';
      for (const m of d.members) listBox.append(memberRow(chat, m));
    } catch (e) {
      listBox.append(el('div', { style: { padding: '14px 18px', color: 'var(--text-2)' }, text: 'خطا در دریافت اعضا' }));
    }

    if (['owner', 'admin'].includes(chat.myRole)) {
      const addBtn = el('div', { class: 'info-row', onclick: () => ChatModals.addMembers(chat), style: { color: 'var(--accent)' } });
      addBtn.append(icon('plus'));
      addBtn.append(el('div', { class: 'ir-body' }, el('div', { class: 'ir-v', text: 'افزودن عضو' })));
      body.append(addBtn);
    }

    // تنظیمات
    const setBox = el('div', { class: 'info-rows', style: { borderTop: '8px solid var(--bg-3)', marginTop: '8px' } });
    setBox.append(infoRow('edit', 'ویرایش اطلاعات', '', () => ChatModals.editChat(chat)));
    setBox.append(infoRow('mute', chat.muted ? 'اعلان‌ها خاموش' : 'خاموش کردن اعلان‌ها', '', async () => {
      try { await API.mute(chat.id, !chat.muted); chat.muted = !chat.muted; ChatList.refreshList(); openInfo(chat.id); } catch (e) { UI.err(e.message); }
    }));
    setBox.append(infoRow('logout', chat.type === 'dm' ? 'پاک کردن گفت‌وگو' : 'ترک کردن ' + (chat.type === 'channel' ? 'کانال' : 'گروه'), '', async () => {
      const yes = await UI.confirm({ title: 'ترک کردن', text: `مطمئنید که می‌خواهید «${chat.title}» را ترک کنید؟`, danger: true, confirmText: 'ترک' });
      if (!yes) return;
      try {
        await API.leave(chat.id);
        State.chats.delete(chat.id); sortChats(); close();
        if (State.activeChatId === chat.id) Chat.closeActive();
        ChatList.refreshList(); UI.ok('انجام شد');
      } catch (e) { UI.err(e.message); }
    }, true));
    body.append(setBox);
  }

  function memberRow(chat, m) {
    const row = el('div', { class: 'member-row' });
    row.append(U.avatar(m, 'av-s', m.online));
    const b = el('div', { class: 'mr-body', onclick: () => { close(); Profile.open(m.id); } });
    const nm = el('div', { class: 'mr-name' }, el('span', { text: m.name }));
    if (m.role !== 'member') nm.append(el('span', { class: 'role-chip', text: m.role === 'owner' ? 'مالک' : 'ادمین' }));
    if (m.id === State.me.id) nm.append(el('span', { class: 'role-chip', style: { background: 'var(--bg-3)', color: 'var(--text-2)' }, text: 'شما' }));
    b.append(nm);
    b.append(el('div', { class: 'mr-sub', text: m.online ? 'آنلاین' : (m.lastSeen || '') }));
    row.append(b);

    const canManage = chat.myRole === 'owner' || (chat.myRole === 'admin' && m.role === 'member');
    if (canManage || chat.myRole === 'owner') {
      row.append(el('button', { class: 'icon-btn', onclick: (e) => {
        e.stopPropagation();
        const items = [];
        if (chat.myRole === 'owner' && m.id !== State.me.id) {
          items.push({ label: m.role === 'admin' ? 'تنزل به عضو' : 'ارتقا به ادمین', icon: 'shield', onClick: async () => {
            try { await API.setRole(chat.id, m.id, m.role === 'admin' ? 'member' : 'admin'); openInfo(chat.id); } catch (er) { UI.err(er.message); }
          }});
          items.push({ label: 'واگذاری مالکیت', icon: 'star', onClick: async () => {
            const yes = await UI.confirm({ title: 'واگذاری مالکیت', text: `مالکیت «${chat.title}» به ${m.name} واگذار شود؟`, danger: true, confirmText: 'واگذاری' });
            if (!yes) return;
            try { await API.transfer(chat.id, m.id); UI.ok('مالکیت واگذار شد'); close(); Chat.open(chat.id); } catch (er) { UI.err(er.message); }
          }});
        }
        if (m.id !== State.me.id) {
          items.push({ label: 'حذف از چت', icon: 'trash', danger: true, onClick: async () => {
            const yes = await UI.confirm({ title: 'حذف عضو', text: `${m.name} از چت حذف شود؟`, danger: true, confirmText: 'حذف' });
            if (!yes) return;
            try { await API.removeMember(chat.id, m.id); openInfo(chat.id); ChatList.refreshList(); } catch (er) { UI.err(er.message); }
          }});
        }
        if (!items.length) items.push({ label: 'مشاهده پروفایل', icon: 'user', onClick: () => { close(); Profile.open(m.id); } });
        UI.dropdown(e.currentTarget, items);
      }}, icon('menu')));
    }
    return row;
  }

  function infoRow(iconName, value, key, onClick, danger) {
    const row = el('div', { class: 'info-row', onclick: onClick || undefined });
    if (danger) row.style.color = 'var(--red)';
    row.append(icon(iconName));
    const b = el('div', { class: 'ir-body' });
    b.append(el('div', { class: 'ir-v', text: value }));
    if (key) b.append(el('div', { class: 'ir-k', text: key }));
    row.append(b);
    return row;
  }

  function inviteUrl(code) {
    const base = location.origin;
    return `${base}/join/${code}`;
  }

  return { openInfo, close, inviteUrl };
})();

/* --------------------------- پروفایل کاربر --------------------------- */
const Profile = (() => {
  const { el, icon } = U;

  async function open(idOrName) {
    if (!idOrName) return;
    if (String(idOrName) === String(State.me.id)) return Settings.open();

    const load = UI.loading('در حال بارگذاری پروفایل…');
    let data;
    try { data = await API.user(idOrName); }
    catch (e) { load.close(); UI.err(e.message); return; }
    load.close();

    const u = data.user;
    const body = el('div');

    const hero = el('div', { class: 'profile-hero', style: { background: 'transparent' } });
    hero.append(U.avatar(u, 'av-l', u.online));
    hero.append(el('h2', { style: { justifyContent: 'center' } }, el('span', { text: u.name }), u.isVerified ? icon('verified', 'ico ico-sm') : null));
    hero.append(el('div', { class: 'sub', text: u.online ? 'آنلاین' : u.lastSeen }));
    body.append(hero);

    const rows = el('div', { class: 'info-rows' });
    if (u.username) {
      const r = el('div', { class: 'info-row', onclick: async () => { await U.copy('@' + u.username); UI.ok('کپی شد'); } });
      r.append(icon('user'));
      r.append(el('div', { class: 'ir-body' }, el('div', { class: 'ir-v', text: '@' + u.username }), el('div', { class: 'ir-k', text: 'نام کاربری' })));
      rows.append(r);
    }
    if (u.bio) {
      const r = el('div', { class: 'info-row' });
      r.append(icon('info'));
      r.append(el('div', { class: 'ir-body' }, el('div', { class: 'ir-v', text: u.bio }), el('div', { class: 'ir-k', text: 'درباره' })));
      rows.append(r);
    }
    body.append(rows);

    if ((data.commonChats || []).length) {
      body.append(el('div', { class: 'sec-title', text: 'چت‌های مشترک' }));
      const box = el('div', { class: 'info-rows' });
      for (const c of data.commonChats) {
        const r = el('div', { class: 'info-row', onclick: () => { m.close(); Chat.open(c.id); } });
        r.append(U.avatar(c, 'av-xs'));
        r.append(el('div', { class: 'ir-body' }, el('div', { class: 'ir-v', text: c.title }), el('div', { class: 'ir-k', text: `${U.faNum(c.memberCount)} عضو` })));
        box.append(r);
      }
      body.append(box);
    }

    const m = UI.modal({
      title: 'پروفایل',
      body,
      foot: [
        el('button', { class: 'btn ghost', text: 'بستن', onclick: () => m.close() }),
        el('button', { class: 'btn', text: 'شروع گفت‌وگو', onclick: async () => {
          m.close();
          try { const d = await API.startDM(u.id); upsertChat(d.chat); ChatList.refreshList(); Chat.open(d.chat.id); }
          catch (e) { UI.err(e.message); }
        }}),
      ],
    });
  }

  return { open };
})();
