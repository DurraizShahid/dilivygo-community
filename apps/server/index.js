'use strict';

// Load .env before anything else.
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const sentry = require('./lib/sentry');
sentry.init();

const http = require('http');
const config = require('./config');
const { assertProductionConfig } = require('./config/validate-production');

// Configuration mistakes affecting authentication, payments, Redis-backed
// state, or job coordination are deployment failures — never runtime fallbacks.
assertProductionConfig();

const app = require('./app');
const logger = require('./lib/logger');
const { onRedisFatal } = require('./lib/redis');
const wsServer = require('./websocket/ws-server');
const { installDistributedFanout } = require('./websocket/distributed-fanout');
const { ensureBucket, ensureSampleProfilePhotosBucket } = require('./lib/storage');
const { bootJobs } = require('./jobs');

const server = http.createServer(app);
wsServer.init(server);

let jobsHandle = null;
let wsFanoutHandle = null;
let shuttingDown = false;
let listening = false;

function logStartup() {
  logger.info(`Server running on port ${config.port}`, {
    env: config.env,
    edition: config.edition,
    redis: config.redis.url ? 'configured' : 'unavailable',
    stripe: config.stripe.enabled ? 'enabled' : 'unavailable',
    twilio: config.twilio.enabled ? 'enabled' : 'console fallback',
    email: config.email.enabled ? config.email.provider : 'console fallback',
    firebase: config.firebase.enabled ? 'enabled' : 'disabled',
    sentry: config.sentry.enabled ? 'enabled' : 'disabled',
    jobRunner: jobsHandle?.runner || config.jobs.runner,
    distributedRealtime: Boolean(wsFanoutHandle?.enabled),
  });
}

function restartOnRequiredCoordinationLoss(kind, err) {
  if (shuttingDown) return;
  logger.error(`Required ${kind} coordination was lost`, {
    error: err?.message || String(err),
  });
  sentry.captureException(
    err instanceof Error ? err : new Error(String(err)),
    { tags: { kind: `${kind}_coordination_failure` } },
  );

  if (config.isProd) {
    // Railway/Kubernetes should replace the unhealthy process. Continuing to
    // answer traffic with broken shared state creates split-brain behavior.
    setImmediate(() => gracefulShutdown(`${kind.toUpperCase()}_COORDINATION_FAILURE`));
  }
}

function handleFanoutFatal(err) {
  restartOnRequiredCoordinationLoss('realtime', err);
}

onRedisFatal((err) => {
  restartOnRequiredCoordinationLoss('redis', err);
});

async function bootRequiredCoordination() {
  try {
    wsFanoutHandle = await installDistributedFanout(wsServer, {
      onFatal: handleFanoutFatal,
    });
    if (config.isProd && !wsFanoutHandle?.enabled) {
      throw new Error('Distributed WebSocket fanout is required in production');
    }

    jobsHandle = await bootJobs();
    return true;
  } catch (err) {
    logger.error('Failed to boot required backend coordination', {
      error: err.message,
      stack: err.stack,
    });
    try { await jobsHandle?.shutdown?.(); } catch {}
    try { await wsFanoutHandle?.shutdown?.(); } catch {}
    jobsHandle = null;
    wsFanoutHandle = null;

    if (config.isProd) return false;
    // Development may continue without distributed infrastructure so local
    // frontend work remains usable; production never gets this fallback.
    return true;
  }
}

async function start() {
  const coordinationReady = await bootRequiredCoordination();
  if (!coordinationReady) {
    await sentry.flush(2000).catch(() => {});
    process.exit(1);
    return;
  }

  // Storage bootstrapping is non-critical to accepting requests and already
  // handles provider errors internally. Start it only after mandatory payment/
  // dispatch/realtime coordination has been established.
  ensureBucket();
  ensureSampleProfilePhotosBucket();

  server.listen(config.port, () => {
    listening = true;
    logStartup();
  });
}

function gracefulShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received — shutting down gracefully`);

  const finish = async () => {
    try {
      if (jobsHandle?.shutdown) await jobsHandle.shutdown();
      logger.info('Background jobs drained');
    } catch (jobsErr) {
      logger.warn('Background job shutdown failed', { error: jobsErr.message });
    }

    try {
      if (wsFanoutHandle?.shutdown) await wsFanoutHandle.shutdown();
      logger.info('Distributed WebSocket fanout closed');
    } catch (wsErr) {
      logger.warn('WebSocket fanout shutdown failed', { error: wsErr.message });
    }

    await sentry.flush(2000).catch(() => {});

    const { getRedis } = require('./lib/redis');
    const redis = getRedis();
    if (redis) {
      try { await redis.quit(); } catch {}
      logger.info('Redis connection closed');
    }
    process.exit(0);
  };

  if (!listening) {
    finish().catch(() => process.exit(1));
  } else {
    server.close((err) => {
      if (err) {
        logger.error('Error during server close', { error: err.message });
        process.exit(1);
        return;
      }
      logger.info('HTTP server closed');
      finish().catch((finishErr) => {
        logger.error('Graceful shutdown cleanup failed', { error: finishErr.message });
        process.exit(1);
      });
    });
  }

  setTimeout(() => {
    logger.error('Graceful shutdown timed out — forcing exit');
    process.exit(1);
  }, 15_000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', async (err) => {
  logger.error('Uncaught exception', { error: err.message, stack: err.stack });
  sentry.captureException(err, { tags: { kind: 'uncaught_exception' } });
  await sentry.flush(2000);
  process.exit(1);
});

process.on('unhandledRejection', async (reason) => {
  logger.error('Unhandled promise rejection', { reason: String(reason) });
  sentry.captureException(
    reason instanceof Error ? reason : new Error(String(reason)),
    { tags: { kind: 'unhandled_rejection' } },
  );
  await sentry.flush(2000);
  process.exit(1);
});

start().catch(async (err) => {
  logger.error('Backend startup failed', { error: err.message, stack: err.stack });
  sentry.captureException(err, { tags: { kind: 'startup_failure' } });
  await sentry.flush(2000).catch(() => {});
  process.exit(1);
});

module.exports = server;
