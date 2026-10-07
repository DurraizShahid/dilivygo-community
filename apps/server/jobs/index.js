'use strict';

/**
 * Background-job boot manager.
 *
 * Production is deliberately stricter than development: if a BullMQ job cannot
 * register, the process fails startup instead of silently running an in-process
 * cron substitute with different distributed-lock/failover semantics.
 */

const config = require('../config');
const logger = require('../lib/logger');
const { registerBullJob } = require('../lib/queue-registry');
const { isBullMqEnabled } = require('../lib/bull-connection');

const JOB_MODULES = [
  require('./scheduled-orders.job'),
  require('./cart-cleanup.job'),
  require('./checkout-batch-cleanup.job'),
  require('./inventory-reservation-cleanup.job'),
  require('./refund-recovery.job'),
  require('./integration-webhook-delivery.job'),
  require('./payment-reconciliation.job'),
  require('./sla-check.job'),
];

function resolveRunner() {
  const forced = (config.jobs.runner || 'auto').toLowerCase();
  if (forced === 'off') return 'off';
  if (forced === 'cron') return 'cron';
  if (forced === 'bullmq') {
    if (!config.redis.url) {
      throw new Error('JOB_RUNNER=bullmq but REDIS_URL is not set');
    }
    return 'bullmq';
  }
  return isBullMqEnabled() ? 'bullmq' : 'cron';
}

function startCronHandle(mod) {
  const task = mod.start();
  return {
    name: mod.name || mod.schedule?.pattern || 'anon-cron',
    kind: 'cron',
    task,
    shutdown: async () => {
      try { task?.stop?.(); } catch { /* ignore */ }
    },
  };
}

async function bootJobs() {
  const runner = resolveRunner();
  logger.info(`Background jobs: selected runner = ${runner}`, {
    redis: config.redis.url ? 'configured' : 'missing',
    forced: config.jobs.runner,
  });

  if (config.isProd && runner !== 'bullmq') {
    throw new Error(`Production background jobs require BullMQ; resolved runner was ${runner}`);
  }

  if (runner === 'off') {
    return { runner, handles: [], shutdown: async () => {} };
  }

  if (runner === 'cron') {
    const handles = JOB_MODULES.map((mod) => startCronHandle(mod));
    return {
      runner,
      handles,
      shutdown: async () => { await Promise.allSettled(handles.map((h) => h.shutdown())); },
    };
  }

  const bullHandles = [];
  const failedModules = [];
  for (const mod of JOB_MODULES) {
    if (!mod.name || !mod.schedule || typeof mod.runOnce !== 'function') {
      logger.warn('Job module missing BullMQ metadata — skipping', {
        hasName: Boolean(mod.name),
        hasSchedule: Boolean(mod.schedule),
        hasRunOnce: typeof mod.runOnce === 'function',
      });
      failedModules.push(mod);
      continue;
    }
    try {
      const handle = await registerBullJob({
        name: mod.name,
        schedule: mod.schedule,
        runOnce: async () => mod.runOnce({ skipLock: false }),
      });
      bullHandles.push(handle);
    } catch (err) {
      logger.error(`Failed to register BullMQ job "${mod.name}"`, { error: err.message });
      failedModules.push(mod);
    }
  }

  if (failedModules.length && config.isProd) {
    await Promise.allSettled(bullHandles.map((h) => h.shutdown?.()));
    const names = failedModules.map((mod) => mod.name || 'unknown');
    throw new Error(`BullMQ registration incomplete in production: ${names.join(', ')}`);
  }

  const cronFallbackHandles = [];
  if (failedModules.length) {
    const names = failedModules.map((mod) => mod.name || 'unknown');
    logger.warn('BullMQ registration incomplete — starting development cron fallback', {
      failedCount: failedModules.length,
      failedJobs: names,
    });
    for (const mod of failedModules) cronFallbackHandles.push(startCronHandle(mod));
  }

  const handles = [...bullHandles, ...cronFallbackHandles];
  const effectiveRunner = bullHandles.length
    ? (cronFallbackHandles.length ? 'bullmq+cron-fallback' : 'bullmq')
    : 'cron';

  return {
    runner: effectiveRunner,
    handles,
    shutdown: async () => { await Promise.allSettled(handles.map((h) => h.shutdown?.())); },
  };
}

module.exports = { bootJobs };
