'use strict';

const { select } = require('../lib/supabase');
const { sendPushToMultiple } = require('./push.service');
const { sendEmail } = require('./email.service');
const templateModel = require('../models/notification-template.model');
const userShopModel = require('../models/user-shop.model');
const userModel = require('../models/user.model');
const {
  renderTemplate,
  buildOrderVariables,
  wrapEmailLayout,
} = require('./template.service');
const logger = require('../lib/logger');
const { writeAuditLog } = require('../lib/audit');
const { organizationIdByOrderId, organizationIdByProjectRef } = require('../lib/audit-org');

// ─── Helpers ───────────────────────────────────────────────────────────────────

async function getUserTokens(userId, projectRef) {
  try {
    const rows = await select('push_tokens', {
      select: 'token',
      filters: { user_id: userId, project_ref: projectRef },
    });
    return (rows || []).map((r) => r.token);
  } catch (err) {
    logger.error('Failed to fetch push tokens', { userId, error: err.message });
    return [];
  }
}

async function getCustomerEmail(customerId, projectRef) {
  try {
    const rows = await select('customers', {
      select: 'email,name',
      filters: { id: customerId, project_ref: projectRef },
      limit: 1,
    });
    return rows?.[0] || null;
  } catch (err) {
    logger.error('Failed to fetch customer', { customerId, error: err.message });
    return null;
  }
}

async function getShopName(shopId) {
  if (!shopId) return null;
  try {
    const rows = await select('shops', {
      select: 'name',
      filters: { id: shopId },
      limit: 1,
    });
    return rows?.[0]?.name || null;
  } catch {
    return null;
  }
}

async function getOrderItems(orderId) {
  try {
    const rows = await select('order_items', {
      filters: { order_id: orderId },
    });
    return rows || [];
  } catch {
    return [];
  }
}

/**
 * Core send function: loads template from DB, renders with variables,
 * sends email and/or push based on template channel setting.
 */
async function sendNotification({
  slug,
  userId,
  projectRef,
  email,
  variables,
  pushData = {},
  /** Logged to audit_log for superadmin customer 360° activity (customer-facing sends only). */
  customerNotificationAudit = null,
}) {
  try {
    const template = await templateModel.getBySlug(slug, projectRef ? { projectRef } : undefined);
    if (!template || !template.is_active) {
      logger.debug(`Notification template "${slug}" inactive or not found, skipping`);
      return;
    }

    const shouldEmail = (template.channel === 'email' || template.channel === 'both') && template.email_subject;
    const shouldPush = (template.channel === 'push' || template.channel === 'both') && template.push_title;

    let organizationId = null;
    const orderIdForOrg = customerNotificationAudit?.orderId;
    if (orderIdForOrg) {
      organizationId = await organizationIdByOrderId(orderIdForOrg);
    } else if (projectRef) {
      organizationId = await organizationIdByProjectRef(projectRef);
    }

    let emailAttempted = false;
    if (shouldEmail && email) {
      emailAttempted = true;
      const subject = renderTemplate(template.email_subject, variables);
      const bodyHtml = renderTemplate(template.email_html || '', variables);
      const html = wrapEmailLayout(bodyHtml);
      const text = subject;
      await sendEmail({ to: email, subject, html, text, organizationId }).catch((err) => {
        // Phase 06: recipient PII never reaches logs — slug + error only.
        logger.error('Notification email failed', { slug, error: err.message });
      });
    }

    let pushTokenCount = 0;
    if (shouldPush && userId && projectRef) {
      const tokens = await getUserTokens(userId, projectRef);
      pushTokenCount = tokens.length;
      if (tokens.length) {
        const title = renderTemplate(template.push_title, variables);
        const body = renderTemplate(template.push_body || '', variables);
        await sendPushToMultiple({
          tokens,
          title,
          body,
          data: { type: slug, ...pushData },
          organizationId,
        }).catch((err) => {
          logger.error('Notification push failed', { slug, error: err.message });
        });
      }
    }

    if (customerNotificationAudit?.customerId) {
      const { customerId, orderId, conversationId } = customerNotificationAudit;
      let resourceType = 'customer';
      let resourceId = customerId;
      if (orderId) {
        resourceType = 'order';
        resourceId = orderId;
      } else if (conversationId) {
        resourceType = 'conversation';
        resourceId = conversationId;
      }
      if (!organizationId) {
        if (orderId) {
          organizationId = await organizationIdByOrderId(orderId);
        } else if (projectRef) {
          organizationId = await organizationIdByProjectRef(projectRef);
        }
      }
      await writeAuditLog({
        userId: customerId,
        action: 'notification.customer_sent',
        resourceType,
        resourceId,
        details: {
          slug,
          emailAttempted,
          pushTokenCount,
        },
        organizationId,
      });
    }
  } catch (err) {
    logger.error('sendNotification failed', { slug, error: err.message });
  }
}

