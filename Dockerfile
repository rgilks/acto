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
COPY package.json package-lock.json* tsconfig.json next.config.js* middleware.ts* ./

COPY app ./app
COPY lib ./lib
COPY public ./public
COPY hooks ./hooks
COPY types ./types

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
RUN chown -R nextjs:nodejs /app/.next

USER nextjs
EXPOSE 3000
ENV PORT 3000
ENV HOSTNAME "0.0.0.0"
# Assuming server.js is part of the standalone output
CMD ["node", "server.js"]
