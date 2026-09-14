'use strict';
/* ==========================================================================
   اجزای رابط کاربری: توست، مودال، منوی راست‌کلیک، لایت‌باکس، انتخابگر ایموجی
   ========================================================================== */
const UI = (() => {
  const { el, icon } = U;

  /* ------------------------------- توست ------------------------------- */
  function toast(msg, type = '', ms = 3200) {
    const box = document.getElementById('toasts');
    const t = el('div', { class: `toast ${type}` });
    if (type === 'ok') t.append(icon('check', 'ico ico-sm'));
    if (type === 'err') t.append(icon('info', 'ico ico-sm'));
    t.append(el('span', { text: msg }));
    box.append(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 240); }, ms);
    return t;
  }

  const ok = (m) => toast(m, 'ok');
  const err = (m) => toast(m, 'err', 4200);

  /* ---------------------------- تأییدیه ---------------------------- */
  function confirm({ title, text, confirmText = 'تأیید', cancelText = 'انصراف', danger = false }) {
    return new Promise((resolve) => {
      let done = false;
      const close = (v) => { if (done) return; done = true; backdrop.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
      const onKey = (e) => { if (e.key === 'Escape') close(false); if (e.key === 'Enter') close(true); };

      const backdrop = el('div', { class: 'modal-backdrop', onclick: (e) => { if (e.target === backdrop) close(false); } });
      const modal = el('div', { class: 'modal' });
      modal.append(el('div', { class: 'modal-head' }, el('h3', { text: title })));
      modal.append(el('div', { class: 'modal-body' }, el('p', { text: text, style: { margin: 0, color: 'var(--text-2)', lineHeight: '1.8' } })));
      const foot = el('div', { class: 'modal-foot' });
      foot.append(el('button', { class: 'btn ghost', text: cancelText, onclick: () => close(false) }));
      foot.append(el('button', { class: `btn ${danger ? 'danger' : ''}`, text: confirmText, onclick: () => close(true) }));
      modal.append(foot);
      backdrop.append(modal);
      document.getElementById('modal-root').append(backdrop);
      document.addEventListener('keydown', onKey);
      setTimeout(() => foot.lastElementChild.focus(), 40);
    });
  }

  /* ------------------------------- ورودی ------------------------------ */
  function prompt({ title, label, placeholder = '', value = '', okText = 'تأیید', type = 'text', multiline = false }) {
    return new Promise((resolve) => {
      let done = false;
      const close = (v) => { if (done) return; done = true; backdrop.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
      const onKey = (e) => { if (e.key === 'Escape') close(null); };

      const input = multiline
        ? el('textarea', { rows: 3, placeholder, style: { width: '100%', resize: 'vertical' } })
        : el('input', { type, placeholder, value });
      input.value = multiline ? (value || '') : (value || '');

      const backdrop = el('div', { class: 'modal-backdrop', onclick: (e) => { if (e.target === backdrop) close(null); } });
      const modal = el('div', { class: 'modal' });
      modal.append(el('div', { class: 'modal-head' }, el('h3', { text: title })));
      const body = el('div', { class: 'modal-body' });
      if (label) body.append(el('div', { class: 'field' }, el('label', { text: label }), input));
      else body.append(input);
      modal.append(body);
      const foot = el('div', { class: 'modal-foot' });
      foot.append(el('button', { class: 'btn ghost', text: 'انصراف', onclick: () => close(null) }));
      foot.append(el('button', { class: 'btn', text: okText, onclick: () => {
        const v = String(input.value).trim();
        if (!v) { input.focus(); return; }
        close(v);
      }}));
      modal.append(foot);
      backdrop.append(modal);
      document.getElementById('modal-root').append(backdrop);
      document.addEventListener('keydown', onKey);
      setTimeout(() => input.focus(), 40);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !multiline) { e.preventDefault(); foot.lastElementChild.click(); }
      });
    });
  }

  /* ------------------------- مودال سفارشی ------------------------- */
  function modal({ title, body, foot, wide = false, onClose }) {
    let closed = false;
    const backdrop = el('div', { class: 'modal-backdrop', onclick: (e) => { if (e.target === backdrop) close(); } });
    const box = el('div', { class: `modal ${wide ? 'wide' : ''}` });
    const head = el('div', { class: 'modal-head' }, el('h3', { text: title }));
    const closeBtn = el('button', { class: 'icon-btn', title: 'بستن', onclick: () => close() }, icon('close'));
    head.append(closeBtn);
    box.append(head);
    const bodyWrap = el('div', { class: 'modal-body' });
    if (typeof body === 'string') bodyWrap.innerHTML = body; else if (body) bodyWrap.append(body);
    box.append(bodyWrap);
    if (foot) box.append(el('div', { class: 'modal-foot' }, ...(Array.isArray(foot) ? foot : [foot])));
    backdrop.append(box);
    document.getElementById('modal-root').append(backdrop);

    function close() {
      if (closed) return; closed = true;
      backdrop.remove();
      document.removeEventListener('keydown', onKey);
      if (onClose) onClose();
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    return { close, box, bodyWrap, backdrop };
  }

  /* --------------------------- منوی کشویی --------------------------- */
  let openDropdown = null;
  function closeDropdown() {
    if (openDropdown) { openDropdown.remove(); openDropdown = null; }
  }

  /**
   * items: [{ label, icon, onClick, danger, sep, head, disabled, checked }]
   */
  function dropdown(anchorEl, items, { align = 'end' } = {}) {
    closeDropdown();
    const dd = el('div', { class: 'dropdown' });
    for (const it of items) {
      if (it.sep) { dd.append(el('div', { class: 'dd-sep' })); continue; }
      if (it.head) { dd.append(el('div', { class: 'dd-head', text: it.head })); continue; }
      const b = el('button', { class: `dd-item ${it.danger ? 'danger' : ''}`, onclick: (e) => {
        e.stopPropagation(); closeDropdown(); if (!it.disabled && it.onClick) it.onClick();
      }});
      if (it.icon) b.append(icon(it.icon, 'ico'));
      b.append(el('span', { text: it.label, style: { flex: '1', textAlign: 'start' } }));
      if (it.checked) b.append(icon('check', 'ico ico-sm'));
      if (it.disabled) b.style.opacity = '.45';
      dd.append(b);
    }

    document.body.append(dd);
    openDropdown = dd;

    const r = anchorEl.getBoundingClientRect();
    const w = dd.offsetWidth, h = dd.offsetHeight;
    let top = r.bottom + 6, left = align === 'end' ? r.right - w : r.left;
    if (top + h > window.innerHeight - 10) top = Math.max(10, r.top - h - 6);
    if (left + w > window.innerWidth - 10) left = window.innerWidth - w - 10;
    if (left < 10) left = 10;
    dd.style.top = top + 'px';
    dd.style.left = left + 'px';
    dd.style.position = 'fixed';

    setTimeout(() => {
      document.addEventListener('click', outside, { once: true });
      document.addEventListener('keydown', escClose);
    }, 0);
    function outside() { closeDropdown(); }
    function escClose(e) { if (e.key === 'Escape') closeDropdown(); }
    return dd;
  }

  /** منوی راست‌کلیک / لمس طولانی */
  function contextMenu(x, y, items) {
    closeDropdown();
    const dd = el('div', { class: 'dropdown ctx-menu' });
    for (const it of items) {
      if (it.sep) { dd.append(el('div', { class: 'dd-sep' })); continue; }
      const b = el('button', { class: `dd-item ${it.danger ? 'danger' : ''}`, onclick: () => { closeDropdown(); it.onClick && it.onClick(); } });
      if (it.icon) b.append(icon(it.icon, 'ico'));
      b.append(el('span', { text: it.label, style: { flex: '1', textAlign: 'start' } }));
      dd.append(b);
    }
    document.body.append(dd);
    openDropdown = dd;
    const w = dd.offsetWidth, h = dd.offsetHeight;
    dd.style.top = Math.min(y, window.innerHeight - h - 10) + 'px';
    dd.style.left = Math.max(10, Math.min(x, window.innerWidth - w - 10)) + 'px';
    setTimeout(() => document.addEventListener('click', () => closeDropdown(), { once: true }), 0);
    return dd;
  }

  /* ------------------------------ لایت‌باکس ---------------------------- */
  function lightbox(media, list = [], index = 0) {
    let i = index;
    const lb = el('div', { class: 'lightbox', onclick: (e) => { if (e.target === lb) close(); } });
    const bar = el('div', { class: 'lb-bar' });
    const nameEl = el('div', { class: 'lb-name' });
    bar.append(nameEl);
    bar.append(el('button', { title: 'دانلود', onclick: (e) => { e.stopPropagation(); U.download(currentUrl(), media.name); } }, icon('download')));
    bar.append(el('button', { title: 'بستن', onclick: (e) => { e.stopPropagation(); close(); } }, icon('close')));
    lb.append(bar);

    const stage = el('div', { style: { display: 'grid', placeItems: 'center', width: '100%', height: '100%' } });
    lb.append(stage);

    function currentUrl() { return (list[i] || media).url; }
    function render() {
      const m = list.length ? list[i] : media;
      stage.innerHTML = '';
      nameEl.textContent = m.name || '';
      if (m.type === 'video') {
        const v = el('video', { src: m.url, controls: 'true', autoplay: 'true' });
        v.onclick = (e) => e.stopPropagation();
        stage.append(v);
      } else {
        const img = el('img', { src: m.url, alt: m.name || '' });
        img.onclick = (e) => e.stopPropagation();
        stage.append(img);
      }
    }
    function close() { lb.remove(); document.removeEventListener('keydown', onKey); }
    function onKey(e) {
      if (e.key === 'Escape') close();
      if (!list.length) return;
      if (e.key === 'ArrowRight') { i = (i + 1) % list.length; render(); }
      if (e.key === 'ArrowLeft') { i = (i - 1 + list.length) % list.length; render(); }
    }
    if (list.length > 1) {
      lb.append(el('button', { class: 'lb-nav prev', onclick: (e) => { e.stopPropagation(); i = (i + 1) % list.length; render(); } }, icon('back')));
      const nx = el('button', { class: 'lb-nav next', onclick: (e) => { e.stopPropagation(); i = (i - 1 + list.length) % list.length; render(); } }, icon('back'));
      lb.append(nx);
    }
    document.body.append(lb);
    document.addEventListener('keydown', onKey);
    render();
  }

  /* ------------------------- نوتیفیکیشن پیام ------------------------- */
  function notify({ chat, message, onClick }) {
    if (!State.settings.notifications) return;
    if (document.visibilityState === 'visible' && State.activeChatId === chat.id) return;

    // نوتیفیکیشن بومی مرورگر
    if ('Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
      try {
        const n = new Notification(chat.title, {
          body: messagePreview(message),
          icon: chat.avatar ? `/media/${chat.avatar}` : undefined,
          tag: 'cg-' + chat.id,
        });
        n.onclick = () => { window.focus(); onClick && onClick(); n.close(); };
        return;
      } catch {}
    }

    // نوتیفیکیشن داخل برنامه
    const senderName = message.sender ? message.sender.name : chat.title;
    const n = el('div', { class: 'notif', onclick: () => { onClick && onClick(); n.remove(); } });
    n.append(U.avatar(message.sender || chat, 'av-s'));
    const body = el('div', { class: 'n-body' });
    body.append(el('div', { class: 'n-name', text: chat.type === 'dm' ? senderName : `${chat.title} • ${senderName}` }));
    body.append(el('div', { class: 'n-text', text: messagePreview(message) }));
    n.append(body);
    n.append(el('button', { class: 'n-close icon-btn', onclick: (e) => { e.stopPropagation(); n.remove(); } }, icon('close', 'ico ico-sm')));
    document.body.append(n);
    setTimeout(() => { n.style.transition = 'opacity .3s'; n.style.opacity = '0'; setTimeout(() => n.remove(), 320); }, 5200);
  }

  function messagePreview(m) {
    if (!m) return '';
    const base = m.media ? `${U.mediaLabel(m.media.type)} ${m.text ? '• ' + m.text : ''}` : m.text;
    return base || '…';
  }

  /* --------------------------- انتخابگر ایموجی -------------------------- */
  const EMOJI_GROUPS = {
    '😀': ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🥵','🥶','🥴','😵','🤯','🤠','🥳','😎','🤓','🧐','😕','😟','🙁','☹️','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱'],
    '👍': ['👍','👎','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👋','🤚','🖐️','✋','🖖','👏','🙌','🤲','🤝','🙏','💪','🦾','🦵','🦶','👂','🦻','👃','🧠','🫀','🫁','🦷','🦴','👀','👁️','👅','👄'],
    '❤️': ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','♥️','🔥','✨','⭐','🌟','💫','⚡','💥','💢','💦','💨','🕊️','🎉','🎊','🎈','🎁','🏆','🥇','🎯'],
    '🌸': ['🌸','🌹','🌺','🌻','🌼','🌷','🌱','🌲','🌳','🌴','🌵','🍀','🍁','🍂','🍃','🌾','🌿','☘️','🍄','🌰','🐚','🌎','🌍','🌏','🌕','🌖','🌗','🌘','🌑','🌒','🌓','🌔','🌙','🌚','🌛','☀️','🌤️','⛅','🌧️','⛈️','❄️','☃️','🌈'],
    '🍔': ['🍏','🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🥦','🥬','🥒','🌶️','🫑','🌽','🥕','🧄','🧅','🥔','🍠','🥐','🥯','🍞','🥖','🧀','🥚','🍳','🧈','🥞','🧇','🥓','🍔','🍟','🍕','🌭','🥪','🌮','🌯','🍜','🍲','🍛','🍣','🍤','🍙','🍚','🍘','🍥','🥮','🍢','🍡','🍧','🍨','🍦','🥧','🧁','🍰','🎂','🍮','🍭','🍬','🍫','🍿','🍩','🍪','☕','🍵','🧃','🥤','🍶','🍺','🍻','🥂','🍷','🥃','🍸','🍹','🧉','🍾'],
    '⚽': ['⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🪀','🏓','🏸','🏒','🥅','⛳','🪁','🏹','🎣','🤿','🥊','🥋','🎽','🛹','🛼','🛷','⛸️','🥌','🎿','⛷️','🏂','🪂','🏋️','🤼','🤸','⛹️','🤺','🤾','🏌️','🏇','🧘','🏄','🏊','🚴','🎮','🎲','🎯','🎳','🎬','🎨','🎭','🎪','🎤','🎧','🎼','🎹','🥁','🎷','🎺','🎸','🪕','🎻'],
    '🚗': ['🚗','🚕','🚙','🚌','🚎','🏎️','🚓','🚑','🚒','🚐','🛻','🚚','🚛','🚜','🛵','🏍️','🛺','🚲','🛴','🚨','🚔','🚍','🚘','🚖','🚡','🚠','🚟','🚃','🚋','🚞','🚝','🚄','🚅','🚈','🚂','🚆','🚇','🚊','🚉','✈️','🛫','🛬','🛩️','💺','🛰️','🚀','🛸','🚁','🛶','⛵','🚤','🛥️','🛳️','⛴️','🚢','⚓','🗺️','🗿','🗽','🗼','🏰','🏯','🏟️','🎡','🎢','🎠','⛲','⛱️','🏖️','🏝️','🏜️','🌋','⛰️','🏔️','🗻'],
    '💡': ['💡','🔦','🕯️','🧯','🛢️','💸','💵','💴','💶','💷','🪙','💰','💳','💎','⚖️','🧰','🔧','🔨','⚒️','🛠️','⛏️','🔩','⚙️','🧱','⛓️','🧲','🔫','💣','🧨','🪓','🔪','🗡️','⚔️','🛡️','🚬','⚰️','🏺','🔮','📿','🧿','💈','⚗️','🔭','🔬','🕳️','🩹','🩺','💊','💉','🩸','🧬','🦠','🧫','🧪','🌡️','🧹','🧺','🧻','🚽','🚰','🚿','🛁','🛀','🧼','🪒','🧽','🪣','🧴','🛎️','🔑','🗝️','🚪','🪑','🛋️','🛏️','🖼️','🪞','🧳','⌚','⏰','📱','💻','🖥️','⌨️','🖱️','💽','💾','📀','📷','📹','🎥','📞','☎️','📟','📠','📺','📻','🎙️','🎚️','🎛️','⏱️','⏲️','🔋','🔌','💰'],
  };

  function emojiPicker(anchor, onPick) {
    const existing = document.querySelector('.emoji-picker');
    if (existing) { existing.remove(); return; }
    const cats = Object.keys(EMOJI_GROUPS);
    let activeCat = cats[0];

    const box = el('div', { class: 'emoji-picker' });
    const catBar = el('div', { class: 'ep-cats' });
    const grid = el('div', { class: 'ep-grid' });

    function renderCat() {
      catBar.innerHTML = '';
      for (const c of cats) {
        catBar.append(el('button', { class: c === activeCat ? 'on' : '', text: c, title: c, onclick: () => { activeCat = c; renderCat(); } }));
      }
      grid.innerHTML = '';
      for (const e of EMOJI_GROUPS[activeCat]) {
        grid.append(el('button', { text: e, onclick: () => onPick(e) }));
      }
    }
    box.append(catBar, grid);
    renderCat();

    const r = anchor.getBoundingClientRect();
    document.body.append(box);
    box.style.position = 'fixed';
    box.style.bottom = 'auto';
    box.style.insetInlineStart = 'auto';
    let left = r.left - 40;
    let top = r.top - box.offsetHeight - 10;
    if (top < 10) top = r.bottom + 10;
    if (left + box.offsetWidth > window.innerWidth - 10) left = window.innerWidth - box.offsetWidth - 10;
    if (left < 10) left = 10;
    box.style.left = left + 'px';
    box.style.top = top + 'px';

    setTimeout(() => {
      const off = (e) => { if (!box.contains(e.target) && e.target !== anchor) { box.remove(); document.removeEventListener('click', off); } };
      document.addEventListener('click', off);
      document.addEventListener('keydown', function k(e) { if (e.key === 'Escape') { box.remove(); document.removeEventListener('keydown', k); } });
    }, 0);
    return box;
  }

  /* -------------------------- بارگذاری -------------------------- */
  function loading(text = 'در حال بارگذاری…') {
    const backdrop = el('div', { class: 'modal-backdrop', style: { background: 'rgba(0,0,0,.35)' } });
    const box = el('div', { class: 'modal', style: { maxWidth: '260px', alignItems: 'center', padding: '26px' } });
    box.append(el('div', { class: 'boot-loader', style: { width: '140px' } }, el('span')));
    box.append(el('div', { text, style: { marginTop: '14px', color: 'var(--text-2)', fontSize: '13px' } }));
    backdrop.append(box);
    document.getElementById('modal-root').append(backdrop);
    return { close: () => backdrop.remove() };
  }

  function skeletonList(n = 8) {
    const f = document.createDocumentFragment();
    for (let i = 0; i < n; i++) {
      const row = el('div', { class: 'sk-row' });
      row.append(el('div', { class: 'sk-c skeleton' }));
      const l = el('div', { class: 'sk-l' });
      l.append(el('i', { class: 'skeleton', style: { width: `${55 + (i * 7) % 35}%` } }));
      l.append(el('i', { class: 'skeleton', style: { width: `${35 + (i * 11) % 45}%`, opacity: '.6' } }));
      row.append(l);
      f.append(row);
    }
    return f;
  }

  return {
    toast, ok, err, confirm, prompt, modal, dropdown, contextMenu,
    lightbox, notify, emojiPicker, loading, skeletonList, closeDropdown, messagePreview,
  };
})();
