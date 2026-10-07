'use strict';

const { createPaymentIntent, constructWebhookEvent } = require('../services/stripe.service');
// Commercial: SaaS billing webhook processing is not part of the Community
// Edition. CE has no workspace subscriptions; billing events are ignored.
let processBillingStripeEvent = async () => ({});
try {
  ({ processBillingStripeEvent } = require('../services/workspace-billing.service'));
} catch {
  // commercial module absent in CE — fallback above applies
}
// Commercial: Connect transfer payouts are not in CE. In CE the restaurant's
// own Stripe account is charged directly; no platform->vendor transfers exist.
let processVendorPayoutsAfterPayment = async () => ({ skipped: true, reason: 'ce_no_connect_transfers' });
try {
  ({ processVendorPayoutsAfterPayment } = require('../services/vendor-payout.service'));
} catch {
  // commercial module absent in CE — fallback above applies
}
const { refreshWorkspaceConnectFromStripe } = require('../services/vendor-stripe-connect.service');
const orderModel = require('../models/order.model');
const shopModel = require('../models/shop.model');
const { select } = require('../lib/supabase');
const stripeEventModel = require('../models/stripe-event.model');
const promoService = require('../services/promo.service');
const notificationService = require('../services/notification.service');
const checkoutBatchService = require('../services/checkout-batch.service');
const platformSettings = require('../models/platform-settings.model');
const wsServer = require('../websocket/ws-server');
const sentry = require('../lib/sentry');
const { writeAuditLog } = require('../lib/audit');
const {
  organizationIdFromStripeEvent,
  organizationIdByProjectRef,
  resolveAuditOrgId,
} = require('../lib/audit-org');
const logger = require('../lib/logger');
const { getShopOpenState } = require('../lib/shop-hours');
const { getPlatformCurrency, validCurrency } = require('../lib/currency');
const { formatMoneyCents } = require('../lib/format-money');
const {
  isCustomerCutleryPlatformEnabled,
  resolveCutleryFromSettings,
  resolveCutleryForShop,
  assertCutleryRequestAllowed,
  parseWantsCutlery,
} = require('../lib/checkout-cutlery');
const walletService = require('../services/wallet.service');
const { updatePaymentOperation } = require('../services/payment-provider');
const { createError } = require('../middleware/error.middleware');
const { assertOrderItemsPricedForShop } = require('../services/order-line-pricing.service');
const { MARKETPLACE_ORGANIZATION_ID } = require('../lib/platform-constants');

const MIN_SCHEDULE_LEAD_MS = 30 * 60 * 1000;

function getAuthenticatedProjectRef(req) {
  const candidates = [
    req.user?.projectRef,
    req.user?.project_ref,
    req.customer?.projectRef,
    req.customer?.project_ref,
  ];
  for (const candidate of candidates) {
    if (candidate != null && String(candidate).trim() !== '') return String(candidate);
  }
  return null;
}

/**
 * Debit wallet (if needed), fulfill batch, vendor payouts. Undoes wallet debit if fulfill throws.
 */
async function checkoutBatchDebitWalletAndFulfill({
  batch,
  paymentIntentId,
  currency,
  walletAmountCents,
  idempotencyBase,
}) {
  const w = Math.max(0, Math.floor(Number(walletAmountCents || 0)));
  const cid = batch.customerId || null;
  const projectRefFromBatch = () => {
    const g0 = batch.groups?.[0];
    return g0?.project_ref ?? g0?.projectRef ?? null;
  };
  let debited = false;
  if (w > 0 && cid) {
    const projectRef = projectRefFromBatch();
    await walletService.applyWalletDelta({
      customerId: cid,
      amountCents: -w,
      type: 'checkout_debit',
      idempotencyKey: `checkout_debit:${idempotencyBase}`,
      projectRef,
      referenceType: 'checkout_batch',
      referenceId: null,
      metadata: { paymentIntentId, walletCents: w },
    });
    debited = true;
  }
  try {
    const orders = await fulfillCheckoutBatch(batch, { paymentIntentId, currency });
    await processVendorPayoutsAfterPayment({ paymentIntentId, currency }).catch((err) =>
      logger.error('Vendor payout processing failed', { paymentIntentId, error: err.message }),
    );
    return orders;
  } catch (err) {
    if (debited && cid) {
      const projectRef = projectRefFromBatch();
      await walletService
        .applyWalletDelta({
          customerId: cid,
          amountCents: w,
          type: 'adjustment',
          idempotencyKey: `checkout_undo:${idempotencyBase}`,
          projectRef,
          referenceType: 'compensation',
          referenceId: null,
          metadata: { reason: 'fulfill_failed', paymentIntentId },
        })
        .catch((e) => logger.error('Wallet undo after failed fulfill', { error: e.message }));
    }
    throw err;
  }
}

