'use strict';

/**
 * Zod validators for the POS hardware print-job HTTP surface
 * (`apps/server/routes/pos-hardware.routes.js` →
 * `apps/server/controllers/pos-hardware.controller.js`).
 *
 * Deferred-wiring batch (Phase 12 follow-up): the ledger + idempotency rules
 * already exist in `services/pos-hardware.js`; these schemas are the HTTP
 * boundary for them and stay byte-agreed with the service guards:
 *
 * Guard agreement with `services/pos-hardware.js`:
 * - `createPrintJobBody.idempotencyKey` mirrors `isValidIdempotencyKey`
 *   exactly (same `^[A-Za-z0-9:_.-]{1,128}$` charset/length). Anything this
 *   schema accepts, `derivePrintJobId` / ledger `enqueue` accept unchanged.
 * - `createPrintJobBody.kind` mirrors `PRINT_JOB_KINDS`
 *   (`receipt | kitchen-ticket | test | drawer-kick`). Unknown kinds stay a
 *   service-side 400 as well — the schema is the first gate, not the only one.
 * - `createPrintJobBody.station` is a free-form 1–64 char label (the service
 *   normalizes unknown stations via `resolveStationPrinter` fallback, so no
 *   enum here — rejecting a station at the edge would break the
 *   degrade-to-cashier contract).
 * - `listPrintJobsQuery.limit` mirrors the model-listing convention used
 *   across SaaS validators (1–100, default 30).
 * - `printJobParam.id` covers ledger-derived ids (`pj_` + 24 hex) with room
 *   for future id shapes (max 64, never empty).
 *
 * Tenancy + roles are enforced by route middleware
 * (`requireRole('vendor','admin')` + `attachProjectRef`/`requireProjectRef` +
 * `attachShopId`/`requireShopId`/`requireShopAccess`, same chain as
 * `routes/vendor-settings.routes.js` and the POS-checkout route in
 * `routes/order.routes.js`) — never by these schemas.
 */

const { z } = require('zod');

const PRINT_JOB_KINDS = ['receipt', 'kitchen-ticket', 'test', 'drawer-kick'];

const PRINT_JOB_STATUSES = ['queued', 'sent', 'acked', 'failed'];

/** Same charset/length as `isValidIdempotencyKey` in `services/pos-hardware.js`. */
const idempotencyKeyField = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(
    /^[A-Za-z0-9:_.-]{1,128}$/,
    'idempotencyKey must be 1-128 chars of [A-Za-z0-9:_.-]',
  );

/** Validates `req.body` for `POST /pos-hardware/print-jobs`. */
const createPrintJobBody = z.object({
  idempotencyKey: idempotencyKeyField,
  kind: z.enum(PRINT_JOB_KINDS).optional().default('receipt'),
  printerKind: z.string().optional(),
  station: z.string().trim().min(1).max(64).optional().default('cashier'),
  stationName: z.string().trim().min(1).max(64).optional(),
  shopId: z.string().optional(),
  orderId: z.string().optional().nullable(),
  copies: z.coerce.number().int().min(1).optional(),
  /** Opaque render payload (HTML/ESC-POS reference); never logged, never echoed. */
  payload: z.record(z.string(), z.unknown()).optional().default({}),
}).passthrough();

/** Validates `req.query` for `GET /pos-hardware/print-jobs`. */
const listPrintJobsQuery = z.object({
  status: z.enum(PRINT_JOB_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(30),
}).strict();

/** Validates `req.params` for `POST /pos-hardware/print-jobs/:id/cancel` and `PATCH /print-jobs/:id/status`. */
const printJobParam = z.object({
  id: z.string().trim().min(1).max(64),
}).strict();

/** Validates `req.body` for `PATCH /pos-hardware/print-jobs/:id/status`. */
const updatePrintJobStatusBody = z.object({
  status: z.enum(['sent', 'acked', 'failed']),
  attempts: z.coerce.number().int().min(0).max(1000).optional(),
  lastError: z.string().trim().max(500).optional().nullable(),
  errorMessage: z.string().trim().max(500).optional().nullable(),
  deviceId: z.string().uuid().optional().nullable(),
  deviceName: z.string().trim().max(128).optional().nullable(),
  shopId: z.string().optional(),
}).passthrough();

const DEVICE_KINDS = ['printer', 'drawer', 'scanner', 'terminal'];

/** Validates `req.body` for `POST /pos-hardware/devices/heartbeat`. */
const deviceHeartbeatBody = z.object({
  deviceName: z.string().trim().min(1).max(128),
  deviceKind: z.enum(DEVICE_KINDS).optional().default('printer'),
  station: z.string().trim().min(1).max(64).optional().default('cashier'),
  stationName: z.string().trim().min(1).max(64).optional(),
  connection: z.record(z.string(), z.unknown()).optional().default({}),
  capabilities: z.record(z.string(), z.unknown()).optional().default({}),
  statusDetails: z.record(z.string(), z.unknown()).optional(),
  isMock: z.boolean().optional().default(true),
  shopId: z.string().optional(),
}).passthrough();

/** Validates `req.query` for `GET /api/saas/pos-hardware/overview`. */
const saasOverviewQuery = z.object({
  projectRef: z.string().trim().optional(),
  shopId: z.string().uuid().optional(),
  station: z.string().trim().optional(),
}).strict();

/** Validates `req.query` for `GET /api/saas/pos-hardware/devices`. */
const saasDevicesQuery = z.object({
  projectRef: z.string().trim().optional(),
  shopId: z.string().uuid().optional(),
  station: z.string().trim().optional(),
  deviceKind: z.enum(DEVICE_KINDS).optional(),
  isMock: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
}).strict();

/** Validates `req.query` for `GET /api/saas/pos-hardware/print-jobs`. */
const saasPrintJobsQuery = z.object({
  projectRef: z.string().trim().optional(),
  shopId: z.string().uuid().optional(),
  station: z.string().trim().optional(),
  status: z.enum(PRINT_JOB_STATUSES).optional(),
  kind: z.enum(PRINT_JOB_KINDS).optional(),
  startDate: z.string().trim().optional(),
  endDate: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(30),
  offset: z.coerce.number().int().min(0).optional().default(0),
}).strict();

module.exports = {
  PRINT_JOB_KINDS,
  PRINT_JOB_STATUSES,
  DEVICE_KINDS,
  createPrintJobBody,
  listPrintJobsQuery,
  printJobParam,
  updatePrintJobStatusBody,
  deviceHeartbeatBody,
  saasOverviewQuery,
  saasDevicesQuery,
  saasPrintJobsQuery,
};
