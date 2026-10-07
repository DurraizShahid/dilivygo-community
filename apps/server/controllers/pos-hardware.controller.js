'use strict';

/**
 * POS hardware print-job & device HTTP controller.
 *
 * Provides durable cloud monitoring and telemetry for local desktop POS
 * printing and hardware devices. The desktop shell remains the execution
 * authority; this controller and `PosHardwareModel` form the durable
 * observability authority.
 *
 * In production:
 *   - Backed by PostgreSQL (`pos_print_jobs` & `pos_hardware_devices`).
 *   - Missing tables fail with 503 `POS_HARDWARE_STORAGE_NOT_READY`.
 *   - Storage errors fail with 503 `POS_HARDWARE_STORAGE_UNAVAILABLE`.
 *   - Idempotent deduplication at the DB layer via unique constraints.
 *   - Deterministic organization resolution from projectRef via `organizationIdByProjectRef`.
 *
 * In test/dev:
 *   - Degrades to in-memory ledger (`createPrintJobLedger`) when tables
 *     are missing pre-migration 120.
 *
 * Endpoints:
 *   POST  /print-jobs             idempotent enqueue
 *   GET   /print-jobs             scoped list (?status=&limit=)
 *   POST  /print-jobs/:id/cancel  cancel a non-terminal job
 *   PATCH /print-jobs/:id/status  report physical print execution state
 *   POST  /devices/heartbeat      report workstation/device health
 */

const {
  createPrintJobLedger,
  hardwareError,
} = require('../services/pos-hardware');
const { PosHardwareModel } = require('../models/pos-hardware.model');
const { organizationIdByProjectRef } = require('../lib/audit-org');
const logger = require('../lib/logger');

let posHardwareModel = new PosHardwareModel();
let ledger = createPrintJobLedger();
let jobsById = new Map();
let devicesById = new Map();

/** Test-only reset. */
function __resetPrintJobStoreForTests() {
  posHardwareModel = new PosHardwareModel();
  ledger = createPrintJobLedger();
  jobsById = new Map();
  devicesById = new Map();
}

function isProductionOrDurable() {
  return process.env.NODE_ENV === 'production' || process.env.FORCE_POS_DURABLE === '1';
}

async function resolveHardwareScope(req, res) {
  const projectRef = req.projectRef || null;
  const shopId = req.shopId || req.shop?.id || null;
  if (!projectRef || !shopId) {
    res.status(400).json({ error: 'Shop scope is required' });
    return null;
  }
  const organizationId = await organizationIdByProjectRef(String(projectRef));
  if (!organizationId) {
    res.status(422).json({
      error: 'Organization could not be determined for workspace',
      code: 'POS_HARDWARE_ORG_UNRESOLVED',
    });
    return null;
  }
  return {
    projectRef: String(projectRef),
    shopId: String(shopId),
    organizationId: String(organizationId),
  };
}

function toHardwareStatus(err, fallback = 500) {
  const status = err && (err.statusCode || err.status);
  return Number.isInteger(status) ? status : fallback;
}

function sanitizePrintJob(job) {
  if (!job || typeof job !== 'object') return null;
  return {
    id: job.job_id || job.id,
    station: job.station,
    kind: job.kind,
    idempotencyKey: job.idempotency_key || job.idempotencyKey,
    status: job.status,
    attempts: job.attempts,
    lastError: job.last_error !== undefined ? job.last_error : (job.lastError || null),
    createdAt: job.created_at || job.createdAt,
    updatedAt: job.updated_at || job.updatedAt,
  };
}

function scopedJobOr404(scope, id) {
  const job = jobsById.get(String(id)) || null;
  if (!job) return null;
  if (job.projectRef !== scope.projectRef || String(job.shopId) !== String(scope.shopId)) {
    return null;
  }
  return job;
}

/**
 * POST /pos-hardware/print-jobs — idempotent enqueue by scope + key.
 */
