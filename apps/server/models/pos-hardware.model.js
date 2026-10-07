'use strict';

/**
 * POS hardware operations model — durable storage authority for POS
 * hardware devices and idempotent print jobs.
 *
 * Persistence tables (migrations 120 / 143):
 *   - `pos_hardware_devices`
 *   - `pos_print_jobs`
 *
 * Scoping & Invariants:
 *   - Every device and job carries `project_ref` and `organization_id`.
 *   - Unique constraint `(project_ref, shop_id, idempotency_key)` is the
 *     durable duplicate-print prevention at the database layer.
 *   - Unique constraint `(project_ref, shop_id, device_name)` is the
 *     workstation device registration uniqueness constraint.
 *   - In production, missing tables throw `POS_HARDWARE_STORAGE_NOT_READY` (503)
 *     to prevent silent degradation of operational truth.
 *   - In test/dev, callers can degrade to an in-memory ledger if explicitly
 *     configured.
 *   - Never returns raw print payloads through diagnostics responses.
 */

const { select, insert, update } = require('../lib/supabase');
const {
  derivePrintJobId,
  sanitizeHardwareError,
  PRINT_JOB_STATES,
  PRINT_JOB_TERMINAL_STATES,
} = require('../services/pos-hardware');
const logger = require('../lib/logger');

const DEVICES_TABLE = 'pos_hardware_devices';
const PRINT_JOBS_TABLE = 'pos_print_jobs';

const VALID_TRANSITIONS = Object.freeze({
  queued: Object.freeze(['sent', 'acked', 'failed']),
  sent: Object.freeze(['sent', 'acked', 'failed']),
  failed: Object.freeze(['sent', 'acked', 'failed']),
  acked: Object.freeze(['acked']),
});

function isValidTransition(from, to) {
  if (!from || !to) return false;
  if (from === to) return true;
  const allowed = VALID_TRANSITIONS[from];
  return Array.isArray(allowed) && allowed.includes(to);
}

function isMissingTableError(err) {
  if (!err) return false;
  const msg = (err.body || err.message || '').toString();
  const code = err.code || '';
  return (
    code === '42P01' ||
    msg.includes('42P01') ||
    (msg.includes('relation') && msg.includes('does not exist')) ||
    (err.statusCode === 404 && (msg.includes('pos_hardware_devices') || msg.includes('pos_print_jobs')))
  );
}

function handleStorageError(err, context = 'pos-hardware-storage', requireDurable = false) {
  const missing = isMissingTableError(err);
  const isProduction =
    requireDurable ||
    process.env.NODE_ENV === 'production' ||
    process.env.FORCE_POS_DURABLE === '1';

  if (isProduction) {
    const error = new Error(
      missing
        ? 'POS hardware storage tables are not ready in production'
        : (err.message || 'POS hardware storage unavailable in production')
    );
    error.statusCode = 503;
    error.code = missing ? 'POS_HARDWARE_STORAGE_NOT_READY' : 'POS_HARDWARE_STORAGE_UNAVAILABLE';
    throw error;
  }
  if (missing) {
    const error = new Error('POS hardware storage table missing');
    error.statusCode = 503;
    error.code = 'POS_HARDWARE_TABLE_MISSING';
    error.isMissingTable = true;
    throw error;
  }
  throw err;
}

/** Sanitize connection info: strip any credentials, secrets, or tokens. */
function sanitizeConnectionInfo(connection) {
  if (!connection || typeof connection !== 'object') return {};
  const safe = {};
  const blockedKeys = ['password', 'secret', 'token', 'key', 'auth', 'credential'];
  for (const [k, v] of Object.entries(connection)) {
    const lower = k.toLowerCase();
    if (!blockedKeys.some((blocked) => lower.includes(blocked))) {
      safe[k] = v;
    }
  }
  return safe;
}

/** Derive device health state from lastSeenAt timestamp. */
function deriveHealthState(lastSeenAt, nowMs = Date.now()) {
  if (!lastSeenAt) return 'offline';
  const seenMs = new Date(lastSeenAt).getTime();
  if (Number.isNaN(seenMs)) return 'offline';
  const diffMs = nowMs - seenMs;
  if (diffMs <= 2 * 60 * 1000) return 'online'; // <= 2 min
  if (diffMs <= 10 * 60 * 1000) return 'stale'; // 2-10 min
  return 'offline'; // > 10 min
}

class PosHardwareModel {
  constructor({ requireDurable = false } = {}) {
    this.requireDurable = requireDurable;
  }

  // ─── Print Jobs ─────────────────────────────────────────────────────────