// ─── Order Lifecycle Notifications ─────────────────────────────────────────────

async function notifyOrderConfirmation(order) {
  const customer = await getCustomerEmail(order.customer_id, order.project_ref);
  const shopName = await getShopName(order.shop_id);
  const items = await getOrderItems(order.id);

  const variables = buildOrderVariables(order, {
    customerName: customer?.name,
    shopName,
    items,
  });

  await sendNotification({
    slug: 'order_confirmation',
    userId: order.customer_id,
    projectRef: order.project_ref,
    email: customer?.email,
    variables,
    pushData: { orderId: order.id },
    customerNotificationAudit:
      order.customer_id ? { customerId: order.customer_id, orderId: order.id } : null,
  });
}

async function notifyOrderStatusChange(order, customerId, statusLabel) {
  if (!customerId) return;

  const statusSlugMap = {
    accepted: 'order_accepted',
    preparing: 'order_preparing',
    ready: 'order_ready',
    picked_up: 'order_picked_up',
  };

  const slug = statusSlugMap[order.status];
  if (!slug) return;

  const customer = await getCustomerEmail(customerId, order.project_ref);
  const shopName = await getShopName(order.shop_id);
  const variables = buildOrderVariables(order, {
    customerName: customer?.name,
    shopName,
  });

  await sendNotification({
    slug,
    userId: customerId,
    projectRef: order.project_ref,
    email: customer?.email,
    variables,
    pushData: { orderId: order.id, status: order.status },
    customerNotificationAudit: { customerId, orderId: order.id },
  });
}

async function notifyOrderCompleted(order, customerId) {
  if (!customerId) return;

  const customer = await getCustomerEmail(customerId, order.project_ref);
  const shopName = await getShopName(order.shop_id);
  const items = await getOrderItems(order.id);

  const variables = buildOrderVariables(order, {
    customerName: customer?.name,
    shopName,
    items,
  });

  await sendNotification({
    slug: 'order_completed',
    userId: customerId,
    projectRef: order.project_ref,
    email: customer?.email,
    variables,
    pushData: { orderId: order.id },
    customerNotificationAudit: { customerId, orderId: order.id },
  });
}

async function notifyOrderRejected(order, customerId, reason) {
  if (!customerId) return;

  const customer = await getCustomerEmail(customerId, order.project_ref);
  const shopName = await getShopName(order.shop_id);

  const variables = buildOrderVariables(order, {
    customerName: customer?.name,
    shopName,
    reason,
    wasRefunded: order.payment_status === 'paid',
  });

  await sendNotification({
    slug: 'order_rejected',
    userId: customerId,
    projectRef: order.project_ref,
    email: customer?.email,
    variables,
    pushData: { orderId: order.id },
    customerNotificationAudit: { customerId, orderId: order.id },
  });
}

async function sendCancellationEmail(customerEmail, order, reason) {
  if (!customerEmail) return;

  const customer = await getCustomerEmail(order.customer_id, order.project_ref);
  const shopName = await getShopName(order.shop_id);

  const variables = buildOrderVariables(order, {
    customerName: customer?.name,
    shopName,
    reason,
    wasRefunded: order.payment_status === 'paid',
  });

  await sendNotification({
    slug: 'order_cancelled',
    userId: order.customer_id,
    projectRef: order.project_ref,
    email: customerEmail,
    variables,
    pushData: { orderId: order.id },
    customerNotificationAudit: order.customer_id
      ? { customerId: order.customer_id, orderId: order.id }
      : null,
  });
}

async function sendRefundEmail(customerEmail, order, refundAmountCents, options = {}) {
  if (!customerEmail) return;

  const customer = await getCustomerEmail(order.customer_id, order.project_ref);
  const shopName = await getShopName(order.shop_id);

  const variables = buildOrderVariables(order, {
    customerName: customer?.name,
    shopName,
    refundAmount: refundAmountCents,
    refundCreditedToWallet: Boolean(options.creditedToWallet),
  });

  await sendNotification({
    slug: 'order_refund',
    userId: order.customer_id,
    projectRef: order.project_ref,
    email: customerEmail,
    variables,
    pushData: { orderId: order.id },
    customerNotificationAudit: order.customer_id
      ? { customerId: order.customer_id, orderId: order.id }
      : null,
  });
}

