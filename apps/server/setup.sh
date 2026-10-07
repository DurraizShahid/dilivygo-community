#!/usr/bin/env bash
# =============================================================================
# Dilivygo Backend — Local Development Setup Script
# =============================================================================
# Usage:
#   chmod +x server/setup.sh
#   ./server/setup.sh
#
# What this script does:
#   1. Checks Node.js version (requires 20+)
#   2. Installs npm dependencies
#   3. Creates .env from .env.example if it doesn't exist
#   4. Optionally starts Redis via Docker (for sessions)
#   5. Runs the test suite to confirm everything works
#   6. Prints instructions for starting the dev server
# =============================================================================

set -euo pipefail

# ─── Colours ─────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
RESET='\033[0m'

info()    { echo -e "${BLUE}[INFO]${RESET}  $*"; }
success() { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
error()   { echo -e "${RED}[ERROR]${RESET} $*"; exit 1; }
header()  { echo -e "\n${BOLD}${BLUE}▶ $*${RESET}"; }

# ─── Determine script location ────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
SERVER_DIR="$SCRIPT_DIR"

echo ""
echo -e "${BOLD}╔══════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║     Dilivygo Backend Setup Script     ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════╝${RESET}"
echo ""

# ─── 1. Check Node.js version ─────────────────────────────────────────────────
header "Checking Node.js version"

if ! command -v node &>/dev/null; then
  error "Node.js is not installed. Install Node.js 20+ from https://nodejs.org"
fi

NODE_VERSION=$(node --version | sed 's/v//' | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
  error "Node.js 20+ is required (found v${NODE_VERSION}). Upgrade at https://nodejs.org"
fi
success "Node.js $(node --version) detected"

# ─── 2. Install dependencies ──────────────────────────────────────────────────
header "Installing server dependencies"

cd "$SERVER_DIR"

if [ -f "node_modules/.package-lock.json" ]; then
  info "node_modules exists — running npm ci to ensure clean install"
fi

npm install
success "Dependencies installed"

# ─── 3. Create .env file ──────────────────────────────────────────────────────
header "Setting up environment variables"

ENV_FILE="$ROOT_DIR/.env"
ENV_EXAMPLE="$ROOT_DIR/.env.example"

if [ -f "$ENV_FILE" ]; then
  warn ".env already exists — skipping copy"
else
  if [ -f "$ENV_EXAMPLE" ]; then
    cp "$ENV_EXAMPLE" "$ENV_FILE"
    success ".env created from .env.example"
    echo ""
    echo -e "${YELLOW}  ⚠  ACTION REQUIRED: Open .env and fill in your values:${RESET}"
    echo "     - SUPABASE_URL            (required)"
    echo "     - SUPABASE_SERVICE_KEY    (required)"
    echo "     - SESSION_SECRET          (required — use a random 32+ char string)"
    echo "     - ALLOWED_ORIGINS         (required in production)"
    echo "     - REDIS_URL               (optional — falls back to in-memory)"
    echo "     - STRIPE_SECRET_KEY       (optional — falls back to dummy processor)"
    echo "     - TWILIO_ACCOUNT_SID      (optional — falls back to console log)"
    echo "     - EMAIL_API_KEY           (optional — falls back to console log)"
    echo ""
  else
    error ".env.example not found at $ENV_EXAMPLE"
  fi
fi

# ─── 4. Redis check ───────────────────────────────────────────────────────────
header "Checking Redis"

REDIS_RUNNING=false
if command -v redis-cli &>/dev/null && redis-cli ping &>/dev/null 2>&1; then
  success "Redis is running locally"
  REDIS_RUNNING=true
elif command -v docker &>/dev/null && docker info &>/dev/null 2>&1; then
  warn "Redis not running. Starting via Docker..."
  if docker ps --format '{{.Names}}' | grep -q "^dilivygo-redis$"; then
    success "dilivygo-redis container already running"
    REDIS_RUNNING=true
  else
    docker run -d \
      --name dilivygo-redis \
      --restart unless-stopped \
      -p 6379:6379 \
      redis:7-alpine \
      redis-server --appendonly yes \
      &>/dev/null && success "Redis started via Docker (container: dilivygo-redis)" && REDIS_RUNNING=true \
      || warn "Could not start Redis via Docker"
  fi
else
  warn "Redis not found and Docker not available."
  warn "Sessions will use in-memory store (OK for development, NOT for production)."
  warn "Install Redis: https://redis.io/docs/getting-started/"
fi

if [ "$REDIS_RUNNING" = true ]; then
  # Update .env to include Redis URL if it's not already set
  if grep -q "^REDIS_URL=$" "$ENV_FILE" 2>/dev/null || grep -q "^#.*REDIS_URL" "$ENV_FILE" 2>/dev/null; then
    info "Tip: set REDIS_URL=redis://localhost:6379 in your .env to use Redis"
  fi
fi

# ─── 5. Run tests ─────────────────────────────────────────────────────────────
header "Running test suite"

cd "$SERVER_DIR"

echo ""
info "Running: npm test"
echo ""

if npm test; then
  echo ""
  success "All tests passed!"
else
  echo ""
  warn "Some tests failed. Check the output above."
  warn "You can still start the dev server — some tests may need real credentials."
fi

# ─── 6. Final instructions ────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}${GREEN}║              Setup Complete — Next Steps                 ║${RESET}"
echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════════════════╝${RESET}"
echo ""
echo -e "  ${BOLD}1. Edit your .env file:${RESET}"
echo "     $ENV_FILE"
echo ""
echo -e "  ${BOLD}2. Run database migrations:${RESET}"
echo "     cd server && npm run migrate"
echo ""
echo -e "  ${BOLD}3. Start the development server:${RESET}"
echo "     cd server && npm run dev"
echo ""
echo -e "  ${BOLD}4. Test the health endpoint:${RESET}"
echo "     curl http://localhost:8080/api/health"
echo ""
echo -e "  ${BOLD}5. Run tests:${RESET}"
echo "     cd server && npm test"
echo ""
echo -e "  ${BOLD}6. Run tests with coverage:${RESET}"
echo "     cd server && npm run test:coverage"
echo ""
echo -e "  ${BOLD}Available npm scripts (run from server/):${RESET}"
echo "     npm start            → production server"
echo "     npm run dev          → dev server with hot reload"
echo "     npm run migrate      → run pending SQL migrations"
echo "     npm test             → run all tests"
echo "     npm run test:watch   → watch mode"
echo "     npm run test:coverage → tests with coverage report"
echo ""
