'use strict';

/**
 * POS hardware drivers + offline print queue for the Electron desktop shell.
 *
 * Phase 12 (local devices only — no cloud POS connectors; those are Phase 11).
 *
 * This module is deliberately ELECTRON-FREE (plain Node: `fs`/`path` only) so
 * the queue, dedupe, and mock-driver behaviour are unit-testable with
 * `node`/`jest` and no hardware. `main.js` wires Electron specifics
 * (sender-bound `getPrintersAsync`, userData storage dir) through the
 * `adapters` argument of `registerPosHardwareIpc`.
 *
 * Security model (unchanged from the existing bridge):
 *   - Renderer access ONLY via the `dilivygoDesktop.hardware` namespace in
 *     `preload.js` (explicit allowlist in `POS_HARDWARE_CHANNELS` below).
 *   - Every channel is registered with `secureHandle`, i.e. the trusted
 *     renderer-origin check in `main.js` still applies.
 *   - Mock drivers default ON (`POS_HARDWARE_REAL !== '1'`) until real
 *     hardware is configured — mock output is labelled mock and never
 *     claims a real print succeeded.
 *   - No new native privileges for browser-only apps: web POS talks to the
 *     server ledger API only (follow-up route work); only this desktop shell
 *     touches devices.
 *
 * Offline/reconnect semantics:
 *   - `enqueue` dedupes on `idempotencyKey` (same key → single queued job,
 *     `{ deduped: true }`).
 *   - The queue persists to JSON after every mutation (crash-safe replay).
 *   - `replay` re-attempts queued/failed jobs through the driver exactly
 *     once per call; acked jobs are removed and never reprinted, so a
 *     reconnect replays the queue WITHOUT duplicates.
 */

const fs = require('fs');
const path = require('path');

const POS_HARDWARE_CHANNELS = Object.freeze([
  'pos-hardware:list-devices',
  'pos-hardware:print-job',
  'pos-hardware:test-print',
  'pos-hardware:open-drawer',
  'pos-hardware:queue-status',
  'pos-hardware:replay-queue',
  'pos-hardware:confirm-cloud-ack',
  'pos-hardware:scanner-claim',
  'pos-hardware:scanner-release',
]);

function isMockMode(env = process.env) {
  return String(env.POS_HARDWARE_REAL || '') !== '1';
}

function isDrawerEnabled(env = process.env) {
  return String(env.POS_HARDWARE_DRAWER_ENABLED || '') === '1';
}

// ─── Mock drivers (default ON until real hardware is configured) ────────────

function createMockPrinterDriver({ printed = [], failMode = 'none' } = {}) {
  let failuresRemaining = failMode === 'fail-once' ? 1 : 0;
  return {
    kind: 'mock-printer',
    get printed() {
      return printed;
    },
    async print(job) {
      if (failMode === 'offline') {
        return { ok: false, error: 'Mock printer offline (simulated)' };
      }
      if (failuresRemaining > 0) {
        failuresRemaining -= 1;
        return { ok: false, error: 'Mock printer transient failure (simulated)' };
      }
      printed.push({ ...(job || {}), printedAt: new Date().toISOString(), mock: true });
      return { ok: true, mock: true };
    },
  };
}

function createMockDrawerDriver({ kicks = [] } = {}) {
  return {
    kind: 'mock-drawer',
    get kicks() {
      return kicks;
    },
    async kick({ printerId } = {}) {
      if (!printerId) return { ok: false, error: 'Drawer kick requires a bound printer' };
      kicks.push({ printerId, kickedAt: new Date().toISOString(), mock: true });
      return { ok: true, mock: true };
    },
  };
}

// ─── Queue storage adapters ──────────────────────────────────────────────────

function createMemoryQueueStorage() {
  let rows = [];
  return {
    load: () => rows.map((r) => ({ ...r })),
    save: (next) => {
      rows = next.map((r) => ({ ...r }));
    },
  };
}

function createFileQueueStorage(filePath) {
  const dir = path.dirname(filePath);
  function load() {
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  function save(rows) {
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(rows, null, 2), 'utf8');
    fs.renameSync(tmp, filePath);
  }
  return { load, save };
}

