'use strict';

/**
 * Payment reconciliation job (Phase 03: Stripe reference integration).
 *
 * Conservative by design. Compares authoritative internal unsettled/recent
 * payment records against Stripe (`queryPayment` from the canonical payment
 * capability, services/payment-provider.js) and:
 *
 *   - auto-repairs ONLY the provably-safe cases:
 *       internal (pending|requires_action) + Stripe canceled -> mark cancelled
 *       internal (pending|requires_action) + Stripe failed   -> mark failed
 *     (terminal Stripe states with no funds moved; no order can ever be
 *     fulfilled from them because fulfillment only runs on
 *     payment_intent.succeeded);
 *   - flags EVERYTHING else via structured logger.warn with correlation ids
 *     (organization / order reference / provider payment id / idempotency key)
 *     for operator review — never silently mutates orders, wallet ledger,
 *     transfers, or subscriptions.
 *
 * Sources:
 *   1. `payment_operations` rows (migration 113) stuck in
 *      (pending|requires_action) past OPERATIONS_TTL_MS.
 *   2. Recent `orders` rows with payment_status='paid' on real Stripe intents
 *      (`pi_*`, excluding `wallet_*` / `pi_dummy_*` synthetics) — detects the
 *      paid-without-Stripe-truth anomaly (flag only, orders are never touched).
 *
 * Expired pre-payment checkout handoffs are owned by
 * jobs/checkout-batch-cleanup.job.js, not here. Billing/subscription state is
 * owned by services/workspace-billing.service.js, not here.
 *
 * Missing-table tolerance: migration 113 may not be applied yet (runner needs
 * DB credentials). A failed ledger read degrades the run to a warn + skip —
 * it never throws, so the job cannot crash the boot loop pre-migration.
 */

const cron = require('node-cron');
const logger = require('../lib/logger');
const { acquireLock, releaseLock } = require('../lib/lock');
const { select, update } = require('../lib/supabase');
const paymentProvider = require('../services/payment-provider');

const UNSETTLED_STATUSES = ['pending', 'requires_action'];
const OPERATIONS_TTL_MS = 60 * 60 * 1000; // stale pending older than 1h
const RECENT_ORDER_WINDOW_MS = 24 * 60 * 60 * 1000; // paid orders from last 24h
const MAX_CHECKS_PER_RUN = 50; // bound Stripe API calls per run

function isSyntheticPaymentId(providerPaymentId) {
  const id = String(providerPaymentId || '');
  return id.startsWith('wallet_') || id.startsWith('pi_dummy_');
}

/**
 * Provably-safe repairs only. Returns the ledger status to write, or null
 * when the discrepancy must be flagged for human review instead.
 */
function safeRepairFor(internalStatus, stripeStatus) {
  if (!UNSETTLED_STATUSES.includes(String(internalStatus))) return null;
  if (stripeStatus === 'cancelled') return 'cancelled';
  if (stripeStatus === 'failed') return 'failed';
  return null;
}

function opCorrelation(row) {
  return {
    operationId: row?.id || null,
    organizationId: row?.organization_id || null,
    orderReference: row?.dilivygo_reference || (row?.order_id ? String(row.order_id) : null),
    providerPaymentId: row?.provider_payment_id || null,
    idempotencyKey: row?.idempotency_key || null,
  };
}

