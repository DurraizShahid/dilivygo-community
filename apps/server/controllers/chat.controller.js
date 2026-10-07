'use strict';

const conversationModel = require('../models/conversation.model');
const messageModel = require('../models/message.model');
const orderModel = require('../models/order.model');
const userModel = require('../models/user.model');
const userShopModel = require('../models/user-shop.model');
const wsServer = require('../websocket/ws-server');
const notificationService = require('../services/notification.service');
const { createError } = require('../middleware/error.middleware');
const { getCallerId, getCallerRole } = require('../middleware/auth.middleware');
const { getCustomerSession } = require('../services/session.service');
const { mapConversation, mapMessage, mapSupportTicketRating } = require('../lib/case');
const supportTicketRatingModel = require('../models/support-ticket-rating.model');
const { PLATFORM_SUPPORT_PARTICIPANT_ID, MARKETPLACE_CUSTOMER_SCOPE } = require('../lib/platform-constants');
const config = require('../config');

function conversationTenantMismatch(req, conversation) {
  if (req.superadmin) return false;
  const cr = getCallerRole(req);
  // Support tickets are routed to SaaS by `organization_id`; enforce it for customers
  // so a session cannot read another org's thread by id (participant checks alone
  // are not enough if ids were ever reused across systems).
  if (cr === 'customer' && conversation?.type === 'customer_support') {
    // Prefer the signed-in customer's canonical org (DB/JWT) over host-derived
    // `req.organizationId`. Host inference uses X-Forwarded-Host and can
    // disagree with the conversation row when headers differ per request,
    // which incorrectly returned 403 for GET /messages after a successful ticket.
    const custOrg =
      req.customer?.organizationId ||
      req.customer?.organization_id ||
      req.organizationId ||
      null;
    const convOrg = conversation.organization_id ?? conversation.organizationId ?? null;
    if (custOrg && convOrg && String(custOrg) !== String(convOrg)) {
      return true;
    }
    return false;
  }
  if (cr === 'customer' && req.customer?.isMarketplaceCustomer) return false;
  return conversation.project_ref !== req.projectRef;
}

function orderTenantMismatch(req, order) {
  if (req.superadmin) return false;
  const cr = getCallerRole(req);
  if (cr === 'customer' && req.customer?.isMarketplaceCustomer) {
    return order.customer_id !== getCallerId(req);
  }
  return order.project_ref !== req.projectRef;
}

function isSupportChatClosed(conversation) {
  if (!conversation || conversation.type !== 'customer_support') return false;
  const at = conversation.support_closed_at ?? conversation.supportClosedAt;
  return at != null && at !== '';
}

function callerCanAccessConversation(req, conversation) {
  const uid = getCallerId(req);
  if (!conversation || !uid) return false;
  if (conversationModel.isParticipant(conversation, uid)) return true;
  if (conversation.type === 'customer_support' && req.superadmin) return true;
  return false;
}

/** Vendor/admin staff user to pair with the rider for vendor_rider threads (shop first, then workspace). */
async function resolveVendorStaffUserIdForOrder(order) {
  if (!order) return null;
  if (order.shop_id) {
    const assignments = await userShopModel.findByShopId(order.shop_id);
    for (const a of assignments || []) {
      const u = await userModel.findById(a.user_id);
      if (u && (u.role === 'vendor' || u.role === 'admin')) return u.id;
    }
  }
  const admins = await userModel.findByProjectRef(order.project_ref, 'admin');
  if (admins?.length) return admins[0].id;
  const vendors = await userModel.findByProjectRef(order.project_ref, 'vendor');
  if (vendors?.length) return vendors[0].id;
  return null;
}

/**
 * Order-linked chats: assigned delivery rider may read/send even when the thread was
 * created as customer↔vendor (participant list is only customer + vendor).
 */
