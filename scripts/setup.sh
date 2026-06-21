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
command -v docker >/dev/null 2>&1 || { log_error "Docker is required"; exit 1; }

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
  log_warn "Review and update .env before starting services"
else
  log_info ".env already exists, skipping"
fi

# Create required directories
mkdir -p generated/{images,audio,subtitles,videos,thumbnails}
mkdir -p models/{piper,whisper}
mkdir -p logs
mkdir -p prompts/comfyui
mkdir -p docker/postgres/data
mkdir -p docker/redis/data

# Create .gitkeep files
touch generated/.gitkeep
touch models/.gitkeep
log_info "Directory structure created ✓"

# Install dependencies
log_info "Installing npm workspaces..."
npm install
log_info "Dependencies installed ✓"

# Start infrastructure
log_info "Starting infrastructure services (postgres, redis, ollama, comfyui)..."
docker compose -f docker-compose.dev.yml up -d postgres redis

# Wait for postgres
log_info "Waiting for PostgreSQL to be ready..."
RETRIES=30
while ! docker compose -f docker-compose.dev.yml exec postgres \
  pg_isready -U storyforge -d storyforge_db >/dev/null 2>&1; do
  RETRIES=$((RETRIES - 1))
  if [[ $RETRIES -le 0 ]]; then
    log_error "PostgreSQL failed to start"
    exit 1
  fi
  sleep 2
done
log_info "PostgreSQL ready ✓"

# Run database migrations
log_info "Running Prisma migrations..."
npm run db:generate --workspace=packages/database
DATABASE_URL="postgresql://storyforge:storyforge_password@localhost:5432/storyforge_db" \
  npm run db:migrate --workspace=packages/database
log_info "Database migrations complete ✓"

# Build packages
log_info "Building shared packages..."
npm run build --workspace=packages/shared
npm run build --workspace=packages/database
log_info "Packages built ✓"

log_info ""
log_info "=== Setup Complete! ==="
log_info ""
log_info "Next steps:"
log_info "  1. Start Ollama and pull models:"
log_info "     docker compose -f docker-compose.dev.yml up -d ollama"
log_info "     docker exec -it storyforge-ai-ollama-1 ollama pull qwen3:8b"
log_info "     docker exec -it storyforge-ai-ollama-1 ollama pull llama3:8b"
log_info ""
log_info "  2. Start the API server:"
log_info "     npm run dev --workspace=apps/api"
log_info ""
log_info "  3. Visit:"
log_info "     API:    http://localhost:3000/health"
log_info "     Docs:   http://localhost:3000/docs"
log_info "     Adminer: http://localhost:8080"
log_info "     Redis:  http://localhost:8081"
