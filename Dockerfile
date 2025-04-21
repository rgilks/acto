FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-alpine AS runner
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

WORKDIR /app
COPY --from=builder --chown=nextjs:nodejs /app/package.json /app/package-lock.json ./

RUN npm ci --omit=dev

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Ensure the data directory exists and is owned by the nextjs user
RUN mkdir -p /data && chown -R nextjs:nodejs /data

USER nextjs

ENV NODE_ENV=production
EXPOSE 3000
ENTRYPOINT ["node", "server.js"]
