'use strict';
/**
 * Express 4 به‌طور خودکار خطاهای پرتاب‌شده در هندلرهای async را نمی‌گیرد؛
 * این پوشش (wrapper) همه‌ی هندلرها را امن می‌کند تا خطاها به errorHandler برسند
 * و کد وضعیت درست (مثل ۴۰۰/۴۰۳/۴۰۹) حفظ شود.
 */
function wrap(fn) {
  // میدل‌ور مدیریت خطا (۴ آرگومان) دست‌نخورده می‌ماند
  if (fn.length === 4) return fn;

  if (fn.constructor && fn.constructor.name === 'AsyncFunction') {
    // هندلر ناهمگام → خطا را به next می‌سپاریم تا errorHandler کد وضعیت را درست بدهد
    switch (fn.length) {
      case 3: return (req, res, next) => fn(req, res, next).catch(next);
      case 2: return (req, res, next) => fn(req, res).catch(next);
      case 1: return (req, res, next) => fn(req).catch(next);
      default: return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
    }
  }

  // هندلر همگام که ممکن است خطا پرتاب کند
  switch (fn.length) {
    case 3: return function (req, res, next) {
      try {
        const out = fn(req, res, next);
        if (out && typeof out.then === 'function') out.catch(next);
      } catch (err) { next(err); }
    };
    case 2: return function (req, res, next) {
      try {
        const out = fn(req, res);
        if (out && typeof out.then === 'function') out.catch(next);
      } catch (err) { next(err); }
    };
    case 1: return function (req, res, next) {
      try {
        const out = fn(req);
        if (out && typeof out.then === 'function') out.catch(next);
      } catch (err) { next(err); }
    };
    default: return function (req, res, next) {
      try {
        const out = fn(req, res, next);
        if (out && typeof out.then === 'function') out.catch(next);
      } catch (err) { next(err); }
    };
  }
}

/** پیاده‌سازی ایمن روی یک نمونه‌ی روتر — همه‌ی هندلرها به‌صورت خودکار پوشش داده می‌شوند */
function patch(router) {
  const methods = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'all'];
  for (const m of methods) {
    const original = router[m].bind(router);
    router[m] = function (path, ...handlers) {
      return original(path, ...handlers.map((h) => (typeof h === 'function' ? wrap(h) : h)));
    };
  }
  return router;
}

module.exports = { wrap, patch };
