'use strict';

const conversationModel = require('../models/conversation.model');
const { wsIdentityUserId, wsIdentityMayRelayTyping } = require('./chat-ws-access');

function effectiveIo(fallback) {
  try {
    // Runtime require avoids a module-load cycle: ws-server imports this relay.
    // Once distributed fanout is installed, use the wrapped exported methods so
    // typing indicators cross backend instances too. Unit tests/dev without the
    // bridge continue using the injected local IO object.
    const wsServer = require('../websocket/ws-server');
    if (wsServer.__distributedFanoutInstalled) return wsServer;
  } catch {}
  return fallback;
}

/**
 * Authorized relay of inbound client `chat:typing` to workspace listeners.
 *
 * @param {object} identity - WS authenticate() identity
 * @param {{ conversationId: string, isTyping?: boolean }} msg
 * @param {{ broadcast: Function, broadcastSupportChat: Function }} io
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
async function relayChatTypingFromClient(identity, msg, io) {
  const conv = await conversationModel.findById(msg.conversationId);
  if (!conv) return { ok: false, reason: 'no_conversation' };
  const allowed = await wsIdentityMayRelayTyping(identity, conv);
  if (!allowed) return { ok: false, reason: 'denied' };
  const uid = wsIdentityUserId(identity);
  const payload = {
    type: 'chat:typing',
    conversationId: msg.conversationId,
    userId: uid,
    isTyping: !!msg.isTyping,
  };
  const projectRef = conv.project_ref;
  const out = effectiveIo(io);
  if (conv.type === 'customer_support') {
    out.broadcastSupportChat(projectRef, payload, conv.organization_id ?? conv.organizationId);
  } else {
    out.broadcast(projectRef, payload);
  }
  return { ok: true };
}

module.exports = { relayChatTypingFromClient };