async function callerCanAccessConversationAsync(req, conversation) {
  if (callerCanAccessConversation(req, conversation)) return true;
  const uid = getCallerId(req);
  const role = getCallerRole(req);
  if (!uid || role !== 'rider') return false;
  if (
    conversation.type !== 'customer_vendor' &&
    conversation.type !== 'vendor_rider' &&
    conversation.type !== 'customer_rider'
  ) {
    return false;
  }
  const oid = conversation.order_id;
  if (!oid) return false;
  const { select } = require('../lib/supabase');
  const deliveries = await select('deliveries', { filters: { order_id: oid }, limit: 1 });
  return deliveries?.[0]?.rider_id === uid;
}

async function maybeSwitchSupportConversationToCustomer(req, conversation) {
  if (!conversation || conversation.type !== 'customer_support') return false;
  if (req.superadmin || req.customer) return false;

  const customerSid = req.cookies?.customer_session;
  if (!customerSid) return false;

  const customerSession = await getCustomerSession(customerSid);
  if (!customerSession?.id) return false;

  const conversationCustomerId = conversation.participant_1_id;
  if (
    String(customerSession.id || '').toLowerCase() !==
    String(conversationCustomerId || '').toLowerCase()
  ) {
    return false;
  }

  const customerOrg = customerSession.organizationId || customerSession.organization_id || null;
  const conversationOrg = conversation.organization_id ?? conversation.organizationId ?? null;
  if (customerOrg && conversationOrg && String(customerOrg) !== String(conversationOrg)) {
    return false;
  }

  req.customer = customerSession;
  req.customerSessionId = customerSid;
  delete req.user;
  delete req.sessionId;
  return true;
}

/** Push target when the sender is not a stored participant (extended-access rider on customer_vendor). */
async function resolveNotifyRecipientId(req, conversation) {
  const senderId = getCallerId(req);
  if (conversationModel.isParticipant(conversation, senderId)) {
    return conversationModel.getOtherParticipant(conversation, senderId);
  }
  if (getCallerRole(req) !== 'rider') return null;
  const order = await orderModel.findById(conversation.order_id);
  if (!order) return null;
  if (conversation.type === 'customer_vendor') {
    return order.customer_id || null;
  }
  if (conversation.type === 'vendor_rider') {
    const p1 = conversation.participant_1_id;
    const p2 = conversation.participant_2_id;
    if (p1 === senderId) return p2;
    if (p2 === senderId) return p1;
    const vendorStaffId = await resolveVendorStaffUserIdForOrder(order);
    if (vendorStaffId && vendorStaffId !== senderId) return vendorStaffId;
  }
  if (conversation.type === 'customer_rider') {
    const p1 = conversation.participant_1_id;
    const p2 = conversation.participant_2_id;
    if (p1 === senderId) return p2;
    if (p2 === senderId) return p1;
    const customerId = order.customer_id;
    if (customerId && customerId !== senderId) return customerId;
    const { select } = require('../lib/supabase');
    const deliveries = await select('deliveries', { filters: { order_id: conversation.order_id }, limit: 1 });
    const rid = deliveries?.[0]?.rider_id;
    if (rid && rid !== senderId) return rid;
  }
  return null;
}

