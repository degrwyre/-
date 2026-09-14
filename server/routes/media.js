'use strict';
/**
 * سرو فایل‌های رسانه‌ای با پشتیبانی از Range Request (برای پخش صوت/ویدیو)
 * احراز هویت با کوکی انجام می‌شود تا تگ‌های <img>/<audio>/<video> کار کنند.
 */
const router = require('../middleware/router')();
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { requireAuth } = require('../middleware/auth');
const { resolveInsideUploads } = require('../utils/files');


const MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif',
  '.webp': 'image/webp', '.bmp': 'image/bmp', '.avif': 'image/avif',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.mkv': 'video/x-matroska',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4',
  '.aac': 'audio/aac', '.flac': 'audio/flac', '.opus': 'audio/ogg',
  '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8',
  '.zip': 'application/zip', '.rar': 'application/vnd.rar', '.7z': 'application/x-7z-compressed',
  '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.json': 'application/octet-stream', '.csv': 'text/csv; charset=utf-8',
};

function mimeFor(file) {
  return MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
}

/** پخش/دانلود یک فایل آپلودشده */
router.get('/:filename', requireAuth, (req, res) => {
  const full = resolveInsideUploads(req.params.filename);
  if (!full || !fs.existsSync(full)) return res.status(404).send('فایل پیدا نشد');

  const stat = fs.statSync(full);
  const type = mimeFor(full);
  const download = req.query.dl === '1';

  res.setHeader('Content-Type', type);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, max-age=86400');
  if (download) {
    const name = String(req.query.name || path.basename(full)).replace(/["\\\r\n]/g, '_');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name)}`);
  } else {
    res.setHeader('Content-Disposition', 'inline');
  }

  const range = req.headers.range;
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    if (m) {
      let start = m[1] ? parseInt(m[1], 10) : 0;
      let end = m[2] ? parseInt(m[2], 10) : stat.size - 1;
      if (isNaN(start) || start < 0) start = 0;
      if (isNaN(end) || end > stat.size - 1) end = stat.size - 1;
      if (start > end) { res.status(416).setHeader('Content-Range', `bytes */${stat.size}`); return res.end(); }

      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
      res.setHeader('Content-Length', end - start + 1);
      return fs.createReadStream(full, { start, end }).pipe(res);
    }
  }

  res.setHeader('Content-Length', stat.size);
  fs.createReadStream(full).pipe(res);
});

module.exports = router;
