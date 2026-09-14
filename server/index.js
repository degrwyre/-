'use strict';
/**
 * 🚀 نقطه‌ی شروع سرور پیام‌رسان
 * اجرا: npm start
 */
const http = require('http');
const app = require('./app');
const config = require('./config');
const { initSocket } = require('./socket');
const db = require('./db');

const server = http.createServer(app);
initSocket(server);

server.listen(config.PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  ┌─────────────────────────────────────────────┐');
  console.log(`  │   ${config.APP_NAME.padEnd(41)} │`);
  console.log('  ├─────────────────────────────────────────────┤');
  console.log(`  │   🌐  http://0.0.0.0:${String(config.PORT).padEnd(24)}│`);
  console.log(`  │   🗄️   DB: ${config.DB_FILE.slice(-30).padEnd(32)}│`);
  console.log(`  │   📁  Uploads: ${config.UPLOAD_DIR.slice(-26).padEnd(26)}│`);
  console.log(`  │   ⚙️   Env: ${config.NODE_ENV.padEnd(32)}│`);
  console.log('  └─────────────────────────────────────────────┘');
  console.log('');
});

/* ------------------------- خروج تمیز از برنامه ------------------------- */
function shutdown(signal) {
  console.log(`\n${signal} دریافت شد — در حال بستن سرور...`);
  server.close(() => {
    try { db.close(); } catch {}
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 8000).unref();
}
['SIGINT', 'SIGTERM'].forEach((s) => process.on(s, () => shutdown(s)));

process.on('unhandledRejection', (r) => console.error('Unhandled rejection:', r));
process.on('uncaughtException', (e) => { console.error('Uncaught exception:', e); });

module.exports = server;
