'use strict';

const config = require('./index');

const DEV_SENTINELS = new Set([
  'dev-secret-change-in-production',
  'dev-jwt-secret-change-in-production',
  'dev-messaging-ref-secret-minimum-32-chars!!',
]);

function present(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function assertProductionConfig() {
  if (!config.isProd) return;

  const failures = [];
  const check = (ok, message) => {
    if (!ok) failures.push(message);
  };

  check(present(process.env.SESSION_SECRET) && !DEV_SENTINELS.has(config.session.secret), 'SESSION_SECRET must be explicitly configured');
  check(present(process.env.JWT_SECRET) && !DEV_SENTINELS.has(config.jwt.secret), 'JWT_SECRET must be explicitly configured');
  const diagnosticSecret = process.env.MESSAGING_DIAGNOSTIC_REF_SECRET || process.env.SESSION_SECRET;
  check(present(diagnosticSecret) && !DEV_SENTINELS.has(config.messaging?.diagnosticRefSecret), 'MESSAGING_DIAGNOSTIC_REF_SECRET or valid SESSION_SECRET must be explicitly configured');
  check(present(config.supabase.url), 'SUPABASE_URL is required');
  check(present(config.supabase.serviceRoleKey || config.supabase.serviceKey), 'SUPABASE_SERVICE_ROLE_KEY (or legacy SUPABASE_SERVICE_KEY) is required');
  check(present(config.redis.url), 'REDIS_URL is required; production may not use process-local session/job state');
  check(present(config.stripe.secretKey), 'STRIPE_SECRET_KEY is required; production checkout may not fall back to dummy payments');
  check(present(config.stripe.webhookSecret), 'STRIPE_WEBHOOK_SECRET is required');
  check(!config.rateLimit.bypassToken, 'LOAD_TEST_BYPASS_TOKEN must not be configured in production');
  check(!['cron', 'off'].includes(config.jobs.runner), 'JOB_RUNNER must be auto or bullmq in production');

  for (const [name, url] of Object.entries(config.appUrls)) {
    const raw = String(url || '').trim();
    check(present(raw), `${name.toUpperCase()}_APP_URL is required`);
    check(/^https:\/\//i.test(raw), `${name.toUpperCase()}_APP_URL must use https in production`);
    check(!/localhost|127\.0\.0\.1/i.test(raw), `${name.toUpperCase()}_APP_URL must not point to localhost in production`);
  }

  if (failures.length) {
    const err = new Error(`Unsafe production configuration:\n- ${failures.join('\n- ')}`);
    err.code = 'UNSAFE_PRODUCTION_CONFIG';
    throw err;
  }
}

module.exports = { assertProductionConfig };