async function assertShopCanAcceptOrder(projectRef, shopId, scheduledFor, opts = {}) {
  if (!shopId) return;
  const shop = await shopModel.findById(shopId);
  if (!shop) {
    const err = new Error('Shop not found or unavailable');
    err.statusCode = 404;
    throw err;
  }
  // Tenant isolation: the shop must be reachable from the caller's scope.
  // - On vendor / legacy per-workspace flows we keep the strict
  //   `shop.project_ref === projectRef` match.
  // - On org-host customer flows the caller's scope is an organization
  //   (the customer marketplace spans every workspace in that org), so we
  //   require the shop to live in that organization instead.
  const expectedOrgId = opts.organizationId ?? null;
  const shopOrgId = shop.organization_id ? String(shop.organization_id) : null;
  const wsMatch = projectRef && shop.project_ref === projectRef;
  const orgMatch = expectedOrgId && shopOrgId && shopOrgId === String(expectedOrgId);
  if (!wsMatch && !orgMatch) {
    const err = new Error('This shop is not available for your account.');
    err.statusCode = 403;
    throw err;
  }
  if (shop.is_active === false) {
    const err = new Error('Shop not found or unavailable');
    err.statusCode = 404;
    throw err;
  }

  const now = new Date();
  const when = scheduledFor ? new Date(scheduledFor) : now;
  const checkMoment = Number.isNaN(when.getTime()) ? now : when;

  if (scheduledFor && !Number.isNaN(when.getTime()) && when.getTime() - now.getTime() < MIN_SCHEDULE_LEAD_MS) {
    const err = new Error('Scheduled orders must be at least 30 minutes in the future.');
    err.statusCode = 400;
    throw err;
  }

  const { isOpen } = getShopOpenState(shop, checkMoment);
  if (!isOpen) {
    const err = new Error('This shop is currently closed and not accepting orders.');
    err.statusCode = 409;
    throw err;
  }
}

function computedGroupSubtotalCents(group) {
  return group.items.reduce((sum, it) => sum + it.quantity * it.unitPriceCents, 0);
}

/**
 * Create one row per shop from a validated checkout batch (single PaymentIntent).
 * Full delivery fee and promo discount apply to the first order (stable shopId sort).
 */
async function fulfillCheckoutBatch(batch, { paymentIntentId, currency }) {
  const sorted = [...batch.groups].sort((a, b) => String(a.shopId).localeCompare(String(b.shopId)));
  let isFirst = true;
  const orders = [];
  let remainingDiscount = Math.max(batch.discountCents || 0, 0);
  const vendorSettingsModel = require('../models/vendor-settings.model');
  const platformCutleryEnabled = await isCustomerCutleryPlatformEnabled();

  for (const g of sorted) {
    await assertOrderItemsPricedForShop({
      shopId: g.shopId,
      projectRef: g.projectRef,
      items: g.items || [],
    });
    const deliveryFeeCents = isFirst ? (batch.deliveryFeeCents || 0) : 0;
    const baseTotal = g.subtotalCents + deliveryFeeCents;
    // Prevent negative per-order totals: consume discount left-to-right (stable shopId sort).
    const orderDiscount = Math.min(remainingDiscount, baseTotal);
    const orderPromoId = isFirst ? (batch.promoCodeId || null) : null;
    const vs = await vendorSettingsModel.findByShopId(g.shopId);
    const wants = parseWantsCutlery(g.wantsCutlery);
    assertCutleryRequestAllowed(wants, vs, platformCutleryEnabled);
    const { requested, feeCents } = resolveCutleryFromSettings({
      platformEnabled: platformCutleryEnabled,
      vendorSettings: vs,
      wantsCutlery: wants,
    });
    const orderTotal = baseTotal - orderDiscount + feeCents;
    remainingDiscount -= orderDiscount;

    const order = await orderModel.createWithItems({
      projectRef: g.projectRef,
      shopId: g.shopId,
      customerId: batch.customerId || null,
      items: g.items,
      totalCents: orderTotal,
      paymentIntentId,
      scheduledFor: batch.scheduledFor || null,
      address: batch.address,
      notes: batch.notes || null,
      currency,
      discountCents: orderDiscount,
      promoCodeId: orderPromoId,
      deliveryFeeCents,
      recordPromoRedemption: isFirst && Boolean(orderPromoId),
      cutleryRequested: requested,
      cutleryFeeCents: feeCents,
    });

    wsServer.fanOrderToWorkspaceAndMarketplaceCustomer(g.projectRef, batch.customerId || null, {
      type: 'order:status_changed',
      orderId: order.id,
      status: order.status,
      previousStatus: null,
      updatedAt: order.created_at,
    });

    notificationService.notifyOrderConfirmation(order).catch((err) =>
      logger.error('Order confirmation notification failed', { orderId: order.id, error: err.message })
    );
    if (order.status === 'placed') {
      notificationService.notifyShopStaffNewOrder(order).catch((err) =>
        logger.error('Vendor new-order notification failed', { orderId: order.id, error: err.message })
      );
    }

    orders.push(order);
    isFirst = false;
  }

  if (remainingDiscount > 0) {
    logger.warn('Checkout batch discount exceeded allocatable order total', {
      paymentIntentId,
      remainingDiscount,
    });
  }

  return orders;
}

