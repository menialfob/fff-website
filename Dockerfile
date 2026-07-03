# ---- Install dependencies ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# postinstall runs `prisma generate`, which needs the schema
COPY prisma ./prisma
RUN npm ci

# ---- Build ----
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Build never connects to the database; all data pages are dynamic.
ENV DATABASE_URL="file:./build.db"
RUN npm run build

# ---- Prisma CLI (for running migrations at container start) ----
# The CLI has a deep dependency tree that Next's standalone tracing doesn't
# cover, so it gets its own isolated node_modules, pinned to the lockfile
# version. Engine binaries are downloaded by its postinstall script.
FROM node:22-alpine AS prisma-cli
WORKDIR /cli
COPY package-lock.json ./
RUN npm install --no-save --omit=dev \
      prisma@$(node -p "require('./package-lock.json').packages['node_modules/prisma'].version") \
    && rm -f package.json package-lock.json

# ---- Runtime ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATABASE_URL="file:/data/db/app.db" \
    UPLOAD_DIR="/data/uploads"

RUN addgroup -S nodejs -g 1001 && adduser -S nextjs -u 1001 -G nodejs \
    && mkdir -p /data/db /data/uploads \
    && chown -R nextjs:nodejs /data

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=prisma-cli /cli/node_modules ./cli/node_modules
# bcryptjs is bundled into the server build but not traced as a loose
# package; bootstrap-admin.mjs needs it at runtime
COPY --from=builder /app/node_modules/bcryptjs ./node_modules/bcryptjs
COPY scripts/bootstrap-admin.mjs ./scripts/bootstrap-admin.mjs
COPY scripts/set-admin.mjs ./scripts/set-admin.mjs
COPY --chmod=755 docker-entrypoint.sh ./

USER nextjs
EXPOSE 3000
VOLUME /data
ENTRYPOINT ["./docker-entrypoint.sh"]
