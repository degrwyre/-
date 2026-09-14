'use strict';
/* ==========================================================================
   صفحه‌ی ورود / ثبت‌نام و مدیریت نشست کاربر
   ========================================================================== */
const Auth = (() => {
  const { el, icon } = U;
  let mode = 'login';

  function render(container) {
    container.innerHTML = '';
    const wrap = el('div', { class: 'auth-wrap' });
    const card = el('div', { class: 'auth-card' });

    /* ---------- سربرگ ---------- */
    const head = el('div', { class: 'auth-head' });
    const logo = el('div', { class: 'logo' });
    logo.innerHTML = `<svg viewBox="0 0 100 100"><path d="M8 48 88 14 72 86l-24-18-12 14-2-20L8 48Z"/></svg>`;
    head.append(logo);
    head.append(el('h1', { text: State.appConfig.appName || 'رهام گرام' }));
    head.append(el('p', { text: 'پیام‌رسان سریع، امن و رایگان — مثل تلگرام، اما مال شما!' }));
    card.append(head);

    /* ---------- تب‌ها ---------- */
    const tabs = el('div', { class: 'tabs' });
    const loginTab = el('button', { text: 'ورود', onclick: () => setMode('login') });
    const regTab = el('button', { text: 'ثبت‌نام', onclick: () => setMode('register') });
    tabs.append(loginTab, regTab);
    card.append(tabs);

    /* ---------- پیام خطا ---------- */
    const errBox = el('div', { class: 'auth-error hidden' });
    card.append(errBox);

    /* ---------- فرم ----------
       نکته‌ی مهم: اعتبارسنجی فقط با جاوااسکریپت انجام می‌شود (novalidate).
       دلیل: فیلدهای پنهانِ required در حالت دیگر، ارسال فرم را بی‌صدا مسدود می‌کنند. */
    const form = el('form', { onsubmit: onSubmit, novalidate: 'true' });

    const nameInput = el('input', { type: 'text', name: 'name', placeholder: 'مثلاً رهام محمدی', maxlength: 64, autocomplete: 'name' });
    const nameField = el('div', { class: 'field' }, el('label', { text: 'نام و نام خانوادگی' }), nameInput);

    const idInput = el('input', { type: 'text', name: 'identifier', placeholder: 'ali_m  یا  09123456789', autocomplete: 'username' });
    const idField = el('div', { class: 'field' }, el('label', { text: 'نام کاربری یا شماره' }), idInput);

    const userInput = el('input', { type: 'text', name: 'username', placeholder: 'roham_m', dir: 'ltr', maxlength: 32, autocomplete: 'off' });
    const userField = el('div', { class: 'field' },
      el('label', { text: 'نام کاربری' }), userInput,
      el('div', { class: 'hint', text: '۴ تا ۳۲ کاراکتر انگلیسی، عدد یا _ — دیگران با @نام‌کاربری پیدایتان می‌کنند' }));

    const phoneInput = el('input', { type: 'tel', name: 'phone', placeholder: '09123456789', dir: 'ltr', maxlength: 20 });
    const phoneField = el('div', { class: 'field' }, el('label', { text: 'شماره موبایل (اختیاری)' }), phoneInput);

    const passInput = el('input', { type: 'password', name: 'password', placeholder: '••••••••', autocomplete: 'current-password' });
    const passField = el('div', { class: 'field' }, el('label', { text: 'رمز عبور' }), passInput);

    const submit = el('button', { class: 'btn', type: 'submit', text: 'ورود' });

    form.append(nameField, idField, userField, phoneField, passField, submit);
    card.append(form);

    card.append(el('div', { class: 'auth-foot', html:
      'با ورود، <a href="#" id="terms-link">قوانین استفاده</a> را می‌پذیرید.<br>' +
      `<span style="opacity:.7">نسخه ${U.esc(State.appConfig.version || '1.0.0')} — ساخته‌شده با ❤️</span>` }));

    wrap.append(card);
    container.append(wrap);

    function setMode(m) {
      mode = m;
      loginTab.classList.toggle('on', m === 'login');
      regTab.classList.toggle('on', m === 'register');
      nameField.classList.toggle('hidden', m !== 'register');
      userField.classList.toggle('hidden', m !== 'register');
      phoneField.classList.toggle('hidden', m !== 'register');
      idField.classList.toggle('hidden', m === 'register');
      submit.textContent = m === 'login' ? 'ورود' : 'ساخت حساب کاربری';
      passInput.setAttribute('autocomplete', m === 'login' ? 'current-password' : 'new-password');
      [nameInput, idInput, userInput, phoneInput, passInput].forEach((i) => i.classList.remove('err'));
      errBox.classList.add('hidden');
      if (m === 'register') nameInput.focus();
      else idInput.focus();
    }
    setMode('login');
    if (!State.appConfig.allowSignup) { regTab.disabled = true; regTab.style.opacity = '.4'; regTab.title = 'ثبت‌نام بسته است'; }

    card.querySelector('#terms-link')?.addEventListener('click', (e) => {
      e.preventDefault();
      UI.modal({ title: 'قوانین استفاده', body: el('div', { style: { lineHeight: '1.9', color: 'var(--text-2)', fontSize: '13.5px' }, html: `
        <p>۱. از این سرویس برای ارسال محتوای غیرقانونی، آزاردهنده یا اسپم استفاده نکنید.</p>
        <p>۲. مسئولیت محتوای ارسالی بر عهده‌ی فرستنده است.</p>
        <p>۳. رمز عبور خود را با کسی به اشتراک نگذارید.</p>
        <p>۴. مدیر سرویس می‌تواند حساب‌های متخلف را مسدود کند.</p>
        <p>۵. این یک نرم‌افزار متن‌باز است؛ می‌توانید آن را شخصی‌سازی کنید.</p>` }) });
    });

    /* ---------- اعتبارسنجی سمت کلاینت ---------- */
    function validate(payload) {
      [nameInput, idInput, userInput, passInput].forEach((i) => i.classList.remove('err'));
      if (mode === 'login') {
        if (!String(payload.identifier || '').trim()) { idInput.classList.add('err'); return 'نام کاربری یا شماره را وارد کنید.'; }
        if (!String(payload.password || '')) { passInput.classList.add('err'); return 'رمز عبور را وارد کنید.'; }
        return null;
      }
      if (String(payload.name || '').trim().length < 2) { nameInput.classList.add('err'); return 'نام باید حداقل ۲ کاراکتر باشد.'; }
      if (!/^[a-zA-Z0-9_]{4,32}$/.test(String(payload.username || '').trim())) {
        userInput.classList.add('err');
        return 'نام کاربری باید ۴ تا ۳۲ کاراکتر انگلیسی، عدد یا _ باشد.';
      }
      if (String(payload.password || '').length < 6) { passInput.classList.add('err'); return 'رمز عبور باید حداقل ۶ کاراکتر باشد.'; }
      if (payload.phone && !/^[0-9+\-\s]{6,20}$/.test(String(payload.phone).trim())) {
        phoneInput.classList.add('err');
        return 'شماره موبایل معتبر نیست.';
      }
      return null;
    }

    async function onSubmit(e) {
      e.preventDefault();
      errBox.classList.add('hidden');
      const fd = new FormData(form);
      const payload = Object.fromEntries(fd.entries());

      const problem = validate(payload);
      if (problem) {
        errBox.textContent = problem;
        errBox.classList.remove('hidden');
        return;
      }

      submit.disabled = true;
      submit.textContent = 'در حال ارسال…';
      try {
        const d = mode === 'login'
          ? await API.login({ identifier: String(payload.identifier).trim(), password: payload.password })
          : await API.register({
              name: String(payload.name).trim(),
              username: String(payload.username).trim(),
              password: payload.password,
              phone: String(payload.phone || '').trim() || undefined,
            });
        await Session.afterAuth(d);
      } catch (er) {
        errBox.textContent = er.message || 'خطا در برقراری ارتباط با سرور';
        errBox.classList.remove('hidden');
        submit.disabled = false;
        submit.textContent = mode === 'login' ? 'ورود' : 'ساخت حساب کاربری';
      }
    }
  }

  /** اگر لینک دعوت در URL باشد، بعد از ورود به‌طور خودکار عضو شویم */
  function pendingInvite() {
    const m = location.pathname.match(/\/join\/([A-Za-z0-9_-]+)/);
    const q = new URLSearchParams(location.search).get('invite');
    return (m && m[1]) || q || null;
  }

  return { render, pendingInvite };
})();

