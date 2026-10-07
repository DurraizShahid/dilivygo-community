'use strict';

/**
 * Centralised Sentry wiring for the backend.
 *
 * Init contract (must be called BEFORE express / supabase / anything else):
 *   require('./lib/sentry').init();
 *
 * @sentry/node v8 auto-instruments express via OpenTelemetry, so the request
 * handler does not need to be registered manually — only the express error
 * handler does (`Sentry.setupExpressErrorHandler(app)` from `app.js`).
 *
 * What we tag on every event:
 *   • `tags.organization_id`     — caller's SaaS org (when known)
 *   • `tags.project_ref`         — workspace
 *   • `tags.shop_id`             — when route is shop-scoped
 *   • `tags.user.id` / role      — admin / customer / superadmin / saas
 *   • `tags.surface`             — vendor | rider | customer | superadmin | saas | api
 *
 * We do NOT send PII (email / phone / addresses). The error handler that
 * lives in `middleware/error.middleware.js` already strips them; this file
 * mirrors that policy.
 */

const config = require('../config');
const logger = require('./logger');

let _initialized = false;
let _sentry = null;

function getSentry() {
  if (_sentry) return _sentry;
  // Lazy-load — do not require @sentry/node when DSN isn't configured so
  // tests / dev environments don't pay the OpenTelemetry import cost.
  // eslint-disable-next-line global-require
  _sentry = require('@sentry/node');
  return _sentry;
}

function isEnabled() {
  return Boolean(config.sentry?.enabled && config.sentry?.dsn);
}

/**
 * Initialise Sentry. Safe to call from `index.js` early.
 * Returns `true` when initialised, `false` when DSN is not configured.
 */
function init() {
  if (_initialized) return true;
  if (!isEnabled()) return false;

  const Sentry = getSentry();

  Sentry.init({
    dsn: config.sentry.dsn,
    environment: config.env,
    release: process.env.GIT_SHA || process.env.RAILWAY_GIT_COMMIT_SHA || undefined,
    // Drop high-volume noise:
    ignoreErrors: [
      // Customers hit /api/health constantly; if it errors we'll see logs.
      /Route GET \/api\/health/i,
      // CSRF token problems are user-facing, not an alertable bug.
      /CSRF token (missing|mismatch)/i,
      // CORS rejections are a policy decision raised by our own middleware
      // for non-allowlisted origins — logging every probe as an unhandled
      // error hides real bugs. The CORS middleware already logs the origin.
      /^CORS policy: origin /i,
      // Supabase/egress blips. `supabaseFetch` already unwraps undici's
      // `fetch failed` into a retryable 503 and logs the real cause
      // (ECONNREFUSED etc.) at warn level — a dev laptop booting the local
      // stack or a Railway egress flap would otherwise page us as an
      // unhandled exception on every in-flight request.
      /Database temporarily unavailable/i,
    ],
    tracesSampleRate: config.isProd ? 0.05 : 0,
    // No profiles by default; can be enabled later via SENTRY_PROFILES_RATE.
    profilesSampleRate: 0,
    // Strip request bodies (potentially PII) before sending.
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.request) {
        delete event.request.cookies;
        delete event.request.data;
      }
      if (event.user) {
        delete event.user.email;
        delete event.user.username;
        delete event.user.ip_address;
      }
      return event;
    },
  });

  _initialized = true;
  logger.info('Sentry initialised', { env: config.env, release: process.env.GIT_SHA || null });
  return true;
}

/**
 * Express middleware: tag the active scope with org / user / surface based on
 * what the auth + project-ref middleware have attached to `req`.
 *
 * Mount AFTER `parseSession` and `attachProjectRef` so we have something to
 * tag with.
 */
function scopeTaggingMiddleware(req, _res, next) {
  if (!_initialized) return next();
  const Sentry = getSentry();

  const orgId =
    req.saasOrganizationId ||
    req.organization?.id ||
    req.session?.organizationId ||
    null;
  const projectRef = req.projectRef || req.session?.projectRef || null;
  const shopId = req.shopId || null;

  // Determine actor type (cheapest first).
  let userId = null;
  let role = null;
  let surface = null;
  if (req.superadmin?.id) {
    userId = req.superadmin.id;
    role = 'superadmin';
    surface = 'superadmin';
  } else if (req.session?.id) {
    userId = req.session.id;
    role = req.session.role || req.session.type || 'admin';
    if (role === 'customer') surface = 'customer';
    else if (role === 'rider') surface = 'rider';
    else surface = 'vendor';
  } else if (req.clerkUserId) {
    userId = req.clerkUserId;
    role = 'saas';
    surface = 'saas';
  }

  Sentry.getCurrentScope().setTags({
    organization_id: orgId,
    project_ref: projectRef,
    shop_id: shopId,
    role,
    surface,
    request_id: req.id || null,
  });
  if (userId) {
    Sentry.setUser({ id: String(userId) });
  }
  next();
}

/**
 * Capture an exception with optional tags. Use this from background jobs,
 * websocket handlers, and webhook handlers — express auto-instrumentation
 * only catches exceptions that bubble up to the express error chain.
 *
 *   Sentry.captureException(err, { tags: { job: 'auto-dispatch' } });
 */
function captureException(err, opts = {}) {
  if (!_initialized) return;
  const Sentry = getSentry();
  Sentry.withScope((scope) => {
    if (opts.tags) scope.setTags(opts.tags);
    if (opts.context) {
      for (const [k, v] of Object.entries(opts.context)) scope.setContext(k, v);
    }
    if (opts.organizationId) scope.setTag('organization_id', opts.organizationId);
    if (opts.projectRef) scope.setTag('project_ref', opts.projectRef);
    Sentry.captureException(err);
  });
}

/**
 * Capture a Stripe webhook handling failure. These are high-priority because
 * a silent 500 there means orders aren't created / wallets aren't credited.
 */
function captureWebhookFailure(err, { eventId, eventType, organizationId } = {}) {
  if (!_initialized) return;
  captureException(err, {
    tags: {
      kind: 'stripe_webhook',
      stripe_event_type: eventType || 'unknown',
    },
    organizationId,
    context: {
      stripe: { eventId, eventType },
    },
  });
}

/** Drain pending events before process exit. */
async function flush(timeoutMs = 2000) {
  if (!_initialized) return true;
  try {
    return await getSentry().flush(timeoutMs);
  } catch {
    return false;
  }
}

/**
 * Wrap a background job runner so unhandled exceptions are captured with
 * `tags.job = <name>`. Cron jobs already log+swallow errors, but the logs
 * disappear into Railway — Sentry gives us alerts.
 */
function wrapJob(name, runner) {
  return async function wrappedJob(...args) {
    try {
      return await runner(...args);
    } catch (err) {
      captureException(err, { tags: { kind: 'job', job: name } });
      throw err;
    }
  };
}

/**
 * Attach the v8 express error handler. Call once from `app.js` AFTER all
 * routes and BEFORE the global error middleware.
 */
function setupExpressErrorHandler(app) {
  if (!_initialized) return;
  const Sentry = getSentry();
  if (typeof Sentry.setupExpressErrorHandler === 'function') {
    Sentry.setupExpressErrorHandler(app);
  } else if (Sentry.Handlers?.errorHandler) {
    // Fallback for older versions installed by accident.
    app.use(Sentry.Handlers.errorHandler());
  }
}

module.exports = {
  init,
  isEnabled,
  scopeTaggingMiddleware,
  captureException,
  captureWebhookFailure,
  flush,
  wrapJob,
  setupExpressErrorHandler,
};
