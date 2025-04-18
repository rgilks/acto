FROM node:18-alpine AS base

# Install system dependencies
RUN apk add --no-cache ca-certificates fuse3 sqlite

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Copy package files first for better caching
COPY package.json package-lock.json* ./
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app

# Add build argument for NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Add build argument for Node version
ARG NODE_VERSION
ENV NODE_VERSION=$NODE_VERSION

COPY --from=deps /app/node_modules ./node_modules
# Copy everything instead of individual directories
COPY . .

# Next.js collects completely anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
# Uncomment the following line in case you want to disable telemetry during the build.
ENV NEXT_TELEMETRY_DISABLED 1

# Create public directory if it doesn't exist
RUN mkdir -p public

RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy LiteFS binary
COPY --from=flyio/litefs:0.5 /usr/local/bin/litefs /usr/local/bin/litefs

# Create public directory in runner if it doesn't exist
RUN mkdir -p public
COPY --from=builder /app/public ./public

# Set the correct permission for prerender cache
RUN mkdir -p .next
RUN chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy the LiteFS config file
COPY --from=builder --chown=nextjs:nodejs /app/litefs.yml ./litefs.yml

# Create directory for SQLite database
RUN mkdir -p /litefs && chown nextjs:nodejs /litefs
RUN mkdir -p /data && chown nextjs:nodejs /data

USER nextjs

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

# ENTRYPOINT runs the Next.js app directly
ENTRYPOINT ["node", "/app/server.js"]
