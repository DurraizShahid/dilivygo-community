'use strict';

const { getRedis } = require('../lib/redis');
const { opaqueId } = require('../lib/opaque-id');
const logger = require('../lib/logger');

const CHANNEL = 'dilivygo:ws:fanout:v1';
const DISTRIBUTED_METHODS = new Set([
  'broadcast',
  'fanOrderToWorkspaceAndMarketplaceCustomer',
  'broadcastSupportChat',
  'broadcastToRoles',
  'sendToUser',
]);

/**
 * Wrap process-local WebSocket fanout with Redis Pub/Sub.
 *
 * Every application call still delivers to this process synchronously, then
 * publishes the exact operation to sibling instances. Subscribers invoke the
 * ORIGINAL local function, never the wrapped export, which prevents fanout
 * loops while preserving the existing registry/auth behaviour.
 *
 * `onFatal` is invoked only when the subscriber reaches ioredis' terminal `end`
 * state after it had successfully subscribed. Transient errors/reconnects are
 * logged but allowed to recover normally.
 */
async function installDistributedFanout(wsServer, { onFatal } = {}) {
  const redis = getRedis();
  if (!redis) {
    logger.warn('Distributed WebSocket fanout unavailable without Redis');
    return { enabled: false, shutdown: async () => {} };
  }

  const instanceId = opaqueId();
  const subscriber = redis.duplicate();
  const originals = {};
  let shuttingDown = false;
  let subscribed = false;
  let fatalNotified = false;

  for (const method of DISTRIBUTED_METHODS) {
    if (typeof wsServer[method] === 'function') originals[method] = wsServer[method].bind(wsServer);
  }

  const publish = (method, args) => {
    const payload = JSON.stringify({
      v: 1,
      origin: instanceId,
      method,
      args,
      at: Date.now(),
    });
    redis.publish(CHANNEL, payload).catch((err) => {
      logger.error('Redis WebSocket fanout publish failed', { method, error: err.message });
    });
  };

  for (const [method, original] of Object.entries(originals)) {
    wsServer[method] = (...args) => {
      const delivered = original(...args);
      publish(method, args);
      return delivered;
    };
  }

  Object.defineProperty(wsServer, '__distributedFanoutInstalled', {
    configurable: true,
    enumerable: false,
    value: true,
  });

  subscriber.on('message', (channel, raw) => {
    if (channel !== CHANNEL) return;
    try {
      const event = JSON.parse(raw);
      if (!event || event.v !== 1 || event.origin === instanceId) return;
      const original = originals[event.method];
      if (!original || !Array.isArray(event.args)) return;
      original(...event.args);
    } catch (err) {
      logger.warn('Redis WebSocket fanout message rejected', { error: err.message });
    }
  });

  subscriber.on('error', (err) => {
    logger.error('Redis WebSocket fanout subscriber error', { error: err.message });
  });

  subscriber.on('end', () => {
    if (shuttingDown || !subscribed || fatalNotified) return;
    fatalNotified = true;
    const err = new Error('Distributed WebSocket fanout subscriber terminated');
    logger.error(err.message, { instanceId, channel: CHANNEL });
    try {
      onFatal?.(err);
    } catch (callbackErr) {
      logger.error('Distributed fanout fatal handler failed', { error: callbackErr.message });
    }
  });

  await subscriber.subscribe(CHANNEL);
  subscribed = true;
  logger.info('Distributed WebSocket fanout enabled', { instanceId, channel: CHANNEL });

  return {
    enabled: true,
    shutdown: async () => {
      shuttingDown = true;
      try { await subscriber.unsubscribe(CHANNEL); } catch {}
      try { await subscriber.quit(); } catch {}
      try { delete wsServer.__distributedFanoutInstalled; } catch {}
      for (const [method, original] of Object.entries(originals)) wsServer[method] = original;
    },
  };
}

module.exports = { installDistributedFanout, CHANNEL };
