'use strict';

const { WebSocketServer, WebSocket } = require('ws');
const { opaqueId } = require('../lib/opaque-id');
const { parse: parseCookie } = require('cookie');
const jwt = require('jsonwebtoken');
const { getAdminSession, getCustomerSession, getSuperadminSession } = require('../services/session.service');
const { consumeTicket } = require('../lib/ws-ticket');
const config = require('../config');
const logger = require('../lib/logger');
const {
  PLATFORM_WS_REF,
  PLATFORM_RIDER_WS_REF,
  MARKETPLACE_CUSTOMER_SCOPE,
  orgRiderWsRef,
  orgCustomerWsRef,
  orgStaffWsRef,
} = require('../lib/platform-constants');
const { relayChatTypingFromClient } = require('../lib/chat-typing-relay');

/**
 * Connection registry: Map<projectRef, Map<connectionId, { ws, userId, role }>>
 */
const registry = new Map();

/**
 * Reverse index userId -> Set<projectRef> so `sendToUser` (and fan helpers) can
 * resolve the correct bucket for org-wide customers/riders without knowing their
 * `organization_id`.
 */
const userBuckets = new Map();

function _indexAdd(userId, projectRef) {
  if (!userId || !projectRef) return;
  let set = userBuckets.get(userId);
  if (!set) {
    set = new Set();
    userBuckets.set(userId, set);
  }
  set.add(projectRef);
}

function _indexRemove(userId, projectRef) {
  if (!userId) return;
  const set = userBuckets.get(userId);
  if (!set) return;
  set.delete(projectRef);
  if (set.size === 0) userBuckets.delete(userId);
}

let wss = null;

/**
 * Initialise the WebSocket server attached to the existing HTTP server.
 * @param {import('http').Server} httpServer
 */
function init(httpServer) {
  wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', async (ws, req) => {
    let identity = null;

    try {
      identity = await authenticate(req);
    } catch (err) {
      logger.warn('WS auth failed', { error: err.message });
      ws.close(4001, 'Authentication failed');
      return;
    }

    if (!identity) {
      ws.close(4001, 'Authentication required');
      return;
    }

    const connectionId = opaqueId();
    let projectRef = identity.projectRef ?? identity.project_ref;
    const orgId = identity.organizationId ?? identity.organization_id ?? null;
    if (identity.role === 'rider' && (projectRef == null || projectRef === '')) {
      projectRef = orgId ? orgRiderWsRef(String(orgId)) : PLATFORM_RIDER_WS_REF;
    }
    if (identity.type === 'customer' && (projectRef == null || projectRef === '')) {
      projectRef = orgId ? orgCustomerWsRef(String(orgId)) : MARKETPLACE_CUSTOMER_SCOPE;
    }
    const userId = identity.userId ?? identity.id;
    const role = identity.role;

    // Primary bucket (used for directed `handleMessage` relays like typing
    // indicators). Additional buckets (e.g. the per-workspace refs a SaaS
    // org-staff connection subscribes to) are registered below.
    const extraRefs = Array.isArray(identity.projectRefs)
      ? identity.projectRefs.filter((r) => typeof r === 'string' && r && r !== projectRef)
      : [];
    const refs = [projectRef, ...extraRefs];

    for (const ref of refs) {
      if (!registry.has(ref)) registry.set(ref, new Map());
      registry.get(ref).set(connectionId, { ws, userId, role, alive: true });
      _indexAdd(userId, ref);
    }

    logger.debug('WS connected', {
      connectionId,
      userId,
      projectRef,
      extraBuckets: extraRefs.length,
      role,
    });

    // Heartbeat
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (data) => handleMessage(ws, data, identity, connectionId));

    ws.on('close', () => {
      for (const ref of refs) {
        const projectConns = registry.get(ref);
        if (projectConns) {
          projectConns.delete(connectionId);
          if (projectConns.size === 0) registry.delete(ref);
        }
        _indexRemove(userId, ref);
      }
      logger.debug('WS disconnected', { connectionId, userId });
    });

    ws.on('error', (err) => {
      logger.error('WS error', { connectionId, error: err.message });
    });

    // Send connection ACK
    safeSend(ws, { type: 'connected', connectionId });
  });

  // Heartbeat interval — ping every 30s, terminate unresponsive after 10s
  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) {
        logger.debug('WS: terminating unresponsive connection');
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30_000);

  wss.on('close', () => clearInterval(heartbeatInterval));

  logger.info('WebSocket server initialised at /ws');
  return wss;
}

/**
 * Authenticate an incoming WebSocket upgrade request.
 *
 * Authentication flavours (tried in scope-priority order):
 *   - `scope=superadmin` + `superadmin_session` cookie → platform admin bucket.
 *   - `scope=saas` + `?ticket=wst_…` → Clerk-backed org-staff connection,
 *     registers in EVERY workspace bucket for that org (see
 *     `/api/saas/ws-ticket`). Clerk JWTs are intentionally NOT accepted on
 *     the URL — tickets are one-time, short-lived, and never leak into
 *     referrer headers / access logs.
 *   - `admin_session` cookie / `customer_session` cookie → regular staff and
 *     customer dashboards.
 *   - `?token=<jwt>` fallback for mobile apps (customer/rider JWTs signed
 *     with `config.jwt.secret`).
 */
