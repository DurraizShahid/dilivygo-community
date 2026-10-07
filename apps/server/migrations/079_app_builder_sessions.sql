-- Migration: 079_app_builder_sessions
--
-- Long-lived session tokens used by the Electron `app-builder` dev-launcher to
-- authenticate against `/api/saas/*` without embedding Clerk's JS runtime in
-- Electron (Clerk access tokens expire every 60s, which is brittle for a
-- desktop dev tool running for hours).
--
-- Flow:
--   1. Operator clicks "Sign in" in Electron, which opens the system browser to
--      `https://app.<apex>/app-builder/authorize?state=<nonce>`.
--   2. That Next.js page is Clerk-protected. When signed in, it calls
--      `POST /api/app-builder/sessions` (Clerk bearer) which inserts a row into
--      this table and returns a freshly generated token (stored hashed).
--   3. The page redirects to `dilivygo-app-builder://auth?token=<token>&state=<nonce>`.
--   4. Electron captures the deep link, validates the state nonce, and persists
--      the token in `electron-store`.
--   5. All subsequent Electron → `/api/saas/*` calls use
--      `Authorization: Bearer <token>`. `verifyAppBuilderSession` looks up the
--      row by `token_hash` and sets `req.clerkUserId` + `req.saasOrganizationId`
--      identically to the Clerk path.
--
-- Tokens are stored hashed (SHA-256 hex) so a DB leak cannot be replayed
-- against the API directly. A row is considered valid while
-- `expires_at > now()` and `revoked_at IS NULL`.

CREATE TABLE IF NOT EXISTS app_builder_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash TEXT NOT NULL,
  clerk_user_id TEXT NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_agent TEXT,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  CONSTRAINT app_builder_sessions_token_hash_uq UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS app_builder_sessions_user_org_idx
  ON app_builder_sessions (clerk_user_id, organization_id);

CREATE INDEX IF NOT EXISTS app_builder_sessions_expires_at_idx
  ON app_builder_sessions (expires_at);

COMMENT ON TABLE app_builder_sessions IS
  'Long-lived session tokens (hashed) used by the Electron app-builder dev '
  'launcher to authenticate against /api/saas/* as an organization member.';