async function createPrintJob(req, res, next) {
  try {
    const scope = await resolveHardwareScope(req, res);
    if (!scope) return;
    const body = req.body || {};

    const station = body.station || body.stationName || 'cashier';
    const kind = body.kind || (body.printerKind === 'kitchen' ? 'kitchen-ticket' : 'receipt');
    const idempotencyKey = body.idempotencyKey;

    let dbResult = null;
    try {
      dbResult = await posHardwareModel.createPrintJob({
        organizationId: scope.organizationId,
        projectRef: scope.projectRef,
        shopId: scope.shopId,
        station,
        kind,
        idempotencyKey,
        payload: body.payload && typeof body.payload === 'object' ? body.payload : {},
      });
    } catch (err) {
      if (err.code === 'POS_HARDWARE_STORAGE_NOT_READY' || err.code === 'POS_HARDWARE_STORAGE_UNAVAILABLE' || isProductionOrDurable()) {
        const status = err.statusCode || 503;
        const code = err.code || 'POS_HARDWARE_STORAGE_NOT_READY';
        return res.status(status).json({ error: err.message, code });
      }
      logger.warn('pos-hardware print-job DB persistence skipped (pre-migration 120 or transient)', {
        op: 'insert-print-job',
        error: err && err.message ? String(err.message).slice(0, 300) : String(err),
      });
    }

    if (dbResult) {
      const job = dbResult.job;
      const sanitized = sanitizePrintJob(job);
      const keyId = job.job_id || job.id;
      const jobData = {
        ...job,
        id: keyId,
        idempotencyKey: job.idempotency_key || job.idempotencyKey,
        projectRef: scope.projectRef,
        shopId: scope.shopId,
        organizationId: scope.organizationId,
      };
      jobsById.set(keyId, jobData);
      if (job.id && job.id !== keyId) {
        jobsById.set(job.id, jobData);
      }
      if (job.job_id && job.job_id !== keyId) {
        jobsById.set(job.job_id, jobData);
      }
      try {
        ledger.enqueue({
          organizationId: scope.organizationId,
          projectRef: scope.projectRef,
          shopId: scope.shopId,
          station,
          kind,
          idempotencyKey,
          payload: body.payload && typeof body.payload === 'object' ? body.payload : {},
        });
      } catch (_) {}
      return res.status(dbResult.deduped ? 200 : 201).json({
        job: sanitized,
        deduped: dbResult.deduped,
      });
    }

    // In non-production test/dev fallback to in-memory ledger
    const inMem = ledger.enqueue({
      organizationId: scope.organizationId,
      projectRef: scope.projectRef,
      shopId: scope.shopId,
      station,
      kind,
      idempotencyKey,
      payload: body.payload && typeof body.payload === 'object' ? body.payload : {},
    });
    jobsById.set(inMem.job.id, {
      ...inMem.job,
      projectRef: scope.projectRef,
      shopId: scope.shopId,
      organizationId: scope.organizationId,
    });

    return res.status(inMem.deduped ? 200 : 201).json({
      job: sanitizePrintJob(inMem.job),
      deduped: inMem.deduped,
    });
  } catch (err) {
    if (err && (err.code || err.statusCode)) {
      return res.status(toHardwareStatus(err, 400)).json({ error: err.message, code: err.code });
    }
    return next(err);
  }
}

/**
 * GET /pos-hardware/print-jobs?status=&limit= — scoped list.
 */
async function listPrintJobs(req, res, next) {
  try {
    const scope = await resolveHardwareScope(req, res);
    if (!scope) return;
    const status = req.query?.status || null;
    const rawLimit = Number(req.query?.limit);
    const limit = Number.isFinite(rawLimit) ? Math.min(100, Math.max(1, Math.floor(rawLimit))) : 30;

    let dbJobs = null;
    try {
      dbJobs = await posHardwareModel.listPrintJobs({
        organizationId: scope.organizationId,
        projectRef: scope.projectRef,
        shopId: scope.shopId,
        status,
        limit,
      });
    } catch (err) {
      if (err.code === 'POS_HARDWARE_STORAGE_NOT_READY' || err.code === 'POS_HARDWARE_STORAGE_UNAVAILABLE' || isProductionOrDurable()) {
        return res.status(503).json({ error: err.message, code: err.code || 'POS_HARDWARE_STORAGE_NOT_READY' });
      }
    }

    if (Array.isArray(dbJobs)) {
      return res.json({ jobs: dbJobs.map(sanitizePrintJob), count: dbJobs.length });
    }

    // In-memory fallback
    const jobs = [...jobsById.values()]
      .filter((job) => job.projectRef === scope.projectRef && String(job.shopId) === String(scope.shopId))
      .filter((job) => (!status || job.status === status))
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0))
      .slice(0, limit)
      .map(sanitizePrintJob);

    return res.json({ jobs, count: jobs.length });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /pos-hardware/print-jobs/:id/cancel — cancel a non-terminal job.
 */