async function createConversation(req, res, next) {
  try {
    const { orderId, type } = req.body;
    const callerId = getCallerId(req);

    // Verify order belongs to this workspace
    const order = await orderModel.findById(orderId);
    if (!order) return next(createError('Order not found', 404));
    if (orderTenantMismatch(req, order)) return next(createError('Access denied', 403));

    // Determine participants based on conversation type
    let participant1Id = callerId;
    let participant2Id;
    const callerRole = getCallerRole(req);

    if (type === 'customer_vendor') {
      const customerId = order.customer_id;
      if (callerRole === 'customer') {
        if (!customerId || customerId !== callerId) {
          return next(createError('Access denied', 403));
        }
        const vendorStaffId = await resolveVendorStaffUserIdForOrder(order);
        if (!vendorStaffId) {
          return next(createError('No restaurant staff available for this order chat', 400));
        }
        participant1Id = callerId;
        participant2Id = vendorStaffId;
      } else {
        if (!customerId) {
          return next(createError('Order has no customer for this chat', 400));
        }
        participant1Id = callerId;
        participant2Id = customerId;
      }
    } else if (type === 'customer_rider') {
      const { select } = require('../lib/supabase');
      const deliveries = await select('deliveries', { filters: { order_id: orderId } });
      const delivery = deliveries?.[0];
      if (!delivery?.rider_id) return next(createError('No rider assigned to this order yet', 400));
      const customerId = order.customer_id;
      if (!customerId) return next(createError('Order has no customer for this chat', 400));
      if (callerRole === 'customer') {
        if (customerId !== callerId) return next(createError('Access denied', 403));
        participant1Id = customerId;
        participant2Id = delivery.rider_id;
      } else if (callerRole === 'rider') {
        if (delivery.rider_id !== callerId) return next(createError('Access denied', 403));
        participant1Id = customerId;
        participant2Id = delivery.rider_id;
      } else {
        return next(createError('Only the customer or assigned rider can open this chat', 403));
      }
    } else if (type === 'vendor_rider') {
      if (callerRole === 'customer') {
        return next(
          createError('Use customer_rider to message your rider', 400)
        );
      }
      const { select } = require('../lib/supabase');
      const deliveries = await select('deliveries', { filters: { order_id: orderId } });
      const delivery = deliveries?.[0];
      if (!delivery?.rider_id) return next(createError('No rider assigned to this order yet', 400));
      if (callerRole === 'rider') {
        if (delivery.rider_id !== callerId) {
          return next(createError('Access denied', 403));
        }
        const vendorStaffId = await resolveVendorStaffUserIdForOrder(order);
        if (!vendorStaffId) {
          return next(createError('No restaurant staff available for this order chat', 400));
        }
        participant1Id = callerId;
        participant2Id = vendorStaffId;
      } else {
        participant1Id = callerId;
        participant2Id = delivery.rider_id;
      }
    } else {
      return next(createError('Invalid conversation type', 400));
    }

    const { conversation, created } = await conversationModel.findOrCreate({
      orderId,
      type,
      participant1Id: participant1Id,
      participant2Id: participant2Id,
      projectRef: order.project_ref,
    });

    return res.status(created ? 201 : 200).json({ conversation: mapConversation(conversation) });
  } catch (err) {
    next(err);
  }
}

async function createSupportTicket(req, res, next) {
  try {
    const customerId = req.customer?.id;
    if (!customerId) return next(createError('Authentication required', 401));

    const { subject, message: firstMessage } = req.body;
    const organizationId =
      req.organizationId ||
      req.customer?.organizationId ||
      req.customer?.organization_id ||
      null;

    // Marketplace / org storefront customers must not create unscoped support rows:
    // SaaS inbox filters on `conversations.organization_id` (see `findAllSupport`).
    if (req.customer?.isMarketplaceCustomer && !organizationId) {
      return next(
        createError(
          'Organization context is required to contact support. Try refreshing the page or signing in again.',
          400
        )
      );
    }

    const convRow = await conversationModel.createSupport({
      customerId,
      projectRef: req.projectRef || MARKETPLACE_CUSTOMER_SCOPE,
      organizationId,
      subject,
    });

    const raw = await messageModel.create({
      conversationId: convRow.id,
      senderId: customerId,
      senderRole: 'customer',
      content: firstMessage,
    });
    const message = mapMessage(raw);
    await conversationModel.touch(convRow.id);

    wsServer.broadcastSupportChat(
      convRow.project_ref,
      {
        type: 'chat:message',
        conversationId: convRow.id,
        message,
      },
      convRow.organization_id ?? convRow.organizationId
    );

    return res.status(201).json({
      conversation: mapConversation(convRow),
      message,
    });
  } catch (err) {
    next(err);
  }
}

async function listConversations(req, res, next) {
  try {
    const callerId = getCallerId(req);
    const conversations =
      getCallerRole(req) === 'customer' && req.customer?.isMarketplaceCustomer
        ? await conversationModel.findForUserAllProjects(callerId)
        : await conversationModel.findForUser(callerId, req.projectRef);
    return res.json({ conversations: (conversations || []).map(mapConversation) });
  } catch (err) {
    next(err);
  }
}

