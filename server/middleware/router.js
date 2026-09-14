'use strict';
/**
 * کارخانه‌ی ساخت روتر: یک express.Router می‌سازد که همه‌ی هندلرهایش
 * به‌طور خودکار در برابر خطاهای همگام و ناهمگام (async/await) محافظت‌شده‌اند.
 *
 * استفاده:  const router = require('../middleware/router')();
 */
const express = require('express');
const { patch } = require('./asyncWrap');

module.exports = function createRouter(options) {
  return patch(express.Router(options));
};
