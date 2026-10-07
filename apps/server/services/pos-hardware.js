'use strict';

/**
 * POS hardware capability contracts — Phase 12 (local devices only).
 *
 * Server side of the local-hardware layer. This module owns the **job
 * ledger + station assignment + idempotent print-job IDs**. It performs NO
 * device I/O: printers, drawers, scanners, and terminals are touched only by
 * the desktop shell (`apps/pos-desktop/pos-hardware-drivers.js`) behind the
 * whitelisted preload bridge. Browser-only apps (web POS, all other
 * frontends) get NO native privileges — they only ever enqueue ledger jobs.
 *
 * Explicit non-goals (Phase 11 owns these — do not add them here):
 *   - Blink / Indolj / ePOSmatic / BlueLink (or any) cloud POS connectors.
 *   - Order-channel ingestion, marketplace sync, delivery provider calls.
 *
 * Reuse notes:
 *   - Server receipt PDFs (`services/receipt-pdf.service.js`,
 *     `GET /orders/:id/receipt.pdf`) are the canonical printable receipt
 *     representation. This module does NOT rebuild receipt content — it only
 *     wraps already-rendered payloads (HTML for the OS print path, ESC/POS
 *     bytes for raw thermal printers) in idempotent jobs.
 *   - `POST /orders/pos/checkout` (`controllers/order.controller.js`
 *     `createPosOrder`) has zero print coupling: the order is created, marked
 *     paid, broadcast, and audit-logged before any print is attempted, and
 *     printing happens client-side on `onSuccess`. The ledger below preserves
 *     that invariant — ledger writes are always separable from order/payment
 *     writes, and a hardware failure must never mutate order/payment rows
 *     (proven by `tests/pos-hardware.test.js`).
 *
 * Tenancy: every job is scoped by `(projectRef, shopId)` with a denormalized
 * `organizationId` for audit joins. Cross-scope reads return `null` (same
 * shape as unknown-id, no oracle). Money stays integer cents; this module
 * never formats currency symbols (ESC/POS receipts print the ISO code).
 *
 * Zero runtime dependencies beyond node builtins (`crypto`) so the ledger,
 * routing, and byte builder are unit-testable with no DB, no network, and
 * no hardware.
 */

const crypto = require('crypto');

// ─── Errors ─────────────────────────────────────────────────────────────────

function hardwareError(message, { statusCode = 500, code = 'POS_HARDWARE_ERROR' } = {}) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  return err;
}

/** Truncate an error for persistence. Never persist job payloads inside errors. */
function sanitizeHardwareError(err, maxChars = 500) {
  const raw = (err && err.message) || String(err || 'Unknown hardware error');
  return raw.length > maxChars ? `${raw.slice(0, maxChars)}…` : raw;
}

// ─── Scope ──────────────────────────────────────────────────────────────────

function assertHardwareScope({ projectRef, shopId } = {}) {
  if (typeof projectRef !== 'string' || !projectRef.trim()) {
    throw hardwareError('projectRef is required for hardware jobs', {
      statusCode: 400,
      code: 'POS_HARDWARE_SCOPE_REQUIRED',
    });
  }
  if (typeof shopId !== 'string' || !shopId.trim()) {
    throw hardwareError('shopId is required for hardware jobs', {
      statusCode: 400,
      code: 'POS_HARDWARE_SCOPE_REQUIRED',
    });
  }
  return { projectRef: projectRef.trim(), shopId: shopId.trim() };
}

function scopeKey({ projectRef, shopId }) {
  return `${projectRef}::${shopId}`;
}

function isSameScope(a, b) {
  return (
    !!a &&
    !!b &&
    a.projectRef === b.projectRef &&
    a.shopId === b.shopId
  );
}

// ─── Idempotency ────────────────────────────────────────────────────────────

const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9:_.-]{1,128}$/;

function isValidIdempotencyKey(key) {
  return typeof key === 'string' && IDEMPOTENCY_KEY_RE.test(key);
}

function assertIdempotencyKey(key) {
  if (!isValidIdempotencyKey(key)) {
    throw hardwareError(
      'idempotencyKey is required (1-128 chars, [A-Za-z0-9:_.-])',
      { statusCode: 400, code: 'POS_HARDWARE_IDEMPOTENCY_REQUIRED' },
    );
  }
  return key;
}

/**
 * Deterministic job id derived from scope + idempotency key, so a retried
 * enqueue maps to the SAME job row (duplicate-print prevention starts here;
 * the desktop queue in `pos-hardware-drivers.js` enforces the second half).
 */