async function reconcileOperationRow(row) {
  const providerPaymentId = row?.provider_payment_id ? String(row.provider_payment_id) : null;
  if (!providerPaymentId || isSyntheticPaymentId(providerPaymentId)) {
    return 'skipped_synthetic';
  }
  const internalStatus = String(row?.status || 'unknown');

  let stripeState;
  try {
    stripeState = await paymentProvider.queryPayment({
      organizationId: row?.organization_id || null,
      providerPaymentId,
    });
  } catch (err) {
    if (err && (err.code === 'PAYMENT_PROVIDER_UNAVAILABLE' || err.code === 'STRIPE_NOT_CONFIGURED')) {
      return 'skipped_provider_unavailable';
    }
    logger.warn('payment-reconciliation: provider query failed (flagged, no repair)', {
      ...opCorrelation(row),
      internalStatus,
      error: err && err.message ? err.message : String(err),
    });
    return 'flagged_query_failed';
  }

  const stripeStatus = stripeState?.status || 'unknown';
  const repair = safeRepairFor(internalStatus, stripeStatus);
  if (repair) {
    await update('payment_operations', {
      status: repair,
      raw_status: stripeState?.raw?.status ? String(stripeState.raw.status) : stripeStatus,
      updated_at: new Date().toISOString(),
    }, { id: row.id });
    logger.info('payment-reconciliation: safe repair applied (terminal Stripe state, no funds moved)', {
      ...opCorrelation(row),
      internalStatus,
      stripeStatus,
      repairedTo: repair,
    });
    return 'repaired';
  }

  if (stripeStatus === 'succeeded' && UNSETTLED_STATUSES.includes(internalStatus)) {
    // Stripe reports funds captured but our ledger never settled. Fulfillment
    // is webhook-owned, so this job must NOT create orders — flag for review
    // (likely a lost/delayed payment_intent.succeeded delivery).
    logger.warn('payment-reconciliation: Stripe succeeded but internal ledger unsettled (flagged, no repair)', {
      ...opCorrelation(row),
      internalStatus,
      stripeStatus,
    });
    return 'flagged_succeeded_unsettled';
  }

  if (stripeStatus === 'unknown') {
    logger.warn('payment-reconciliation: unrecognized provider state (flagged, no repair)', {
      ...opCorrelation(row),
      internalStatus,
      stripeStatus,
    });
    return 'flagged_unknown';
  }

  return 'ok';
}

async function reconcileStaleOperations(budget) {
  const cutoff = new Date(Date.now() - OPERATIONS_TTL_MS).toISOString();
  let rows = null;
  try {
    rows = await select('payment_operations', {
      select: 'id,organization_id,order_id,dilivygo_reference,purpose,provider,provider_payment_id,idempotency_key,status,raw_status,webhook_event_id,amount_cents,currency,created_at',
      filters: { status: UNSETTLED_STATUSES },
      rawFilters: [`created_at=lt.${cutoff}`],
      order: 'created_at.asc',
      limit: Math.min(budget, MAX_CHECKS_PER_RUN),
    });
  } catch (err) {
    // Migration 113 not applied yet (or ledger unreachable): degrade, don't crash.
    logger.warn('payment-reconciliation: payment_operations unreadable, skipping operation scan', {
      error: err && err.message ? err.message : String(err),
    });
    return { outcomes: { skipped_ledger_unreadable: 0 }, checked: 0, degraded: true };
  }

  const outcomes = {};
  let checked = 0;
  for (const row of rows || []) {
    if (checked >= budget) break;
    checked += 1;
    try {
      const outcome = await reconcileOperationRow(row);
      outcomes[outcome] = (outcomes[outcome] || 0) + 1;
    } catch (err) {
      outcomes.failed = (outcomes.failed || 0) + 1;
      logger.error('payment-reconciliation: operation row failed', {
        ...opCorrelation(row),
        error: err && err.message ? err.message : String(err),
      });
    }
  }
  return { outcomes, checked, degraded: false };
}

