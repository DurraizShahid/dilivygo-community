FROM node:20-alpine

# Security: run as non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S dilivygo -u 1001

WORKDIR /app

# Install backend dependencies (Turborepo: apps/server)
# NOTE: apps/server is built as a standalone Node app in Docker. Its package-lock.json
# is a standalone lockfile (NOT the monorepo root lock). Regenerate with:
#   npm run lock:server   (from repo root)
# --legacy-peer-deps matches the repo root .npmrc the lockfile was generated against,
# otherwise npm10+ tries to auto-install peer deps (react via resend's @react-email/render)
# that aren't in the lockfile and fails with "Missing: react from lock file".
COPY apps/server/package*.json ./apps/server/
RUN cd apps/server && npm ci --omit=dev --legacy-peer-deps

# Copy backend source and shared runtime integration catalog.
# integration-connections.service.js resolves ../../../integrations/catalog.json
# from /app/apps/server/services, so the catalog must exist at /app/integrations.
COPY --chown=dilivygo:nodejs apps/server ./apps/server
COPY --chown=dilivygo:nodejs integrations ./integrations
# Shared pure color helpers used by onboarding finalization (no package install).
COPY --chown=dilivygo:nodejs packages/types/src/onboarding-branding.js ./packages/types/src/onboarding-branding.js

# npm ci ran as root; ensure app dir is writable for runtime mkdir (e.g. data/uploads/platform-logos)
RUN chown -R dilivygo:nodejs /app/apps/server

# Run from server dir so __dirname and cwd match local dev (e.g. dotenv ../.env, migrations)
WORKDIR /app/apps/server

USER dilivygo

EXPOSE 8080

ENV NODE_ENV=production
ENV PORT=8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/api/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

CMD ["node", "index.js"]
