'use strict';

// Patch Express route Layer so async errors propagate to the error middleware
// (must load before `require('express')` and before any routes are registered).
require('express-async-errors');

const express = require('express');
const compression = require('compression');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');

const { csrfProtection } = require('./middleware/csrf.middleware');
const { requestId } = require('./middleware/request-id.middleware');

const config = require('./config');
const corsOptions = require('./config/cors');
const helmetOptions = require('./config/helmet');
const openApiSpec = require('./lib/openapi-spec');
const logger = require('./lib/logger');
const sentry = require('./lib/sentry');
const { stripeWebhookLifecycle } = require('./lib/stripe-webhook-context');
const routes = require('./routes');
const paymentController = require('./controllers/payment.controller');
const messagingWebhookRoutes = require('./routes/messaging-webhook.routes');
const messagingWebhookController = require('./controllers/messaging-webhook.controller');
const { notFound, errorHandler } = require('./middleware/error.middleware');

const app = express();

// ─── Trust Proxy ──────────────────────────────────────────────────────────────
// Required when behind Vercel/Railway/nginx to get real client IPs for rate limiting
if (config.trustProxyHops > 0) app.set('trust proxy', config.trustProxyHops);

// ─── Request ID ───────────────────────────────────────────────────────────────
app.use(requestId);

// ─── Response Compression ─────────────────────────────────────────────────────
app.use(compression());

// ─── Security Headers ─────────────────────────────────────────────────────────
app.use(helmet(helmetOptions));

// ─── CORS ─────────────────────────────────────────────────────────────────────
const publicCorsOptions = {
  ...corsOptions,
  origin: true,
};
app.use(
  cors((req, callback) => {
    if (req.path.startsWith('/api/public/')) {
      return callback(null, publicCorsOptions);
    }
    return callback(null, corsOptions);
  })
);
app.options(
  '*',
  cors((req, callback) => {
    if (req.path.startsWith('/api/public/')) {
      return callback(null, publicCorsOptions);
    }
    return callback(null, corsOptions);
  })
);

// ─── OpenAPI / Swagger UI ─────────────────────────────────────────────────────
if (config.enableApiDocs) {
  const swaggerUi = require('swagger-ui-express');
  app.get('/api/docs/openapi.json', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(openApiSpec);
  });
  app.use(
    '/api/docs',
    swaggerUi.serve,
    swaggerUi.setup(openApiSpec, {
      customSiteTitle: 'Dilivygo API',
      swaggerOptions: {
        docExpansion: 'list',
        filter: true,
        persistAuthorization: true,
        tryItOutEnabled: true,
        requestInterceptor: (request) => {
          request.headers = request.headers || {};
          const doc = globalThis && globalThis.document;
          if (doc && doc.cookie) {
            const parts = doc.cookie.split(';').map((c) => c.trim());
            const raw = parts.find((c) => c.startsWith('csrf_token='));
            if (raw) {
              const value = decodeURIComponent(raw.slice('csrf_token='.length));
              request.headers['X-CSRF-Token'] = value;
            }
          }
          return request;
        },
      },
    }),
  );
}

// ─── Request Logging ──────────────────────────────────────────────────────────
morgan.token('request-id', (req) => req.id || '-');
app.use(
  morgan(
    config.isProd
      ? ':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" :request-id'
      : ':method :url :status :response-time ms - :res[content-length] :request-id',
    {
      stream: { write: (msg) => logger.http(msg.trim()) },
      skip: (req) => req.path === '/api/health',
    }
  )
);

// ─── Signed webhooks: MUST precede JSON/urlencoded body parsers ───────────────
app.post(
  '/api/webhooks/stripe',
  express.raw({ type: 'application/json' }),
  (req, _res, next) => {
    req.rawBody = req.body;
    next();
  },
  stripeWebhookLifecycle,
  paymentController.stripeWebhook,
);

// Resend delivery/bounce/complaint callbacks (Phase 06, Svix-signed).
// Answers 503 until RESEND_WEBHOOK_SECRET is configured.
app.post(
  '/api/webhooks/resend',
  express.raw({ type: 'application/json' }),
  messagingWebhookRoutes,
);

// Twilio SMS status callbacks (Phase 07, X-Twilio-Signature signed).
// Answers 503 until TWILIO_AUTH_TOKEN is configured.
app.post(
  '/api/webhooks/twilio/status',
  express.urlencoded({ extended: false }),
  messagingWebhookController.twilioStatusCallback,
);

// ─── Body Parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser(config.session.secret));

// ─── CSRF Protection ──────────────────────────────────────────────────────────
app.use(csrfProtection);

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api', routes);

// ─── Sentry Express Error Handler (before global error handler) ──────────────
sentry.setupExpressErrorHandler(app);

// ─── 404 + Global Error Handler (must be last) ────────────────────────────────
app.use(notFound);
app.use(errorHandler);

module.exports = app;
