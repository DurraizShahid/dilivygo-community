'use strict';

const wsServer = require('../websocket/ws-server');

/**
 * Fan-out to workspace + marketplace customer connections, and superadmin (`__platform__`).
 */
function emitRefundRequestUpdated(payload) {
  const {
    projectRef,
    customerId,
    orderId,
    refundRequestId = null,
    status = null,
  } = payload;
  if (!projectRef || !orderId) return;
  const msg = {
    type: 'refund_request:updated',
    orderId,
    projectRef,
    customerId: customerId || null,
    refundRequestId,
    status,
  };
  wsServer.fanOrderToWorkspaceAndMarketplaceCustomer(projectRef, customerId || null, msg);
  wsServer.broadcast(wsServer.PLATFORM_WS_REF, msg);
}

module.exports = { emitRefundRequestUpdated };
