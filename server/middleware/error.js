'use strict';
/** مدیریت خطاهای سراسری */

function notFound(_req, res) {
  res.status(404).json({ error: 'مسیر پیدا نشد' });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, _req, res, _next) {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error('💥 Server error:', err);
  res.status(status).json({
    error: err.publicMessage || (status >= 500 ? 'خطای داخلی سرور' : err.message),
  });
}

/** خطای HTTP قابل کنترل */
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.publicMessage = message;
  }
}

module.exports = { notFound, errorHandler, HttpError };