  async createPrintJob({
    organizationId = null,
    projectRef,
    shopId,
    deviceId = null,
    station = 'cashier',
    kind = 'receipt',
    idempotencyKey,
    payload = {},
  }) {
    if (!projectRef || !shopId || !idempotencyKey) {
      const err = new Error('projectRef, shopId, and idempotencyKey are required');
      err.statusCode = 400;
      err.code = 'POS_HARDWARE_SCOPE_REQUIRED';
      throw err;
    }

    const derivedJobId = derivePrintJobId({ projectRef, shopId, idempotencyKey });
    const now = new Date().toISOString();

    const insertData = {
      job_id: derivedJobId,
      organization_id: organizationId,
      project_ref: projectRef,
      shop_id: shopId,
      device_id: deviceId,
      station: station || 'cashier',
      kind: kind || 'receipt',
      idempotency_key: idempotencyKey,
      payload: payload && typeof payload === 'object' ? payload : {},
      status: 'queued',
      attempts: 0,
      last_error: null,
      created_at: now,
      updated_at: now,
    };

    try {
      const inserted = await insert(PRINT_JOBS_TABLE, [insertData]);
      const row = Array.isArray(inserted) ? inserted[0] : inserted;
      return { job: row, deduped: false };
    } catch (err) {
      const isDuplicate =
        err.code === '23505' ||
        err.statusCode === 409 ||
        (err.body && (err.body.includes('23505') || err.body.includes('pos_print_jobs_scope_idem_uq')));

      if (isDuplicate) {
        const existing = await this.findJobByIdempotencyKey(idempotencyKey, { projectRef, shopId });
        if (existing) {
          return { job: existing, deduped: true };
        }
      }
      return handleStorageError(err, 'createPrintJob', this.requireDurable);
    }
  }

  async findJobById(id, { projectRef = null, shopId = null, organizationId = null } = {}) {
    if (!id) return null;
    try {
      const filters = {};
      if (organizationId) filters.organization_id = organizationId;
      if (projectRef) filters.project_ref = projectRef;
      if (shopId) filters.shop_id = shopId;

      let rows;
      if (typeof id === 'string' && id.startsWith('pj_')) {
        rows = await select(PRINT_JOBS_TABLE, { filters: { ...filters, job_id: id }, limit: 1 });
      } else {
        rows = await select(PRINT_JOBS_TABLE, { filters: { ...filters, id }, limit: 1 });
        if (!rows || rows.length === 0) {
          rows = await select(PRINT_JOBS_TABLE, { filters: { ...filters, job_id: id }, limit: 1 });
        }
      }
      return rows?.[0] || null;
    } catch (err) {
      return handleStorageError(err, 'findJobById', this.requireDurable);
    }
  }

  async findJobByIdempotencyKey(idempotencyKey, { projectRef, shopId }) {
    if (!idempotencyKey || !projectRef || !shopId) return null;
    try {
      const rows = await select(PRINT_JOBS_TABLE, {
        filters: { idempotency_key: idempotencyKey, project_ref: projectRef, shop_id: shopId },
        limit: 1,
      });
      return rows?.[0] || null;
    } catch (err) {
      return handleStorageError(err, 'findJobByIdempotencyKey', this.requireDurable);
    }
  }

