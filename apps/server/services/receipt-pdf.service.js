'use strict';

const PDFDocument = require('pdfkit');
const orderModel = require('../models/order.model');
const shopModel = require('../models/shop.model');
const customerModel = require('../models/customer.model');
const { select } = require('../lib/supabase');
const { resolveShopCurrency, validCurrency } = require('../lib/currency');
const { formatMoneyCents } = require('../lib/format-money');

function orderItemsList(order) {
  const raw = order.order_items || order.orderItems;
  return Array.isArray(raw) ? raw : [];
}

function lineTotalCents(item) {
  const q = Number(item.quantity || 0);
  const u = Number(item.unit_price_cents ?? item.unitPriceCents ?? 0);
  return q * u;
}

/**
 * Load order + shop + workspace label + customer for receipt rendering.
 */
async function loadOrderReceiptContext(orderId) {
  const order = await orderModel.findWithItems(orderId);
  if (!order) return null;

  const [shop, customer, workspaceRows] = await Promise.all([
    order.shop_id ? shopModel.findById(order.shop_id) : Promise.resolve(null),
    order.customer_id ? customerModel.findById(order.customer_id) : Promise.resolve(null),
    select('workspaces', { filters: { project_ref: order.project_ref }, limit: 1 }),
  ]);

  const workspace = workspaceRows?.[0] || null;
  const workspaceName = workspace?.name || null;
  const orderCurrency = validCurrency(order.currency);
  const receiptCurrency =
    orderCurrency || (await resolveShopCurrency(shop, workspace));

  return { order, shop, customer, workspaceName, receiptCurrency };
}

/**
 * @param {object} params
 * @param {object} params.order — row from findWithItems (snake_case fields)
 * @param {object|null} params.shop
 * @param {object|null} params.customer
 * @param {string|null} params.workspaceName
 * @returns {Promise<Buffer>}
 */
function buildOrderReceiptPdfBuffer({ order, shop, customer, workspaceName, receiptCurrency }) {
  const items = orderItemsList(order);
  const itemsSubtotalCents = items.reduce((sum, it) => sum + lineTotalCents(it), 0);
  const deliveryFeeCents = Number(order.delivery_fee_cents || 0);
  const discountCents = Number(order.discount_cents || 0);
  const totalCents = Number(order.total_cents || 0);
  const currency = receiptCurrency || validCurrency(order.currency);
  const paymentStatus = order.payment_status || 'unknown';
  const shortId = String(order.id || '').slice(0, 8).toUpperCase();

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: `Receipt ${shortId}` } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(20).text('Receipt / Invoice', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(9).fillColor('#666').text(`Order #${shortId} · ${String(order.id)}`, { align: 'center' });
    doc.fillColor('#000');
    doc.moveDown(1);

    if (workspaceName) {
      doc.fontSize(11).font('Helvetica-Bold').text(workspaceName);
      doc.font('Helvetica');
    }
    if (shop?.name) {
      doc.fontSize(11).text(shop.name);
    }
    if (shop?.address) {
      doc.fontSize(9).fillColor('#444').text(String(shop.address));
      doc.fillColor('#000');
    }
    if (shop?.phone) {
      doc.fontSize(9).text(`Tel: ${shop.phone}`);
    }
    doc.moveDown(0.8);

    const created = order.created_at ? new Date(order.created_at).toLocaleString() : '—';
    doc.fontSize(10).text(`Date: ${created}`);
    doc.text(`Status: ${order.status || '—'}`);
    doc.text(`Payment: ${paymentStatus}`);
    doc.moveDown(0.6);

    if (customer) {
      const who = [customer.name, customer.phone, customer.email].filter(Boolean).join(' · ');
      if (who) {
        doc.font('Helvetica-Bold').fontSize(10).text('Bill to');
        doc.font('Helvetica').fontSize(9).text(who);
        doc.moveDown(0.5);
      }
    }

    if (order.delivery_address) {
      doc.font('Helvetica-Bold').fontSize(10).text('Delivery address');
      doc.font('Helvetica').fontSize(9).text(String(order.delivery_address), { width: doc.page.width - 96 });
      doc.moveDown(0.5);
    }
    if (order.delivery_notes) {
      doc.font('Helvetica-Bold').fontSize(10).text('Delivery notes');
      doc.font('Helvetica').fontSize(9).text(String(order.delivery_notes), { width: doc.page.width - 96 });
      doc.moveDown(0.5);
    }

    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').fontSize(10).text('Items');
    doc.moveDown(0.25);
    doc.font('Helvetica').fontSize(9);

    for (const it of items) {
      const name = String(it.name || 'Item');
      const qty = Number(it.quantity || 0);
      const unit = Number(it.unit_price_cents ?? it.unitPriceCents ?? 0);
      const line = qty * unit;
      doc.text(
        `${name}  × ${qty}  @ ${formatMoneyCents(unit, currency)}  = ${formatMoneyCents(line, currency)}`,
        { width: doc.page.width - 96 }
      );
      if (doc.y > doc.page.height - 160) {
        doc.addPage();
      }
    }

    doc.moveDown(0.6);
    doc.moveTo(48, doc.y).lineTo(doc.page.width - 48, doc.y).strokeColor('#cccccc').stroke();
    doc.moveDown(0.4);

    const labelX = doc.page.width - 48 - 200;
    const valX = doc.page.width - 48 - 72;
    let sumY = doc.y;
    doc.fontSize(9).text('Subtotal (items)', labelX, sumY, { width: 120, align: 'right' });
    doc.text(formatMoneyCents(itemsSubtotalCents, currency), valX, sumY, { width: 72, align: 'right' });
    sumY += 16;

    if (deliveryFeeCents > 0) {
      doc.text('Delivery fee', labelX, sumY, { width: 120, align: 'right' });
      doc.text(formatMoneyCents(deliveryFeeCents, currency), valX, sumY, { width: 72, align: 'right' });
      sumY += 16;
    }
    if (discountCents > 0) {
      doc.text('Discount', labelX, sumY, { width: 120, align: 'right' });
      doc.text(`-${formatMoneyCents(discountCents, currency)}`, valX, sumY, { width: 72, align: 'right' });
      sumY += 16;
    }

    doc.font('Helvetica-Bold').fontSize(11);
    doc.text('Total', labelX, sumY, { width: 120, align: 'right' });
    doc.text(formatMoneyCents(totalCents, currency), valX, sumY, { width: 72, align: 'right' });

    doc.font('Helvetica').fontSize(8).fillColor('#666');
    doc.text('Thank you for your order.', 48, doc.page.height - 72, { align: 'center', width: doc.page.width - 96 });
    doc.fillColor('#000');

    doc.end();
  });
}

module.exports = {
  loadOrderReceiptContext,
  buildOrderReceiptPdfBuffer,
  formatMoney: formatMoneyCents,
};