async function authenticate(req) {
  const cookieHeader = req.headers.cookie || '';
  const cookies = parseCookie(cookieHeader);
  const url = new URL(req.url, 'http://localhost');
  const scope = url.searchParams.get('scope');

  // Superadmin dashboard: dedicated scope so vendor/admin cookies on same host do not steal the connection
  if (scope === 'superadmin' && cookies.superadmin_session) {
    const session = await getSuperadminSession(cookies.superadmin_session);
    if (session) {
      return {
        ...session,
        type: 'superadmin',
        role: 'superadmin',
        userId: session.id,
        projectRef: PLATFORM_WS_REF,
        project_ref: PLATFORM_WS_REF,
      };
    }
    return null;
  }

  // SaaS dashboard: Clerk-authed, uses one-time handshake ticket issued by
  // `GET /api/saas/ws-ticket`. We NEVER accept a Clerk JWT directly on the
  // URL — it's long-lived and would end up in logs.
  if (scope === 'saas') {
    const ticket = url.searchParams.get('ticket');
    const payload = ticket ? await consumeTicket(ticket) : null;
    if (!payload || payload.kind !== 'saas_org_staff' || !payload.organizationId) {
      return null;
    }
    const orgId = String(payload.organizationId);
    const workspaceRefs = Array.isArray(payload.projectRefs)
      ? payload.projectRefs.filter((r) => typeof r === 'string' && r)
      : [];
    return {
      type: 'saas_org_staff',
      role: 'saas_org_admin',
      userId: String(payload.clerkUserId),
      organizationId: orgId,
      // Primary ref = org-staff sentinel (for org-level events like billing).
      projectRef: orgStaffWsRef(orgId),
      // Extra refs = every workspace in this org, so existing
      // `broadcast(projectRef, …)` calls (orders, chat, refunds) reach them.
      projectRefs: workspaceRefs,
    };
  }

  // Admin session cookie
  if (cookies.admin_session) {
    const session = await getAdminSession(cookies.admin_session);
    if (session) return session;
  }

  // Customer session cookie
  if (cookies.customer_session) {
    const session = await getCustomerSession(cookies.customer_session);
    if (session) return session;
  }

  // JWT query param (mobile apps / public tracking).
  // NOTE: Intentionally only reached when `scope` is not `saas` — see above.
  const token = url.searchParams.get('token');
  if (token) {
    try {
      const payload = jwt.verify(token, config.jwt.secret);
      return payload;
    } catch {
      return null;
    }
  }

  return null;
}

function handleMessage(ws, data, identity, connectionId) {
  let msg;
  try {
    msg = JSON.parse(data.toString());
  } catch {
    safeSend(ws, { type: 'error', message: 'Invalid JSON' }, { connectionId, userId: identity?.userId ?? identity?.id ?? null, kind: 'server' });
    return;
  }

  if (msg.type === 'ping') {
    safeSend(ws, { type: 'pong' }, { connectionId, userId: identity?.userId ?? identity?.id ?? null, kind: 'server' });
  } else if (msg.type === 'chat:typing' && msg.conversationId) {
    void (async () => {
      try {
        await relayChatTypingFromClient(identity, msg, {
          broadcast,
          broadcastSupportChat,
        });
      } catch (err) {
        logger.warn('WS chat:typing relay failed', { error: err.message });
      }
    })();
  }
}

/**
 * Broadcast a message to ALL connections in a project workspace.
 *
 * Supported event types:
 *   order:status_changed  — order status transitioned
 *   order:rejected        — vendor rejected an order
 *   order:delayed         — SLA deadline breached
 *   delivery:location_update — rider GPS ping
 *   delivery:rider_arrived   — rider tapped "arrived"
 *   delivery:rider_assigned  — rider assigned to delivery
 *   delivery:request         — new delivery available for riders (prefer broadcastToRoles(..., ['rider','admin']))
 *   chat:typing              — typing indicator relay
 */
function broadcast(projectRef, message) {
  const projectConns = registry.get(projectRef);
  if (!projectConns) return 0;

  const payload = JSON.stringify(message);
  let count = 0;
  for (const [connectionId, { ws, userId }] of projectConns.entries()) {
    if (safeSendRaw(ws, payload, { connectionId, userId, kind: 'broadcast' })) count++;
  }
  return count;
}

const PLATFORM_ORDER_INBOX_TYPES = new Set(['order:status_changed', 'order:rejected', 'order:delayed']);

/**
 * Vendor workspace listeners + the customer's own WS bucket(s).
 *
 * We send to every bucket the customer is actually registered in — for org-scoped
 * customers that's `__org_customers__<orgId>`; for legacy it's `__marketplace_customer__`
 * or a workspace ref. This means callers don't need to know the customer's org.
 *
 * High-signal order lifecycle events are also mirrored to the superadmin dashboard
 * bucket (`__platform__`) so platform tooling can refresh without polling.
 */