// ─── Offline print queue ─────────────────────────────────────────────────────

// Tombstone retention policy:
// Reconciled print records are preserved locally as durable tombstones to prevent
// duplicate physical prints on accidental re-submissions. Reconciled tombstones are
// capped at 1,000 records and expired after 7 days.
const MAX_RECONCILED_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_RECONCILED_TOMBSTONES = 1000;

function createPrintQueue({ storage, printer, now = () => new Date().toISOString(), maxAttempts = 5 } = {}) {
  if (!storage || !printer) throw new Error('createPrintQueue requires storage + printer');
  let rows = storage.load().map((r) => {
    // Backwards compatibility: normalize legacy rows
    if (!r.status) {
      r.status = r.printed ? 'printed_pending_cloud_ack' : 'queued';
    }
    return r;
  });

  function pruneTombstones() {
    const nowMs = new Date(now()).getTime();
    rows = rows.filter((r) => {
      if (r.status !== 'reconciled') return true;
      if (!r.reconciledAt) return true;
      const ageMs = nowMs - new Date(r.reconciledAt).getTime();
      return ageMs <= MAX_RECONCILED_AGE_MS;
    });

    const reconciled = rows.filter((r) => r.status === 'reconciled');
    if (reconciled.length > MAX_RECONCILED_TOMBSTONES) {
      reconciled.sort((a, b) => new Date(a.reconciledAt || 0) - new Date(b.reconciledAt || 0));
      const excessCount = reconciled.length - MAX_RECONCILED_TOMBSTONES;
      const toRemoveKeys = new Set(reconciled.slice(0, excessCount).map((r) => r.idempotencyKey));
      rows = rows.filter((r) => !toRemoveKeys.has(r.idempotencyKey));
    }
  }

  function persist() {
    pruneTombstones();
    storage.save(rows);
  }

  function enqueue(job) {
    const idempotencyKey = job && job.idempotencyKey;
    if (typeof idempotencyKey !== 'string' || !idempotencyKey) {
      return { ok: false, error: 'idempotencyKey is required' };
    }
    const existing = rows.find((r) => r.idempotencyKey === idempotencyKey);
    if (existing) {
      if (existing.status === 'reconciled') {
        return {
          ok: true,
          deduped: true,
          printed: true,
          reconciled: true,
          job: { ...existing },
        };
      }
      if (existing.status === 'printed_pending_cloud_ack') {
        return {
          ok: true,
          deduped: true,
          printed: true,
          needsCloudAck: true,
          job: { ...existing },
        };
      }
      // queued or failed: DO NOT return fake physical success!
      return {
        ok: false,
        deduped: true,
        printed: false,
        queued: true,
        status: existing.status,
        job: { ...existing },
      };
    }

    const row = {
      idempotencyKey,
      cloudJobId: job.cloudJobId || null,
      shopId: job.shopId || null,
      projectRef: job.projectRef || null,
      variant: job.variant || 'cashier',
      receiptHtml: job.receiptHtml || '',
      status: 'queued',
      attempts: 0,
      lastError: null,
      enqueuedAt: now(),
      printedAt: null,
      reconciledAt: null,
    };
    rows.push(row);
    persist();
    return { ok: true, deduped: false, job: { ...row } };
  }

  function pending() {
    return rows.filter((r) => r.status !== 'reconciled').map((r) => ({ ...r }));
  }

  function all() {
    return rows.map((r) => ({ ...r }));
  }

  function tombstones() {
    return rows.filter((r) => r.status === 'reconciled').map((r) => ({ ...r }));
  }

  async function attempt(row) {
    if (row.status === 'reconciled') {
      return {
        idempotencyKey: row.idempotencyKey,
        cloudJobId: row.cloudJobId || null,
        shopId: row.shopId || null,
        projectRef: row.projectRef || null,
        printed: true,
        reconciled: true,
        attempts: row.attempts,
      };
    }
    if (row.status === 'printed_pending_cloud_ack') {
      return {
        idempotencyKey: row.idempotencyKey,
        cloudJobId: row.cloudJobId || null,
        shopId: row.shopId || null,
        projectRef: row.projectRef || null,
        printed: true,
        needsCloudAck: true,
        attempts: row.attempts,
      };
    }

    let result;
    try {
      result = await printer.print(row);
    } catch (err) {
      result = { ok: false, error: (err && err.message) || 'Printer threw' };
    }

    if (result && result.ok) {
      // Physical output confirmed: preserve row as printed_pending_cloud_ack
      // and strip receiptHtml to eliminate redundant sensitive data.
      const target = rows.find((r) => r.idempotencyKey === row.idempotencyKey);
      if (target) {
        target.status = 'printed_pending_cloud_ack';
        target.printedAt = now();
        target.attempts = (target.attempts || 0) + 1;
        target.lastError = null;
        delete target.receiptHtml;
      }
      persist();
      return {
        idempotencyKey: row.idempotencyKey,
        cloudJobId: row.cloudJobId || null,
        shopId: row.shopId || null,
        projectRef: row.projectRef || null,
        printed: true,
        needsCloudAck: true,
        attempts: target ? target.attempts : ((row.attempts || 0) + 1),
      };
    }

    const target = rows.find((r) => r.idempotencyKey === row.idempotencyKey);
    if (target) {
      target.status = 'failed';
      target.attempts = (target.attempts || 0) + 1;
      target.lastError = String((result && result.error) || 'Print failed').slice(0, 500);
    }
    persist();
    return {
      idempotencyKey: row.idempotencyKey,
      cloudJobId: row.cloudJobId || null,
      shopId: row.shopId || null,
      projectRef: row.projectRef || null,
      attempts: target ? target.attempts : ((row.attempts || 0) + 1),
      printed: false,
      error: String((result && result.error) || 'Print failed').slice(0, 500),
    };
  }

  function confirmCloudAck({ idempotencyKey, cloudJobId } = {}) {
    if (!idempotencyKey) return { ok: false, error: 'idempotencyKey is required' };
    const row = rows.find((r) => r.idempotencyKey === idempotencyKey);
    if (!row) {
      return { ok: false, error: 'Job not found in local queue', idempotencyKey };
    }
    row.status = 'reconciled';
    row.reconciledAt = now();
    delete row.receiptHtml;
    persist();
    return {
      ok: true,
      reconciled: true,
      idempotencyKey: row.idempotencyKey,
      cloudJobId: row.cloudJobId || null,
      shopId: row.shopId || null,
    };
  }

  async function replay({ onlyIds = null } = {}) {
    pruneTombstones();
    const snapshot = onlyIds
      ? rows.filter((r) => onlyIds.includes(r.idempotencyKey))
      : rows;

    const seen = new Set();
    const unique = snapshot.filter((r) => {
      if (seen.has(r.idempotencyKey)) return false;
      seen.add(r.idempotencyKey);
      return true;
    });

    const executionResults = [];
    const reconciliationPending = [];
    const results = [];

    for (const row of unique) {
      if (row.status === 'reconciled') {
        continue;
      }
      if (row.status === 'printed_pending_cloud_ack') {
        const item = {
          idempotencyKey: row.idempotencyKey,
          cloudJobId: row.cloudJobId || null,
          shopId: row.shopId || null,
          projectRef: row.projectRef || null,
          printed: true,
          needsCloudAck: true,
          attempts: row.attempts,
        };
        reconciliationPending.push(item);
        results.push(item);
        continue;
      }
      if ((row.status === 'queued' || row.status === 'failed') && row.attempts < maxAttempts) {
        // eslint-disable-next-line no-await-in-loop
        const res = await attempt(row);
        executionResults.push(res);
        results.push(res);
      }
    }

    return {
      attempted: executionResults.length,
      printed: results.filter((r) => r.printed).length,
      failed: results.filter((r) => !r.printed).length,
      results,
      executionResults,
      reconciliationPending,
    };
  }

  return {
    enqueue,
    pending,
    all,
    tombstones,
    attempt,
    confirmCloudAck,
    replay,
    pruneTombstones,
  };
}