async function createIntentWithCheckoutDraft(req, res, next) {
  try {
    const { amountCents, currency, checkoutDraft } = req.body;
    const primaryRef = checkoutDraft.groups?.[0]?.projectRef;
    const settingsCtx = primaryRef ? { projectRef: primaryRef } : undefined;
    const effectiveCurrency = validCurrency(currency) || (await getPlatformCurrency(settingsCtx));
    const customerId = req.customer?.id ? String(req.customer.id) : null;
    const authenticatedProjectRef = getAuthenticatedProjectRef(req);

    // Staff and workspace-scoped customers must never be able to mint orders for another tenant.
    // Marketplace customers (no bound project_ref) remain allowed to span workspaces in checkoutDraft.
    if (
      authenticatedProjectRef &&
      checkoutDraft.groups.some((group) => group.projectRef !== authenticatedProjectRef)
    ) {
      const err = new Error('Checkout contains items from a different workspace.');
      err.statusCode = 403;
      throw err;
    }

    const multiRaw = await platformSettings.get('multi_shop_cart_enabled', settingsCtx);
    const multiShopCartEnabled = multiRaw === 'true';

    const shopIds = [...new Set(checkoutDraft.groups.map((g) => g.shopId))];
    if (shopIds.length > 1 && !multiShopCartEnabled) {
      const err = new Error(
        'Multi-shop checkout is disabled. Remove items from other shops or contact support.',
      );
      err.statusCode = 403;
      throw err;
    }

    // Enforce single-organization checkout: each organization is its own marketplace,
    // so a cart can only contain shops from one organization. Shops from other orgs
    // are invisible to this customer anyway, but we still assert server-side.
    //
    // SECURITY (audit finding #6): also runs for SINGLE-shop carts so a
    // customer authenticated against org A cannot place an order against a
    // shop UUID in org B (e.g. via a leaked id). Marketplace bucket is the
    // explicit exception — `_marketplace` customers intentionally shop
    // across all orgs, and shops in the marketplace org are accessible from
    // any customer (legacy / cross-tenant inventory).
    {
      const shopRows = await select('shops', {
        filters: { id: shopIds },
        select: 'id,organization_id',
      });
      const orgIds = new Set();
      for (const row of shopRows || []) {
        if (row?.organization_id) orgIds.add(String(row.organization_id));
      }
      // Drop the marketplace bucket from the cross-shop comparison — a cart
      // mixing a marketplace shop with a real-org shop is still legal.
      const orgIdsExcludingMarketplace = new Set(
        [...orgIds].filter((id) => id !== MARKETPLACE_ORGANIZATION_ID),
      );
      if (orgIdsExcludingMarketplace.size > 1) {
        const err = new Error(
          'Checkout can only include shops from one organization. Remove items from other organizations.',
        );
        err.statusCode = 400;
        err.code = 'CROSS_ORG_CART';
        throw err;
      }
      // Customer org check (defense in depth — defends against single-shop
      // checkout with a foreign shop id). Only enforced when both sides
      // report a non-marketplace org.
      if (customerId && orgIdsExcludingMarketplace.size === 1) {
        const cRows = await select('customers', {
          select: 'id,organization_id',
          filters: { id: customerId },
          limit: 1,
        });
        const customerOrgId = cRows?.[0]?.organization_id
          ? String(cRows[0].organization_id)
          : null;
        const cartOrgId = [...orgIdsExcludingMarketplace][0];
        if (
          customerOrgId &&
          customerOrgId !== MARKETPLACE_ORGANIZATION_ID &&
          customerOrgId !== cartOrgId
        ) {
          const err = new Error(
            'Checkout can only include shops from your organization. Remove items from other organizations.',
          );
          err.statusCode = 400;
          err.code = 'CROSS_ORG_CART';
          throw err;
        }
      }
    }

    const combinedSubtotal = checkoutDraft.groups.reduce((s, g) => s + g.subtotalCents, 0);
    for (const g of checkoutDraft.groups) {
      const computed = computedGroupSubtotalCents(g);
      if (computed !== g.subtotalCents) {
        const err = new Error('Cart line totals do not match shop subtotals.');
        err.statusCode = 400;
        throw err;
      }
    }
    for (const g of checkoutDraft.groups) {
      await assertOrderItemsPricedForShop({
        shopId: g.shopId,
        projectRef: g.projectRef,
        items: g.items || [],
      });
    }

    const scheduledFor = checkoutDraft.scheduledFor || null;
    const vendorSettingsModel = require('../models/vendor-settings.model');
    let cutlerySumCents = 0;
    for (const g of checkoutDraft.groups) {
      await assertShopCanAcceptOrder(g.projectRef, g.shopId, scheduledFor, {
        organizationId: req.organizationId || null,
      });
      const settings = await vendorSettingsModel.findByShopId(g.shopId);
      const minCents = settings?.minimum_order_cents || 0;
      if (minCents > 0 && g.subtotalCents < minCents) {
        const err = new Error(
          `Minimum order amount is ${formatMoneyCents(minCents, effectiveCurrency)} for one of the shops.`,
        );
        err.statusCode = 400;
        throw err;
      }
      const wants = parseWantsCutlery(g.wantsCutlery);
      const gCtx = g.projectRef ? { projectRef: g.projectRef } : undefined;
      const platformCutleryEnabled = await isCustomerCutleryPlatformEnabled(gCtx);
      assertCutleryRequestAllowed(wants, settings, platformCutleryEnabled);
      const { feeCents } = resolveCutleryFromSettings({
        platformEnabled: platformCutleryEnabled,
        vendorSettings: settings,
        wantsCutlery: wants,
      });
      cutlerySumCents += feeCents;
    }

    const uniqueRefs = [...new Set(checkoutDraft.groups.map((g) => g.projectRef))];
    const promoProjectRef = uniqueRefs.length === 1 ? uniqueRefs[0] : null;

    // Resolve the tenant organization for promo validation so that coupons
    // issued in org A cannot be redeemed on a checkout served from org B. In
    // practice `req.organizationId` is set by `attachProjectRef` whenever the
    // host maps to a tenant (including the `{ref}.customer.<apex>` marketplace
    // case where `projectRef` is null). For legacy workspace-host checkouts we
    // fall back to resolving the org from the single project_ref, and finally
    // from the customer's own org.
    let promoOrganizationId =
      req.organizationId
      || req.customer?.organizationId
      || req.customer?.organization_id
      || null;
    if (!promoOrganizationId && promoProjectRef) {
      try {
        promoOrganizationId = await organizationIdByProjectRef(promoProjectRef);
      } catch {
        promoOrganizationId = null;
      }
    }

    let promoResult = null;
    let discountCents = 0;
    let promoCodeId = null;
    if (checkoutDraft.promoCode && checkoutDraft.promoCode.trim()) {
      promoResult = await promoService.validatePromoCode(checkoutDraft.promoCode.trim(), {
        projectRef: promoProjectRef,
        shopId: null,
        customerId,
        subtotalCents: combinedSubtotal,
        deliveryFeeCents: checkoutDraft.deliveryFeeCents,
        currency: effectiveCurrency,
        organizationId: promoOrganizationId,
      });
      if (promoResult.valid) {
        discountCents = promoResult.discountCents;
        promoCodeId = promoResult.promoCodeId;
      } else {
        const err = new Error(promoResult.message || 'Invalid promo code');
        err.statusCode = 400;
        throw err;
      }
    }

    const effectiveDelivery =
      promoResult?.valid && promoResult.freeDelivery ? 0 : checkoutDraft.deliveryFeeCents;
    const expectedTotal = Math.max(combinedSubtotal - discountCents + effectiveDelivery + cutlerySumCents, 0);

    const walletSetting = await platformSettings.get('customer_wallet_enabled', settingsCtx);
    const walletFeature = walletSetting === 'true' && customerId;

    let walletAmountCents = 0;
    if (walletFeature) {
      const requested = Math.max(0, Math.floor(Number(req.body.walletAmountCents || 0)));
      walletAmountCents = Math.min(requested, expectedTotal);
      const bal = await walletService.getBalance(customerId);
      if (walletAmountCents > bal) {
        throw createError('Insufficient wallet balance', 400);
      }
    }

    const stripePortion = expectedTotal - walletAmountCents;
    if (stripePortion !== amountCents) {
      const err = new Error('Payment amount does not match cart total and wallet.');
      err.statusCode = 400;
      throw err;
    }

    const batchPayload = {
      groups: checkoutDraft.groups,
      deliveryFeeCents: effectiveDelivery,
      discountCents: promoResult?.valid ? discountCents : 0,
      promoCodeId: promoResult?.valid ? promoCodeId : null,
      customerId,
      currency: effectiveCurrency,
      address: checkoutDraft.address.trim(),
      notes: checkoutDraft.notes ? String(checkoutDraft.notes).trim() : null,
      scheduledFor,
      walletAmountCents,
    };

    const checkoutBatchId = await checkoutBatchService.saveCheckoutBatch(batchPayload);

    const stripeMeta = {
      checkoutBatchId,
      multiShopCheckout: shopIds.length > 1 ? '1' : '0',
      customerId: customerId || '',
      currency: effectiveCurrency,
      amountCents: String(amountCents),
      walletAmountCents: String(walletAmountCents),
      projectRef: checkoutDraft.groups[0].projectRef,
    };

    if (walletFeature && stripePortion === 0 && walletAmountCents > 0) {
      const batch = await checkoutBatchService.takeCheckoutBatch(checkoutBatchId);
      if (!batch) {
        const err = new Error('Checkout session expired. Please try again.');
        err.statusCode = 400;
        throw err;
      }
      const walletPi = `wallet_${checkoutBatchId}`;
      const orders = await checkoutBatchDebitWalletAndFulfill({
        batch,
        paymentIntentId: walletPi,
        currency: effectiveCurrency,
        walletAmountCents,
        idempotencyBase: checkoutBatchId,
      });
      await writeAuditLog({
        action: 'payment.wallet_checkout',
        resourceType: 'order',
        resourceId: orders[0]?.id,
        details: { paymentIntentId: walletPi, orderCount: orders.length, walletAmountCents },
        organizationId:
          orders[0]?.organization_id ||
          (await organizationIdByProjectRef(String(checkoutDraft.groups[0].projectRef))),
      });
      const out = {
        clientSecret: null,
        paymentIntentId: walletPi,
        isDummy: false,
        isWalletOnly: true,
        walletAmountCents,
      };
      if (promoResult?.valid) {
        out.promoApplied = {
          discountCents: promoResult.discountCents,
          freeDelivery: promoResult.freeDelivery,
          message: promoResult.message,
        };
      }
      return res.json(out);
    }

    const chargeAmount =
      stripePortion <= 0
        ? 0
        : walletAmountCents > 0
          ? stripePortion
          : Math.max(stripePortion, 50);
    const result = await createPaymentIntent(chargeAmount, effectiveCurrency, stripeMeta);

    if (result.isDummy) {
      const batch = await checkoutBatchService.takeCheckoutBatch(checkoutBatchId);
      if (!batch) {
        const err = new Error('Checkout session expired. Please try again.');
        err.statusCode = 400;
        throw err;
      }
      const orders = await checkoutBatchDebitWalletAndFulfill({
        batch,
        paymentIntentId: result.paymentIntentId,
        currency: effectiveCurrency,
        walletAmountCents: batch.walletAmountCents || 0,
        idempotencyBase: result.paymentIntentId,
      });

      await writeAuditLog({
        action: 'payment.demo_bypass',
        resourceType: 'order',
        resourceId: orders[0]?.id,
        details: { paymentIntentId: result.paymentIntentId, orderCount: orders.length },
        organizationId:
          orders[0]?.organization_id ||
          (await organizationIdByProjectRef(String(checkoutDraft.groups[0].projectRef))),
      });

      logger.info('Demo bypass: multi-shop orders created without Stripe', {
        orderIds: orders.map((o) => o.id),
      });
    }

    if (promoResult?.valid) {
      result.promoApplied = {
        discountCents: promoResult.discountCents,
        freeDelivery: promoResult.freeDelivery,
        message: promoResult.message,
      };
    }
    result.walletAmountCents = walletAmountCents;

    return res.json(result);
  } catch (err) {
    next(err);
  }
}