async function getMessages(req, res, next) {
  try {
    const { id } = req.params;
    const { page } = req.query;

    const conversation = await conversationModel.findById(id);
    if (!conversation) return next(createError('Conversation not found', 404));

    await maybeSwitchSupportConversationToCustomer(req, conversation);

    if (!(await callerCanAccessConversationAsync(req, conversation))) {
      return next(createError('You are not a participant in this conversation', 403));
    }
    if (conversationTenantMismatch(req, conversation)) {
      return next(createError('Access denied', 403));
    }

    const rows = await messageModel.getHistory(id, { page: parseInt(page || '1', 10) });
    return res.json({
      messages: (rows || []).map(mapMessage),
      page: parseInt(page || '1', 10),
      pageSize: config.chat.pageSize,
    });
  } catch (err) {
    next(err);
  }
}

async function sendMessage(req, res, next) {
  try {
    const { id } = req.params;
    const { content } = req.body;

    if (content.length > config.chat.maxMessageLength) {
      return next(createError(`Message exceeds ${config.chat.maxMessageLength} character limit`, 400));
    }

    const conversation = await conversationModel.findById(id);
    if (!conversation) return next(createError('Conversation not found', 404));

    await maybeSwitchSupportConversationToCustomer(req, conversation);
    const callerId = getCallerId(req);
    const callerRole = getCallerRole(req);

    if (!(await callerCanAccessConversationAsync(req, conversation))) {
      return next(createError('You are not a participant in this conversation', 403));
    }
    if (conversationTenantMismatch(req, conversation)) {
      return next(createError('Access denied', 403));
    }

    if (isSupportChatClosed(conversation)) {
      return next(
        createError(
          'This support chat has ended. Reopen it to send messages.',
          403
        )
      );
    }

    const raw = await messageModel.create({
      conversationId: id,
      senderId: callerId,
      senderRole: callerRole,
      content,
    });
    const message = mapMessage(raw);

    await conversationModel.touch(id);

    const recipientId = await resolveNotifyRecipientId(req, conversation);

    const convRef = conversation.project_ref;
    if (conversation.type === 'customer_support') {
      wsServer.broadcastSupportChat(
        convRef,
        {
          type: 'chat:message',
          conversationId: id,
          message,
        },
        conversation.organization_id ?? conversation.organizationId
      );
    } else {
      wsServer.broadcast(convRef, {
        type: 'chat:message',
        conversationId: id,
        message,
      });
    }

    const recipientOnline = recipientId && wsServer.isUserOnline(convRef, recipientId);
    if (
      recipientId &&
      recipientId !== PLATFORM_SUPPORT_PARTICIPANT_ID &&
      !recipientOnline
    ) {
      const senderName = req.user?.email || req.customer?.name || 'Someone';
      const customerNotificationAudit =
        conversation.type === 'customer_support' && recipientId === conversation.participant_1_id
          ? { customerId: recipientId, conversationId: id }
          : null;
      await notificationService.notifyNewMessage(recipientId, senderName, id, convRef, {
        customerNotificationAudit,
      });
    }

    return res.status(201).json({ message });
  } catch (err) {
    next(err);
  }
}

