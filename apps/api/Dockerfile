# =============================================================================
# StoryForge AI — API Dockerfile
# Multi-stage build: node (deps/build) + python (edge-tts/faster-whisper) +
# ffmpeg, assembled into a slim, non-root, stateless runtime image.
#
# Node 22+ is required (not just the >=20.0.0 in package.json engines) —
# @supabase/supabase-js's storage/realtime client needs native WebSocket,
# which doesn't exist in Node 20. Confirmed by a failing storage health
# check on node:20-slim during verification; fixed by moving to node:22-slim.
# =============================================================================

FROM node:22-slim AS base
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# -----------------------------------------------
# deps: install node_modules for every workspace the API actually needs
# (apps/api, packages/*, services/*) — deliberately excludes apps/web.
FROM base AS deps
COPY package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/database/package.json ./packages/database/
COPY apps/api/package.json ./apps/api/
COPY services/analytics-agent/package.json ./services/analytics-agent/
COPY services/image-agent/package.json ./services/image-agent/
COPY services/narration-agent/package.json ./services/narration-agent/
COPY services/prompt-agent/package.json ./services/prompt-agent/
COPY services/seo-agent/package.json ./services/seo-agent/
COPY services/story-agent/package.json ./services/story-agent/
COPY services/subtitle-agent/package.json ./services/subtitle-agent/
COPY services/upload-agent/package.json ./services/upload-agent/
COPY services/video-agent/package.json ./services/video-agent/
RUN npm install --ignore-scripts \
    --workspace=apps/api \
    --workspace=packages/shared \
    --workspace=packages/database \
    --workspace=services/analytics-agent \
    --workspace=services/image-agent \
    --workspace=services/narration-agent \
    --workspace=services/prompt-agent \
    --workspace=services/seo-agent \
    --workspace=services/story-agent \
    --workspace=services/subtitle-agent \
    --workspace=services/upload-agent \
    --workspace=services/video-agent

