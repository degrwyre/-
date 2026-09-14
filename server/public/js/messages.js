'use strict';
/* ==========================================================================
   رندر پیام‌ها: حباب، رسانه، واکنش، منوی پیام، گروه‌بندی
   ========================================================================== */
const Messages = (() => {
  const { el, icon } = U;

  /** آیا پیام i باید نام فرستنده را نشان دهد؟ */
  function showSender(list, i) {
    const m = list[i];
    if (!m || m.system || m.mine) return false;
    const prev = list[i - 1];
    return !prev || prev.senderId !== m.senderId || prev.system || isDifferentDay(prev.createdAt, m.createdAt);
  }

  function isTail(list, i) {
    const m = list[i], next = list[i + 1];
    if (!next) return true;
    return next.senderId !== m.senderId || next.system || isDifferentDay(m.createdAt, next.createdAt);
  }

  function isDifferentDay(a, b) {
    if (!a || !b) return true;
    return new Date(a).toDateString() !== new Date(b).toDateString();
  }

  /** رندر کل لیست پیام‌ها */
  function renderList(container, list, chat) {
    container.innerHTML = '';
    if (!list || !list.length) {
      container.append(el('div', { class: 'empty-state', style: { margin: 'auto' } , html: `
        <svg class="ico" style="width:56px;height:56px;margin:0 auto 12px;opacity:.3"><use href="#i-send"></use></svg>
        <h3>هنوز پیامی نیست</h3>
        <p>${chat.type === 'channel' ? 'اولین پست کانال را بنویسید.' : 'اولین پیام را ارسال کنید 👋'}</p>` }));
      return;
    }

    const frag = document.createDocumentFragment();
    let lastDay = null;

    list.forEach((m, i) => {
      const day = new Date(m.createdAt).toDateString();
      if (day !== lastDay) {
        lastDay = day;
        frag.append(el('div', { class: 'day-sep' }, el('span', { text: U.fmtDay(m.createdAt) })));
      }
      frag.append(renderMessage(m, list, i, chat));
    });
    container.append(frag);
  }

  function renderMessage(m, list, index, chat) {
    if (m.system) {
      return el('div', { class: 'msg system', 'data-mid': m.id },
        el('div', { class: 'sys-bubble', text: m.text }));
    }

    const row = el('div', {
      class: `msg ${m.mine ? 'out' : 'in'}`,
      'data-mid': m.id,
      oncontextmenu: (e) => { e.preventDefault(); openMenu(e.clientX, e.clientY, m, chat); },
    });

    // آواتار فرستنده در گروه‌ها — در حالت RTL بعد از حباب قرار می‌گیرد
    // تا درست کنار پیام خودش بنشیند (نه بین دو پیام)
    let senderAvatar = null;
    if (!m.mine && chat.type !== 'dm') {
      if (isTail(list, index) && m.sender) {
        senderAvatar = U.avatar(m.sender, 'av-xs');
        senderAvatar.classList.add('m-avatar');
        senderAvatar.style.cursor = 'pointer';
        senderAvatar.onclick = (e) => { e.stopPropagation(); if (m.senderId) Profile.open(m.senderId); };
      } else {
        senderAvatar = el('div', { class: 'm-avatar-spacer' });
      }
    }

    const bubble = el('div', { class: 'bubble' });
    if (isTail(list, index)) bubble.classList.add(m.mine ? 'tail-out' : 'tail-in');

    bubble.onclick = (e) => {
      const a = e.target.closest('a');
      if (a && a.classList.contains('mention')) { e.preventDefault(); Profile.open(a.dataset.username); }
    };

    // نام فرستنده
    if (showSender(list, index) && m.sender) {
      const nm = el('div', {
        class: 'm-sender',
        text: m.sender.name,
        style: { color: senderColor(m.senderId) },
        onclick: (e) => { e.stopPropagation(); Profile.open(m.senderId); },
      });
      bubble.append(nm);
    }

    // فوروارد
    if (m.forwardedFrom) {
      bubble.append(el('div', { class: 'm-forwarded' },
        icon('forward', 'ico ico-sm'),
        el('span', { text: ` هدایت‌شده از ${m.forwardedFrom}`, style: { marginInlineStart: '4px' } })));
    }

    // پاسخ
    if (m.replyTo) {
      const rp = el('div', { class: 'm-reply', onclick: (e) => { e.stopPropagation(); Chat.scrollToMessage(m.replyTo.id); } });
      rp.append(el('div', { class: 'bar' }));
      const rb = el('div', { class: 'rp-body' });
      rb.append(el('div', { class: 'rp-name', text: m.replyTo.senderName }));
      rb.append(el('div', { class: 'rp-text', text: m.replyTo.text || U.mediaLabel(m.replyTo.mediaType) }));
      rp.append(rb);
      bubble.append(rp);
    }

    // رسانه
    if (m.media) bubble.append(renderMedia(m, chat));

    // متن
    if (m.text) {
      bubble.append(el('div', { class: 'm-text', html: U.richText(m.text) }));
    }

    // متا (زمان + تیک)
    const meta = el('span', { class: 'm-meta' });
    if (m.editedAt) meta.append(el('span', { class: 'edited', text: 'ویرایش‌شده ' }));
    meta.append(el('span', { text: U.fmtTime(m.createdAt) }));
    if (m.mine) {
      const read = isRead(m, chat);
      const t = el('span', { class: `ticks ${read ? 'read' : ''}`, title: read ? 'خوانده‌شده' : 'ارسال‌شده' });
      t.append(icon(read ? 'check-double' : 'check', 'ico ico-sm'));
      meta.append(t);
    }
    bubble.append(meta);

    // واکنش‌ها
    if (m.reactions && m.reactions.length) bubble.append(renderReactions(m, chat));

    // آواتار در حالت RTL قبل از حباب قرار می‌گیرد → سمت راست (ابتدای خط) می‌نشیند
    if (senderAvatar) row.append(senderAvatar);
    row.append(bubble);

    // دکمه‌های سریع
    const quick = el('div', { class: 'quick' });
    quick.append(el('button', { title: 'پاسخ', onclick: (e) => { e.stopPropagation(); Chat.setReply(m); } }, icon('reply')));
    quick.append(el('button', { title: 'واکنش', onclick: (e) => { e.stopPropagation(); react(m, chat, '👍'); } }, el('span', { text: '👍', style: { fontSize: '15px' } })));
    quick.append(el('button', { title: 'بیشتر', onclick: (e) => {
      e.stopPropagation();
      const r = e.currentTarget.getBoundingClientRect();
      openMenu(r.left, r.bottom + 4, m, chat);
    }}, icon('menu')));
    row.append(quick);

    // لمس طولانی در موبایل = منو
    let pressTimer = null;
    row.addEventListener('touchstart', (e) => {
      pressTimer = setTimeout(() => {
        const t = e.touches[0];
        openMenu(t.clientX, t.clientY, m, chat);
      }, 550);
    }, { passive: true });
    ['touchend', 'touchmove', 'touchcancel'].forEach((ev) =>
      row.addEventListener(ev, () => clearTimeout(pressTimer), { passive: true }));

    return row;
  }

  function senderColor(id) {
    const palette = ['#e17076', '#eda86c', '#a695e7', '#7bc862', '#6ec9cb', '#65aadd', '#ee7aae'];
    return palette[(id || 0) % palette.length];
  }

  function isRead(m, chat) {
    if (!chat) return false;
    const peerRead = chat.peerLastRead;
    if (chat.type === 'dm') return peerRead != null && peerRead >= m.id;
    return m.readByAll;
  }

  /* ------------------------------ رسانه ------------------------------ */
  function renderMedia(m, chat) {
    const type = m.media.type;
    const hasText = !!m.text;

    if (type === 'image' || type === 'video') {
      const wrap = el('div', { class: `m-media ${hasText ? 'has-text' : ''}` });
      if (type === 'image') {
        const img = el('img', { src: m.media.url, alt: m.media.name || '', loading: 'lazy' });
        if (m.media.width && m.media.height) {
          img.style.aspectRatio = `${m.media.width} / ${m.media.height}`;
        } else {
          img.style.maxWidth = '340px';
        }
        img.onclick = (e) => {
          e.stopPropagation();
          const list = mediaGallery(chat.id).map((x) => ({ url: x.media.url, type: x.media.type, name: x.media.name }));
          const idx = list.findIndex((x) => x.url === m.media.url);
          UI.lightbox({ url: m.media.url, type, name: m.media.name }, list, Math.max(0, idx));
        };
        img.onerror = () => { img.replaceWith(el('div', { class: 'm-file', html: '<div class="mf-body"><div class="mf-name">تصویر در دسترس نیست</div></div>' })); };
        wrap.append(img);
      } else {
        const v = el('video', { src: m.media.url, controls: 'true', preload: 'metadata', playsinline: 'true' });
        v.onclick = (e) => e.stopPropagation();
        wrap.append(v);
      }
      return wrap;
    }

    if (type === 'voice' || type === 'audio') return renderAudio(m);
    return renderFile(m);
  }

  function renderAudio(m) {
    const box = el('div', { class: 'm-audio' });
    const btn = el('button', { class: 'mf-ico', onclick: (e) => { e.stopPropagation(); toggle(); } }, icon('play'));
    const body = el('div', { class: 'mf-body' });
    body.append(el('div', { class: 'mf-name', text: m.media.type === 'voice' ? 'پیام صوتی' : (m.media.name || 'صوت') }));
    const sub = el('div', { class: 'mf-sub', text: U.fmtDuration(m.media.duration || 0) });
    body.append(sub);
    const prog = el('div', { class: 'mf-prog' }, el('i'));
    body.append(prog);
    box.append(btn, body);

    let audio = null;
    function toggle() {
      if (!audio) {
        audio = new Audio(m.media.url);
        audio.addEventListener('timeupdate', () => {
          if (audio.duration) prog.firstElementChild.style.width = (audio.currentTime / audio.duration * 100) + '%';
          sub.textContent = U.fmtDuration(audio.currentTime) + ' / ' + U.fmtDuration(audio.duration || m.media.duration || 0);
        });
        audio.addEventListener('ended', () => { btn.innerHTML = ''; btn.append(icon('play')); prog.firstElementChild.style.width = '0%'; });
        audio.addEventListener('error', () => UI.err('پخش این فایل ممکن نشد'));
      }
      if (audio.paused) { audio.play().catch(() => UI.err('مرورگر اجازه‌ی پخش نداد')); btn.innerHTML = ''; btn.append(icon('pause')); }
      else { audio.pause(); btn.innerHTML = ''; btn.append(icon('play')); }
    }
    return box;
  }

  function renderFile(m) {
    const box = el('div', { class: 'm-file', onclick: (e) => { e.stopPropagation(); U.download(m.media.url, m.media.name); } });
    const ico = el('div', { class: 'mf-ico', style: { background: fileColor(m.media.name) } });
    ico.append(icon(extIcon(m.media.name)));
    const body = el('div', { class: 'mf-body' });
    body.append(el('div', { class: 'mf-name', text: m.media.name || 'فایل' }));
    body.append(el('div', { class: 'mf-sub', text: U.fmtSize(m.media.size) }));
    box.append(ico, body);
    box.append(el('span', { style: { color: 'var(--text-2)', display: 'grid', placeItems: 'center' } }, icon('download', 'ico ico-sm')));
    return box;
  }

  function fileColor(name = '') {
    const ext = (name.split('.').pop() || '').toLowerCase();
    const map = { pdf: '#e5544b', doc: '#4a86e8', docx: '#4a86e8', xls: '#4dcd5e', xlsx: '#4dcd5e', ppt: '#f0a03c', pptx: '#f0a03c', zip: '#c792ea', rar: '#c792ea' };
    return map[ext] || 'var(--accent)';
  }
  function extIcon(name = '') {
    const ext = (name.split('.').pop() || '').toLowerCase();
    if (['pdf', 'doc', 'docx', 'txt', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext)) return 'file';
    if (['zip', 'rar', '7z'].includes(ext)) return 'archive';
    return 'file';
  }

  /* ----------------------------- واکنش‌ها ----------------------------- */
  function renderReactions(m, chat) {
    const box = el('div', { class: 'm-reactions' });
    for (const r of m.reactions) {
      box.append(el('button', {
        class: `react-chip ${r.mine ? 'mine' : ''}`,
        onclick: (e) => { e.stopPropagation(); react(m, chat, r.emoji); },
        title: `${U.faNum(r.count)} نفر`,
      }, el('span', { text: r.emoji }), el('b', { text: U.faNum(r.count) })));
    }
    return box;
  }

  async function react(m, chat, emoji) {
    m.reactions = m.reactions || [];
    // خوش‌بینانه به‌روز می‌کنیم
    const i = m.reactions.findIndex((r) => r.emoji === emoji);
    if (i > -1) {
      if (m.reactions[i].mine) {
        m.reactions[i].count--;
        m.reactions[i].mine = false;
        if (m.reactions[i].count <= 0) m.reactions.splice(i, 1);
      } else { m.reactions[i].count++; m.reactions[i].mine = true; }
    } else m.reactions.push({ emoji, count: 1, mine: true });

    updateMessageNode(m, chat);
    try {
      if (State.socket && State.socket.connected) State.socket.emit('message:react', { messageId: m.id, emoji });
      else await API.react(m.id, emoji);
    } catch (e) { UI.err(e.message); }
  }

  /** به‌روزرسانی گره یک پیام در DOM */
  function updateMessageNode(m, chat) {
    const node = document.querySelector(`.messages .msg[data-mid="${m.id}"]`);
    if (!node) return;
    const list = State.messages.get(chat.id) || [];
    const idx = list.findIndex((x) => x.id === m.id);
    const fresh = renderMessage(m, list, idx < 0 ? list.length - 1 : idx, chat);
    node.replaceWith(fresh);
  }

  /* --------------------------- گالری رسانه --------------------------- */
  function mediaGallery(chatId) {
    const list = State.messages.get(chatId) || [];
    return list.filter((m) => m.media && ['image', 'video'].includes(m.media.type));
  }

  /* ----------------------------- منوی پیام ---------------------------- */
  function openMenu(x, y, m, chat) {
    const canEdit = m.mine && !m.system && Date.now() - m.createdAt < 48 * 3600e3;
    const canDelete = m.mine || ['owner', 'admin'].includes(chat.myRole);
    const canPin = ['owner', 'admin'].includes(chat.myRole) && !m.system;
    const isPinned = chat.pinnedMessage && chat.pinnedMessage.id === m.id;

    UI.contextMenu(x, y, [
      { label: 'پاسخ', icon: 'reply', onClick: () => Chat.setReply(m) },
      { label: 'کپی متن', icon: 'copy', onClick: async () => {
        const txt = m.text || (m.media ? m.media.url : '');
        await U.copy(txt); UI.ok('کپی شد');
      }},
      { label: 'هدایت به…', icon: 'forward', onClick: () => ChatModals.forward([m.id]) },
      { sep: true },
      ...(canEdit ? [{ label: 'ویرایش', icon: 'edit', onClick: () => Chat.startEdit(m) }] : []),
      ...(canPin ? [{ label: isPinned ? 'برداشتن سنجاق' : 'سنجاق کردن', icon: 'pin', onClick: async () => {
        try {
          if (isPinned) await API.unpin(chat.id);
          else await API.pin(chat.id, m.id);
        } catch (e) { UI.err(e.message); }
      }}] : []),
      { label: 'انتخاب', icon: 'check', onClick: () => Chat.toggleSelect(m.id) },
      { sep: true },
      ...(canDelete ? [
        { label: 'حذف برای همه', icon: 'trash', danger: true, onClick: () => Chat.deleteMessage(m, true) },
        ...(m.mine ? [] : [{ label: 'حذف برای من', icon: 'trash', danger: true, onClick: () => Chat.deleteMessage(m, false) }]),
      ] : []),
    ]);
  }

  return { renderList, renderMessage, updateMessageNode, mediaGallery, react, openMenu, senderColor };
})();