async function cancelPrintJob(req, res, next) {
  try {
    const scope = await resolveHardwareScope(req, res);
    if (!scope) return;
    const id = req.params?.id ? String(req.params.id) : '';

    let dbCancelled = null;
    try {
      dbCancelled = await posHardwareModel.cancelJob(id, scope, 'Cancelled by operator');
    } catch (err) {
      if (err.code === 'POS_PRINT_JOB_TERMINAL' || err.statusCode === 409) {
        return res.status(409).json({ error: err.message, code: 'POS_PRINT_JOB_TERMINAL' });
      }
      if (err.code === 'POS_PRINT_JOB_NOT_FOUND' || err.statusCode === 404) {
        if (isProductionOrDurable()) {
          return res.status(404).json({ error: err.message, code: 'POS_PRINT_JOB_NOT_FOUND' });
        }
      }
      if (err.code === 'POS_HARDWARE_STORAGE_NOT_READY' || err.code === 'POS_HARDWARE_STORAGE_UNAVAILABLE' || isProductionOrDurable()) {
        return res.status(503).json({ error: err.message, code: err.code || 'POS_HARDWARE_STORAGE_NOT_READY' });
      }
    }

    if (dbCancelled) {
      jobsById.set(dbCancelled.id, {
        ...dbCancelled,
        projectRef: scope.projectRef,
        shopId: scope.shopId,
        organizationId: scope.organizationId,
      });
      return res.json({ job: sanitizePrintJob(dbCancelled), cancelled: true });
    }

    // In-memory fallback
    const known = scopedJobOr404(scope, id);
    if (!known) {
      return res.status(404).json({ error: 'Print job not found', code: 'POS_PRINT_JOB_NOT_FOUND' });
    }
    if (known.status === 'acked') {
      return res.status(409).json({ error: 'Print job is already acked', code: 'POS_PRINT_JOB_TERMINAL' });
    }

    const key = known.idempotencyKey;
    let cancelled;
    try {
      cancelled = ledger.markFailed(key, scope, 'Cancelled by operator');
    } catch (transitionErr) {
      return res.status(toHardwareStatus(transitionErr, 409)).json({
        error: transitionErr.message,
        code: transitionErr.code,
      });
    }

    jobsById.set(cancelled.id, { ...cancelled, projectRef: scope.projectRef, shopId: scope.shopId });
    logger.warn('pos-hardware print-job DB persistence skipped (pre-migration 120 or transient)', {
      op: 'cancel-print-job',
      jobId: cancelled.id,
    });
    return res.json({ job: sanitizePrintJob(cancelled), cancelled: true });
  } catch (err) {
    return next(err);
  }
}

/**
 * PATCH /pos-hardware/print-jobs/:id/status — report execution state from desktop POS.
 */
async function updatePrintJobStatus(req, res, next) {
  try {
    const scope = await resolveHardwareScope(req, res);
    if (!scope) return;
    const id = req.params?.id ? String(req.params.id) : '';
    const body = req.body || {};

    let dbUpdated = null;
    try {
      dbUpdated = await posHardwareModel.updateJobStatus(id, scope, {
        status: body.status,
        attempts: body.attempts,
        lastError: body.lastError || body.errorMessage || null,
        deviceId: body.deviceId,
      });
    } catch (err) {
      if (err.code === 'POS_PRINT_JOB_TERMINAL' || err.statusCode === 409) {
        return res.status(409).json({ error: err.message, code: 'POS_PRINT_JOB_TERMINAL' });
      }
      if (err.code === 'POS_PRINT_JOB_NOT_FOUND' || err.statusCode === 404) {
        if (isProductionOrDurable()) {
          return res.status(404).json({ error: err.message, code: 'POS_PRINT_JOB_NOT_FOUND' });
        }
      }
      if (err.code === 'POS_HARDWARE_STORAGE_NOT_READY' || err.code === 'POS_HARDWARE_STORAGE_UNAVAILABLE' || isProductionOrDurable()) {
        return res.status(503).json({ error: err.message, code: err.code || 'POS_HARDWARE_STORAGE_NOT_READY' });
      }
    }

    if (dbUpdated) {
      jobsById.set(dbUpdated.id, {
        ...dbUpdated,
        projectRef: scope.projectRef,
        shopId: scope.shopId,
        organizationId: scope.organizationId,
      });
      return res.json({ job: sanitizePrintJob(dbUpdated) });
    }

    // In-memory fallback (only when DB has missing table in dev/test)
    const known = scopedJobOr404(scope, id);
    if (!known) {
      return res.status(404).json({ error: 'Print job not found', code: 'POS_PRINT_JOB_NOT_FOUND' });
    }
    if (known.status === 'acked') {
      if (body.status === 'acked') {
        return res.json({ job: sanitizePrintJob(known) });
      }
      return res.status(409).json({ error: 'Print job is already acked', code: 'POS_PRINT_JOB_TERMINAL' });
    }

    const key = known.idempotencyKey;
    let transitioned;
    try {
      if (body.status === 'sent') {
        transitioned = ledger.markSent(key, scope);
      } else if (body.status === 'acked') {
        transitioned = ledger.markAcked(key, scope);
      } else if (body.status === 'failed') {
        const errorMsg = body.lastError || body.errorMessage || 'Print failed';
        transitioned = ledger.markFailed(key, scope, errorMsg);
      }
    } catch (transitionErr) {
      return res.status(toHardwareStatus(transitionErr, 409)).json({
        error: transitionErr.message,
        code: transitionErr.code,
      });
    }

    if (transitioned) {
      jobsById.set(transitioned.id, {
        ...transitioned,
        projectRef: scope.projectRef,
        shopId: scope.shopId,
        attempts: body.attempts !== undefined ? body.attempts : transitioned.attempts,
      });
    }

    const finalJob = jobsById.get(id) || transitioned || known;
    return res.json({ job: sanitizePrintJob(finalJob) });
  } catch (err) {
    if (err && (err.code || err.statusCode)) {
      return res.status(toHardwareStatus(err, 400)).json({ error: err.message, code: err.code });
    }
    return next(err);
  }
}

