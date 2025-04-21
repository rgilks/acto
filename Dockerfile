FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY tsconfig.json next.config.js* middleware.ts* ./

# === Additions for Cache ===
ARG NEXT_CACHE_DIR
# Copy cache from host if NEXT_CACHE_DIR is set (i.e., cache hit occurred)
# This creates the target dir and copies only if the source exists/arg is non-empty.
RUN if [ -n "${NEXT_CACHE_DIR}" ] && [ -d "${NEXT_CACHE_DIR}" ]; then \
    echo "Copying Next.js cache from host: ${NEXT_CACHE_DIR}"; \
    mkdir -p .next && cp -a "${NEXT_CACHE_DIR}" .next/; \
    else \
    echo "No Next.js cache hit or cache directory not found/specified."; \
    fi
# === End Additions ===

COPY . .
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --chown=nextjs:nodejs entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh
USER nextjs
EXPOSE 3000
ENV PORT 3000
ENV HOSTNAME "0.0.0.0"
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["node", "server.js"]
