'use strict';

const logger = require('../lib/logger');
const { formatMoneyCents } = require('../lib/format-money');

/**
 * Lightweight Handlebars-like template engine.
 * Supports: {{variable}}, {{#if var}}...{{/if}}, {{#if var}}...{{else}}...{{/if}}
 */
function renderTemplate(template, variables) {
  if (!template) return '';

  let result = template;

  // {{#if variable}}content{{else}}altContent{{/if}}
  result = result.replace(
    /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_, key, inner) => {
      const val = variables[key];
      const isTruthy = val !== undefined && val !== null && val !== '' && val !== false;
      const [ifBlock, elseBlock = ''] = inner.split('{{else}}');
      return isTruthy ? ifBlock : elseBlock;
    }
  );

  // {{variable}}
  result = result.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const val = variables[key];
    if (val === undefined || val === null) return '';
    return String(val);
  });

  return result;
}

function buildItemRows(items, currency) {
  if (!items?.length) return '';
  return items
    .map(
      (item) =>
        `<tr><td style="padding:8px;border-bottom:1px solid #eee;">${item.name || item.product_name || 'Item'}${item.quantity > 1 ? ` x${item.quantity}` : ''}</td><td style="text-align:right;padding:8px;border-bottom:1px solid #eee;">${formatMoneyCents((item.unit_price_cents || item.unitPriceCents || 0) * (item.quantity || 1), currency)}</td></tr>`
    )
    .join('\n  ');
}

function shortOrderId(id) {
  return id ? id.slice(0, 8).toUpperCase() : '';
}

/**
 * Build standard template variables from an order + optional extras.
 */
function buildOrderVariables(order, extras = {}) {
  const currency = (order.currency || extras.currency || 'GBP').toUpperCase();
  const cutleryReq = order.cutlery_requested ?? order.cutleryRequested;
  const cutleryFee = order.cutlery_fee_cents ?? order.cutleryFeeCents ?? 0;
  let cutleryLine = '';
  if (cutleryReq) {
    cutleryLine =
      cutleryFee > 0
        ? `Cutlery requested (${formatMoneyCents(cutleryFee, currency)})`
        : 'Cutlery requested (free)';
  }
  return {
    orderNumber: shortOrderId(order.id),
    orderId: order.id,
    customerName: extras.customerName || order.customer_name || 'Customer',
    shopName: extras.shopName || order.shop_name || 'the restaurant',
    totalFormatted: formatMoneyCents(order.total_cents || 0, currency),
    subtotalFormatted: formatMoneyCents(order.subtotal_cents || 0, currency),
    deliveryFeeFormatted: formatMoneyCents(order.delivery_fee_cents || 0, currency),
    deliveryAddress: order.delivery_address || extras.deliveryAddress || '',
    status: order.status || '',
    itemRows: buildItemRows(extras.items || order.items, currency),
    reason: extras.reason || '',
    refundAmount: extras.refundAmount ? formatMoneyCents(extras.refundAmount, currency) : '',
    wasRefunded: extras.wasRefunded || (order.payment_status === 'paid') || false,
    deliveryMode: extras.deliveryMode || '',
    senderName: extras.senderName || '',
    cutleryLine,
    ...extras.custom,
  };
}

/**
 * Wrap email HTML in a branded base layout.
 */
function wrapEmailLayout(bodyHtml, options = {}) {
  const { appName = 'Dilivygo', primaryColor = '#000000' } = options;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${appName}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;">
<tr><td align="center" style="padding:24px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
  <tr><td style="background:${primaryColor};padding:20px 32px;">
    <h1 style="margin:0;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">${appName}</h1>
  </td></tr>
  <tr><td style="padding:32px;">
    ${bodyHtml}
  </td></tr>
  <tr><td style="padding:16px 32px;background:#f8f8f8;border-top:1px solid #eee;">
    <p style="margin:0;font-size:12px;color:#999;text-align:center;">&copy; ${new Date().getFullYear()} ${appName}. All rights reserved.</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

module.exports = {
  renderTemplate,
  formatCents: formatMoneyCents,
  buildItemRows,
  shortOrderId,
  buildOrderVariables,
  wrapEmailLayout,
};
