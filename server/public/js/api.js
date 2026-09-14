'use strict';
/* ==========================================================================
   لایه‌ی ارتباط با سرور (REST API)
   ========================================================================== */
const API = (() => {
  const BASE = '/api';

  async function request(path, opts = {}) {
    const headers = { ...(opts.headers || {}) };
    let body = opts.body;

    if (body && !(body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
    }
    if (State.token) headers['Authorization'] = 'Bearer ' + State.token;

    const res = await fetch(BASE + path, {
      method: opts.method || (body ? 'POST' : 'GET'),
      headers, body,
      credentials: 'same-origin',
      signal: opts.signal,
    });

    let data = null;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      try { data = await res.json(); } catch { data = null; }
    } else {
      try { data = { text: await res.text() }; } catch {}
    }

    if (!res.ok) {
      const err = new Error((data && data.error) || `خطای ${res.status}`);
      err.status = res.status;
      err.data = data;
      if (res.status === 401 && State.me && !opts.skipAuthRedirect) {
        Session.onUnauthorized();
      }
      throw err;
    }
    return data;
  }

  const get = (p, o) => request(p, { ...o, method: 'GET' });
  const post = (p, b, o) => request(p, { ...o, method: 'POST', body: b });
  const patch = (p, b, o) => request(p, { ...o, method: 'PATCH', body: b });
  const put = (p, b, o) => request(p, { ...o, method: 'PUT', body: b });
  const del = (p, o) => request(p, { ...o, method: 'DELETE' });

  return {
    request, get, post, patch, put, del,

    /* --- احراز هویت --- */
    register: (b) => post('/auth/register', b),
    login: (b) => post('/auth/login', b),
    logout: () => post('/auth/logout'),
    me: () => get('/auth/me'),
    sessions: () => get('/auth/sessions'),
    revokeSession: (id) => del('/auth/sessions/' + encodeURIComponent(id)),
    revokeOtherSessions: () => del('/auth/sessions'),

    /* --- کاربران --- */
    search: (q) => get('/users/search?q=' + encodeURIComponent(q)),
    user: (idOrName) => get('/users/' + encodeURIComponent(idOrName)),
    startDM: (id) => post(`/users/${id}/dm`),
    updateProfile: (b) => patch('/users/me/profile', b),
    updateSettings: (b) => put('/users/me/settings', b),
    changePassword: (b) => post('/users/me/password', b),
    uploadAvatar: (file) => { const fd = new FormData(); fd.append('avatar', file); return post('/users/me/avatar', fd); },
    removeAvatar: () => del('/users/me/avatar'),

    /* --- چت‌ها --- */
    chats: () => get('/chats'),
    chat: (id) => get('/chats/' + id),
    createChat: (b) => post('/chats/create', b),
    savedChat: () => get('/chats/saved'),
    joinByCode: (code) => post('/chats/join/' + encodeURIComponent(code)),
    members: (id) => get(`/chats/${id}/members`),
    addMember: (id, userId) => post(`/chats/${id}/members`, { userId }),
    removeMember: (id, userId) => del(`/chats/${id}/members/${userId}`),
    setRole: (id, userId, role) => patch(`/chats/${id}/members/${userId}/role`, { role }),
    transfer: (id, userId) => post(`/chats/${id}/transfer`, { userId }),
    updateChat: (id, b) => patch('/chats/' + id, b),
    uploadChatAvatar: (id, file) => { const fd = new FormData(); fd.append('avatar', file); return post(`/chats/${id}/avatar`, fd); },
    pin: (id, msgId) => post(`/chats/${id}/pin/${msgId}`),
    unpin: (id) => del(`/chats/${id}/pin`),
    mute: (id, muted) => post(`/chats/${id}/mute`, { muted }),
    leave: (id) => post(`/chats/${id}/leave`),
    searchInChat: (id, q) => get(`/chats/${id}/search?q=${encodeURIComponent(q)}`),

    /* --- پیام‌ها --- */
    history: (chatId, before, limit = 40) =>
      get(`/messages/chat/${chatId}?limit=${limit}${before ? '&before=' + before : ''}`),
    send: (chatId, b) => post(`/messages/chat/${chatId}`, b),
    upload: (chatId, formData, onProgress) => {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${BASE}/messages/chat/${chatId}/upload`);
        if (State.token) xhr.setRequestHeader('Authorization', 'Bearer ' + State.token);
        xhr.withCredentials = true;
        xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
        xhr.onload = () => {
          try {
            const d = JSON.parse(xhr.responseText || '{}');
            if (xhr.status >= 200 && xhr.status < 300) resolve(d);
            else { if (xhr.status === 401) Session.onUnauthorized(); reject(new Error(d.error || 'آپلود ناموفق')); }
          } catch (e) { reject(new Error('پاسخ نامعتبر از سرور')); }
        };
        xhr.onerror = () => reject(new Error('خطای شبکه در آپلود'));
        xhr.send(formData);
      });
    },
    editMessage: (id, text) => patch('/messages/' + id, { text }),
    deleteMessage: (id, forEveryone) => del(`/messages/${id}${forEveryone ? '?forEveryone=1' : ''}`),
    react: (id, emoji) => post(`/messages/${id}/reaction`, { emoji }),
    markRead: (chatId) => post(`/messages/chat/${chatId}/read`),
    forward: (messageIds, chatIds) => post('/messages/forward', { messageIds, chatIds }),
    searchAll: (q) => get('/messages/search?q=' + encodeURIComponent(q)),
    chatMedia: (chatId) => get(`/messages/chat/${chatId}/media`),

    /* --- متفرقه --- */
    health: () => get('/health'),
    config: () => get('/config'),
    stats: () => get('/stats'),
    explore: () => get('/explore'),
    contacts: () => get('/contacts'),
    addContact: (userId) => post('/contacts', { userId }),
    removeContact: (userId) => del('/contacts/' + userId),
  };
})();
