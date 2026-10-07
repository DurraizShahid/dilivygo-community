-- Migration: 120_pos_hardware_print_jobs
--
-- Phase 12 (POS hardware & local device integration layer — local ONLY).
-- Persists the server-side job ledger defined in
-- `apps/server/services/pos-hardware.js` (`createPrintJobLedger`) plus a
-- per-shop device registry. No device I/O happens server-side; rows here are
-- assignments/intents consumed by the desktop shell queue
-- (`apps/pos-desktop/pos-hardware-drivers.js`).
--
-- Tables:
-- 1. `pos_hardware_devices`: registered local devices per shop
--    (printer | drawer | scanner | terminal). `connection` holds ONLY
--    non-secret addressing (USB id, LAN host/port, OS printer name) —
--    never credentials or keys. `is_mock` defaults TRUE until real hardware
--    is configured (no fake success: mock rows must never be reported as
--    healthy production devices).
-- 2. `pos_print_jobs`: idempotent print-job ledger. The
--    `UNIQUE (project_ref, shop_id, idempotency_key)` constraint is the
--    duplicate-print prevention at the DB layer (mirrors the in-memory
--    ledger + desktop queue dedupe).
--
-- Tenancy: every row carries `project_ref` (+ denormalized
-- `organization_id`, following migrations 073/074 conventions). Shop scope
-- via `shop_id` → `shops(id) ON DELETE CASCADE`.
--
-- Rollback: DROP TABLE IF EXISTS pos_print_jobs, pos_hardware_devices
-- (jobs are ephemeral intents; devices re-register from the desktop shell).
-- Backfill: none required — both tables start empty; the service degrades
-- to the in-memory ledger when the tables are absent (pre-migration runs).
--
-- NOTE: created but NOT applied in this phase (no migration runner run per
-- phase constraints). Apply with:
--   npm run migrate --workspace=dilivygo-backend

CREATE TABLE IF NOT EXISTS pos_hardware_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NULL REFERENCES organizations (id) ON DELETE CASCADE,
  project_ref TEXT NOT NULL,
  shop_id UUID NULL REFERENCES shops (id) ON DELETE CASCADE,
  device_name TEXT NOT NULL,
  device_kind TEXT NOT NULL
    CHECK (device_kind IN ('printer', 'drawer', 'scanner', 'terminal')),
  station TEXT NOT NULL DEFAULT 'cashier',
  connection JSONB NOT NULL DEFAULT '{}'::jsonb,
  capabilities JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_mock BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pos_hardware_devices_scope_name_uq
    UNIQUE (project_ref, shop_id, device_name)
);

CREATE INDEX IF NOT EXISTS idx_pos_hardware_devices_scope
  ON pos_hardware_devices (project_ref, shop_id, station);

CREATE INDEX IF NOT EXISTS idx_pos_hardware_devices_org
  ON pos_hardware_devices (organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS pos_print_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id TEXT NOT NULL,
  organization_id UUID NULL REFERENCES organizations (id) ON DELETE CASCADE,
  project_ref TEXT NOT NULL,
  shop_id UUID NULL REFERENCES shops (id) ON DELETE CASCADE,
  device_id UUID NULL REFERENCES pos_hardware_devices (id) ON DELETE SET NULL,
  station TEXT NOT NULL DEFAULT 'cashier',
  kind TEXT NOT NULL DEFAULT 'receipt'
    CHECK (kind IN ('receipt', 'kitchen-ticket', 'test', 'drawer-kick')),
  idempotency_key TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sent', 'acked', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pos_print_jobs_scope_idem_uq
    UNIQUE (project_ref, shop_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_pos_print_jobs_pending
  ON pos_print_jobs (project_ref, shop_id, status, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_pos_print_jobs_org
  ON pos_print_jobs (organization_id, created_at DESC);
