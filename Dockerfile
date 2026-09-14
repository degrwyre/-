# syntax=docker/dockerfile:1
# ==========================================================================
# ایمیج production پیام‌رسان — سبک و دو مرحله‌ای
# نکته: better-sqlite3 نیاز به بیلد دارد، پس مرحله‌ی builder جدا شده است.
# ==========================================================================

# ------------------------- مرحله ۱: ساخت وابستگی‌ها -------------------------
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# ابزارهای لازم برای کامپایل ماژول‌های native
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

# ------------------------- مرحله ۲: ایمیج نهایی -------------------------
FROM node:20-bookworm-slim AS runner

WORKDIR /app
ENV NODE_ENV=production

# کاربر غیر-root برای امنیت بیشتر
RUN groupadd --system --gid 1001 app \
    && useradd --system --uid 1001 --gid app app \
    && mkdir -p /data/uploads \
    && chown -R app:app /data /app

COPY --from=builder --chown=app:app /app/node_modules ./node_modules
COPY --chown=app:app package.json ./
COPY --chown=app:app server ./server
COPY --chown=app:app scripts ./scripts

USER app

# متغیرهای پیش‌فرض (در Railway بازنویسی می‌شوند)
ENV PORT=3000 \
    DATA_DIR=/data \
    DB_FILE=/data/rohamgram.db \
    UPLOAD_DIR=/data/uploads

EXPOSE 3000

# Railway از این مسیر برای بررسی سلامت سرویس استفاده می‌کند
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "server/index.js"]
