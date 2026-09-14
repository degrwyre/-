'use strict';
/* ==========================================================================
   ناحیه‌ی چت: هدر، تاریخچه، کامپوزر، ضبط صوت، آپلود فایل، تایپینگ
   ========================================================================== */
const Chat = (() => {
  const { el, icon } = U;

  let root, headerEl, messagesEl, innerEl, composerWrap, textarea, sendBtn, pinBar;
  let replyBar, attachPreview, recBar, scrollDownBtn, typingHint, selectBar;
  let loadingHistory = false;
  let selected = new Set();
  let recorder = null, recChunks = [], recStart = 0, recTimer = null, recStream = null;
  let typingTimeout = null, lastTypingSent = 0;
  let mediaListCache = [];

  /* ============================ رندر پوسته ============================ */
  function render(container) {
    root = container;
    root.innerHTML = '';
    root.className = 'chat-area';

    headerEl = el('div', { class: 'chat-header', id: 'chat-header' });
    root.append(headerEl);

    pinBar = el('div', { class: 'pin-bar hidden' });
    root.append(pinBar);

    selectBar = el('div', { class: 'pin-bar hidden', style: { background: 'var(--accent-soft)' } });
    root.append(selectBar);

    messagesEl = el('div', { class: 'messages', id: 'messages' });
    messagesEl.append(el('div', { class: 'chat-bg-pattern' }));
    innerEl = el('div', { class: 'msgs-inner', id: 'msgs-inner' });
    messagesEl.append(innerEl);
    messagesEl.addEventListener('scroll', U.throttle(onScroll, 120));
    root.append(messagesEl);

    typingHint = el('div', { class: 'typing-hint hidden' },
      el('div', { class: 'typing-dots' }, el('i'), el('i'), el('i')));
    root.append(typingHint);

    scrollDownBtn = el('button', { class: 'scroll-down hidden', title: 'پایین‌ترین پیام', onclick: () => scrollBottom(true) },
      icon('back'));
    root.append(scrollDownBtn);

    composerWrap = el('div', { class: 'composer-wrap', id: 'composer-wrap' });
    root.append(composerWrap);

    renderEmpty();
    setupDragDrop();
  }

  function renderEmpty() {
    headerEl.innerHTML = '';
    messagesEl.classList.add('hidden');
    composerWrap.innerHTML = '';
    const empty = el('div', { class: 'no-chat' }, el('div', { class: 'nc-box', text: 'یک چت را انتخاب کنید تا گفت‌وگو را شروع کنید' }));
    root.append(empty);
    empty.id = 'no-chat';
  }

  /* ============================ باز کردن چت ============================ */
  async function open(chatId, focusMessageId = null) {
    const chat = State.chats.get(chatId);
    if (!chat) { UI.err('چت پیدا نشد'); return; }

    // ذخیره‌ی پیش‌نویس چت قبلی
    saveDraft();

    State.activeChatId = chatId;
    State.replyTo = null;
    State.editing = null;
    State.attachFile = null;
    selected.clear();
    document.querySelector('.main')?.classList.add('chat-open');
    document.getElementById('no-chat')?.remove();

    ChatList.markActive(chatId);
    messagesEl.classList.remove('hidden');

    renderHeader(chat);
    renderComposer(chat);

    if (State.socket) {
      State.socket.emit('chat:open', { chatId });
    }

    // بارگذاری تاریخچه
    innerEl.innerHTML = '';
    innerEl.append(el('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px', padding: '14px' } },
      ...Array.from({ length: 6 }, (_, i) => el('div', {
        class: 'skeleton',
        style: { height: '46px', width: `${38 + (i * 9) % 45}%`, alignSelf: i % 2 ? 'flex-end' : 'flex-start', borderRadius: '12px' },
      }))));

    try {
      const data = await API.history(chatId);
      State.messages.set(chatId, data.messages);
      State.messagesMeta.set(chatId, { hasMore: data.hasMore, oldestId: data.messages[0] ? data.messages[0].id : null });
      if (data.chat) upsertChat(data.chat);
      await loadMembers(chatId);
      renderAll(chat);

      if (focusMessageId) scrollToMessage(focusMessageId);
      else scrollBottom(false);

      markRead(chat);
      renderPinBar(chat);
    } catch (e) {
      innerEl.innerHTML = '';
      innerEl.append(el('div', { class: 'empty-state', html: `<h3>خطا در بارگذاری</h3><p>${U.esc(e.message)}</p>` }));
    }

    setTimeout(() => textarea && textarea.focus(), 60);
  }

  async function loadMembers(chatId) {
    if (State.members.has(chatId)) return;
    try {
      const d = await API.members(chatId);
      State.members.set(chatId, d.members);
    } catch { State.members.set(chatId, []); }
  }

  function renderAll(chat) {
    Messages.renderList(innerEl, State.messages.get(chat.id) || [], chat);
    renderHeader(chat);
    renderPinBar(chat);
  }

  /* ============================== هدر ============================== */
  function renderHeader(chat) {
    headerEl.innerHTML = '';

    headerEl.append(el('button', { class: 'back-btn icon-btn', title: 'بازگشت', onclick: () => closeActive() }, icon('back')));

    const av = U.avatar(chat, 'av-s', chat.type === 'dm' && chat.peer && chat.peer.online);
    av.style.cursor = 'pointer';
    av.onclick = () => openInfo(chat.id);
    headerEl.append(av);

    const info = el('div', { class: 'ch-info', onclick: () => openInfo(chat.id) });
    const name = el('div', { class: 'ch-name' });
    name.append(el('span', { text: chat.title }));
    if (chat.type === 'channel') name.append(icon('megaphone', 'ico ico-sm'));
    else if (chat.type === 'group') name.append(icon('users', 'ico ico-sm'));
    if (chat.peer && chat.peer.isVerified) name.append(icon('verified', 'ico ico-sm'));
    info.append(name);
    info.append(el('div', { class: 'ch-status', id: 'ch-status', text: statusText(chat) }));
    headerEl.append(info);

    headerEl.append(el('button', { class: 'icon-btn', title: 'جست‌وجو در چت', onclick: (e) => openInChatSearch(e.currentTarget, chat) }, icon('search')));
    headerEl.append(el('button', {
      class: 'icon-btn', title: chat.muted ? 'باصدا کردن' : 'بی‌صدا کردن',
      onclick: async (e) => {
        try { await API.mute(chat.id, !chat.muted); chat.muted = !chat.muted; renderHeader(chat); ChatList.refreshList(); UI.ok(chat.muted ? 'اعلان‌ها خاموش شد' : 'اعلان‌ها روشن شد'); }
        catch (er) { UI.err(er.message); }
      },
    }, icon(chat.muted ? 'mute' : 'megaphone')));
    headerEl.append(el('button', { class: 'icon-btn', title: 'بیشتر', onclick: (e) => headerMenu(e.currentTarget, chat) }, icon('menu')));
  }

  function statusText(chat) {
    if (chat.type === 'dm') {
      if (chat.peer && chat.peer.online) return 'آنلاین';
      return chat.peer ? chat.peer.lastSeen : '—';
    }
    const n = U.faNum(chat.memberCount || 0);
    if (chat.type === 'channel') return `${n} مشترک`;
    const onlineCount = (State.members.get(chat.id) || []).filter((m) => m.online).length;
    return onlineCount ? `${n} عضو، ${U.faNum(onlineCount)} آنلاین` : `${n} عضو`;
  }

  function headerMenu(anchor, chat) {
    const isAdmin = ['owner', 'admin'].includes(chat.myRole);
    UI.dropdown(anchor, [
      { label: 'اطلاعات چت', icon: 'info', onClick: () => openInfo(chat.id) },
      { label: 'جست‌وجو در پیام‌ها', icon: 'search', onClick: (e) => openInChatSearch(anchor, chat) },
      { label: chat.muted ? 'باصدا کردن' : 'بی‌صدا کردن', icon: chat.muted ? 'megaphone' : 'mute', onClick: async () => {
        try { await API.mute(chat.id, !chat.muted); chat.muted = !chat.muted; renderHeader(chat); ChatList.refreshList(); } catch (e) { UI.err(e.message); }
      }},
      ...(isAdmin ? [
        { sep: true },
        { label: 'ویرایش اطلاعات چت', icon: 'edit', onClick: () => ChatModals.editChat(chat) },
        { label: 'افزودن عضو', icon: 'plus', onClick: () => ChatModals.addMembers(chat) },
        { label: 'لینک دعوت', icon: 'link', onClick: () => ChatModals.inviteLink(chat) },
      ] : []),
      { sep: true },
      { label: chat.type === 'dm' ? 'پاک کردن گفت‌وگو' : 'ترک کردن چت', icon: 'logout', danger: true, onClick: async () => {
        const yes = await UI.confirm({
          title: chat.type === 'dm' ? 'پاک کردن گفت‌وگو' : `ترک «${chat.title}»`,
          text: chat.type === 'dm' ? 'این گفت‌وگو از لیست شما حذف می‌شود.' : 'دیگر پیام‌های این چت را دریافت نخواهید کرد.',
          danger: true, confirmText: 'بله',
        });
        if (!yes) return;
        try { await API.leave(chat.id); State.chats.delete(chat.id); sortChats(); closeActive(); ChatList.refreshList(); UI.ok('انجام شد'); }
        catch (e) { UI.err(e.message); }
      }},
    ]);
  }

  /* ========================= نوار پیام سنجاق‌شده ========================= */
  function renderPinBar(chat) {
    if (!pinBar) return;
    if (!chat.pinnedMessage) { pinBar.classList.add('hidden'); pinBar.innerHTML = ''; return; }
    pinBar.classList.remove('hidden');
    pinBar.innerHTML = '';
    pinBar.append(el('div', { class: 'bar' }));
    const b = el('div', { class: 'pb-body', onclick: () => scrollToMessage(chat.pinnedMessage.id) });
    b.append(el('div', { class: 'pb-t', text: 'پیام سنجاق‌شده' }));
    b.append(el('div', { class: 'pb-x', text: chat.pinnedMessage.text || U.mediaLabel(chat.pinnedMessage.media?.type) }));
    pinBar.append(b);
    if (['owner', 'admin'].includes(chat.myRole)) {
      pinBar.append(el('button', { class: 'icon-btn', title: 'برداشتن سنجاق', onclick: async (e) => {
        e.stopPropagation();
        try { await API.unpin(chat.id); } catch (er) { UI.err(er.message); }
      }}, icon('close', 'ico ico-sm')));
    }
    pinBar.onclick = () => scrollToMessage(chat.pinnedMessage.id);
  }

  /* ============================ کامپوزر ============================ */
  function renderComposer(chat) {
    composerWrap.innerHTML = '';
    replyBar = null; attachPreview = null; recBar = null;

    const canPost = chat.type !== 'channel' || ['owner', 'admin'].includes(chat.myRole);
    if (!canPost) {
      composerWrap.append(el('div', { class: 'composer', style: { justifyContent: 'center', padding: '14px', color: 'var(--text-2)', fontSize: '13.5px' }, text: 'فقط ادمین‌های این کانال می‌توانند پست بگذارند.' }));
      return;
    }
    if (chat.muted && chat.type !== 'channel') {
      composerWrap.append(el('div', { class: 'composer', style: { justifyContent: 'center', padding: '14px', color: 'var(--text-2)', fontSize: '13.5px' }, text: 'شما در این چت بی‌صدا شده‌اید.' }));
      return;
    }

    const box = el('div', { class: 'composer' });

    // دکمه‌ی پیوست
    const attachBtn = el('button', { class: 'icon-btn', title: 'پیوست فایل', onclick: (e) => attachMenu(e.currentTarget) }, icon('attach'));
    box.append(attachBtn);

    // ورودی متن
    textarea = el('textarea', {
      rows: 1, placeholder: 'پیام بنویسید…', id: 'msg-input',
      oninput: onTextareaInput,
      onkeydown: onTextareaKey,
      onpaste: onPaste,
    });
    const draft = State.drafts[chat.id];
    if (draft) textarea.value = draft;
    box.append(textarea);

    // ایموجی
    box.append(el('button', { class: 'icon-btn', title: 'ایموجی', onclick: (e) => {
      UI.emojiPicker(e.currentTarget, (em) => { insertAtCursor(em); });
    }}, icon('emoji')));

    // ارسال / میکروفون
    sendBtn = el('button', { class: 'send-btn mic', title: 'ارسال', onclick: () => sendBtn.classList.contains('mic') ? startRecording() : send() });
    sendBtn.append(icon('mic'));
    box.append(sendBtn);

    composerWrap.append(box);
    autoGrow();
    updateSendBtn();
  }

  function insertAtCursor(text) {
    if (!textarea) return;
    const s = textarea.selectionStart, e = textarea.selectionEnd;
    textarea.value = textarea.value.slice(0, s) + text + textarea.value.slice(e);
    textarea.selectionStart = textarea.selectionEnd = s + text.length;
    textarea.focus();
    onTextareaInput();
  }

  function onTextareaInput() {
    autoGrow();
    updateSendBtn();
    saveDraft();
    sendTyping();
  }

  function autoGrow() {
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 160) + 'px';
  }

  function updateSendBtn() {
    if (!sendBtn || !textarea) return;
    const has = textarea.value.trim().length > 0 || State.attachFile;
    sendBtn.classList.toggle('mic', !has);
    sendBtn.innerHTML = '';
    sendBtn.append(icon(has ? 'send' : 'mic'));
    sendBtn.title = has ? 'ارسال' : 'ضبط پیام صوتی';
  }

  function onTextareaKey(e) {
    const enterSend = State.settings.enterToSend;
    if (e.key === 'Enter' && !e.shiftKey && enterSend) { e.preventDefault(); send(); return; }
    if (e.key === 'Enter' && e.shiftKey && !enterSend) { e.preventDefault(); send(); return; }
    if (e.key === 'Escape') {
      if (State.editing) cancelEdit();
      else if (State.replyTo) clearReply();
    }
    if (e.key === 'ArrowUp' && !textarea.value && !State.editing) {
      const list = State.messages.get(State.activeChatId) || [];
      const mine = [...list].reverse().find((m) => m.mine && !m.system);
      if (mine && Date.now() - mine.createdAt < 48 * 3600e3) { e.preventDefault(); startEdit(mine); }
    }
  }

  /* =========================== ارسال پیام =========================== */
  async function send() {
    const chat = activeChat();
    if (!chat) return;
    const text = textarea ? textarea.value.trim() : '';
    const file = State.attachFile;
    if (!text && !file) return;

    const replyTo = State.replyTo;
    const editing = State.editing;

    // حالت ویرایش
    if (editing) {
      try {
        const d = await API.editMessage(editing.id, text);
        const list = State.messages.get(chat.id) || [];
        const i = list.findIndex((x) => x.id === editing.id);
        if (i > -1) list[i] = d.message;
        Messages.updateMessageNode(d.message, chat);
        cancelEdit();
        if (textarea) textarea.value = '';
        autoGrow(); updateSendBtn();
        U.playSound('sent');
      } catch (e) { UI.err(e.message); }
      return;
    }

    const tempId = 'tmp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);

    if (file) { await sendWithFile(chat, file, text, replyTo, tempId); return; }

    // ارسال متن از طریق سوکت (سریع‌تر) یا REST
    if (textarea) { textarea.value = ''; autoGrow(); }
    saveDraft();
    clearReply();
    updateSendBtn();

    // نمایش خوش‌بینانه
    const optimistic = {
      id: tempId, chatId: chat.id, sender: State.me, senderId: State.me.id,
      text, media: null, replyTo: replyTo ? toReplyShape(replyTo) : null,
      mine: true, system: false, reactions: [], createdAt: Date.now(), pending: true,
    };
    pushMessage(optimistic, chat.id, false);

    try {
      if (State.socket && State.socket.connected) {
        State.socket.emit('message:send', {
          chatId: chat.id, text, replyToId: replyTo ? replyTo.id : null, tempId,
        }, (res) => {
          if (res && res.error) { UI.err(res.error); replacePending(tempId, null); return; }
          if (res && res.message) { replacePending(tempId, res.message); U.playSound('sent'); }
        });
      } else {
        const d = await API.send(chat.id, { text, replyToId: replyTo ? replyTo.id : null, tempId });
        replacePending(tempId, d.message);
        U.playSound('sent');
      }
    } catch (e) {
      replacePending(tempId, null);
      UI.err(e.message);
      if (textarea) textarea.value = text;
    }
  }

  async function sendWithFile(chat, file, caption, replyTo, tempId) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('text', caption);
    fd.append('tempId', tempId);
    if (replyTo) fd.append('replyToId', replyTo.id);

    // پیش‌نمایش با نوار پیشرفت
    const pv = showAttachPreview(file, true);
    clearReply();
    if (textarea) { textarea.value = ''; autoGrow(); updateSendBtn(); }
    State.attachFile = null;

    try {
      const d = await API.upload(chat.id, fd, (ratio) => {
        if (pv && pv.bar) pv.bar.style.width = Math.round(ratio * 100) + '%';
      });
      if (pv) pv.remove();
      pushMessage(d.message, chat.id, true);
      U.playSound('sent');
    } catch (e) {
      if (pv) pv.remove();
      UI.err(e.message || 'آپلود ناموفق بود');
    }
  }

  function showAttachPreview(file, withProgress) {
    if (attachPreview) attachPreview.remove();
    attachPreview = el('div', { class: 'attach-preview' });
    if (file.type.startsWith('image/')) {
      const img = el('img', { src: URL.createObjectURL(file), alt: '' });
      attachPreview.append(img);
    } else {
      const ico = el('div', { class: 'mf-ico' }); ico.append(icon('file'));
      attachPreview.append(ico);
    }
    const body = el('div', { class: 'mf-body' });
    body.append(el('div', { class: 'mf-name', text: file.name }));
    body.append(el('div', { class: 'mf-sub', text: U.fmtSize(file.size) }));
    if (withProgress) {
      const p = el('div', { class: 'mf-prog' }, el('i', { style: { width: '4%' } }));
      body.append(p);
      attachPreview._bar = p.firstElementChild;
    }
    attachPreview.append(body);
    attachPreview.append(el('button', { class: 'icon-btn', title: 'حذف', onclick: () => { State.attachFile = null; attachPreview.remove(); attachPreview = null; updateSendBtn(); } }, icon('close', 'ico ico-sm')));
    composerWrap.prepend(attachPreview);
    return { remove: () => { attachPreview && attachPreview.remove(); attachPreview = null; }, bar: attachPreview._bar };
  }

  /* ========================= منوی پیوست فایل ========================= */
  function attachMenu(anchor) {
    UI.dropdown(anchor, [
      { label: 'تصویر یا ویدیو', icon: 'image', onClick: () => pickFile('image/*,video/*') },
      { label: 'فایل', icon: 'file', onClick: () => pickFile('*/*') },
      { label: 'ضبط پیام صوتی', icon: 'mic', onClick: () => startRecording() },
      { sep: true },
      { label: 'موقعیت (به‌زودی)', icon: 'pin', disabled: true, onClick: () => {} },
    ]);
  }

  function pickFile(accept) {
    const input = el('input', { type: 'file', accept, style: { display: 'none' } });
    input.onchange = () => {
      const f = input.files[0];
      input.remove();
      if (f) handleFile(f);
    };
    document.body.append(input);
    input.click();
  }

  function handleFile(file) {
    const max = (State.appConfig.maxUploadMB || 50) * 1024 * 1024;
    if (file.size > max) { UI.err(`حجم فایل بیش از ${U.faNum(State.appConfig.maxUploadMB)} مگابایت است.`); return; }
    State.attachFile = file;
    showAttachPreview(file, false);
    updateSendBtn();
    if (textarea) textarea.focus();
  }

  function onPaste(e) {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (const it of items) {
      if (it.kind === 'file') {
        const f = it.getAsFile();
        if (f) { e.preventDefault(); handleFile(f); return; }
      }
    }
  }

  function setupDragDrop() {
    if (!root) return;
    let depth = 0;
    root.addEventListener('dragenter', (e) => { e.preventDefault(); depth++; root.style.outline = '2px dashed var(--accent)'; });
    root.addEventListener('dragover', (e) => e.preventDefault());
    root.addEventListener('dragleave', () => { depth--; if (depth <= 0) root.style.outline = ''; });
    root.addEventListener('drop', (e) => {
      e.preventDefault(); depth = 0; root.style.outline = '';
      const f = e.dataTransfer.files[0];
      if (f && State.activeChatId) handleFile(f);
    });
  }

  /* ========================== ضبط پیام صوتی ========================== */
  async function startRecording() {
    if (!navigator.mediaDevices || !window.MediaRecorder) { UI.err('مرورگر شما از ضبط صوت پشتیبانی نمی‌کند.'); return; }
    try {
      recStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch { UI.err('دسترسی به میکروفون داده نشد.'); return; }

    recChunks = [];
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
      .find((m) => window.MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) || '';
    recorder = new MediaRecorder(recStream, mime ? { mimeType: mime } : undefined);
    recorder.ondataavailable = (e) => { if (e.data.size) recChunks.push(e.data); };
    recorder.onstop = onRecordStop;
    recorder.start();
    recStart = Date.now();

    composerWrap.innerHTML = '';
    recBar = el('div', { class: 'rec-bar' });
    recBar.append(el('div', { class: 'rec-dot' }));
    recBar.append(el('div', { class: 'rec-time', text: '0:00' }));
    recBar.append(el('div', { class: 'rec-hint', text: 'در حال ضبط… برای لغو، دکمه‌ی سطل زباله را بزنید' }));
    recBar.append(el('button', { class: 'icon-btn', title: 'لغو', onclick: () => stopRecording(true) }, icon('trash')));
    recBar.append(el('button', { class: 'send-btn', title: 'ارسال', onclick: () => stopRecording(false) }, icon('send')));
    composerWrap.append(recBar);

    recTimer = setInterval(() => {
      const s = Math.floor((Date.now() - recStart) / 1000);
      const t = recBar && recBar.querySelector('.rec-time');
      if (t) t.textContent = U.fmtDuration(s);
      if (s >= 300) stopRecording(false);
    }, 250);
  }

  function stopRecording(cancel) {
    if (recTimer) { clearInterval(recTimer); recTimer = null; }
    if (recorder && recorder.state !== 'inactive') {
      recorder._cancel = cancel;
      recorder.stop();
    }
    if (recStream) { recStream.getTracks().forEach((t) => t.stop()); recStream = null; }
  }

  function onRecordStop() {
    const cancel = recorder._cancel;
    const duration = (Date.now() - recStart) / 1000;
    recorder = null;
    const chat = activeChat();
    renderComposer(chat);

    if (cancel || !recChunks.length) { if (!cancel) UI.toast('ضبط لغو شد'); return; }
    if (duration < 0.6) { UI.toast('خیلی کوتاه بود'); return; }

    const blob = new Blob(recChunks, { type: recChunks[0].type || 'audio/webm' });
    const name = `voice_${Date.now()}.webm`;
    const file = new File([blob], name, { type: blob.type });

    const tempId = 'tmp_' + Date.now();
    const fd = new FormData();
    fd.append('file', file);
    fd.append('duration', String(duration));
    fd.append('tempId', tempId);
    fd.append('text', '');

    const pv = showAttachPreview({ name: 'پیام صوتی ' + U.fmtDuration(duration), size: blob.size, type: 'audio/webm' }, true);
    API.upload(chat.id, fd, (r) => { if (pv.bar) pv.bar.style.width = Math.round(r * 100) + '%'; })
      .then((d) => { pv.remove(); pushMessage(d.message, chat.id, true); U.playSound('sent'); })
      .catch((e) => { pv.remove(); UI.err(e.message); });
  }

  /* ============================ تایپینگ ============================ */
  function sendTyping() {
    if (!State.settings.showTyping) return;
    const now = Date.now();
    if (now - lastTypingSent < 2500) return;
    lastTypingSent = now;
    if (State.socket && State.socket.connected && State.activeChatId) {
      State.socket.emit('typing:start', { chatId: State.activeChatId });
    }
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      if (State.socket && State.socket.connected && State.activeChatId) {
        State.socket.emit('typing:stop', { chatId: State.activeChatId });
      }
    }, 3000);
  }

  function showTyping(chatId, userId, name, on) {
    if (chatId !== State.activeChatId) return;
    let m = State.typing.get(chatId);
    if (!m) { m = new Map(); State.typing.set(chatId, m); }
    if (on) m.set(userId, name); else m.delete(userId);

    const status = document.getElementById('ch-status');
    if (!typingHint) return;
    if (m.size) {
      typingHint.classList.remove('hidden');
      if (status) {
        status.textContent = [...m.values()].slice(0, 2).join('، ') + (m.size > 2 ? ` و ${U.faNum(m.size - 2)} نفر دیگر` : '') + ' در حال نوشتن…';
        status.className = 'ch-status typing';
      }
    } else {
      typingHint.classList.add('hidden');
      const chat = State.chats.get(chatId);
      if (status && chat) { status.textContent = statusText(chat); status.className = 'ch-status' + (chat.peer && chat.peer.online ? ' online' : ''); }
    }
  }

  /* ======================= افزودن/به‌روزرسانی پیام ======================= */
  function pushMessage(m, chatId, doScroll = true) {
    const list = State.messages.get(chatId) || [];
    const i = list.findIndex((x) => x.id === m.id);
    if (i === -1) list.push(m); else list[i] = m; // از تکراری بودن پیام جلوگیری می‌شود
    State.messages.set(chatId, list);

    const chat = State.chats.get(chatId);
    if (chat) {
      chat.lastMessage = m;
      chat.lastActivity = m.createdAt;
      if (!m.mine && !m.system && chatId !== State.activeChatId) chat.unread = (chat.unread || 0) + 1;
      upsertChat(chat);
    }

    if (chatId === State.activeChatId) {
      appendMessageNode(m, chat);
      const nearBottom = isNearBottom();
      if (doScroll && (m.mine || nearBottom)) scrollBottom(true);
      else if (!m.mine && !nearBottom) showScrollDown(true);
    }
    ChatList.updateItem(chatId);
  }

  function appendMessageNode(m, chat) {
    if (!innerEl) return;
    const list = State.messages.get(chat.id) || [];
    const idx = list.findIndex((x) => x.id === m.id);
    // حذف اسکلت‌ها
    innerEl.querySelectorAll('.skeleton').forEach((n) => n.remove());
    const empty = innerEl.querySelector('.empty-state');
    if (empty) empty.remove();

    // اگر پیام قبلی هم‌فرستنده بود، باید آن را دوباره رندر کنیم (برای دم)
    if (idx > 0 && list[idx - 1].senderId === m.senderId && !m.system) {
      const prevNode = innerEl.querySelector(`.msg[data-mid="${list[idx - 1].id}"]`);
      if (prevNode) prevNode.replaceWith(Messages.renderMessage(list[idx - 1], list, idx - 1, chat));
    }

    const node = Messages.renderMessage(m, list, idx < 0 ? list.length - 1 : idx, chat);
    const existing = innerEl.querySelector(`.msg[data-mid="${m.id}"]`);
    if (existing) existing.replaceWith(node); else innerEl.append(node);
  }

  function replacePending(tempId, real) {
    const chatId = State.activeChatId;
    const list = State.messages.get(chatId) || [];
    const i = list.findIndex((x) => x.id === tempId);
    if (real) {
      // اگر پیام واقعی از قبل در لیست هست، فقط گره‌ی موقت را پاک کن (جلوگیری از تکرار)
      const already = list.findIndex((x) => x.id === real.id);
      if (already > -1) {
        if (i > -1) list.splice(i, 1);
      } else if (i > -1) {
        list[i] = real;
      } else {
        list.push(real);
      }
      State.messages.set(chatId, list);

      // گره‌ی موقت (optimistic) را از DOM بردار؛ پیام واقعی در جای درست رندر می‌شود
      if (innerEl) {
        const pending = innerEl.querySelector(`.msg[data-mid="${tempId}"]`);
        if (pending) pending.remove();
      }

      const chat = State.chats.get(chatId);
      if (chat) { chat.lastMessage = real; chat.lastActivity = real.createdAt; upsertChat(chat); }
      if (chatId === State.activeChatId) appendMessageNode(real, chat);
      ChatList.updateItem(chatId);
    } else if (i > -1) {
      list.splice(i, 1);
      State.messages.set(chatId, list);
      const node = innerEl.querySelector(`.msg[data-mid="${tempId}"]`);
      if (node) node.remove();
    }
  }

  /** به‌روزرسانی یک پیام موجود (ویرایش، واکنش، حذف) */
  function updateMessage(m) {
    const chatId = m.chatId;
    const list = State.messages.get(chatId) || [];
    const i = list.findIndex((x) => x.id === m.id);
    if (i > -1) list[i] = m;
    State.messages.set(chatId, list);
    const chat = State.chats.get(chatId);
    if (chat && chat.lastMessage && chat.lastMessage.id === m.id) { chat.lastMessage = m; upsertChat(chat); ChatList.updateItem(chatId); }
    if (chatId === State.activeChatId && chat) Messages.updateMessageNode(m, chat);
  }

  function removeMessage(chatId, messageId) {
    const list = State.messages.get(chatId) || [];
    const i = list.findIndex((x) => x.id === messageId);
    if (i > -1) { list.splice(i, 1); State.messages.set(chatId, list); }
    const node = innerEl && innerEl.querySelector(`.msg[data-mid="${messageId}"]`);
    if (node) { node.style.transition = 'opacity .2s, transform .2s'; node.style.opacity = '0'; node.style.transform = 'scale(.9)'; setTimeout(() => node.remove(), 200); }
    const chat = State.chats.get(chatId);
    if (chat) {
      if (chat.pinnedMessage && chat.pinnedMessage.id === messageId) { chat.pinnedMessage = null; renderPinBar(chat); }
      const nl = State.messages.get(chatId) || [];
      chat.lastMessage = nl.length ? nl[nl.length - 1] : null;
      upsertChat(chat); ChatList.updateItem(chatId);
    }
  }

  /* ========================= پیمایش و بارگذاری ========================= */
  function isNearBottom() {
    if (!messagesEl) return true;
    return messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 160;
  }

  function scrollBottom(smooth = true) {
    if (!messagesEl) return;
    messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    showScrollDown(false);
  }

  function showScrollDown(show) {
    if (!scrollDownBtn) return;
    scrollDownBtn.classList.toggle('hidden', !show);
    const chat = activeChat();
    scrollDownBtn.innerHTML = '';
    scrollDownBtn.append(icon('back'));
    if (show && chat && chat.unread > 0) {
      scrollDownBtn.append(el('span', { class: 'badge', text: chat.unread > 99 ? '99+' : U.faNum(chat.unread) }));
    }
  }

  function scrollToMessage(messageId) {
    const node = innerEl && innerEl.querySelector(`.msg[data-mid="${messageId}"]`);
    if (!node) {
      // شاید هنوز بارگذاری نشده — پیام‌های قدیمی‌تر را بگیر
      UI.toast('پیام در تاریخچه‌ی بارگذاری‌شده نیست؛ به بالا اسکرول کنید.');
      return;
    }
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    node.style.transition = 'background .3s';
    const b = node.querySelector('.bubble');
    if (b) {
      const old = b.style.background;
      b.style.background = 'var(--accent-soft)';
      setTimeout(() => { b.style.background = old; }, 900);
    }
  }

  async function onScroll() {
    if (!messagesEl) return;
    showScrollDown(!isNearBottom());
    if (messagesEl.scrollTop < 260 && !loadingHistory) await loadOlder();
  }

  async function loadOlder() {
    const chatId = State.activeChatId;
    if (!chatId) return;
    const meta = State.messagesMeta.get(chatId);
    if (!meta || !meta.hasMore) return;

    loadingHistory = true;
    const prevHeight = messagesEl.scrollHeight;
    const sep = el('div', { class: 'day-sep' }, el('span', { text: 'در حال بارگذاری…' }));
    innerEl.prepend(sep);

    try {
      const data = await API.history(chatId, meta.oldestId, 40);
      sep.remove();
      const list = State.messages.get(chatId) || [];
      const chat = State.chats.get(chatId);
      const existingIds = new Set(list.map((m) => m.id));
      const fresh = data.messages.filter((m) => !existingIds.has(m.id));
      const merged = [...fresh, ...list];
      State.messages.set(chatId, merged);
      State.messagesMeta.set(chatId, { hasMore: data.hasMore, oldestId: fresh.length ? fresh[0].id : meta.oldestId });

      // رندر مجدد برای حفظ گروه‌بندی درست
      Messages.renderList(innerEl, merged, chat);
      messagesEl.scrollTop = messagesEl.scrollHeight - prevHeight;
    } catch (e) {
      sep.remove();
      UI.err(e.message);
    } finally { loadingHistory = false; }
  }

  /* ============================ خوانده‌شده ============================ */
  /**
   * علامت‌گذاری چت به‌عنوان خوانده‌شده.
   * نکته: سرور هنگام ارسال تاریخچه هم last_read را به‌روز می‌کند، بنابراین
   * نمی‌توان فقط به `unread` تکیه کرد؛ باید «تا کدام پیام اعلام کرده‌ایم» را
   * جداگانه نگه داریم تا رویداد chat:read برای طرف مقابل ارسال شود.
   */
  async function markRead(chat) {
    if (!chat) return;
    const list = State.messages.get(chat.id) || [];
    const lastId = list.length ? list[list.length - 1].id : 0;

    if (chat.unread) {
      chat.unread = 0;
      upsertChat(chat);
      ChatList.updateItem(chat.id);
    }
    // قبلاً تا همین پیام اعلام کرده‌ایم؟
    if (chat.sentReadUpTo && lastId && chat.sentReadUpTo >= lastId) return;
    try {
      await API.markRead(chat.id);
      chat.sentReadUpTo = lastId || chat.sentReadUpTo || 0;
    } catch {}
  }

  /* ========================= پاسخ و ویرایش ========================= */
  function toReplyShape(m) {
    return {
      id: m.id, text: (m.text || '').slice(0, 160),
      mediaType: m.media ? m.media.type : null, mediaName: m.media ? m.media.name : null,
      senderName: m.sender ? m.sender.name : 'شما', senderId: m.senderId,
    };
  }

  function setReply(m) {
    cancelEdit();
    State.replyTo = m;
    renderReplyBar();
    if (textarea) textarea.focus();
  }

  function clearReply() {
    State.replyTo = null;
    if (replyBar) { replyBar.remove(); replyBar = null; }
  }

  function renderReplyBar() {
    if (!composerWrap) return;
    if (replyBar) replyBar.remove();
    const m = State.replyTo;
    if (!m) return;
    replyBar = el('div', { class: 'reply-bar' });
    replyBar.append(el('span', { style: { color: 'var(--accent)', display: 'grid', placeItems: 'center' } }, icon('reply')));
    replyBar.append(el('div', { class: 'bar' }));
    const b = el('div', { class: 'rb-body' });
    b.append(el('div', { class: 'rb-t', text: m.mine ? 'پاسخ به خودتان' : `پاسخ به ${m.sender ? m.sender.name : ''}` }));
    b.append(el('div', { class: 'rb-x', text: m.text || U.mediaLabel(m.media && m.media.type) }));
    replyBar.append(b);
    replyBar.append(el('button', { class: 'icon-btn', onclick: () => clearReply() }, icon('close', 'ico ico-sm')));
    composerWrap.prepend(replyBar);
  }

  function startEdit(m) {
    clearReply();
    State.editing = m;
    if (!textarea) return;
    textarea.value = m.text;
    autoGrow(); updateSendBtn(); textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    if (replyBar) replyBar.remove();
    replyBar = el('div', { class: 'reply-bar' });
    replyBar.append(el('span', { style: { color: 'var(--orange)', display: 'grid', placeItems: 'center' } }, icon('edit')));
    replyBar.append(el('div', { class: 'bar', style: { background: 'var(--orange)' } }));
    const b = el('div', { class: 'rb-body' });
    b.append(el('div', { class: 'rb-t', text: 'ویرایش پیام', style: { color: 'var(--orange)' } }));
    b.append(el('div', { class: 'rb-x', text: m.text || U.mediaLabel(m.media && m.media.type) }));
    replyBar.append(b);
    replyBar.append(el('button', { class: 'icon-btn', onclick: () => cancelEdit() }, icon('close', 'ico ico-sm')));
    composerWrap.prepend(replyBar);
  }

  function cancelEdit() {
    State.editing = null;
    if (replyBar && State.replyTo === null) { replyBar.remove(); replyBar = null; }
    if (textarea) { textarea.value = State.drafts[State.activeChatId] || ''; autoGrow(); updateSendBtn(); }
    if (State.replyTo) renderReplyBar();
  }

  /* ============================ حذف پیام ============================ */
  async function deleteMessage(m, forEveryone) {
    const yes = await UI.confirm({
      title: 'حذف پیام',
      text: forEveryone ? 'این پیام برای همه‌ی اعضا حذف می‌شود.' : 'این پیام فقط برای شما حذف می‌شود.',
      danger: true, confirmText: 'حذف',
    });
    if (!yes) return;
    try {
      await API.deleteMessage(m.id, forEveryone);
      if (forEveryone) removeMessage(m.chatId, m.id);
      else { const node = innerEl.querySelector(`.msg[data-mid="${m.id}"]`); if (node) node.remove(); }
      UI.ok('پیام حذف شد');
    } catch (e) { UI.err(e.message); }
  }

  /* ============================ انتخاب چندتایی ============================ */
  function toggleSelect(id) {
    if (selected.has(id)) selected.delete(id); else selected.add(id);
    renderSelectBar();
    innerEl.querySelectorAll('.msg').forEach((n) => {
      n.style.opacity = selected.size && !selected.has(Number(n.dataset.mid)) && !String(n.dataset.mid).startsWith('tmp') ? '.55' : '1';
      n.style.outline = selected.has(Number(n.dataset.mid)) ? '2px solid var(--accent)' : '';
      n.style.borderRadius = '12px';
    });
  }

  function clearSelect() {
    selected.clear();
    renderSelectBar();
    innerEl.querySelectorAll('.msg').forEach((n) => { n.style.opacity = '1'; n.style.outline = ''; });
  }

  function renderSelectBar() {
    if (!selectBar) return;
    if (!selected.size) { selectBar.classList.add('hidden'); selectBar.innerHTML = ''; return; }
    selectBar.classList.remove('hidden');
    selectBar.innerHTML = '';
    selectBar.append(el('div', { class: 'pb-body' },
      el('div', { class: 'pb-t', text: `${U.faNum(selected.size)} پیام انتخاب شد` })));
    selectBar.append(el('button', { class: 'icon-btn', title: 'هدایت', onclick: () => ChatModals.forward([...selected]) }, icon('forward')));
    selectBar.append(el('button', { class: 'icon-btn', title: 'حذف', onclick: async () => {
      const ids = [...selected];
      const yes = await UI.confirm({ title: 'حذف پیام‌ها', text: `${U.faNum(ids.length)} پیام برای همه حذف شود؟`, danger: true, confirmText: 'حذف' });
      if (!yes) return;
      for (const id of ids) { try { await API.deleteMessage(id, true); removeMessage(State.activeChatId, id); } catch {} }
      clearSelect(); UI.ok('حذف شد');
    }}, icon('trash')));
    selectBar.append(el('button', { class: 'icon-btn', title: 'لغو', onclick: () => clearSelect() }, icon('close')));
  }

  /* ============================= پیش‌نویس ============================= */
  function saveDraft() {
    if (!State.activeChatId || !textarea) return;
    if (State.editing) return;
    const v = textarea.value;
    if (v.trim()) State.drafts[State.activeChatId] = v;
    else delete State.drafts[State.activeChatId];
  }

  /* ========================= جست‌وجو داخل چت ========================= */
  function openInChatSearch(anchor, chat) {
    const m = UI.modal({
      title: 'جست‌وجو در ' + chat.title,
      body: (() => {
        const wrap = el('div');
        const input = el('input', { type: 'text', placeholder: 'عبارت مورد نظر…', style: { width: '100%', padding: '10px 13px', background: 'var(--bg-3)', border: 'none', borderRadius: '10px', outline: 'none' } });
        const out = el('div', { style: { marginTop: '12px', maxHeight: '320px', overflowY: 'auto' } });
        input.oninput = U.debounce(async () => {
          const q = input.value.trim();
          if (q.length < 2) { out.innerHTML = ''; return; }
          out.innerHTML = '<div style="color:var(--text-2);font-size:13px">در حال جست‌وجو…</div>';
          try {
            const d = await API.searchInChat(chat.id, q);
            out.innerHTML = '';
            if (!d.messages.length) { out.innerHTML = '<div style="color:var(--text-2);font-size:13px">نتیجه‌ای نبود.</div>'; return; }
            for (const msg of d.messages) {
              const row = el('div', { class: 'sr-item', onclick: () => { m.close(); scrollToMessage(msg.id); } });
              const b = el('div', { class: 'sr-body' });
              b.append(el('div', { class: 'sr-t', text: msg.sender ? msg.sender.name : '—' }));
              b.append(el('div', { class: 'sr-s', text: msg.text || U.mediaLabel(msg.media?.type) }));
              row.append(b);
              row.append(el('span', { class: 'ci-time', text: U.fmtShort(msg.createdAt) }));
              out.append(row);
            }
          } catch (e) { out.innerHTML = ''; UI.err(e.message); }
        }, 300);
        wrap.append(input, out);
        setTimeout(() => input.focus(), 60);
        return wrap;
      })(),
    });
  }

  /* ========================= بستن چت فعال ========================= */
  function closeActive() {
    saveDraft();
    if (State.activeChatId && State.socket) State.socket.emit('chat:close', { chatId: State.activeChatId });
    State.activeChatId = null;
    document.querySelector('.main')?.classList.remove('chat-open');
    ChatList.markActive(null);
    renderEmpty();
  }

  function openInfo(chatId) { ChatPanels.openInfo(chatId); }

  /** ورودی پیام جدید از سوکت */
  function onIncoming(payload) {
    const { message, chat } = payload;
    if (chat) upsertChat(chat);
    const isOpen = State.activeChatId === message.chatId;
    pushMessage(message, message.chatId, isOpen);

    if (isOpen) {
      const c = State.chats.get(message.chatId);
      if (c) { c.unread = 0; upsertChat(c); markRead(c); }
    } else {
      const c = State.chats.get(message.chatId);
      if (c && !c.muted && !message.mine) {
        U.playSound('msg');
        UI.notify({ chat: c, message, onClick: () => open(c.id) });
        bumpUnreadBadge();
      }
    }
  }

  function bumpUnreadBadge() {
    updateDocumentTitle();
    ChatList.refreshList();
  }

  return {
    render, open, closeActive, pushMessage, updateMessage, removeMessage, replacePending,
    setReply, startEdit, clearSelect, toggleSelect, deleteMessage, scrollBottom, scrollToMessage,
    showTyping, onIncoming, openInfo, markRead, renderHeader, renderPinBar, statusText, appendMessageNode,
    get selected() { return selected; },
  };
})();