function fanOrderToWorkspaceAndMarketplaceCustomer(projectRef, customerId, message) {
  let count = 0;
  if (projectRef) count += broadcast(projectRef, message);
  if (customerId) {
    const buckets = userBuckets.get(customerId);
    if (buckets && buckets.size > 0) {
      for (const bucket of buckets) {
        if (bucket === projectRef) continue;
        count += sendToUser(bucket, customerId, message);
      }
    } else {
      count += sendToUser(MARKETPLACE_CUSTOMER_SCOPE, customerId, message);
    }
  }
  if (message?.type && PLATFORM_ORDER_INBOX_TYPES.has(message.type)) {
    count += broadcast(PLATFORM_WS_REF, message);
  }
  return count;
}

/**
 * Customer support live chat: workspace/marketplace bucket + superadmin +
 * SaaS org-staff bucket (when `organizationId` is set on the ticket).
 *
 * @param {string} projectRef
 * @param {object} message
 * @param {string|null|undefined} organizationId - `conversations.organization_id` for org-hosted storefronts
 */
function broadcastSupportChat(projectRef, message, organizationId) {
  let count = broadcast(projectRef, message) + broadcast(PLATFORM_WS_REF, message);
  const oid =
    organizationId != null && String(organizationId).trim() !== ''
      ? String(organizationId).trim()
      : null;
  if (oid) {
    count += broadcast(orgCustomerWsRef(oid), message);
    count += broadcast(orgStaffWsRef(oid), message);
  }
  return count;
}

/**
 * Broadcast only to connections whose staff role is in allowedRoles (e.g. rider dispatch alerts).
 * Skips customers and other roles without a matching staff role.
 */
function broadcastToRoles(projectRef, message, allowedRoles) {
  const projectConns = registry.get(projectRef);
  if (!projectConns) return 0;

  const payload = JSON.stringify(message);
  let count = 0;
  for (const [connectionId, { ws, role, userId }] of projectConns.entries()) {
    if (!role || !allowedRoles.includes(role)) continue;
    if (safeSendRaw(ws, payload, { connectionId, userId, kind: 'broadcastToRoles' })) count++;
  }
  return count;
}

/**
 * Send a message to a specific user's connections within a project.
 */
function sendToUser(projectRef, userId, message) {
  const projectConns = registry.get(projectRef);
  if (!projectConns) return 0;

  const payload = JSON.stringify(message);
  let count = 0;
  for (const [connectionId, { ws, userId: connUserId }] of projectConns.entries()) {
    if (connUserId !== userId) continue;
    if (safeSendRaw(ws, payload, { connectionId, userId: connUserId, kind: 'sendToUser' })) count++;
  }
  return count;
}

/**
 * Check if a user has at least one active WebSocket connection in the project.
 */
function isUserOnline(projectRef, userId) {
  const projectConns = registry.get(projectRef);
  if (!projectConns) return false;

  for (const { userId: connUserId, ws } of projectConns.values()) {
    if (connUserId === userId && ws.readyState === WebSocket.OPEN) return true;
  }
  return false;
}

/**
 * List unique user IDs with at least one active connection for a role.
 */
function listOnlineUsersByRole(projectRef, role) {
  const projectConns = registry.get(projectRef);
  if (!projectConns) return [];

  const ids = new Set();
  for (const { userId, role: connRole, ws } of projectConns.values()) {
    if (connRole === role && ws.readyState === WebSocket.OPEN) ids.add(userId);
  }
  return Array.from(ids);
}

function safeSendRaw(ws, payload, { connectionId = null, userId = null, kind = null } = {}) {
  if (ws.readyState !== WebSocket.OPEN) return false;

  const maxBuffered = config.websocket?.maxBufferedAmountBytes ?? 0;
  if (maxBuffered > 0 && ws.bufferedAmount > maxBuffered) {
    logger.warn('WS backpressure: terminating slow connection', {
      connectionId,
      userId,
      kind,
      bufferedAmount: ws.bufferedAmount,
      maxBufferedAmountBytes: maxBuffered,
    });
    ws.terminate();
    return false;
  }

  try {
    ws.send(payload);
    return true;
  } catch (err) {
    logger.warn('WS send failed', {
      connectionId,
      userId,
      kind,
      error: err.message,
    });
    try {
      ws.terminate();
    } catch {}
    return false;
  }
}

function safeSend(ws, message, meta) {
  return safeSendRaw(ws, JSON.stringify(message), meta);
}

function getStats() {
  const stats = {};
  for (const [projectRef, conns] of registry.entries()) {
    stats[projectRef] = conns.size;
  }
  return stats;
}

module.exports = {
  init,
  broadcast,
  fanOrderToWorkspaceAndMarketplaceCustomer,
  broadcastSupportChat,
  broadcastToRoles,
  sendToUser,
  isUserOnline,
  listOnlineUsersByRole,
  getStats,
  PLATFORM_WS_REF,
};