/* ==========================================================================
   مدیریت نشست (Session): بارگذاری کاربر، اتصال سوکت، خروج
   ========================================================================== */
const Session = (() => {

  async function afterAuth(d) {
    State.token = d.token;
    U.store.set('token', d.token);
    State.me = d.user;
    U.store.set('me', d.user);
    await App.bootstrap();

    // اگر لینک دعوت در URL بود، خودکار عضو شویم
    const code = Auth.pendingInvite();
    if (code) {
      try {
        const r = await API.joinByCode(code);
        upsertChat(r.chat); ChatList.refreshList();
        history.replaceState({}, '', '/');
        Chat.open(r.chat.id);
        UI.ok('به چت پیوستید 🎉');
      } catch {}
    }
  }

  async function logout() {
    const yes = await UI.confirm({ title: 'خروج از حساب', text: 'مطمئنید که می‌خواهید از حساب خارج شوید؟', danger: true, confirmText: 'خروج' });
    if (!yes) return;
    try { await API.logout(); } catch {}
    if (State.socket) { State.socket.disconnect(); State.socket = null; }
    State.token = null; State.me = null;
    State.chats.clear(); State.chatOrder = []; State.activeChatId = null;
    State.messages.clear(); State.members.clear();
    U.store.del('token'); U.store.del('me');
    location.reload();
  }

  function onUnauthorized() {
    if (!State.me) return;
    State.token = null; State.me = null;
    U.store.del('token'); U.store.del('me');
    if (State.socket) { State.socket.disconnect(); State.socket = null; }
    UI.toast('نشست شما منقضی شد. دوباره وارد شوید.', 'err', 5000);
    setTimeout(() => location.reload(), 1200);
  }

  return { afterAuth, logout, onUnauthorized };
})();
