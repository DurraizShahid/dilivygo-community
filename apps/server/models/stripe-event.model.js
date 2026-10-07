'use strict';

const { select, insert, SupabaseError } = require('../lib/supabase');
const { acquireLock, releaseLock } = require('../lib/lock');
const { getStripeWebhookContext } = require('../lib/stripe-webhook-context');

const EVENT_LOCK_TTL_MS = 5 * 60 * 1000;

class StripeEventModel {
  async isProcessed(eventId) {
    const rows = await select('stripe_events', {
      filters: { event_id: eventId },
      limit: 1,
    });
    return Boolean(rows?.length);
  }

  /**
   * Compatibility method used by payment.controller.js.
   *
   * Historically this inserted the durable event row BEFORE processing, which
   * caused failed webhooks to be discarded forever on Stripe retry. It now:
   *   1) returns false if the event has already completed,
   *   2) acquires a distributed per-event processing lock,
   *   3) records request-local metadata only.
   * The durable row is inserted by commitCurrentEvent() immediately before the
   * successful HTTP response is sent.
   */
  async recordOnce({ eventId, type, organizationId = null }) {
    if (await this.isProcessed(eventId)) return false;

    const lock = await acquireLock(`lock:stripe:event:${eventId}`, EVENT_LOCK_TTL_MS);
    if (!lock) return false;

    if (await this.isProcessed(eventId)) {
      await releaseLock(lock);
      return false;
    }

    const context = getStripeWebhookContext();
    if (!context) {
      await releaseLock(lock);
      throw new Error('Stripe webhook processing context is not initialized');
    }

    context.event = { eventId, type, organizationId };
    context.lock = lock;
    context.finalized = false;
    return true;
  }

  async commitCurrentEvent() {
    const context = getStripeWebhookContext();
    if (!context?.event || context.finalized) return;

    const { eventId, type, organizationId } = context.event;
    const row = {
      event_id: eventId,
      type,
      processed_at: new Date().toISOString(),
    };
    if (organizationId) row.organization_id = organizationId;

    try {
      await insert('stripe_events', [row]);
      context.finalized = true;
    } catch (err) {
      if (
        err instanceof SupabaseError &&
        (err.status === 409 || err.status === 406 || err.statusCode === 409 || err.statusCode === 406)
      ) {
        context.finalized = true;
      } else {
        throw err;
      }
    } finally {
      if (context.lock) {
        await releaseLock(context.lock);
        context.lock = null;
      }
    }
  }

  async releaseCurrentClaim() {
    const context = getStripeWebhookContext();
    if (!context?.lock) return;
    const lock = context.lock;
    context.lock = null;
    await releaseLock(lock);
  }
}

module.exports = new StripeEventModel();