function derivePrintJobId({ projectRef, shopId, idempotencyKey }) {
  assertHardwareScope({ projectRef, shopId });
  assertIdempotencyKey(idempotencyKey);
  const digest = crypto
    .createHash('sha1')
    .update(`${projectRef}::${shopId}::${idempotencyKey}`, 'utf8')
    .digest('hex')
    .slice(0, 24);
  return `pj_${digest}`;
}

/** Stable per-copy key: `${orderId}:${variant}:copy${copyIndex}`. */
function buildCopyIdempotencyKey({ orderId, variant, copyIndex }) {
  if (!orderId || !variant || !Number.isInteger(copyIndex) || copyIndex < 1) {
    throw hardwareError('orderId, variant, and 1-based copyIndex are required', {
      statusCode: 400,
      code: 'POS_HARDWARE_IDEMPOTENCY_REQUIRED',
    });
  }
  return `${orderId}:${variant}:copy${copyIndex}`;
}

// ─── Print-job ledger ───────────────────────────────────────────────────────

const PRINT_JOB_STATES = Object.freeze(['queued', 'sent', 'acked', 'failed']);
const PRINT_JOB_TERMINAL_STATES = Object.freeze(['acked']);
const PRINT_JOB_KINDS = Object.freeze(['receipt', 'kitchen-ticket', 'test', 'drawer-kick']);

/**
 * In-memory job ledger. Production persistence is migration 120
 * (`pos_print_jobs` with `UNIQUE (project_ref, shop_id, idempotency_key)`);
 * this ledger mirrors that constraint so behaviour is identical with or
 * without the DB: same scope + same key ⇒ same job, never a second row.
 *
 * `now` is injectable for deterministic tests.
 */
