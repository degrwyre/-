'use strict';
/* ==========================================================================
   پنل تنظیمات: پروفایل، ظاهر، اعلان‌ها، حریم خصوصی، دستگاه‌های فعال
   ========================================================================== */
const Settings = (() => {
  const { el, icon } = U;

  function toggleTheme() {
    State.settings.theme = State.settings.theme === 'dark' ? 'light' : 'dark';
    applyAppearance();
    persist({ theme: State.settings.theme });
  }

  async function persist(patch) {
    U.store.set('settings', State.settings);
    try { await API.updateSettings(patch); } catch {}
  }

  /* ------------------------------ پروفایل من ------------------------------ */
  function openMyProfile() {
    const body = el('div');
    const av = U.avatar(State.me, 'av-xl');
    av.style.cursor = 'pointer';
    av.title = 'برای تغییر کلیک کنید';
    av.onclick = () => changeAvatar();

    const hero = el('div', { class: 'profile-hero', style: { background: 'transparent' } });
    hero.append(av);
    hero.append(el('div', { style: { marginTop: '8px', color: 'var(--text-2)', fontSize: '12.5px' }, text: 'برای تغییر عکس پروفایل کلیک کنید' }));
    body.append(hero);

    const name = el('input', { type: 'text', value: State.me.name, maxlength: 64 });
    const username = el('input', { type: 'text', value: State.me.username || '', maxlength: 32, dir: 'ltr' });
    const bio = el('textarea', { rows: 3, maxlength: 200, style: { width: '100%', resize: 'vertical' } });
    bio.value = State.me.bio || '';

    body.append(el('div', { class: 'field' }, el('label', { text: 'نام' }), name));
    body.append(el('div', { class: 'field' },
      el('label', { text: 'نام کاربری' }), username,
      el('div', { class: 'hint', html: `لینک شما: <b dir="ltr">t.me/${U.esc(State.me.username || '')}</b> — دیگران با @${U.esc(State.me.username || '')} پیدایتان می‌کنند` })));
    body.append(el('div', { class: 'field' }, el('label', { text: 'درباره من (بیو)' }), bio));

    const m = UI.modal({
      title: 'ویرایش پروفایل', body,
      foot: [
        el('button', { class: 'btn ghost', text: 'حذف عکس', onclick: async () => {
          try { await API.removeAvatar(); State.me.avatar = null; U.store.set('me', State.me); m.close(); UI.ok('عکس حذف شد'); ChatList.refreshList(); } catch (e) { UI.err(e.message); }
        }}),
        el('button', { class: 'btn ghost', text: 'انصراف', onclick: () => m.close() }),
        el('button', { class: 'btn', text: 'ذخیره', onclick: async (e) => {
          const btn = e.currentTarget; btn.disabled = true;
          try {
            const d = await API.updateProfile({ name: name.value.trim(), username: username.value.trim(), bio: bio.value.trim() });
            State.me = d.user; U.store.set('me', d.user);
            // به‌روزرسانی عنوان چت‌های خصوصی در لیست
            for (const c of State.chats.values()) if (c.type === 'dm' && c.peer && c.peer.id === State.me.id) c.title = State.me.name;
            m.close(); UI.ok('پروفایل ذخیره شد'); ChatList.refreshList();
          } catch (er) { UI.err(er.message); btn.disabled = false; }
        }}),
      ],
    });

    async function changeAvatar() {
      const input = el('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
      input.onchange = async () => {
        const f = input.files[0]; input.remove();
        if (!f) return;
        if (f.size > 5 * 1024 * 1024) { UI.err('حجم عکس باید کمتر از ۵ مگابایت باشد'); return; }
        const load = UI.loading('در حال آپلود عکس…');
        try {
          const d = await API.uploadAvatar(f);
          State.me = d.user; U.store.set('me', d.user);
          load.close(); m.close(); UI.ok('عکس پروفایل به‌روز شد');
          ChatList.refreshList(); openMyProfile();
        } catch (e) { load.close(); UI.err(e.message); }
      };
      document.body.append(input); input.click();
    }
  }

  /* ------------------------------ تغییر رمز ------------------------------ */
  function changePassword() {
    const cur = el('input', { type: 'password', placeholder: 'رمز فعلی', autocomplete: 'current-password' });
    const nw = el('input', { type: 'password', placeholder: 'رمز جدید (حداقل ۶ کاراکتر)', autocomplete: 'new-password' });
    const nw2 = el('input', { type: 'password', placeholder: 'تکرار رمز جدید', autocomplete: 'new-password' });
    const body = el('div', {},
      el('div', { class: 'field' }, el('label', { text: 'رمز عبور فعلی' }), cur),
      el('div', { class: 'field' }, el('label', { text: 'رمز عبور جدید' }), nw),
      el('div', { class: 'field' }, el('label', { text: 'تکرار رمز جدید' }), nw2));

    const m = UI.modal({
      title: 'تغییر رمز عبور', body,
      foot: [
        el('button', { class: 'btn ghost', text: 'انصراف', onclick: () => m.close() }),
        el('button', { class: 'btn', text: 'ذخیره', onclick: async (e) => {
          if (nw.value !== nw2.value) { UI.err('رمز جدید و تکرار آن یکسان نیستند'); return; }
          if (nw.value.length < 6) { UI.err('رمز جدید باید حداقل ۶ کاراکتر باشد'); return; }
          const btn = e.currentTarget; btn.disabled = true;
          try { await API.changePassword({ currentPassword: cur.value, newPassword: nw.value }); m.close(); UI.ok('رمز عبور تغییر کرد'); }
          catch (er) { UI.err(er.message); btn.disabled = false; }
        }}),
      ],
    });
  }

  /* ------------------------------ دستگاه‌ها ------------------------------ */
  async function devices() {
    const body = el('div');
    const list = el('div');
    body.append(list);
    const load = UI.loading();
    let data;
    try { data = await API.sessions(); } catch { data = { sessions: [] }; }
    load.close();

    for (const s of data.sessions) {
      const row = el('div', { class: 'info-row', style: { cursor: 'default' } });
      row.append(icon('device'));
      const b = el('div', { class: 'ir-body' });
      b.append(el('div', { class: 'ir-v', text: s.device + (s.current ? ' (دستگاه فعلی)' : '') }));
      b.append(el('div', { class: 'ir-k', text: `${U.fmtDate(s.created_at, { dateStyle: 'medium', timeStyle: 'short' })}${s.ip ? ' • ' + s.ip : ''}` }));
      row.append(b);
      if (!s.current) {
        row.append(el('button', { class: 'btn sm danger', text: 'خروج', onclick: async () => {
          try { await API.revokeSession(s.id); row.remove(); UI.ok('نشست پایان یافت'); } catch (e) { UI.err(e.message); }
        }}));
      }
      list.append(row);
    }
    UI.modal({
      title: 'دستگاه‌های فعال', body,
      foot: [
        el('button', { class: 'btn ghost', text: 'پایان همه‌ی نشست‌های دیگر', onclick: async () => {
          const yes = await UI.confirm({ title: 'پایان نشست‌ها', text: 'همه‌ی دستگاه‌های دیگر از حساب شما خارج می‌شوند.', danger: true, confirmText: 'بله' });
          if (!yes) return;
          try { await API.revokeOtherSessions(); UI.ok('انجام شد'); } catch (e) { UI.err(e.message); }
        }}),
      ],
    });
  }

  /* ------------------------------ درباره ------------------------------ */
  async function about() {
    let stats = null;
    try { stats = await API.stats(); } catch {}
    const body = el('div', { style: { textAlign: 'center', lineHeight: '2' } });
    body.innerHTML = `
      <div style="width:70px;height:70px;margin:0 auto 12px;border-radius:50%;background:linear-gradient(135deg,var(--accent),#7db4e8);display:grid;place-items:center">
        <svg viewBox="0 0 100 100" style="width:36px;height:36px;fill:#fff"><path d="M8 48 88 14 72 86l-24-18-12 14-2-20L8 48Z"/></svg>
      </div>
      <h3 style="margin:0 0 4px">${U.esc(State.appConfig.appName)}</h3>
      <div style="color:var(--text-2);font-size:13px">نسخه ${U.esc(State.appConfig.version || '1.0.0')}</div>
      ${stats ? `<div style="margin-top:16px;display:flex;justify-content:center;gap:22px">
        <div><div style="font-size:20px;font-weight:700;color:var(--accent)">${U.faNum(stats.users)}</div><div style="font-size:12px;color:var(--text-2)">کاربر</div></div>
        <div><div style="font-size:20px;font-weight:700;color:var(--accent)">${U.faNum(stats.chats)}</div><div style="font-size:12px;color:var(--text-2)">چت</div></div>
        <div><div style="font-size:20px;font-weight:700;color:var(--accent)">${U.faNum(stats.messages)}</div><div style="font-size:12px;color:var(--text-2)">پیام</div></div>
      </div>` : ''}
      <p style="margin-top:16px;color:var(--text-2);font-size:12.8px">
        ساخته‌شده با Node.js، Express، Socket.IO و SQLite.<br>
        متن‌باز و قابل استقرار روی Railway.
      </p>`;
    UI.modal({ title: 'درباره', body });
  }

  /* =============================== پنل اصلی =============================== */
  function open() {
    ChatPanels.close();
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;

    const panel = el('div', { class: 'side-panel', id: 'settings-panel' });

    const head = el('div', { class: 'sp-head' });
    head.append(el('button', { class: 'icon-btn', onclick: () => panel.remove() }, icon('back')));
    head.append(el('h3', { text: 'تنظیمات' }));
    panel.append(head);

    const body = el('div', { class: 'sp-body' });

    /* --- پروفایل --- */
    const hero = el('div', { class: 'profile-hero', onclick: () => { panel.remove(); openMyProfile(); }, style: { cursor: 'pointer' } });
    hero.append(U.avatar(State.me, 'av-l'));
    hero.append(el('h2', { text: State.me.name }));
    hero.append(el('div', { class: 'sub', text: State.me.username ? '@' + State.me.username : '' }));
    body.append(hero);

    const s = State.settings;

    /* --- ظاهر --- */
    body.append(el('div', { class: 'sec-title', text: 'ظاهر' }));
    const appBox = el('div', { class: 'info-rows' });

    // تم
    appBox.append(rowSwitch('moon', 'حالت شب', 'پس‌زمینه تیره برای چشم‌های خسته', s.theme === 'dark', async (v) => {
      s.theme = v ? 'dark' : 'light'; applyAppearance(); await persist({ theme: s.theme });
    }));

    // زبان
    const langRow = el('div', { class: 'setting-row' });
    langRow.append(icon('info'));
    langRow.append(el('div', { class: 'sr-body' }, el('div', { class: 'sr-t', text: 'زبان رابط' }), el('div', { class: 'sr-s', text: s.lang === 'en' ? 'English' : 'فارسی' })));
    const langSel = el('select', { onchange: async (e) => { s.lang = e.target.value; applyAppearance(); await persist({ lang: s.lang }); location.reload(); },
      style: { background: 'var(--bg-3)', border: 'none', borderRadius: '8px', padding: '6px 10px', outline: 'none' } });
    langSel.append(el('option', { value: 'fa', text: 'فارسی', selected: s.lang === 'fa' }), el('option', { value: 'en', text: 'English', selected: s.lang === 'en' }));
    langSel.value = s.lang;
    langRow.append(langSel);
    appBox.append(langRow);

    // اندازه فونت
    const fsRow = el('div', { class: 'setting-row' });
    fsRow.append(icon('edit'));
    fsRow.append(el('div', { class: 'sr-body' }, el('div', { class: 'sr-t', text: 'اندازه متن' }), el('div', { class: 'sr-s', id: 'fs-val', text: U.faNum(s.fontSize) + ' پیکسل' })));
    const fsRange = el('input', { type: 'range', min: 12, max: 19, step: 0.5, value: s.fontSize, style: { width: '110px', accentColor: 'var(--accent)' },
      oninput: (e) => { s.fontSize = parseFloat(e.target.value); document.getElementById('fs-val').textContent = U.faNum(s.fontSize) + ' پیکسل'; document.documentElement.style.setProperty('--fs', s.fontSize + 'px'); },
      onchange: async () => { await persist({ fontSize: s.fontSize }); } });
    fsRow.append(fsRange);
    appBox.append(fsRow);

    // فشرده
    appBox.append(rowSwitch('users', 'حالت فشرده', 'نمایش چت‌ها با ارتفاع کمتر', !!s.compact, async (v) => {
      s.compact = v; document.body.classList.toggle('compact', v); await persist({ compact: v });
    }));
    body.append(appBox);

    /* --- گفت‌وگو --- */
    body.append(el('div', { class: 'sec-title', text: 'گفت‌وگو' }));
    const chatBox = el('div', { class: 'info-rows' });
    chatBox.append(rowSwitch('send', 'ارسال با Enter', 'در غیر این صورت با Ctrl+Enter ارسال می‌شود', s.enterToSend !== false, async (v) => { s.enterToSend = v; await persist({ enterToSend: v }); }));
    chatBox.append(rowSwitch('eye', 'نمایش «در حال نوشتن…»', 'دیگران ببینند که در حال تایپ هستید', s.showTyping !== false, async (v) => { s.showTyping = v; await persist({ showTyping: v }); }));
    body.append(chatBox);

    /* --- اعلان‌ها --- */
    body.append(el('div', { class: 'sec-title', text: 'اعلان‌ها' }));
    const notBox = el('div', { class: 'info-rows' });
    notBox.append(rowSwitch('megaphone', 'اعلان پیام جدید', 'نمایش بنر برای پیام‌های تازه', s.notifications !== false, async (v) => {
      s.notifications = v; await persist({ notifications: v });
      if (v && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    }));
    notBox.append(rowSwitch('mic', 'صدای اعلان', 'پخش صدا هنگام دریافت پیام', s.sound !== false, async (v) => { s.sound = v; await persist({ sound: v }); if (v) U.playSound('msg'); }));

    const permRow = el('div', { class: 'setting-row', onclick: async () => {
      if (!('Notification' in window)) return UI.err('مرورگر شما از اعلان پشتیبانی نمی‌کند');
      const p = await Notification.requestPermission();
      UI.toast(p === 'granted' ? 'اعلان‌های مرورگر فعال شد' : 'اجازه‌ی اعلان داده نشد', p === 'granted' ? 'ok' : 'err');
    }});
    permRow.append(icon('shield'));
    permRow.append(el('div', { class: 'sr-body' },
      el('div', { class: 'sr-t', text: 'فعال‌سازی اعلان مرورگر' }),
      el('div', { class: 'sr-s', text: 'برای دریافت اعلان وقتی تب بسته است' })));
    notBox.append(permRow);
    body.append(notBox);

    /* --- حساب --- */
    body.append(el('div', { class: 'sec-title', text: 'حساب کاربری' }));
    const accBox = el('div', { class: 'info-rows' });
    accBox.append(rowAction('user', 'ویرایش پروفایل', () => { panel.remove(); openMyProfile(); }));
    accBox.append(rowAction('key', 'تغییر رمز عبور', () => { panel.remove(); changePassword(); }));
    accBox.append(rowAction('device', 'دستگاه‌های فعال', () => { panel.remove(); devices(); }));
    accBox.append(rowAction('link', 'لینک پروفایل من', async () => {
      await U.copy(`@${State.me.username}`);
      UI.ok('نام کاربری شما کپی شد: @' + State.me.username);
    }));
    body.append(accBox);

    /* --- سایر --- */
    body.append(el('div', { class: 'sec-title', text: 'سایر' }));
    const otherBox = el('div', { class: 'info-rows' });
    otherBox.append(rowAction('search', 'کاوش چت‌های عمومی', () => { panel.remove(); ChatModals.explore(); }));
    otherBox.append(rowAction('archive', 'پیام‌های ذخیره‌شده', () => { panel.remove(); ChatModals.savedMessages(); }));
    otherBox.append(rowAction('info', 'درباره برنامه', () => about()));
    otherBox.append(rowAction('logout', 'خروج از حساب', () => Session.logout(), true));
    body.append(otherBox);

    body.append(el('div', { style: { padding: '20px', textAlign: 'center', color: 'var(--text-3)', fontSize: '12px' },
      text: `${State.appConfig.appName} • نسخه ${State.appConfig.version || '1.0.0'}` }));

    panel.append(body);
    sidebar.append(panel);

    function rowSwitch(iconName, title, sub, checked, onChange) {
      const row = el('div', { class: 'setting-row' });
      row.append(icon(iconName));
      row.append(el('div', { class: 'sr-body' }, el('div', { class: 'sr-t', text: title }), el('div', { class: 'sr-s', text: sub })));
      const input = el('input', { type: 'checkbox' }); input.checked = !!checked;
      const sw = el('label', { class: 'switch' }, input, el('span', { class: 'sl' }));
      input.onchange = () => onChange(input.checked);
      row.append(sw);
      row.onclick = (e) => { if (e.target.closest('.switch')) return; input.checked = !input.checked; onChange(input.checked); };
      return row;
    }
    function rowAction(iconName, title, onClick, danger) {
      const row = el('div', { class: 'setting-row', onclick: onClick });
      if (danger) { row.style.color = 'var(--red)'; }
      row.append(icon(iconName));
      row.append(el('div', { class: 'sr-body' }, el('div', { class: 'sr-t', text: title })));
      row.append(icon('back', 'ico ico-sm'));
      return row;
    }
  }

  return { open, openMyProfile, changePassword, devices, about, toggleTheme, persist };
})();
