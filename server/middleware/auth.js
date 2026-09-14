'use strict';
/**
 * احراز هویت: توکن JWT در کوکی httpOnly (امن‌تر) و همچنین قابل استفاده در هدر Authorization.
 */
const { parse } = require('cookie');
const db = require('../db');
const config = require('../config');
const { verifyToken } = require('../utils/helpers');

const COOKIE_NAME = 'cg_token';

function getTokenFromReq(req) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) return header.slice(7);
  try {
    const cookies = parse(req.headers.cookie || '');
    if (cookies[COOKIE_NAME]) return cookies[COOKIE_NAME];
  } catch {}
  return null;
}

/** توکن را در پاسخ ست می‌کند */
function setAuthCookie(res, token) {
  const attrs = [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${30 * 86400}`,
  ];
  if (config.IS_PROD) attrs.push('Secure');
  res.setHeader('Set-Cookie', attrs.join('; '));
}

function clearAuthCookie(res) {
  const attrs = [`${COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (config.IS_PROD) attrs.push('Secure');
  res.setHeader('Set-Cookie', attrs.join('; '));
}

/** احراز هویت اجباری */
function requireAuth(req, res, next) {
  const token = getTokenFromReq(req);
  const payload = verifyToken(token, config.JWT_SECRET);
  if (!payload || !payload.uid) return res.status(401).json({ error: 'نیاز به ورود به حساب کاربری' });

  const user = db.prepare(`SELECT id, username, phone, name, bio, avatar, is_verified, last_seen, settings, created_at
                           FROM users WHERE id = ?`).get(payload.uid);
  if (!user) return res.status(401).json({ error: 'حساب کاربری یافت نشد' });

  req.user = user;
  req.sessionId = payload.sid;
  next();
}

/** احراز هویت اختیاری (برای صفحات عمومی) */
function optionalAuth(req, _res, next) {
  const token = getTokenFromReq(req);
  const payload = verifyToken(token, config.JWT_SECRET);
  if (payload && payload.uid) {
    req.user = db.prepare('SELECT id, username, name, bio, avatar, is_verified FROM users WHERE id = ?').get(payload.uid);
    req.sessionId = payload.sid;
  }
  next();
}

module.exports = { requireAuth, optionalAuth, getTokenFromReq, setAuthCookie, clearAuthCookie, COOKIE_NAME };
