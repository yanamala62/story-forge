#!/usr/bin/env bash
# =============================================================================
# StoryForge AI — Initial Setup Script
# Run once after cloning the repository
# =============================================================================

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

log_info "=== StoryForge AI Setup ==="

# Check prerequisites
command -v node >/dev/null 2>&1 || { log_error "Node.js is required (>=20)"; exit 1; }
command -v npm  >/dev/null 2>&1 || { log_error "npm is required"; exit 1; }
command -v ffmpeg >/dev/null 2>&1 || log_warn "ffmpeg not found on PATH — required for video composition. Install it and set FFMPEG_BINARY_PATH/FFPROBE_BINARY_PATH in .env if it's not auto-detected."
command -v python3 >/dev/null 2>&1 || command -v python >/dev/null 2>&1 || log_warn "Python 3 not found on PATH — required for narration (edge-tts) and subtitles (faster-whisper). See requirements.txt."

NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [[ "$NODE_VERSION" -lt 20 ]]; then
  log_error "Node.js 20+ required (found v${NODE_VERSION})"
  exit 1
fi

log_info "Node.js $(node --version) ✓"
log_info "npm $(npm --version) ✓"

# Copy environment file
if [[ ! -f .env ]]; then
  cp .env.example .env
  log_info ".env created from .env.example"
  log_warn "Fill in .env before continuing: DATABASE_URL/DIRECT_URL and SUPABASE_* (Supabase project), OPENROUTER_API_KEY (openrouter.ai/keys), YOUTUBE_* (Google Cloud OAuth) if you want uploads."
else
  log_info ".env already exists, skipping"
fi

# Install Python dependencies (edge-tts, faster-whisper)
if command -v pip3 >/dev/null 2>&1 || command -v pip >/dev/null 2>&1; then
  log_info "Installing Python dependencies..."
  (command -v pip3 >/dev/null 2>&1 && pip3 install -r requirements.txt) || pip install -r requirements.txt
  log_info "Python dependencies installed ✓"
else
  log_warn "pip not found — install requirements.txt manually before running narration/subtitles."
fi

# Install npm dependencies
log_info "Installing npm workspaces..."
npm install
log_info "Dependencies installed ✓"

# Push the Prisma schema to Supabase and seed the system user
log_info "Syncing database schema (Supabase)..."
npm run db:generate --workspace=packages/database
node scripts/db-setup.cjs

# Build shared packages
log_info "Building shared packages..."
npm run build --workspace=packages/shared
npm run build --workspace=packages/database
log_info "Packages built ✓"

log_info ""
log_info "=== Setup Complete! ==="
log_info ""
log_info "Next steps:"
log_info "  1. Start the API + web dev servers:"
log_info "     npm run dev"
log_info ""
log_info "  2. Visit:"
log_info "     API:  http://localhost:3000/health"
log_info "     Docs: http://localhost:3000/docs"
log_info "     Web:  http://localhost:5173"
log_info ""
log_info "To build the production backend image: npm run docker:build"
