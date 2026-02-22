FROM node:22.14-alpine AS builder
WORKDIR /app

ENV MODERATE_PROMPTS=false \
  TELEGRAM_BOT_TOKEN="" \
  TELEGRAM_CHAT_ID="" \
  ENABLE_TELEGRAM_NOTIFICATIONS=false \
  OPENAI_MODERATION_API_KEY="" \
  EMBEDDINGS_OPENROUTER_API_KEY="" \
  SECRET_KEY="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef" \
  DATABASE_URL="/tmp/sapin-build.db" \
  FILES_STORAGE_PATH="/tmp/files/uploads"

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22.14-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000

RUN addgroup -S nodejs && adduser -S sapin -G nodejs

COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/build ./build
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/src/lib/server/db/schema ./src/lib/server/db/schema
COPY --from=builder /app/scripts/docker-entrypoint.sh ./scripts/docker-entrypoint.sh

RUN mkdir -p /data/files/uploads \
    && chmod +x /app/scripts/docker-entrypoint.sh \
    && chown -R sapin:nodejs /app /data

USER sapin

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/analytics/config').then((res) => process.exit(res.ok ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]
