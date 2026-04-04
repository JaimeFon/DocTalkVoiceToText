# ── Build ─────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .
RUN npm run build

# ── Production ────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# Copiar dependencias de producción
COPY package.json ./
RUN npm install --omit=dev

# Copiar artefactos de build y servidor custom
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/server.js ./
COPY --from=builder /app/next.config.ts ./

USER nextjs

EXPOSE 3000
ENV PORT=3000

CMD ["node", "server.js"]