/**
 * POST /pos-hardware/devices/heartbeat — report workstation & device health.
 */
async function deviceHeartbeat(req, res, next) {
  try {
    const scope = await resolveHardwareScope(req, res);
    if (!scope) return;
    const body = req.body || {};

    let durableResult = null;
    try {
      durableResult = await posHardwareModel.upsertHeartbeat({
        organizationId: scope.organizationId,
        projectRef: scope.projectRef,
        shopId: scope.shopId,
        deviceName: body.deviceName,
        deviceKind: body.deviceKind || 'printer',
        station: body.station || body.stationName || 'cashier',
        connection: body.connection || (body.statusDetails && typeof body.statusDetails === 'object' ? body.statusDetails : {}),
        capabilities: body.capabilities || {},
        isMock: body.isMock !== undefined ? Boolean(body.isMock) : true,
      });
    } catch (err) {
      if (err.code === 'POS_HARDWARE_STORAGE_NOT_READY' || err.code === 'POS_HARDWARE_STORAGE_UNAVAILABLE' || isProductionOrDurable()) {
        return res.status(503).json({ error: err.message, code: err.code || 'POS_HARDWARE_STORAGE_NOT_READY' });
      }
      logger.warn('pos-hardware device heartbeat DB persistence skipped (pre-migration 120 or transient)', {
        op: 'device-heartbeat',
        deviceName: body.deviceName,
        error: err?.message,
      });
    }

    if (durableResult) {
      const dev = durableResult.device;
      const sanitized = {
        id: dev.id,
        organizationId: dev.organization_id || dev.organizationId || null,
        projectRef: dev.project_ref || dev.projectRef,
        shopId: dev.shop_id || dev.shopId || null,
        deviceName: dev.device_name || dev.deviceName,
        deviceKind: dev.device_kind || dev.deviceKind,
        station: dev.station,
        connection: dev.connection,
        capabilities: dev.capabilities,
        isMock: dev.is_mock !== undefined ? Boolean(dev.is_mock) : Boolean(dev.isMock),
        healthState: dev.healthState || (dev.last_seen_at ? 'online' : 'offline'),
        lastSeenAt: dev.last_seen_at || dev.lastSeenAt,
        createdAt: dev.created_at || dev.createdAt,
        updatedAt: dev.updated_at || dev.updatedAt,
      };
      return res.json({ ok: true, device: sanitized, created: durableResult.created });
    }

    // In-memory fallback
    const devKey = `${scope.projectRef}::${scope.shopId}::${body.deviceName}`;
    const now = new Date().toISOString();
    const existing = devicesById.get(devKey);
    const mockDev = {
      id: existing ? existing.id : `dev_${Buffer.from(devKey).toString('hex').slice(0, 16)}`,
      organizationId: scope.organizationId,
      projectRef: scope.projectRef,
      shopId: scope.shopId,
      deviceName: body.deviceName,
      deviceKind: body.deviceKind || 'printer',
      station: body.station || 'cashier',
      connection: body.connection || {},
      capabilities: body.capabilities || {},
      isMock: body.isMock !== undefined ? Boolean(body.isMock) : true,
      lastSeenAt: now,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
    };
    devicesById.set(devKey, mockDev);
    return res.json({ ok: true, device: mockDev, created: !existing });
  } catch (err) {
    if (err && (err.code || err.statusCode)) {
      return res.status(toHardwareStatus(err, 400)).json({ error: err.message, code: err.code });
    }
    return next(err);
  }
}

module.exports = {
  createPrintJob,
  listPrintJobs,
  cancelPrintJob,
  updatePrintJobStatus,
  deviceHeartbeat,
  __resetPrintJobStoreForTests,
};