async function reconcileRecentPaidOrders(budget) {
  if (budget <= 0) return { outcomes: {}, checked: 0 };
  let rows = null;
  try {
    rows = await select('orders', {
      select: 'id,organization_id,project_ref,total_cents,currency,payment_intent_id,payment_status,created_at',
      filters: { payment_status: 'paid' },
      order: 'created_at.desc',
      limit: Math.min(budget, MAX_CHECKS_PER_RUN),
    });
  } catch (err) {
    logger.warn('payment-reconciliation: orders unreadable, skipping paid-order scan', {
      error: err && err.message ? err.message : String(err),
    });
    return { outcomes: { skipped_orders_unreadable: 0 }, checked: 0 };
  }

  const windowStart = Date.now() - RECENT_ORDER_WINDOW_MS;
  const outcomes = {};
  let checked = 0;
  for (const order of rows || []) {
    if (checked >= budget) break;
    if (!order?.created_at || new Date(order.created_at).getTime() < windowStart) continue;
    const pid = order?.payment_intent_id ? String(order.payment_intent_id) : null;
    if (!pid || isSyntheticPaymentId(pid) || !pid.startsWith('pi_')) continue;
    checked += 1;
    try {
      const stripeState = await paymentProvider.queryPayment({
        organizationId: order?.organization_id || null,
        providerPaymentId: pid,
      });
      const stripeStatus = stripeState?.status || 'unknown';
      if (stripeStatus === 'cancelled' || stripeStatus === 'failed') {
        // Order claims paid but Stripe reports a terminal-unpaid intent.
        // NEVER auto-repair orders here (refund/recovery flows own order
        // state) — flag for operator review with full correlation.
        logger.warn('payment-reconciliation: order marked paid but Stripe terminal-unpaid (flagged, no repair)', {
          orderId: order.id,
          organizationId: order.organization_id || null,
          projectRef: order.project_ref || null,
          providerPaymentId: pid,
          totalCents: order.total_cents ?? null,
          currency: order.currency || null,
          stripeStatus,
        });
        outcomes.flagged_paid_terminal_unpaid = (outcomes.flagged_paid_terminal_unpaid || 0) + 1;
      } else {
        outcomes.ok = (outcomes.ok || 0) + 1;
      }
    } catch (err) {
      if (err && (err.code === 'PAYMENT_PROVIDER_UNAVAILABLE' || err.code === 'STRIPE_NOT_CONFIGURED')) {
        outcomes.skipped_provider_unavailable = (outcomes.skipped_provider_unavailable || 0) + 1;
      } else {
        logger.warn('payment-reconciliation: paid-order query failed (flagged, no repair)', {
          orderId: order?.id || null,
          providerPaymentId: pid,
          error: err && err.message ? err.message : String(err),
        });
        outcomes.flagged_query_failed = (outcomes.flagged_query_failed || 0) + 1;
      }
    }
  }
  return { outcomes, checked };
}

async function runOnce({ skipLock = false } = {}) {
  const lock = skipLock
    ? { acquired: true }
    : await acquireLock('lock:job:payment-reconciliation', 5 * 60_000);
  if (!lock) return { skipped: true };

  try {
    const ops = await reconcileStaleOperations(MAX_CHECKS_PER_RUN);
    const remaining = Math.max(0, MAX_CHECKS_PER_RUN - (ops.checked || 0));
    const orders = await reconcileRecentPaidOrders(remaining);
    const outcomes = { ...ops.outcomes };
    for (const [key, count] of Object.entries(orders.outcomes || {})) {
      outcomes[key] = (outcomes[key] || 0) + count;
    }
    const summary = {
      operationsChecked: ops.checked || 0,
      ordersChecked: orders.checked || 0,
      outcomes,
      degraded: Boolean(ops.degraded),
    };
    logger.info('payment-reconciliation complete', summary);
    return summary;
  } catch (err) {
    logger.error('payment-reconciliation job failed', { error: err.message });
    throw err;
  } finally {
    if (!skipLock) await releaseLock(lock);
  }
}

const schedule = { pattern: '*/15 * * * *', tz: 'UTC' };

function start() {
  const task = cron.schedule(schedule.pattern, () => runOnce().catch(() => {}), { timezone: schedule.tz });
  logger.info('Background job started: payment-reconciliation (every 15 minutes)');
  return task;
}

module.exports = {
  start,
  runOnce,
  reconcileOperationRow,
  reconcileStaleOperations,
  reconcileRecentPaidOrders,
  safeRepairFor,
  schedule,
  name: 'payment-reconciliation',
};