// ─── IPC registration (called from main.js inside app.whenReady) ────────────

function registerPosHardwareIpc({
  secureHandle,
  adapters = {},
  env = process.env,
  now = () => new Date().toISOString(),
} = {}) {
  if (typeof secureHandle !== 'function') throw new Error('registerPosHardwareIpc requires secureHandle');

  const mock = isMockMode(env);
  let printer;
  if (adapters.printer) {
    printer = adapters.printer;
  } else if (!mock) {
    throw new Error('Real POS hardware requested (POS_HARDWARE_REAL=1) but no printer adapter was configured');
  } else {
    printer = createMockPrinterDriver();
  }
  const drawer = adapters.drawer || createMockDrawerDriver();
  const storage =
    adapters.storage ||
    (adapters.userDataDir
      ? createFileQueueStorage(path.join(adapters.userDataDir, 'pos-hardware-queue.json'))
      : createMemoryQueueStorage());
  const queue = createPrintQueue({ storage, printer, now });

  const scannerClaims = new Map(); // deviceId → { holder, expiresAtMs }

  function wrap(handler) {
    return async (...args) => {
      try {
        return await handler(...args);
      } catch (err) {
        return { ok: false, error: (err && err.message) || 'Hardware bridge error' };
      }
    };
  }

  secureHandle(
    'pos-hardware:list-devices',
    wrap(async (event) => {
      let systemPrinters = [];
      if (adapters.getPrinters && event) {
        try {
          systemPrinters = await adapters.getPrinters(event);
        } catch {
          systemPrinters = [];
        }
      }
      return {
        ok: true,
        mock,
        printers: systemPrinters,
        drawer: { supported: true, viaPrinterOnly: true, enabled: isDrawerEnabled(env), mock },
        scanner: { supported: true, claimTtlMs: 30000, mock },
        terminal: { available: false, code: 'TERMINAL_NOT_PROVISIONED' },
      };
    }),
  );

  secureHandle(
    'pos-hardware:print-job',
    wrap(async (_event, job = {}) => {
      const idempotencyKey = job && job.idempotencyKey;
      if (typeof idempotencyKey !== 'string' || !idempotencyKey) {
        return { ok: false, error: 'idempotencyKey is required' };
      }

      const existing = queue.all().find((r) => r.idempotencyKey === idempotencyKey);
      if (existing) {
        if (existing.status === 'reconciled') {
          return {
            ok: true,
            printed: true,
            deduped: true,
            reconciled: true,
            idempotencyKey,
            cloudJobId: existing.cloudJobId || job.cloudJobId || null,
            shopId: existing.shopId || job.shopId || null,
          };
        }
        if (existing.status === 'printed_pending_cloud_ack') {
          return {
            ok: true,
            printed: true,
            deduped: true,
            needsCloudAck: true,
            idempotencyKey,
            cloudJobId: existing.cloudJobId || job.cloudJobId || null,
            shopId: existing.shopId || job.shopId || null,
          };
        }
        // existing is queued or failed: DO NOT fake success. Attempt real physical execution!
        if (job.receiptHtml && !existing.receiptHtml) {
          existing.receiptHtml = job.receiptHtml;
        }
        if (job.cloudJobId && !existing.cloudJobId) {
          existing.cloudJobId = job.cloudJobId;
        }
        const result = await queue.attempt(existing);
        if (result.printed) {
          return {
            ok: true,
            printed: true,
            deduped: true,
            needsCloudAck: true,
            idempotencyKey,
            cloudJobId: existing.cloudJobId || job.cloudJobId || null,
            shopId: existing.shopId || job.shopId || null,
          };
        }
        return {
          ok: false,
          printed: false,
          queued: true,
          deduped: true,
          idempotencyKey,
          cloudJobId: existing.cloudJobId || job.cloudJobId || null,
          shopId: existing.shopId || job.shopId || null,
          attempts: result.attempts || existing.attempts,
          error: result.error || 'Print failed — job kept in offline queue',
        };
      }

      // New job: enqueue and attempt execution
      const enqueued = queue.enqueue(job);
      if (!enqueued.ok) return enqueued;
      const row = queue.all().find((r) => r.idempotencyKey === idempotencyKey);
      const result = await queue.attempt(row);
      if (result.printed) {
        return {
          ok: true,
          printed: true,
          needsCloudAck: true,
          idempotencyKey,
          cloudJobId: job.cloudJobId || null,
          shopId: job.shopId || null,
        };
      }
      return {
        ok: false,
        printed: false,
        queued: true,
        idempotencyKey,
        cloudJobId: job.cloudJobId || null,
        shopId: job.shopId || null,
        attempts: result.attempts || 1,
        error: result.error || 'Print failed — job kept in offline queue',
      };
    }),
  );

  secureHandle(
    'pos-hardware:confirm-cloud-ack',
    wrap(async (_event, payload = {}) => {
      const { idempotencyKey, cloudJobId } = payload || {};
      if (!idempotencyKey) {
        return { ok: false, error: 'idempotencyKey is required' };
      }
      return queue.confirmCloudAck({ idempotencyKey, cloudJobId });
    }),
  );

  secureHandle(
    'pos-hardware:test-print',
    wrap(async (_event, payload = {}) => {
      const variant = payload.variant === 'kitchen' ? 'kitchen' : 'cashier';
      if (typeof adapters.testPrint === 'function') {
        return adapters.testPrint({ variant, receiptHtml: payload.receiptHtml });
      }
      const idempotencyKey = `test:${variant}:${Date.now()}`;
      const replayed = await queue.replay({ onlyIds: [] });
      void replayed;
      const result = await printer.print({
        idempotencyKey,
        kind: 'test',
        station: variant,
        mock: mock || undefined,
      });
      if (result && result.ok) return { ok: true, mock };
      return { ok: false, error: (result && result.error) || 'Test print failed' };
    }),
  );

  secureHandle(
    'pos-hardware:open-drawer',
    wrap(async (_event, payload = {}) => {
      if (!isDrawerEnabled(env)) {
        const err = new Error('Cash-drawer access requires the drawer permission flag');
        err.code = 'DRAWER_NOT_PERMITTED';
        throw err;
      }
      const printerId = typeof payload.printerId === 'string' ? payload.printerId.trim() : '';
      if (!printerId) {
        const err = new Error('Cash-drawer kick requires a bound printer');
        err.code = 'DRAWER_REQUIRES_PRINTER';
        throw err;
      }
      return drawer.kick({ printerId });
    }),
  );

  secureHandle(
    'pos-hardware:queue-status',
    wrap(async () => ({ ok: true, mock, jobs: queue.pending() })),
  );

  secureHandle(
    'pos-hardware:replay-queue',
    wrap(async () => ({ ok: true, mock, ...(await queue.replay()) })),
  );

  secureHandle(
    'pos-hardware:scanner-claim',
    wrap(async (_event, payload = {}) => {
      const { deviceId, holder, ttlMs = 30000 } = payload || {};
      if (!deviceId || !holder) throw new Error('deviceId and holder are required');
      const current = scannerClaims.get(deviceId);
      if (current && current.expiresAtMs > Date.now() && current.holder !== holder) {
        return { ok: false, code: 'SCANNER_CLAIMED', holder: current.holder };
      }
      scannerClaims.set(deviceId, { holder, expiresAtMs: Date.now() + ttlMs });
      return { ok: true, holder };
    }),
  );

  secureHandle(
    'pos-hardware:scanner-release',
    wrap(async (_event, payload = {}) => {
      const { deviceId, holder } = payload || {};
      const current = scannerClaims.get(deviceId);
      if (!current) return { ok: true, released: false };
      if (current.holder !== holder) {
        return { ok: false, code: 'SCANNER_NOT_HOLDER', holder: current.holder };
      }
      scannerClaims.delete(deviceId);
      return { ok: true, released: true };
    }),
  );

  return { queue, printer, drawer, mock, channels: [...POS_HARDWARE_CHANNELS] };
}

module.exports = {
  POS_HARDWARE_CHANNELS,
  isMockMode,
  isDrawerEnabled,
  createMockPrinterDriver,
  createMockDrawerDriver,
  createMemoryQueueStorage,
  createFileQueueStorage,
  createPrintQueue,
  registerPosHardwareIpc,
};