  async updateJobStatus(id, scope = {}, { status, attempts, lastError = null, deviceId = null }) {
    if (!PRINT_JOB_STATES.includes(status)) {
      const err = new Error(`Unknown print-job status: ${status}`);
      err.statusCode = 400;
      err.code = 'POS_PRINT_JOB_BAD_STATE';
      throw err;
    }

    const MAX_CAS_RETRIES = 3;

    for (let retry = 0; retry < MAX_CAS_RETRIES; retry++) {
      const job = await this.findJobById(id, scope);
      if (!job) {
        const err = new Error('Print job not found');
        err.statusCode = 404;
        err.code = 'POS_PRINT_JOB_NOT_FOUND';
        throw err;
      }

      // Terminal guard: once acked, cannot become failed or change state
      if (PRINT_JOB_TERMINAL_STATES.includes(job.status)) {
        if (status === 'acked') {
          return job;
        }
        const err = new Error(`Print job is already ${job.status}`);
        err.statusCode = 409;
        err.code = 'POS_PRINT_JOB_TERMINAL';
        throw err;
      }

      if (!isValidTransition(job.status, status)) {
        const err = new Error(`Cannot transition print job from ${job.status} to ${status}`);
        err.statusCode = 409;
        err.code = 'POS_PRINT_JOB_TERMINAL';
        throw err;
      }

      const nextAttempts =
        typeof attempts === 'number' && Number.isInteger(attempts)
          ? Math.max(job.attempts || 0, attempts)
          : status === 'failed'
            ? (job.attempts || 0) + 1
            : (job.attempts || 0);

      const nextError =
        status === 'failed'
          ? sanitizeHardwareError(lastError || 'Print failed')
          : status === 'acked'
            ? null
            : job.last_error;

      const patch = {
        status,
        attempts: nextAttempts,
        last_error: nextError,
        updated_at: new Date().toISOString(),
      };
      if (deviceId) {
        patch.device_id = deviceId;
      }

      try {
        const updated = await update(PRINT_JOBS_TABLE, patch, { id: job.id, status: job.status });
        if (!updated || (Array.isArray(updated) && updated.length === 0)) {
          // CAS missed — status changed concurrently. Retry loop will re-read and check terminal/transition state.
          continue;
        }
        return Array.isArray(updated) ? updated[0] : (updated || { ...job, ...patch });
      } catch (err) {
        if (err.code === 'POS_PRINT_JOB_TERMINAL' || err.statusCode === 409) {
          throw err;
        }
        return handleStorageError(err, 'updateJobStatus', this.requireDurable);
      }
    }

    // Retries exhausted — final check
    const finalJob = await this.findJobById(id, scope);
    if (finalJob && PRINT_JOB_TERMINAL_STATES.includes(finalJob.status)) {
      if (status === 'acked') return finalJob;
      const err = new Error(`Print job is already ${finalJob.status}`);
      err.statusCode = 409;
      err.code = 'POS_PRINT_JOB_TERMINAL';
      throw err;
    }
    const conflictErr = new Error('Print job status update conflicted concurrently; please retry');
    conflictErr.statusCode = 409;
    conflictErr.code = 'POS_PRINT_JOB_CONFLICT';
    throw conflictErr;
  }

  async cancelJob(id, scope = {}, reason = 'Cancelled by operator') {
    return this.updateJobStatus(id, scope, {
      status: 'failed',
      lastError: reason,
    });
  }

  async listPrintJobs({
    organizationId = null,
    projectRef = null,
    shopId = null,
    station = null,
    status = null,
    kind = null,
    startDate = null,
    endDate = null,
    limit = 30,
    offset = 0,
  } = {}) {
    const filters = {};
    if (organizationId) filters.organization_id = organizationId;
    if (projectRef) filters.project_ref = projectRef;
    if (shopId) filters.shop_id = shopId;
    if (station) filters.station = station;
    if (status) filters.status = status;
    if (kind) filters.kind = kind;

    const rawFilters = [];
    if (startDate) rawFilters.push(`created_at=gte.${startDate}`);
    if (endDate) rawFilters.push(`created_at=lte.${endDate}`);

    try {
      const rows = await select(PRINT_JOBS_TABLE, {
        select: 'id,job_id,organization_id,project_ref,shop_id,device_id,station,kind,idempotency_key,status,attempts,last_error,created_at,updated_at',
        filters,
        rawFilters,
        order: 'created_at.desc',
        limit: Math.min(100, Math.max(1, limit)),
        offset: Math.max(0, offset),
      });
      return Array.isArray(rows) ? rows : [];
    } catch (err) {
      return handleStorageError(err, 'listPrintJobs', this.requireDurable);
    }
  }

  // ─── Devices & Heartbeat ──────────────────────────────────────────────────

  async upsertHeartbeat({
    organizationId = null,
    projectRef,
    shopId,
    deviceName,
    deviceKind = 'printer',
    station = 'cashier',
    connection = {},
    capabilities = {},
    isMock = true,
  }) {
    if (!projectRef || !shopId || !deviceName) {
      const err = new Error('projectRef, shopId, and deviceName are required for device heartbeat');
      err.statusCode = 400;
      err.code = 'POS_DEVICE_SCOPE_REQUIRED';
      throw err;
    }

    const now = new Date().toISOString();
    const sanitizedConn = sanitizeConnectionInfo(connection);

    try {
      const existingRows = await select(DEVICES_TABLE, {
        filters: { project_ref: projectRef, shop_id: shopId, device_name: deviceName },
        limit: 1,
      });

      const existing = existingRows?.[0];
      if (existing) {
        const patch = {
          device_kind: deviceKind || existing.device_kind,
          station: station || existing.station,
          connection: sanitizedConn,
          capabilities: capabilities && typeof capabilities === 'object' ? capabilities : existing.capabilities,
          is_mock: Boolean(isMock),
          last_seen_at: now,
          updated_at: now,
        };
        if (organizationId && !existing.organization_id) {
          patch.organization_id = organizationId;
        }
        const updated = await update(DEVICES_TABLE, patch, { id: existing.id });
        const row = Array.isArray(updated) ? updated[0] : (updated || { ...existing, ...patch });
        return { device: row, created: false };
      }

      const insertData = {
        organization_id: organizationId,
        project_ref: projectRef,
        shop_id: shopId,
        device_name: deviceName,
        device_kind: deviceKind || 'printer',
        station: station || 'cashier',
        connection: sanitizedConn,
        capabilities: capabilities && typeof capabilities === 'object' ? capabilities : {},
        is_mock: Boolean(isMock),
        last_seen_at: now,
        created_at: now,
        updated_at: now,
      };

      const inserted = await insert(DEVICES_TABLE, [insertData]);
      const row = Array.isArray(inserted) ? inserted[0] : inserted;
      return { device: row, created: true };
    } catch (err) {
      return handleStorageError(err, 'upsertHeartbeat', this.requireDurable);
    }
  }