async function markRead(req, res, next) {
  try {
    const { id } = req.params;

    const conversation = await conversationModel.findById(id);
    if (!conversation) return next(createError('Conversation not found', 404));

    await maybeSwitchSupportConversationToCustomer(req, conversation);
    const callerId = getCallerId(req);

    if (!(await callerCanAccessConversationAsync(req, conversation))) {
      return next(createError('You are not a participant in this conversation', 403));
    }
    if (conversationTenantMismatch(req, conversation)) {
      return next(createError('Access denied', 403));
    }

    await messageModel.markConversationRead(id, callerId);

    const readPayload = {
      type: 'chat:read',
      conversationId: id,
      userId: callerId,
      readAt: new Date().toISOString(),
    };

    const convRef = conversation.project_ref;
    if (conversation.type === 'customer_support') {
      wsServer.broadcastSupportChat(
        convRef,
        readPayload,
        conversation.organization_id ?? conversation.organizationId
      );
    } else {
      wsServer.broadcast(convRef, readPayload);
    }

    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function getSupportRating(req, res, next) {
  try {
    const { id } = req.params;
    if (!req.customer && !req.cookies?.customer_session) {
      return next(createError('Forbidden', 403));
    }

    const conversation = await conversationModel.findById(id);
    if (!conversation) return next(createError('Conversation not found', 404));
    await maybeSwitchSupportConversationToCustomer(req, conversation);
    const customerId = req.customer?.id;
    if (!customerId) return next(createError('Forbidden', 403));
    if (conversation.type !== 'customer_support') {
      return next(createError('Not a support conversation', 400));
    }
    if (conversationTenantMismatch(req, conversation)) {
      return next(createError('Access denied', 403));
    }
    if (conversation.participant_1_id !== customerId) {
      return next(createError('Access denied', 403));
    }

    const row = await supportTicketRatingModel.findByConversationId(id);
    return res.json({ rating: row ? mapSupportTicketRating(row) : null });
  } catch (err) {
    next(err);
  }
}

async function putSupportRating(req, res, next) {
  try {
    const { id } = req.params;
    const { stars, comment } = req.body;
    if (!req.customer && !req.cookies?.customer_session) {
      return next(createError('Forbidden', 403));
    }

    const conversation = await conversationModel.findById(id);
    if (!conversation) return next(createError('Conversation not found', 404));
    await maybeSwitchSupportConversationToCustomer(req, conversation);
    const customerId = req.customer?.id;
    if (!customerId) return next(createError('Forbidden', 403));
    if (conversation.type !== 'customer_support') {
      return next(createError('Not a support conversation', 400));
    }
    if (conversationTenantMismatch(req, conversation)) {
      return next(createError('Access denied', 403));
    }
    if (conversation.participant_1_id !== customerId) {
      return next(createError('Access denied', 403));
    }

    const existingRating = await supportTicketRatingModel.findByConversationId(id);
    if (existingRating) {
      return next(
        createError(
          'You have already rated this support chat. Ratings cannot be changed.',
          403
        )
      );
    }

    const cmt = typeof comment === 'string' && comment.trim() ? comment.trim() : null;
    const row = await supportTicketRatingModel.createForConversation({
      conversationId: id,
      projectRef: conversation.project_ref,
      customerId,
      ticketSubject: conversation.support_subject ?? null,
      stars,
      comment: cmt,
    });

    return res.json({ rating: mapSupportTicketRating(row) });
  } catch (err) {
    next(err);
  }
}

async function patchSupportChatStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { closed } = req.body;
    if (!req.customer && !req.cookies?.customer_session) {
      return next(createError('Only customers can update this support chat', 403));
    }

    const conversation = await conversationModel.findById(id);
    if (!conversation) return next(createError('Conversation not found', 404));
    await maybeSwitchSupportConversationToCustomer(req, conversation);
    const customerId = req.customer?.id;
    if (!customerId) {
      return next(createError('Only customers can update this support chat', 403));
    }
    if (conversation.type !== 'customer_support') {
      return next(createError('Not a support conversation', 400));
    }
    if (conversationTenantMismatch(req, conversation)) {
      return next(createError('Access denied', 403));
    }
    if (conversation.participant_1_id !== customerId) {
      return next(createError('Access denied', 403));
    }

    const updated = await conversationModel.setSupportClosed(id, closed);
    const mapped = mapConversation(updated);

    wsServer.broadcastSupportChat(
      conversation.project_ref,
      {
        type: 'chat:support_status',
        conversationId: id,
        supportClosedAt: mapped.supportClosedAt,
      },
      conversation.organization_id ?? conversation.organizationId
    );

    return res.json({ conversation: mapped });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createConversation,
  createSupportTicket,
  listConversations,
  getMessages,
  sendMessage,
  markRead,
  getSupportRating,
  putSupportRating,
  patchSupportChatStatus,
};
