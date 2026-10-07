'use strict';

const platformSettings = require('../models/platform-settings.model');
const walletService = require('../services/wallet.service');
const { createPaymentIntent } = require('../services/stripe.service');
const { getPlatformCurrency, validCurrency } = require('../lib/currency');
const { createError } = require('../middleware/error.middleware');

function resolveWalletScopeOptions(req) {
  // Prefer organization scope when available (multi-tenant marketplace customers
  // don't have a project_ref); fall back to projectRef for legacy workspace
  // customers. Callers of platformSettings/getPlatformCurrency receive org context
  // so per-organization overrides (wallet flag, currency) apply correctly.
  const organizationId =
    req.organizationId
    || req.customer?.organizationId
    || req.customer?.organization_id
    || null;
  if (organizationId) return { organizationId: String(organizationId) };
  const ref = req?.customer?.projectRef ?? req?.customer?.project_ref ?? req?.projectRef;
  if (ref) return { projectRef: String(ref) };
  return undefined;
}

async function assertWalletEnabled(req) {
  const scope = resolveWalletScopeOptions(req);
  const v = await platformSettings.get('customer_wallet_enabled', scope);
  if (v !== 'true') {
    throw createError('Wallet is not enabled', 403);
  }
}

async function getWallet(req, res, next) {
  try {
    await assertWalletEnabled(req);
    const customerId = req.customer.id;
    const currency = await getPlatformCurrency(resolveWalletScopeOptions(req));
    const [balance, rows] = await Promise.all([
      walletService.getBalance(customerId),
      walletService.listLedger(customerId, { limit: 80, offset: 0 }),
    ]);
    const transactions = (rows || []).map(walletService.mapLedgerRow);
    return res.json({ balanceCents: balance, currency, transactions });
  } catch (err) {
    next(err);
  }
}

async function createTopupIntent(req, res, next) {
  try {
    await assertWalletEnabled(req);
    const amountCents = Math.floor(Number(req.body.amountCents));
    if (!Number.isFinite(amountCents) || amountCents < 50) {
      return next(createError('Minimum top-up is 50 minor units in your currency', 400));
    }

    const scope = resolveWalletScopeOptions(req);
    const currency = await getPlatformCurrency(scope);
    const requestedCurrency = validCurrency(req.body.currency);
    if (requestedCurrency && requestedCurrency !== currency) {
      const err = createError(
        `Currency changed to ${currency.toUpperCase()}. Refresh your wallet and try again.`,
        409,
      );
      err.code = 'CURRENCY_MISMATCH';
      err.details = {
        requestedCurrency: requestedCurrency.toUpperCase(),
        authoritativeCurrency: currency.toUpperCase(),
      };
      throw err;
    }

    const meta = {
      purpose: 'wallet_topup',
      customerId: String(req.customer.id),
      projectRef: req.projectRef || '',
      currency,
    };
    const chargeAmount = Math.max(amountCents, 50);
    const result = await createPaymentIntent(chargeAmount, currency, meta);
    if (result.isDummy) {
      await walletService.applyWalletDelta({
        customerId: req.customer.id,
        amountCents: chargeAmount,
        type: 'topup_stripe',
        idempotencyKey: `topup:${result.paymentIntentId}`,
        projectRef: req.projectRef,
        referenceType: 'payment_intent',
        referenceId: null,
        metadata: { dummy: true, currency },
      });
    }
    return res.json({ ...result, currency });
  } catch (err) {
    next(err);
  }
}

module.exports = { getWallet, createTopupIntent };