  async listDevices({
    organizationId = null,
    projectRef = null,
    shopId = null,
    station = null,
    deviceKind = null,
    isMock = null,
  } = {}) {
    const filters = {};
    if (organizationId) filters.organization_id = organizationId;
    if (projectRef) filters.project_ref = projectRef;
    if (shopId) filters.shop_id = shopId;
    if (station) filters.station = station;
    if (deviceKind) filters.device_kind = deviceKind;
    if (typeof isMock === 'boolean') filters.is_mock = isMock;

    try {
      const rows = await select(DEVICES_TABLE, {
        filters,
        order: 'last_seen_at.desc.nullslast',
      });
      const list = Array.isArray(rows) ? rows : [];
      return list.map((dev) => ({
        ...dev,
        connection: sanitizeConnectionInfo(dev.connection),
        healthState: deriveHealthState(dev.last_seen_at),
      }));
    } catch (err) {
      return handleStorageError(err, 'listDevices', this.requireDurable);
    }
  }

  // ─── Diagnostics & Overview ───────────────────────────────────────────────

  async getOverviewMetrics(organizationId, { projectRef = null, shopId = null, station = null } = {}) {
    if (!organizationId) {
      const err = new Error('organizationId is required for overview metrics');
      err.statusCode = 400;
      err.code = 'POS_HARDWARE_ORG_REQUIRED';
      throw err;
    }

    try {
      const devices = await this.listDevices({ organizationId, projectRef, shopId, station });

      let online = 0;
      let offline = 0;
      let stale = 0;
      let mockDevices = 0;

      for (const dev of devices) {
        if (dev.is_mock) mockDevices += 1;
        const state = dev.healthState;
        if (state === 'online') online += 1;
        else if (state === 'stale') stale += 1;
        else offline += 1;
      }

      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const recentJobs = await this.listPrintJobs({
        organizationId,
        projectRef,
        shopId,
        station,
        startDate: since24h,
        limit: 100,
      });

      const printsToday = recentJobs.length;
      const failedPrintsToday = recentJobs.filter((j) => j.status === 'failed').length;
      const failureRate = printsToday > 0 ? Number(((failedPrintsToday / printsToday) * 100).toFixed(1)) : 0;

      const successfulJobs = recentJobs.filter((j) => j.status === 'acked');
      let latestSuccessfulPrint = successfulJobs[0]?.created_at || null;
      if (!latestSuccessfulPrint) {
        const lastAcked = await select(PRINT_JOBS_TABLE, {
          select: 'created_at',
          filters: { organization_id: organizationId, status: 'acked' },
          order: 'created_at.desc',
          limit: 1,
        });
        latestSuccessfulPrint = lastAcked?.[0]?.created_at || null;
      }

      const recentFailures = recentJobs
        .filter((j) => j.status === 'failed')
        .slice(0, 5)
        .map((j) => ({
          id: j.id,
          jobId: j.job_id,
          shopId: j.shop_id,
          station: j.station,
          deviceName: null,
          error: j.last_error || 'Print failed',
          attempts: j.attempts || 1,
          createdAt: j.created_at,
        }));

      return {
        workstations: devices.length,
        online,
        offline,
        stale,
        mockDevices,
        printsToday,
        failedPrintsToday,
        failureRate,
        latestSuccessfulPrint,
        recentFailures,
      };
    } catch (err) {
      return handleStorageError(err, 'getOverviewMetrics', this.requireDurable);
    }
  }
}

module.exports = {
  PosHardwareModel,
  isMissingTableError,
  handleStorageError,
  sanitizeConnectionInfo,
  deriveHealthState,
  DEVICES_TABLE,
  PRINT_JOBS_TABLE,
  VALID_TRANSITIONS,
  isValidTransition,
};
