'use strict';

const conversationModel = require('../models/conversation.model');
const { select } = require('./supabase');

/**
 * WebSocket identity shape from ws-server authenticate() (subset used here).
 * @param {{ userId?: string, id?: string, role?: string, type?: string }} identity
 */
function wsIdentityUserId(identity) {
  return identity?.userId ?? identity?.id ?? null;
}

function wsIdentityRole(identity) {
  if (identity?.type === 'superadmin' || identity?.role === 'superadmin') return 'superadmin';
  if (identity?.type === 'customer') return 'customer';
  if (identity?.type === 'admin' && identity?.role) return identity.role;
  return identity?.role ?? null;
}

/**
 * Whether this WS connection may broadcast typing indicators for the conversation.
 */
async function wsIdentityMayRelayTyping(identity, conversation) {
  const uid = wsIdentityUserId(identity);
  if (!conversation || !uid) return false;

  if (conversation.type === 'customer_support') {
    if (conversationModel.isParticipant(conversation, uid)) return true;
    return wsIdentityRole(identity) === 'superadmin';
  }

  if (conversationModel.isParticipant(conversation, uid)) return true;

  const role = wsIdentityRole(identity);
  if (role !== 'rider') return false;
  if (
    conversation.type !== 'customer_vendor' &&
    conversation.type !== 'vendor_rider' &&
    conversation.type !== 'customer_rider'
  ) {
    return false;
  }
  const oid = conversation.order_id;
  if (!oid) return false;
  const deliveries = await select('deliveries', { filters: { order_id: oid }, limit: 1 });
  return deliveries?.[0]?.rider_id === uid;
}

module.exports = {
  wsIdentityUserId,
  wsIdentityMayRelayTyping,
};