function createPrintJobLedger({ now = () => new Date().toISOString() } = {}) {
  const rows = new Map(); // `${scopeKey}::${idempotencyKey}` → job

  function enqueue({
    organizationId = null,
    projectRef,
    shopId,
    station = 'cashier',
    kind = 'receipt',
    idempotencyKey,
    payload = {},
  } = {}) {
    assertHardwareScope({ projectRef, shopId });
    assertIdempotencyKey(idempotencyKey);
    if (!PRINT_JOB_KINDS.includes(kind)) {
      throw hardwareError(`Unknown print-job kind: ${String(kind)}`, {
        statusCode: 400,
        code: 'POS_HARDWARE_UNKNOWN_KIND',
      });
    }
    const key = `${scopeKey({ projectRef, shopId })}::${idempotencyKey}`;
    const existing = rows.get(key);
    if (existing) return { job: { ...existing }, deduped: true };

    const timestamp = now();
    const job = {
      id: derivePrintJobId({ projectRef, shopId, idempotencyKey }),
      organizationId,
      projectRef,
      shopId,
      station,
      kind,
      idempotencyKey,
      payload,
      status: 'queued',
      attempts: 0,
      lastError: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    rows.set(key, job);
    return { job: { ...job }, deduped: false };
  }

  function get({ projectRef, shopId, idempotencyKey }) {
    if (!projectRef || !shopId || !idempotencyKey) return null;
    const job = rows.get(`${scopeKey({ projectRef, shopId })}::${idempotencyKey}`) || null;
    return job ? { ...job } : null;
  }

  function listPending({ projectRef, shopId }) {
    assertHardwareScope({ projectRef, shopId });
    return [...rows.values()]
      .filter(
        (job) =>
          job.projectRef === projectRef &&
          job.shopId === shopId &&
          (job.status === 'queued' || job.status === 'failed'),
      )
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
      .map((job) => ({ ...job }));
  }

  function transition(idempotencyKey, scope, to, { error = null } = {}) {
    assertHardwareScope(scope);
    assertIdempotencyKey(idempotencyKey);
    const key = `${scopeKey(scope)}::${idempotencyKey}`;
    const job = rows.get(key);
    if (!job) {
      throw hardwareError('Print job not found', {
        statusCode: 404,
        code: 'POS_PRINT_JOB_NOT_FOUND',
      });
    }
    if (PRINT_JOB_TERMINAL_STATES.includes(job.status)) {
      throw hardwareError(`Print job is already ${job.status}`, {
        statusCode: 409,
        code: 'POS_PRINT_JOB_TERMINAL',
      });
    }
    if (!PRINT_JOB_STATES.includes(to)) {
      throw hardwareError(`Unknown print-job state: ${String(to)}`, {
        statusCode: 400,
        code: 'POS_PRINT_JOB_BAD_STATE',
      });
    }
    const updated = {
      ...job,
      status: to,
      attempts: to === 'failed' ? job.attempts + 1 : job.attempts,
      lastError: to === 'failed' ? sanitizeHardwareError(error) : job.lastError,
      updatedAt: now(),
    };
    rows.set(key, updated);
    return { ...updated };
  }

  return {
    enqueue,
    get,
    listPending,
    markSent: (idempotencyKey, scope) => transition(idempotencyKey, scope, 'sent'),
    markAcked: (idempotencyKey, scope) => transition(idempotencyKey, scope, 'acked'),
    markFailed: (idempotencyKey, scope, error) => transition(idempotencyKey, scope, 'failed', { error }),
  };
}

// ─── Kitchen routing (station → printer mapping) ────────────────────────────

/**
 * Resolve which configured printer serves a station. `routes` is the
 * shop-level map `{ [station]: printerId }`; unknown stations fall back to
 * `fallbackPrinterId` so a misconfigured station degrades to the cashier
 * printer instead of dropping the ticket. Returns `isFallback: true` in
 * that case so operators can see the misconfiguration in the ledger row.
 */
function resolveStationPrinter({ station, routes = {}, fallbackPrinterId = null } = {}) {
  const normalized = typeof station === 'string' && station.trim() ? station.trim() : 'cashier';
  const direct = routes && typeof routes[normalized] === 'string' && routes[normalized].trim()
    ? routes[normalized].trim()
    : null;
  if (direct) return { station: normalized, printerId: direct, isFallback: false };
  return { station: normalized, printerId: fallbackPrinterId, isFallback: true };
}

/**
 * Fan an order out into one ledger-ready job spec per copy. Each copy gets
 * its own deterministic idempotency key so a retry prints exactly the
 * missing copies — never a duplicate of an already-acked copy.
 */
function buildReceiptJobs({
  orderId,
  organizationId = null,
  projectRef,
  shopId,
  copies = { cashier: 1, kitchen: 1 },
} = {}) {
  assertHardwareScope({ projectRef, shopId });
  if (!orderId) {
    throw hardwareError('orderId is required to build receipt jobs', {
      statusCode: 400,
      code: 'POS_HARDWARE_ORDER_REQUIRED',
    });
  }
  const specs = [];
  for (const variant of ['cashier', 'kitchen']) {
    const count = Math.max(0, Number(copies?.[variant] ?? (variant === 'cashier' ? 1 : 0)));
    for (let copyIndex = 1; copyIndex <= count; copyIndex += 1) {
      specs.push({
        organizationId,
        projectRef,
        shopId,
        station: variant === 'kitchen' ? 'kitchen' : 'cashier',
        kind: variant === 'kitchen' ? 'kitchen-ticket' : 'receipt',
        idempotencyKey: buildCopyIdempotencyKey({ orderId, variant, copyIndex }),
        orderId,
        variant,
        copyIndex,
        totalCopies: count,
      });
    }
  }
  return specs;
}

// ─── ESC/POS byte builder (pure functions, no deps) ─────────────────────────

const ESC = 0x1b;
const GS = 0x1d;
const MAX_ESCPOS_BYTES = 64 * 1024;

function escposInit() {
  return Buffer.from([ESC, 0x40]); // ESC @ — initialize printer
}

/** align: 0 = left, 1 = center, 2 = right. */
function escposAlign(align = 0) {
  if (![0, 1, 2].includes(align)) {
    throw hardwareError('ESC/POS align must be 0, 1, or 2', {
      statusCode: 400,
      code: 'POS_HARDWARE_ESCPOS_RANGE',
    });
  }
  return Buffer.from([ESC, 0x61, align]); // ESC a n
}

/**
 * Encode printable text for a basic ESC/POS code page. Characters outside
 * latin-1 become '?' (deterministic, never emits multi-byte sequences the
 * printer would render as garbage). No line feed is appended — callers
 * compose with `escposFeed`.
 */
function escposText(str) {
  const raw = String(str ?? '');
  let out = '';
  for (const ch of raw) {
    const code = ch.codePointAt(0);
    out += code !== undefined && code <= 0xff ? ch : '?';
  }
  return Buffer.from(out, 'latin1');
}

function escposFeed(lines = 1) {
  if (!Number.isInteger(lines) || lines < 0 || lines > 255) {
    throw hardwareError('ESC/POS feed must be an integer 0-255', {
      statusCode: 400,
      code: 'POS_HARDWARE_ESCPOS_RANGE',
    });
  }
  return Buffer.from(Array(lines).fill(0x0a));
}

function escposCut() {
  return Buffer.from([GS, 0x56, 0x00]); // GS V 0 — full cut
}

/**
 * Cash-drawer kick (ESC p m t1 t2). pin: 0 = drawer 1, 1 = drawer 2.
 * Standard pulse t1=25ms on, t2=250ms off. This is the ONLY drawer trigger
 * path — see `assertDrawerPermitted` (permission flag + printer binding).
 */
function escposDrawerKick({ pin = 0 } = {}) {
  if (![0, 1].includes(pin)) {
    throw hardwareError('Drawer kick pin must be 0 or 1', {
      statusCode: 400,
      code: 'POS_HARDWARE_ESCPOS_RANGE',
    });
  }
  return Buffer.from([ESC, 0x70, pin, 0x19, 0xfa]); // ESC p m 25 250
}

function concatEscPos(...parts) {
  return Buffer.concat(parts.map((p) => (Buffer.isBuffer(p) ? p : Buffer.from(p))));
}

/** Format integer cents as `12.34` — ISO code printed separately, no symbols. */
function formatCentsPlain(amountCents) {
  if (!Number.isInteger(amountCents)) {
    throw hardwareError('ESC/POS amounts must be integer cents', {
      statusCode: 400,
      code: 'POS_HARDWARE_INVALID_AMOUNT',
    });
  }
  const sign = amountCents < 0 ? '-' : '';
  const abs = Math.abs(amountCents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/**
 * Minimal receipt byte builder: header + item lines + total + cut.
 * `width` is the printable column count (typical 32 for 58mm, 42 for 80mm).
 */
function buildReceiptEscPos({
  title = 'Dilivygo POS',
  lines = [],
  totalCents = 0,
  currencyCode = '',
  footer = '',
  width = 32,
} = {}) {
  const parts = [escposInit(), escposAlign(1), escposText(`${title}\n`), escposAlign(0)];
  for (const line of lines) {
    const qty = Number(line?.quantity || 0);
    const label = String(line?.label || '').slice(0, width);
    const amount = formatCentsPlain(Number(line?.amountCents || 0));
    const row = `${qty}x ${label}`.slice(0, Math.max(0, width - amount.length - 1));
    parts.push(escposText(`${row.padEnd(Math.max(0, width - amount.length), ' ')}${amount}\n`));
  }
  const total = formatCentsPlain(Number(totalCents || 0));
  parts.push(escposText(`${'-'.repeat(width)}\n`));
  parts.push(escposText(`TOTAL${` ${currencyCode}`.trimEnd()}\n`));
  parts.push(escposAlign(2), escposText(`${total}\n`), escposAlign(0));
  if (footer) parts.push(escposFeed(1), escposText(`${String(footer).slice(0, width * 4)}\n`));
  parts.push(escposFeed(3), escposCut());
  const buffer = concatEscPos(...parts);
  if (buffer.length > MAX_ESCPOS_BYTES) {
    throw hardwareError('ESC/POS receipt exceeds the maximum byte size', {
      statusCode: 400,
      code: 'POS_HARDWARE_ESCPOS_TOO_LARGE',
    });
  }
  return buffer;
}

// ─── Scanner input-claim semantics ──────────────────────────────────────────

/**
 * USB HID scanners wedge keystrokes into whichever field has focus, so two
 * POS panes racing for scans double-add items. The claim registry gives a
 * pane exclusive logical ownership of a scanner for a TTL: exactly one
 * holder at a time, claims expire, release is explicit. Pure + injectable
 * clock; the desktop shell persists nothing (claims are ephemeral by design).
 */
function createScannerClaimRegistry({ nowMs = () => Date.now() } = {}) {
  const claims = new Map(); // deviceId → { holder, expiresAtMs }

  function claim({ deviceId, holder, ttlMs = 30000 } = {}) {
    if (!deviceId || !holder) {
      throw hardwareError('deviceId and holder are required to claim a scanner', {
        statusCode: 400,
        code: 'POS_HARDWARE_SCANNER_CLAIM_REQUIRED',
      });
    }
    const current = claims.get(deviceId);
    if (current && current.expiresAtMs > nowMs() && current.holder !== holder) {
      return { ok: false, code: 'SCANNER_CLAIMED', holder: current.holder };
    }
    claims.set(deviceId, { holder, expiresAtMs: nowMs() + ttlMs });
    return { ok: true, holder };
  }

  function release({ deviceId, holder } = {}) {
    const current = claims.get(deviceId);
    if (!current) return { ok: true, released: false };
    if (current.holder !== holder) {
      return { ok: false, code: 'SCANNER_NOT_HOLDER', holder: current.holder };
    }
    claims.delete(deviceId);
    return { ok: true, released: true };
  }

  function holderOf(deviceId) {
    const current = claims.get(deviceId);
    if (!current || current.expiresAtMs <= nowMs()) return null;
    return current.holder;
  }

  return { claim, release, holderOf };
}

// ─── Cash-drawer permission gate ────────────────────────────────────────────

/**
 * Drawers fire ONLY through a bound printer's kick path (ESC p) and ONLY
 * when the operator role carries the drawer flag. There is no standalone
 * "open drawer" hardware call — the ledger kind is `drawer-kick` and it
 * always references the printer it fires through.
 */
function assertDrawerPermitted({ permissions = {}, printerId = null } = {}) {
  if (permissions.hardwareDrawer !== true) {
    throw hardwareError('Cash-drawer access requires the drawer permission', {
      statusCode: 403,
      code: 'DRAWER_NOT_PERMITTED',
    });
  }
  if (typeof printerId !== 'string' || !printerId.trim()) {
    throw hardwareError('Cash-drawer kick requires a bound printer (drawer fires via the printer path only)', {
      statusCode: 400,
      code: 'DRAWER_REQUIRES_PRINTER',
    });
  }
  return { permitted: true, printerId: printerId.trim() };
}

// ─── Payment-terminal capability (prepared, NOT implemented) ────────────────

const TERMINAL_DECISION = Object.freeze({
  provider: 'none',
  status: 'not_provisioned',
  // Stripe Terminal was evaluated and deliberately NOT implemented:
  // counter card-present payments are already covered by the existing
  // Stripe card path + cash path in POS checkout, and the official
  // Terminal SDKs (browser JS SDK bound to Stripe.js, server-driven
  // readers) have no Electron-certified device path matching this
  // desktop shell. See docs/integrations/providers/pos-hardware.md §7.
  evaluated: 'stripe-terminal',
  reason:
    'Counter payments are covered by existing Stripe card + cash checkout; ' +
    'no Electron-certified Terminal device path. Doc-level decision only.',
});

function getTerminalCapability() {
  return {
    available: false,
    code: 'TERMINAL_NOT_PROVISIONED',
    ...TERMINAL_DECISION,
  };
}

function createTerminalPayment() {
  throw hardwareError(
    'No payment terminal is provisioned for this shop (Stripe Terminal deliberately not implemented — see pos-hardware docs §7)',
    { statusCode: 503, code: 'TERMINAL_NOT_PROVISIONED' },
  );
}

// ─── Failure isolation ──────────────────────────────────────────────────────

/**
 * Run a hardware attempt without ever throwing into the caller. Order and
 * payment flows must use this (or equivalent handling) so a dead printer,
 * an offline terminal, or a declined card-present attempt can only fail the
 * hardware job — never the order/payment rows.
 */
async function settleHardwareAttempt(fn) {
  try {
    const value = await fn();
    return { ok: true, value };
  } catch (err) {
    return { ok: false, error: sanitizeHardwareError(err) };
  }
}

module.exports = {
  hardwareError,
  sanitizeHardwareError,
  assertHardwareScope,
  scopeKey,
  isSameScope,
  isValidIdempotencyKey,
  assertIdempotencyKey,
  derivePrintJobId,
  buildCopyIdempotencyKey,
  PRINT_JOB_STATES,
  PRINT_JOB_TERMINAL_STATES,
  PRINT_JOB_KINDS,
  createPrintJobLedger,
  resolveStationPrinter,
  buildReceiptJobs,
  ESC,
  GS,
  MAX_ESCPOS_BYTES,
  escposInit,
  escposAlign,
  escposText,
  escposFeed,
  escposCut,
  escposDrawerKick,
  concatEscPos,
  formatCentsPlain,
  buildReceiptEscPos,
  createScannerClaimRegistry,
  assertDrawerPermitted,
  TERMINAL_DECISION,
  getTerminalCapability,
  createTerminalPayment,
  settleHardwareAttempt,
};
