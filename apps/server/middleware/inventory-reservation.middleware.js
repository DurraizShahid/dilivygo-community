'use strict';

const inventoryReservations = require('../services/inventory-reservation.service');
const { cancelPaymentIntent } = require('../services/stripe.service');
const { assertOrderItemsPricedForShop } = require('../services/order-line-pricing.service');
const { createError } = require('./error.middleware');
const logger = require('../lib/logger');

function parseItems(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    throw createError('Invalid cart items payload', 400);
  }
}

function checkoutGroups(req) {
  const draftGroups = req.body?.checkoutDraft?.groups;
  if (Array.isArray(draftGroups) && draftGroups.length) {
    return draftGroups.map((group) => ({
      shopId: group.shopId,
      projectRef: group.projectRef || req.projectRef || null,
      items: Array.isArray(group.items) ? group.items : [],
    }));
  }

  const metadata = req.body?.metadata || {};
  const items = parseItems(metadata.items);
  if (!metadata.shopId || !items.length) return [];
  return [{
    shopId: metadata.shopId,
    projectRef: metadata.projectRef || req.projectRef || null,
    items,
  }];
}

function isImmediateFulfillment(body) {
  const id = String(body?.paymentIntentId || '');
  return Boolean(
    body?.isWalletOnly ||
    body?.isDummy ||
    id.startsWith('wallet_') ||
    id.startsWith('pi_dummy_')
  );
}

/**
 * Reserve finite variant stock before a PaymentIntent is exposed to the client.
 *
 * The controller remains responsible for cart totals/promos/etc. This middleware
 * repeats the authoritative line-price ownership check before touching stock so
 * a caller cannot temporarily reserve variants belonging to another shop.
 *
 * `res.json` is wrapped so the newly-created PaymentIntent is durably linked to
 * the reservation BEFORE its client secret leaves the server. If that link
 * cannot be persisted, the PaymentIntent is cancelled and the reservation is
 * released instead of exposing a chargeable intent for stock that is back on
 * sale.
 */
async function reserveCheckoutInventory(req, res, next) {
  try {
    const groups = checkoutGroups(req);
    if (!groups.length) return next();

    for (const group of groups) {
      if (!group.shopId) throw createError('Shop is required for checkout', 400);
      await assertOrderItemsPricedForShop({
        shopId: group.shopId,
        projectRef: group.projectRef,
        items: group.items,
      });
    }

    const reservationId = await inventoryReservations.reserveForCheckout(groups);
    if (!reservationId) return next();

    req.inventoryReservationId = reservationId;
    let settled = false;
    let paymentAttached = false;
    const originalJson = res.json.bind(res);

    const releaseIfSafe = async (reason) => {
      if (settled || paymentAttached) return;
      settled = true;
      try {
        await inventoryReservations.release(reservationId);
      } catch (err) {
        logger.error('Failed to release checkout inventory reservation', {
          reservationId,
          reason,
          error: err.message,
        });
      }
    };

    res.once('close', () => {
      if (!res.writableEnded) {
        releaseIfSafe('response_closed').catch(() => {});
      }
    });

    res.json = function inventoryAwareJson(body) {
      const finalize = async () => {
        if (settled) return originalJson(body);

        const paymentIntentId = body?.paymentIntentId ? String(body.paymentIntentId) : null;
        if (res.statusCode >= 400 || !paymentIntentId) {
          await releaseIfSafe(res.statusCode >= 400 ? 'request_failed' : 'no_payment_intent');
          return originalJson(body);
        }

        // Wallet-only and non-production demo checkout already created the paid
        // order before reaching this response. The stock must therefore be
        // consumed regardless of whether synthetic payment-id bookkeeping can
        // subsequently be attached.
        if (isImmediateFulfillment(body)) {
          try {
            await inventoryReservations.consume(reservationId);
            settled = true;
          } catch (err) {
            logger.error('Failed to consume inventory after immediate fulfillment', {
              reservationId,
              paymentIntentId,
              error: err.message,
            });
            // The order already exists. Never return the stock to sale here.
            settled = true;
            res.status(503);
            return originalJson({
              error: 'Order completed but inventory reconciliation needs attention.',
              code: 'INVENTORY_RECONCILIATION_FAILED',
            });
          }

          try {
            await inventoryReservations.attachPaymentIntent(reservationId, paymentIntentId);
          } catch (err) {
            // Reservation is already consumed, so linkage failure is bookkeeping
            // only. Do not turn a successfully-created wallet/demo order into a
            // client-visible failure that encourages a duplicate retry.
            logger.error('Failed to attach consumed inventory reservation to immediate payment', {
              reservationId,
              paymentIntentId,
              error: err.message,
            });
          }
          return originalJson(body);
        }

        try {
          await inventoryReservations.attachPaymentIntent(reservationId, paymentIntentId);
          paymentAttached = true;
          settled = true;
          return originalJson(body);
        } catch (err) {
          logger.error('Failed to attach inventory reservation to payment', {
            reservationId,
            paymentIntentId,
            error: err.message,
          });

          try {
            await cancelPaymentIntent(paymentIntentId, {
              idempotencyKey: `inventory_attach_failed:${paymentIntentId}`,
            });
          } catch (cancelErr) {
            // Do not release stock when cancellation is uncertain. The client
            // secret has not been sent, and keeping stock reserved is safer
            // than creating an oversell if Stripe accepted the intent state.
            logger.error('PaymentIntent cancellation failed after inventory attach failure', {
              reservationId,
              paymentIntentId,
              error: cancelErr.message,
            });
            settled = true;
            res.status(503);
            return originalJson({
              error: 'Checkout initialization failed. Please retry shortly.',
              code: 'INVENTORY_PAYMENT_LINK_FAILED',
            });
          }

          paymentAttached = false;
          await releaseIfSafe('payment_link_failed');
          res.status(503);
          return originalJson({
            error: 'Checkout initialization failed. Please retry.',
            code: 'INVENTORY_PAYMENT_LINK_FAILED',
          });
        }
      };

      return finalize();
    };

    return next();
  } catch (err) {
    const message = String(err?.message || '');
    if (/insufficient|unavailable stock/i.test(message)) {
      return next(createError('One or more items are no longer available in the requested quantity.', 409));
    }
    return next(err);
  }
}

module.exports = { reserveCheckoutInventory, checkoutGroups };