async function notifyOrderDelayed(order, customerId) {
  if (!customerId) return;

  const shopName = await getShopName(order.shop_id);
  const variables = buildOrderVariables(order, { shopName });

  await sendNotification({
    slug: 'order_delayed',
    userId: customerId,
    projectRef: order.project_ref,
    variables,
    pushData: { orderId: order.id },
    customerNotificationAudit: { customerId, orderId: order.id },
  });
}

// ─── Vendor Notifications ──────────────────────────────────────────────────────

async function notifyNewOrder(order, vendorId) {
  const shopName = await getShopName(order.shop_id);
  const variables = buildOrderVariables(order, { shopName });

  await sendNotification({
    slug: 'new_order_vendor',
    userId: vendorId,
    projectRef: order.project_ref,
    variables,
    pushData: { orderId: order.id },
  });
}

/**
 * Push "new order" to every staff member who should see it: vendors assigned to the
 * shop (user_shops) plus all workspace admins. Skips POS self-serve paths by caller
 * (only invoked for customer-paid orders that land in `placed`).
 */
async function notifyShopStaffNewOrder(order) {
  if (!order || order.status !== 'placed' || !order.shop_id || !order.project_ref) return;

  const shopName = await getShopName(order.shop_id);
  const variables = buildOrderVariables(order, { shopName });

  const recipientIds = new Set();
  const assignments = await userShopModel.findByShopId(order.shop_id);
  for (const row of assignments || []) {
    if (row.user_id) recipientIds.add(row.user_id);
  }
  const admins = await userModel.findByProjectRef(order.project_ref, 'admin');
  for (const admin of admins || []) {
    if (admin.id) recipientIds.add(admin.id);
  }

  await Promise.all(
    [...recipientIds].map((userId) =>
      sendNotification({
        slug: 'new_order_vendor',
        userId,
        projectRef: order.project_ref,
        variables,
        pushData: { orderId: order.id },
      }),
    ),
  );
}

// ─── Delivery Notifications ────────────────────────────────────────────────────

async function notifyDeliveryAssigned(delivery, riderId, projectRef) {
  const variables = {
    orderNumber: delivery.order_id ? delivery.order_id.slice(0, 8).toUpperCase() : '',
    deliveryId: delivery.id,
  };

  await sendNotification({
    slug: 'delivery_assigned',
    userId: riderId,
    projectRef,
    variables,
    pushData: { deliveryId: delivery.id },
  });
}

async function notifyDeliveryRequest(delivery, riderId, projectRef) {
  const variables = {
    deliveryId: delivery.id,
    orderNumber: delivery.order_id ? delivery.order_id.slice(0, 8).toUpperCase() : '',
  };

  await sendNotification({
    slug: 'delivery_request',
    userId: riderId,
    projectRef,
    variables,
    pushData: { deliveryId: delivery.id },
  });
}

async function notifyRiderArrived(delivery, orderId, projectRef) {
  const orderModel = require('../models/order.model');
  const order = await orderModel.findById(orderId);
  if (!order?.customer_id) return;

  const shopName = await getShopName(order.shop_id);
  const variables = buildOrderVariables(order, { shopName });

  await sendNotification({
    slug: 'rider_arrived',
    userId: order.customer_id,
    projectRef,
    variables,
    pushData: { deliveryId: delivery.id, orderId },
    customerNotificationAudit: { customerId: order.customer_id, orderId },
  });
}

// ─── Chat Notifications ────────────────────────────────────────────────────────

async function notifyNewMessage(recipientId, senderName, conversationId, projectRef, options = {}) {
  await sendNotification({
    slug: 'chat_message',
    userId: recipientId,
    projectRef,
    variables: { senderName },
    pushData: { conversationId },
    customerNotificationAudit: options.customerNotificationAudit || null,
  });
}

module.exports = {
  sendNotification,
  notifyOrderConfirmation,
  notifyOrderStatusChange,
  notifyOrderCompleted,
  notifyOrderRejected,
  sendCancellationEmail,
  sendRefundEmail,
  notifyOrderDelayed,
  notifyNewOrder,
  notifyShopStaffNewOrder,
  notifyDeliveryAssigned,
  notifyDeliveryRequest,
  notifyRiderArrived,
  notifyNewMessage,
};