async function createIntent(req, res, next) {
  try {
    const { amountCents, currency, metadata, checkoutDraft } = req.body;

    if (checkoutDraft) {
      return createIntentWithCheckoutDraft(req, res, next);
    }

    // On an org-host customer marketplace the middleware leaves `req.projectRef`
    // null so downstream body fallbacks can establish the correct workspace
    // project_ref from the shop. Resolve it here before building the Stripe
    // metadata so the webhook / order row carries the real workspace ref.
    let resolvedProjectRef = req.projectRef || null;
    if (!resolvedProjectRef && metadata?.shopId) {
      const shopRow = await shopModel.findById(String(metadata.shopId));
      if (shopRow?.project_ref) {
        resolvedProjectRef = String(shopRow.project_ref);
        req.projectRef = resolvedProjectRef;
      }
    }
    const enrichedMeta = { ...metadata, projectRef: resolvedProjectRef };

    // Resolve the tenant organization so we can both (a) pick up the org's
    // default currency when the client didn't send one and (b) keep promo
    // validation tenant-scoped.
    let tenantOrganizationId =
      req.organizationId
      || req.customer?.organizationId
      || req.customer?.organization_id
      || null;
    if (!tenantOrganizationId && resolvedProjectRef) {
      try {
        tenantOrganizationId = await organizationIdByProjectRef(resolvedProjectRef);
      } catch {
        tenantOrganizationId = null;
      }
    }

    const effectiveCurrency =
      validCurrency(currency)
      || (await getPlatformCurrency(
        tenantOrganizationId
          ? { organizationId: tenantOrganizationId }
          : resolvedProjectRef
          ? { projectRef: resolvedProjectRef }
          : undefined,
      ));

    await assertShopCanAcceptOrder(
      resolvedProjectRef,
      enrichedMeta.shopId || null,
      enrichedMeta.scheduledFor || null,
      { organizationId: req.organizationId || null },
    );

    const vendorSettingsModel = require('../models/vendor-settings.model');
    let shopVendorSettings = null;
    if (enrichedMeta.shopId) {
      shopVendorSettings = await vendorSettingsModel.findByShopId(enrichedMeta.shopId);
      const minCents = shopVendorSettings?.minimum_order_cents || 0;
      const subtotal = parseInt(enrichedMeta.subtotalCents || amountCents, 10);
      if (minCents > 0 && subtotal < minCents) {
        const err = new Error(
          `Minimum order amount is ${formatMoneyCents(minCents, effectiveCurrency)}. Your subtotal is ${formatMoneyCents(subtotal, effectiveCurrency)}.`,
        );
        err.statusCode = 400;
        throw err;
      }
    }

    let finalAmount = amountCents;
    let promoResult = null;

    if (enrichedMeta.promoCode) {
      promoResult = await promoService.validatePromoCode(enrichedMeta.promoCode, {
        projectRef: resolvedProjectRef,
        shopId: enrichedMeta.shopId || null,
        customerId: enrichedMeta.customerId || null,
        subtotalCents: parseInt(enrichedMeta.subtotalCents || amountCents, 10),
        deliveryFeeCents: parseInt(enrichedMeta.deliveryFeeCents || '0', 10),
        currency: effectiveCurrency,
        organizationId: tenantOrganizationId,
      });
      if (promoResult.valid) {
        enrichedMeta.discountCents = String(promoResult.discountCents);
        enrichedMeta.promoCodeId = promoResult.promoCodeId;
      }
    }

    const platformCutleryEnabled = await isCustomerCutleryPlatformEnabled();
    const wantsCutleryInput = parseWantsCutlery(enrichedMeta.wantsCutlery);
    assertCutleryRequestAllowed(wantsCutleryInput, shopVendorSettings, platformCutleryEnabled);
    const { requested: resolvedCutleryRequested, feeCents: resolvedCutleryFeeCents } =
      resolveCutleryFromSettings({
        platformEnabled: platformCutleryEnabled,
        vendorSettings: shopVendorSettings,
        wantsCutlery: wantsCutleryInput,
      });
    enrichedMeta.wantsCutlery = resolvedCutleryRequested ? '1' : '0';

    const subMeta = enrichedMeta.subtotalCents;
    if (enrichedMeta.shopId && subMeta !== undefined && subMeta !== null && String(subMeta).trim() !== '') {
      const subtotalCheck = parseInt(String(subMeta), 10);
      const deliveryCheck = parseInt(enrichedMeta.deliveryFeeCents || '0', 10);
      const disc = promoResult?.valid ? promoResult.discountCents : 0;
      const effDel = promoResult?.valid && promoResult.freeDelivery ? 0 : deliveryCheck;
      const expectedPay = Math.max(subtotalCheck - disc + effDel + resolvedCutleryFeeCents, 0);
      if (expectedPay !== amountCents) {
        const err = new Error('Payment amount does not match order total.');
        err.statusCode = 400;
        throw err;
      }
      // `amountCents` is already the final payable total in this validated path.
      finalAmount = expectedPay;
    } else if (promoResult?.valid) {
      // Backward compatibility for callers that do not provide subtotal metadata.
      finalAmount = Math.max(amountCents - promoResult.discountCents, 0);
    }

    if (enrichedMeta.shopId && enrichedMeta.items) {
      let parsedItems;
      try {
        parsedItems =
          typeof enrichedMeta.items === 'string'
            ? JSON.parse(enrichedMeta.items)
            : enrichedMeta.items;
      } catch {
        throw createError('Invalid cart items payload', 400);
      }
      if (!Array.isArray(parsedItems)) {
        throw createError('Invalid cart items payload', 400);
      }
      await assertOrderItemsPricedForShop({
        shopId: enrichedMeta.shopId,
        projectRef: resolvedProjectRef,
        items: parsedItems,
      });
    }

    const chargeAmount = Math.max(finalAmount, 50);
    const result = await createPaymentIntent(chargeAmount, effectiveCurrency, enrichedMeta);

    if (result.isDummy) {
      const { projectRef, customerId, shopId, items, scheduledFor, address, notes, deliveryFeeCents } =
        enrichedMeta;
      const parsedDemoItems = items ? JSON.parse(items) : [];
      if (shopId && parsedDemoItems.length) {
        await assertOrderItemsPricedForShop({
          shopId,
          projectRef,
          items: parsedDemoItems,
        });
      }
      const order = await orderModel.createWithItems({
        projectRef,
        shopId: shopId || null,
        customerId: customerId || null,
        items: parsedDemoItems,
        totalCents: amountCents,
        paymentIntentId: result.paymentIntentId,
        scheduledFor: scheduledFor || null,
        address: address || null,
        notes: notes || null,
        currency: effectiveCurrency,
        discountCents: promoResult?.valid ? promoResult.discountCents : 0,
        promoCodeId: promoResult?.valid ? promoResult.promoCodeId : null,
        deliveryFeeCents: deliveryFeeCents ? parseInt(deliveryFeeCents, 10) : 0,
        cutleryRequested: resolvedCutleryRequested,
        cutleryFeeCents: resolvedCutleryFeeCents,
      });

      wsServer.fanOrderToWorkspaceAndMarketplaceCustomer(projectRef, customerId || null, {
        type: 'order:status_changed',
        orderId: order.id,
        status: order.status,
        previousStatus: null,
        updatedAt: order.created_at,
      });

      notificationService.notifyOrderConfirmation(order).catch((err) =>
        logger.error('Order confirmation notification failed', { orderId: order.id, error: err.message })
      );
      if (order.status === 'placed') {
        notificationService.notifyShopStaffNewOrder(order).catch((err) =>
          logger.error('Vendor new-order notification failed', { orderId: order.id, error: err.message })
        );
      }

      await writeAuditLog({
        action: 'payment.demo_bypass',
        resourceType: 'order',
        resourceId: order.id,
        details: { paymentIntentId: result.paymentIntentId },
        organizationId: await resolveAuditOrgId({ order, projectRef }),
      });

      logger.info('Demo bypass: order created without Stripe', { orderId: order.id });
      result.orderId = order.id;
    }

    if (promoResult?.valid) {
      result.promoApplied = {
        discountCents: promoResult.discountCents,
        freeDelivery: promoResult.freeDelivery,
        message: promoResult.message,
      };
    }

    return res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * Stripe webhook handler.
 * MUST receive raw body — see app.js for rawBodyMiddleware applied to this route.
 * Order creation happens HERE and only here — never from the frontend.
 */
async function stripeWebhook(req, res, next) {
  let event = null;
  try {
    const sig = req.headers['stripe-signature'];

    try {
      event = constructWebhookEvent(req.rawBody, sig);
    } catch (err) {
      logger.warn('Stripe webhook signature verification failed', { error: err.message });
      return res.status(400).json({ error: 'Webhook signature verification failed' });
    }

    // Idempotency: Stripe may retry events; ensure we only process once.
    const webhookOrgId = await organizationIdFromStripeEvent(event);
    const isNew = await stripeEventModel.recordOnce({
      eventId: event.id,
      type: event.type,
      organizationId: webhookOrgId,
    });
    if (!isNew) {
      logger.info('Stripe webhook duplicate ignored', { type: event.type, eventId: event.id });
      return res.json({ received: true, duplicate: true });
    }

    logger.info('Stripe webhook received', { type: event.type, eventId: event.id });

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const intent = event.data.object;
        const meta = intent.metadata || {};
        const auditOrgId =
          webhookOrgId || (meta.projectRef ? await organizationIdByProjectRef(String(meta.projectRef)) : null);

        if (meta.purpose === 'wallet_topup' && meta.customerId) {
          const amount = Number(intent.amount_received ?? intent.amount ?? 0);
          if (amount > 0) {
            await walletService
              .applyWalletDelta({
                customerId: meta.customerId,
                amountCents: Math.round(amount),
                type: 'topup_stripe',
                idempotencyKey: `topup:${intent.id}`,
                projectRef: meta.projectRef || null,
                referenceType: 'payment_intent',
                referenceId: null,
                metadata: { stripePaymentIntentId: intent.id },
              })
              .catch((err) => {
                logger.error('Wallet top-up credit failed', { intentId: intent.id, error: err.message });
                throw err;
              });
          }
          break;
        }

        if (meta.checkoutBatchId) {
          const batch = await checkoutBatchService.takeCheckoutBatch(meta.checkoutBatchId);
          if (!batch) {
            logger.error('Stripe webhook: checkout batch missing or expired', { intentId: intent.id });
            const err = new Error(`Stripe webhook: checkout batch missing or expired (batchId: ${meta.checkoutBatchId}, intentId: ${intent.id})`);
            sentry.captureWebhookFailure(err, {
              eventId: event.id,
              eventType: event.type,
              organizationId: webhookOrgId,
            });
            throw err;
          }
          const resolvedWebhookCurrency =
            validCurrency(meta.currency) || validCurrency(intent.currency) || (await getPlatformCurrency());
          const orders = await checkoutBatchDebitWalletAndFulfill({
            batch,
            paymentIntentId: intent.id,
            currency: resolvedWebhookCurrency,
            walletAmountCents: batch.walletAmountCents || 0,
            idempotencyBase: intent.id,
          });
          for (const order of orders) {
            await writeAuditLog({
              action: 'payment.succeeded',
              resourceType: 'order',
              resourceId: order.id,
              details: { paymentIntentId: intent.id, batch: true },
              organizationId: order.organization_id || auditOrgId,
            });
          }
          break;
        }

        const {
          projectRef, customerId, shopId, items,
          scheduledFor, address, notes, currency: metaCurrency,
          discountCents, promoCodeId, deliveryFeeCents,
        } = meta;

        if (!projectRef) {
          logger.warn('Stripe webhook: missing projectRef in metadata', { intentId: intent.id });
          break;
        }

        const resolvedWebhookCurrency =
          validCurrency(metaCurrency) || validCurrency(intent.currency) || (await getPlatformCurrency());

        const { requested: whCutleryReq, feeCents: whCutleryFee } = await resolveCutleryForShop(
          shopId || null,
          parseWantsCutlery(meta.wantsCutlery),
        );

        const parsedWhItems = items ? JSON.parse(items) : [];
        if (shopId && parsedWhItems.length) {
          await assertOrderItemsPricedForShop({
            shopId,
            projectRef,
            items: parsedWhItems,
          });
        }
        const order = await orderModel.createWithItems({
          projectRef,
          shopId: shopId || null,
          customerId: customerId || null,
          items: parsedWhItems,
          totalCents: Number(intent.amount),
          paymentIntentId: intent.id,
          scheduledFor: scheduledFor || null,
          address: address || null,
          notes: notes || null,
          currency: resolvedWebhookCurrency,
          discountCents: discountCents ? parseInt(discountCents, 10) : 0,
          promoCodeId: promoCodeId || null,
          deliveryFeeCents: deliveryFeeCents ? parseInt(deliveryFeeCents, 10) : 0,
          cutleryRequested: whCutleryReq,
          cutleryFeeCents: whCutleryFee,
        });

        wsServer.fanOrderToWorkspaceAndMarketplaceCustomer(projectRef, customerId || null, {
          type: 'order:status_changed',
          orderId: order.id,
          status: order.status,
          previousStatus: null,
          updatedAt: order.created_at,
        });

        notificationService.notifyOrderConfirmation(order).catch((err) =>
          logger.error('Order confirmation notification failed', { orderId: order.id, error: err.message })
        );
        if (order.status === 'placed') {
          notificationService.notifyShopStaffNewOrder(order).catch((err) =>
            logger.error('Vendor new-order notification failed', { orderId: order.id, error: err.message })
          );
        }

        await writeAuditLog({
          action: 'payment.succeeded',
          resourceType: 'order',
          resourceId: order.id,
          details: { paymentIntentId: intent.id },
          organizationId: await resolveAuditOrgId({ order, projectRef }),
        });

        await processVendorPayoutsAfterPayment({
          paymentIntentId: intent.id,
          currency: resolvedWebhookCurrency,
        }).catch((err) => {
          logger.error('Vendor payout processing failed', { intentId: intent.id, error: err.message });
          sentry.captureException(err, {
            tags: { kind: 'vendor_payout', intentId: intent.id },
            context: { paymentIntentId: intent.id },
          });
        });
        break;
      }

      case 'payment_intent.payment_failed': {
        const intent = event.data.object;
        logger.warn('Payment failed', { intentId: intent.id });
        // Phase 03: mirror the terminal failure onto the payment-operations
        // ledger (new table, no existing behavior changes). Best-effort only —
        // the ledger helper never throws, so webhook ack semantics are kept.
        await updatePaymentOperation({
          providerPaymentId: intent.id,
          status: 'failed',
          rawStatus: intent.status ? String(intent.status) : 'failed',
          webhookEventId: event.id,
        });
        break;
      }

      case 'payment_intent.canceled': {
        // Phase 03: a canceled intent can never produce an order (fulfillment
        // only runs on payment_intent.succeeded), so the only safe mutation is
        // the payment-operations ledger row. Expired-checkout cleanup is owned
        // by jobs/checkout-batch-cleanup.job.js, not by this handler.
        const intent = event.data.object;
        logger.warn('Payment canceled', {
          intentId: intent.id,
          organizationId: webhookOrgId || null,
        });
        await updatePaymentOperation({
          providerPaymentId: intent.id,
          status: 'cancelled',
          rawStatus: intent.status ? String(intent.status) : 'canceled',
          webhookEventId: event.id,
        });
        break;
      }

      case 'charge.refunded': {
        const charge = event.data.object;
        logger.info('Charge refunded', { chargeId: charge.id });
        // Phase 03: mirror onto the ledger when the charge carries its
        // PaymentIntent id. Canonical order-refund state is still owned by
        // executeOrderRefund (services/order-refund.service.js) — this handler
        // never touches orders, it only records the provider truth.
        if (typeof charge.payment_intent === 'string' && charge.payment_intent) {
          await updatePaymentOperation({
            providerPaymentId: charge.payment_intent,
            status: 'refunded',
            rawStatus: 'refunded',
            webhookEventId: event.id,
          });
        }
        break;
      }

      case 'charge.dispute.created':
      case 'charge.dispute.updated':
      case 'charge.dispute.closed':
      case 'charge.dispute.funds_withdrawn':
      case 'charge.dispute.funds_reinstated': {
        // Phase 03: disputes apply to card payments (Dilivygo takes cards via
        // Stripe), so they are product-applicable. Handling is observe-only:
        // structured log with correlation ids for operator review. Dispute
        // resolution / representment workflow is an explicit follow-up (no
        // order or ledger state is mutated here).
        const dispute = event.data.object || {};
        logger.warn('Stripe dispute event — operator review required', {
          eventType: event.type,
          eventId: event.id,
          disputeId: dispute.id || null,
          chargeId: typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id || null,
          paymentIntentId: typeof dispute.payment_intent === 'string' ? dispute.payment_intent : null,
          amountCents: Number.isFinite(Number(dispute.amount)) ? Number(dispute.amount) : null,
          currency: dispute.currency ? String(dispute.currency) : null,
          reason: dispute.reason ? String(dispute.reason) : null,
          status: dispute.status ? String(dispute.status) : null,
          organizationId: webhookOrgId || null,
        });
        break;
      }

      case 'checkout.session.expired': {
        // Phase 03: an expired Checkout Session means the customer abandoned
        // the flow before paying. Order checkouts use PaymentIntents directly
        // (never Checkout Sessions), so only SaaS Billing sessions can land
        // here — and an abandoned billing session creates no subscription, so
        // no state change is needed. Logged for funnel visibility.
        const session = event.data.object || {};
        logger.info('Checkout session expired (abandoned, no state change)', {
          sessionId: session.id || null,
          mode: session.mode ? String(session.mode) : null,
          organizationId: webhookOrgId || null,
        });
        break;
      }

      case 'invoice.payment_succeeded':
      case 'invoice.payment_failed': {
        // Phase 03 (billing lifecycle gap, observe-only): subscription renewals
        // emit invoice events, but processBillingStripeEvent
        // (services/workspace-billing.service.js — outside Phase 03 touch
        // scope) only syncs subscription/Checkout-Session events. Until that
        // service handles invoice events, a past-due renewal may leave the
        // org's billing status stale; the warn line below is the alert for
        // that follow-up. No state is mutated here.
        const invoice = event.data.object || {};
        logger[event.type === 'invoice.payment_failed' ? 'warn' : 'info'](
          'Billing invoice event (no local sync yet — see workspace-billing follow-up)',
          {
            eventType: event.type,
            eventId: event.id,
            invoiceId: invoice.id || null,
            customerId: typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id || null,
            subscriptionId: typeof invoice.subscription === 'string'
              ? invoice.subscription
              : invoice.subscription?.id || null,
            amountDueCents: Number.isFinite(Number(invoice.amount_due)) ? Number(invoice.amount_due) : null,
            currency: invoice.currency ? String(invoice.currency) : null,
            organizationId: webhookOrgId || null,
          },
        );
        break;
      }

      case 'account.updated': {
        const acct = event.data.object;
        const workspaceId = acct.metadata?.workspace_id;
        if (workspaceId) {
          await refreshWorkspaceConnectFromStripe(String(workspaceId), acct.id).catch((err) =>
            logger.warn('account.updated workspace refresh failed', { error: err.message }),
          );
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
      case 'checkout.session.completed': {
        // Billing-vs-order separation (Phase 03): these four event types are
        // SaaS Billing ONLY. Customer order checkouts create PaymentIntents
        // directly (createIntent above) and never create Checkout Sessions, so
        // a subscription-mode guard plus this routing keeps order money and
        // workspace-subscription state in disjoint paths even though both ride
        // the single Stripe webhook endpoint. Order fulfillment listens solely
        // to payment_intent.* / charge.* events above. Deliberately NOT
        // refactored further: moving billing onto its own endpoint/secret is a
        // follow-up (requires Stripe dashboard webhook changes), tracked as a
        // Phase 03 follow-up, not done here.
        await processBillingStripeEvent(event);
        break;
      }

      default:
        logger.debug('Stripe webhook: unhandled event type', { type: event.type });
    }

    return res.json({ received: true });
  } catch (err) {
    // Stripe retries on 5xx, so we surface every webhook failure to Sentry
    // so on-call sees the alert immediately. The global error handler still
    // emits the right status code via `next(err)`.
    sentry.captureWebhookFailure(err, {
      eventId: event?.id,
      eventType: event?.type,
    });
    next(err);
  }
}

module.exports = { createIntent, stripeWebhook };