# -----------------------------------------------
# python-deps: independent lineage — edge-tts + faster-whisper in a venv.
# Never shares layers with the node stages, so it rebuilds only when
# requirements.txt changes.
FROM node:22-slim AS python-deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-venv python3-pip \
    && rm -rf /var/lib/apt/lists/* \
    && python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# -----------------------------------------------
# builder: full source, build in dependency order via turbo, then prune
# devDependencies before anything gets copied into the production image.
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run db:generate --workspace=packages/database
RUN npx turbo run build --filter=@storyforge/api...
RUN npm prune --omit=dev \
    # npm workspaces' prune doesn't reliably drop devDependencies declared
    # inside a workspace's own package.json (only root-level ones) — these
    # two are confirmed (via package-lock.json) to have no production-dependency
    # edges anywhere, so they're safe to remove explicitly.
    && rm -rf node_modules/typescript node_modules/prisma

# -----------------------------------------------
# production: fresh minimal base — only runtime system packages, no
# build tooling (pip/venv/turbo/typescript never enter this layer).
FROM node:22-slim AS production
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg fontconfig fonts-dejavu-core python3 curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 --ingroup nodejs storyforge

WORKDIR /app

COPY --from=python-deps /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY --from=builder --chown=storyforge:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=storyforge:nodejs /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder --chown=storyforge:nodejs /app/packages/shared/package.json ./packages/shared/
COPY --from=builder --chown=storyforge:nodejs /app/packages/database/dist ./packages/database/dist
COPY --from=builder --chown=storyforge:nodejs /app/packages/database/prisma ./packages/database/prisma
COPY --from=builder --chown=storyforge:nodejs /app/packages/database/package.json ./packages/database/
COPY --from=builder --chown=storyforge:nodejs /app/services/analytics-agent/dist ./services/analytics-agent/dist
COPY --from=builder --chown=storyforge:nodejs /app/services/analytics-agent/package.json ./services/analytics-agent/
COPY --from=builder --chown=storyforge:nodejs /app/services/image-agent/dist ./services/image-agent/dist
COPY --from=builder --chown=storyforge:nodejs /app/services/image-agent/package.json ./services/image-agent/
COPY --from=builder --chown=storyforge:nodejs /app/services/narration-agent/dist ./services/narration-agent/dist
COPY --from=builder --chown=storyforge:nodejs /app/services/narration-agent/package.json ./services/narration-agent/
COPY --from=builder --chown=storyforge:nodejs /app/services/narration-agent/scripts ./services/narration-agent/scripts
COPY --from=builder --chown=storyforge:nodejs /app/services/prompt-agent/dist ./services/prompt-agent/dist
COPY --from=builder --chown=storyforge:nodejs /app/services/prompt-agent/package.json ./services/prompt-agent/
COPY --from=builder --chown=storyforge:nodejs /app/services/seo-agent/dist ./services/seo-agent/dist
COPY --from=builder --chown=storyforge:nodejs /app/services/seo-agent/package.json ./services/seo-agent/
COPY --from=builder --chown=storyforge:nodejs /app/services/story-agent/dist ./services/story-agent/dist
COPY --from=builder --chown=storyforge:nodejs /app/services/story-agent/package.json ./services/story-agent/
COPY --from=builder --chown=storyforge:nodejs /app/services/subtitle-agent/dist ./services/subtitle-agent/dist
COPY --from=builder --chown=storyforge:nodejs /app/services/subtitle-agent/package.json ./services/subtitle-agent/
COPY --from=builder --chown=storyforge:nodejs /app/services/subtitle-agent/scripts ./services/subtitle-agent/scripts
COPY --from=builder --chown=storyforge:nodejs /app/services/upload-agent/dist ./services/upload-agent/dist
COPY --from=builder --chown=storyforge:nodejs /app/services/upload-agent/package.json ./services/upload-agent/
COPY --from=builder --chown=storyforge:nodejs /app/services/video-agent/dist ./services/video-agent/dist
COPY --from=builder --chown=storyforge:nodejs /app/services/video-agent/package.json ./services/video-agent/
COPY --from=builder --chown=storyforge:nodejs /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=storyforge:nodejs /app/apps/api/package.json ./apps/api/

# Stateless container — per-story media is staged here only transiently
# (uploaded to Supabase then deleted), logs are console + a tmp path.
# Every agent builds its paths as join(process.cwd(), STORAGE_LOCAL_PATH, ...)
# (see e.g. image-agent.service.ts), which only works correctly for a
# *relative* STORAGE_LOCAL_PATH — join() doesn't special-case an absolute
# value unless it's the first argument. So instead of pointing the env var
# at /tmp directly (which breaks that join into a bogus nested path and a
# malformed Supabase upload key), keep STORAGE_LOCAL_PATH/LOG_DIR at their
# relative defaults ('./generated', 'cwd/logs') and symlink those relative
# locations to /tmp — zero code changes, still fully stateless.
#
# The symlinks themselves are created at build time (they live under /app,
# not /tmp, so they survive fine), but the actual target directories under
# /tmp/storyforge are NOT created here — many hosts (Render included) mount
# a fresh, empty tmpfs at /tmp when the container *starts*, which discards
# anything written under /tmp during the image build. Creating them here
# would leave a dangling symlink at runtime (confirmed locally by reproducing
# with `docker run --tmpfs /tmp`: mkdir fails with
# "ENOTDIR: not a directory, mkdir '/app/apps/api/generated'"). The real
# mkdir happens in CMD below, every time the container actually starts.
RUN ln -s /tmp/storyforge/generated /app/apps/api/generated \
    && ln -s /tmp/storyforge/logs /app/apps/api/logs

# `adduser --system` gives storyforge no real home dir (HOME=/nonexistent on
# Debian), which breaks faster-whisper: it caches its downloaded model under
# $HOME/.cache/huggingface and crashes with EACCES writing to /nonexistent.
# Point HOME at the same writable tmp tree — this also means the model
# downloads once per container lifetime rather than on every transcription.
ENV HOME=/tmp/storyforge

# Absolute paths (not the bare 'ffmpeg'/'ffprobe' sentinel defaults) so
# video-agent.service.ts uses the system ffmpeg installed above instead of
# falling back to the bundled ffmpeg-static/ffprobe-static npm packages.
ENV FFMPEG_BINARY_PATH=/usr/bin/ffmpeg
ENV FFPROBE_BINARY_PATH=/usr/bin/ffprobe

USER storyforge

WORKDIR /app/apps/api

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:3000/health/live || exit 1

# mkdir (not just relying on the build-time symlink target) because /tmp may
# be a fresh empty mount at container start on the actual host — see the
# comment above the symlink RUN step for why.
CMD ["sh", "-c", "mkdir -p /tmp/storyforge/generated /tmp/storyforge/logs && exec node dist/index.js"]
