# =============================================================================
# StoryForge AI — API Dockerfile
# Multi-stage build for minimal production image
# =============================================================================

FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat curl
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# -----------------------------------------------
FROM base AS deps
COPY package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/database/package.json ./packages/database/
COPY apps/api/package.json ./apps/api/
RUN npm install --workspace=apps/api --workspace=packages/shared --workspace=packages/database --ignore-scripts

# -----------------------------------------------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build --workspace=packages/shared
RUN npm run db:generate --workspace=packages/database
RUN npm run build --workspace=packages/database
RUN npm run build --workspace=apps/api

# -----------------------------------------------
FROM base AS production
ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 storyforge

COPY --from=builder --chown=storyforge:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=storyforge:nodejs /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder --chown=storyforge:nodejs /app/packages/database/dist ./packages/database/dist
COPY --from=builder --chown=storyforge:nodejs /app/packages/database/prisma ./packages/database/prisma
COPY --from=builder --chown=storyforge:nodejs /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=storyforge:nodejs /app/apps/api/package.json ./apps/api/

# Create required directories
RUN mkdir -p /app/generated /app/logs && chown -R storyforge:nodejs /app/generated /app/logs

USER storyforge

WORKDIR /app/apps/api

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:3000/health/live || exit 1

CMD ["node", "dist/index.js"]
