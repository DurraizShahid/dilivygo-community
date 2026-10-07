'use strict';

/**
 * Short-lived, single-use WebSocket handshake tickets.
 *
 * Issued by an authenticated HTTP endpoint (e.g. `/api/saas/ws-ticket`) and
 * consumed by the `/ws` upgrade handler. Exists so long-lived bearer tokens
 * (Clerk session JWTs, etc.) never need to appear in WebSocket URLs — URLs
 * show up in access logs, referrer headers, and browser history.
 *
 * Storage:
 *   - Redis when available (`SET … EX 60`, atomic `GETDEL` on consume).
 *   - Process-local `Map` otherwise. Safe for single-process deployments
 *     because the HTTP handler and the WS upgrade handler live on the same
 *     Node.js process (they share one `http.Server`).
 *
 * Tickets are:
 *   - 48 hex chars of CSPRNG entropy, prefixed `wst_`.
 *   - Valid for 60 seconds.
 *   - Single-use (consumed atomically).
 */

const crypto = require('crypto');
const { getRedis } = require('./redis');
const logger = require('./logger');

const TICKET_TTL_SECONDS = 60;
const TICKET_PREFIX = 'ws_ticket:';

/** @type {Map<string, { body: string, expiresAt: number }>} */
const memTickets = new Map();

function purgeExpired() {
  const now = Date.now();
  for (const [ticket, entry] of memTickets) {
    if (entry.expiresAt <= now) memTickets.delete(ticket);
  }
}

/**
 * Issue a one-time ticket. `payload` must be JSON-serialisable — it's what
 * the `/ws` upgrade handler will see back via `consumeTicket`.
 *
 * @template T
 * @param {T} payload
 * @returns {Promise<{ ticket: string, expiresInSeconds: number }>}
 */
async function issueTicket(payload) {
  const ticket = `wst_${crypto.randomBytes(24).toString('hex')}`;
  const body = JSON.stringify({ ...payload, iat: Date.now() });
  const redis = getRedis();
  if (redis) {
    try {
      await redis.set(`${TICKET_PREFIX}${ticket}`, body, 'EX', TICKET_TTL_SECONDS);
      return { ticket, expiresInSeconds: TICKET_TTL_SECONDS };
    } catch (err) {
      logger.warn('WS ticket: Redis set failed, falling back to memory', { message: err.message });
    }
  }
  purgeExpired();
  memTickets.set(ticket, {
    body,
    expiresAt: Date.now() + TICKET_TTL_SECONDS * 1000,
  });
  return { ticket, expiresInSeconds: TICKET_TTL_SECONDS };
}

/**
 * Atomically look up and delete a ticket. Returns the payload originally
 * passed to `issueTicket`, or `null` if the ticket is unknown / expired /
 * already consumed.
 *
 * @param {string} ticket
 * @returns {Promise<any | null>}
 */
async function consumeTicket(ticket) {
  if (!ticket || typeof ticket !== 'string') return null;
  const redis = getRedis();
  if (redis) {
    try {
      const key = `${TICKET_PREFIX}${ticket}`;
      // `GETDEL` is atomic on Redis 6.2+. Older servers fall back to GET+DEL
      // which has a tiny race window but is still single-use in practice
      // (the DEL follows immediately after a successful GET).
      let body = null;
      try {
        body = await redis.call('GETDEL', key);
      } catch {
        const current = await redis.get(key);
        if (current) {
          await redis.del(key);
          body = current;
        }
      }
      if (body) return JSON.parse(body);
    } catch (err) {
      logger.warn('WS ticket: Redis consume failed', { message: err.message });
    }
  }
  purgeExpired();
  const entry = memTickets.get(ticket);
  if (!entry) return null;
  memTickets.delete(ticket);
  if (entry.expiresAt <= Date.now()) return null;
  try {
    return JSON.parse(entry.body);
  } catch {
    return null;
  }
}

module.exports = { issueTicket, consumeTicket, TICKET_TTL_SECONDS };
