'use strict';

/**
 * Thin wrapper over BullMQ that lets each job file register itself with a
 * declarative descriptor and plugs into both the boot manager and the
 * graceful-shutdown path automatically.
 *
 * Each job declares:
 *   - name:      unique queue / worker id (also the BullMQ `Queue` name)
 *   - schedule:  `{ every: <ms> }` OR `{ pattern: '<cron>', tz?: 'UTC' }`
 *   - runOnce:   `async ({ job, logger }) => void` — the business logic
 *   - concurrency: workers pulled at most once at a time on this instance
 *                  (default 1 — matches the historical distributed-lock
 *                  behaviour of the node-cron implementations)
 *   - attempts, backoff, removeOnComplete/Fail: BullMQ job options. Sensible
 *     defaults mirror the production-hardening rule: keep the last 100
 *     completed / 500 failed jobs for debuggability.
 *
 * BullMQ v5 has the scheduler built into `Queue` itself — we no longer need
 * the `QueueScheduler` class that was required in v3/v4.
 */

const { Queue, Worker } = require('bullmq');
const { createBullConnection } = require('./bull-connection');
const logger = require('./logger');
const sentry = require('./sentry');

const DEFAULT_JOB_OPTS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: { age: 24 * 3600, count: 100 },
  removeOnFail: { age: 7 * 24 * 3600, count: 500 },
};

const registered = new Map();

/**
 * Register a recurring job backed by BullMQ.
 *
 * Returns a handle with `queue`, `worker`, and `shutdown()`.
 */
async function registerBullJob(descriptor) {
  const {
    name,
    schedule,
    runOnce,
    concurrency = 1,
    attempts,
    backoff,
    removeOnComplete,
    removeOnFail,
    lockDuration,
    stalledInterval,
  } = descriptor;

  if (!name) throw new Error('registerBullJob: name required');
  if (!schedule) throw new Error(`registerBullJob(${name}): schedule required`);
  if (typeof runOnce !== 'function') {
    throw new Error(`registerBullJob(${name}): runOnce must be a function`);
  }

  const queueConn = createBullConnection({ label: `${name}:queue` });
  const workerConn = createBullConnection({ label: `${name}:worker` });
  if (!queueConn || !workerConn) {
    throw new Error(`registerBullJob(${name}): REDIS_URL not set — BullMQ cannot be used`);
  }

  const queue = new Queue(name, { connection: queueConn });
  const jobOptions = {
    ...DEFAULT_JOB_OPTS,
    ...(attempts !== undefined ? { attempts } : {}),
    ...(backoff ? { backoff } : {}),
    ...(removeOnComplete ? { removeOnComplete } : {}),
    ...(removeOnFail ? { removeOnFail } : {}),
  };

  // upsertJobScheduler is idempotent: repeated boots (blue/green deploys,
  // horizontal replicas, nodemon restarts) don't produce duplicate schedules.
  const schedulerId = `dilivygo:${name}`;
  const repeatOpts = schedule.every
    ? { every: schedule.every }
    : { pattern: schedule.pattern, tz: schedule.tz || 'UTC' };
  await queue.upsertJobScheduler(schedulerId, repeatOpts, {
    name,
    data: {},
    opts: jobOptions,
  });

  const worker = new Worker(
    name,
    async (job) => {
      const startedAt = Date.now();
      try {
        const result = await runOnce({ job, logger });
        const durationMs = Date.now() - startedAt;
        if (durationMs > 5_000) {
          logger.info(`[bullmq:${name}] slow run`, { durationMs, id: job.id });
        }
        return result;
      } catch (err) {
        logger.error(`[bullmq:${name}] failed`, { error: err.message, stack: err.stack });
        sentry.captureException(err, {
          tags: { kind: 'job', job: name, runner: 'bullmq' },
        });
        throw err;
      }
    },
    {
      connection: workerConn,
      concurrency,
      ...(lockDuration ? { lockDuration } : {}),
      ...(stalledInterval ? { stalledInterval } : {}),
    }
  );

  worker.on('error', (err) => {
    // ioredis reconnect blips surface here — demote to warn unless fatal.
    logger.warn(`[bullmq:${name}] worker error`, { message: err.message });
  });
  worker.on('failed', (job, err) => {
    logger.warn(`[bullmq:${name}] job failed`, {
      id: job?.id,
      attemptsMade: job?.attemptsMade,
      error: err?.message,
    });
  });

  const handle = {
    name,
    kind: 'bullmq',
    queue,
    worker,
    shutdown: async () => {
      try {
        await worker.close();
      } catch (err) {
        logger.warn(`[bullmq:${name}] worker close failed`, { message: err.message });
      }
      try {
        await queue.close();
      } catch (err) {
        logger.warn(`[bullmq:${name}] queue close failed`, { message: err.message });
      }
      try {
        if (queueConn.status !== 'end') await queueConn.quit();
      } catch { /* ignore */ }
      try {
        if (workerConn.status !== 'end') await workerConn.quit();
      } catch { /* ignore */ }
      registered.delete(name);
    },
  };

  registered.set(name, handle);
  logger.info(
    `Background job started (bullmq): ${name} ${
      schedule.every ? `every ${schedule.every}ms` : `cron "${schedule.pattern}"`
    }`
  );
  return handle;
}

/** Snapshot of currently-registered job names — primarily for tests. */
function listRegistered() {
  return Array.from(registered.keys());
}

/** Close everything the registry owns. Safe to call multiple times. */
async function shutdownAll() {
  const handles = Array.from(registered.values());
  await Promise.allSettled(handles.map((h) => h.shutdown()));
}

module.exports = {
  registerBullJob,
  listRegistered,
  shutdownAll,
  DEFAULT_JOB_OPTS,
};
