'use strict';

/**
 * Phase 06 — canonical messaging capability (Resend / Twilio / FCM adapters).
 *
 * All provider SDKs are mocked: no network, no credentials. The real
 * messaging-provider.js plus the real thin wrappers (email/sms/push
 * services) run on top of the mocks so adapter sends, retry classification,
 * invalid-token handling, correlation-key dedupe, delivery records, and
 * health honesty are exercised for real. Message content must never reach
 * logs (asserted).
 */

const mockResendSend = jest.fn();
const mockTwilioCreate = jest.fn();
const mockTwilioValidateRequest = jest.fn();
const mockFcmSend = jest.fn();
const mockFcmBatch = jest.fn();
const mockSvixVerify = jest.fn();

jest.mock('resend', () => ({
  Resend: jest.fn(() => ({
    emails: { send: (...args) => mockResendSend(...args) },
  })),
}));

jest.mock('twilio', () => {
  const fn = jest.fn(() => ({
    messages: { create: (...args) => mockTwilioCreate(...args) },
  }));
  fn.validateRequest = (...args) => mockTwilioValidateRequest(...args);
  return fn;
});

jest.mock('firebase-admin', () => ({
  apps: [],
  initializeApp: jest.fn(),
  credential: { cert: jest.fn(() => ({})) },
  messaging: jest.fn(() => ({
    send: (...args) => mockFcmSend(...args),
    sendEachForMulticast: (...args) => mockFcmBatch(...args),
  })),
}));

jest.mock('svix', () => ({
  Webhook: jest.fn(() => ({
    verify: (...args) => mockSvixVerify(...args),
  })),
}));

jest.mock('../lib/supabase', () => ({
  select: jest.fn().mockResolvedValue([]),
  insert: jest.fn().mockResolvedValue({}),
  update: jest.fn().mockResolvedValue({}),
  remove: jest.fn().mockResolvedValue(null),
  supabaseFetch: jest.fn().mockResolvedValue(null),
  SupabaseError: class SupabaseError extends Error {
    constructor(message, statusCode) {
      super(message);
      this.name = 'SupabaseError';
      this.statusCode = statusCode;
    }
  },
}));

jest.mock('../lib/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

// Mutable config double: `enabled` getters mirror config/index.js semantics.
const testConfig = {
  email: {
    provider: 'resend',
    apiKey: 'test-resend-key',
    fromAddress: 'test@dilivygo.app',
    get enabled() { return !!this.apiKey; },
  },
  twilio: {
    accountSid: 'ACtest',
    authToken: 'test-token',
    phoneNumber: '+10000000001',
    get enabled() { return !!(this.accountSid && this.authToken && this.phoneNumber); },
  },
  firebase: {
    serviceAccountJson: '{}',
    get enabled() { return !!this.serviceAccountJson; },
  },
};
jest.mock('../config', () => testConfig);

const db = require('../lib/supabase');
const logger = require('../lib/logger');
const provider = require('../services/messaging-provider');
const emailService = require('../services/email.service');
const smsService = require('../services/sms.service');
const pushService = require('../services/push.service');
const webhookController = require('../controllers/messaging-webhook.controller');

let keySeq = 0;
function uniqueKey(prefix) {
  keySeq += 1;
  return `${prefix}-key-${keySeq}`;
}

function loggedBlobs() {
  const blobs = [];
  for (const fn of [logger.info, logger.warn, logger.error, logger.debug]) {
    for (const call of fn.mock.calls) {
      blobs.push(JSON.stringify(call));
    }
  }
  return blobs.join('\n');
}

function twilioError(twilioCode, message = 'Twilio API error') {
  return Object.assign(new Error(message), { status: 400, code: twilioCode });
}

beforeEach(() => {
  jest.clearAllMocks();
  keySeq = 0;
  db.select.mockResolvedValue([]);
  db.insert.mockResolvedValue({});
  db.update.mockResolvedValue({});
  db.remove.mockResolvedValue(null);
  testConfig.email.apiKey = 'test-resend-key';
  testConfig.twilio.accountSid = 'ACtest';
  testConfig.firebase.serviceAccountJson = '{}';
  provider._resetClients();
  provider._clearRecentSends();
  provider._resetHealth();
});

// ─── Email adapter ────────────────────────────────────────────────────────────

describe('email adapter (Resend)', () => {
  test('send resolves queued result and records a delivery row', async () => {
    mockResendSend.mockResolvedValue({ data: { id: 're_msg1' }, error: null });

    const result = await provider.sendEmail({
      organizationId: 'org-1',
      to: 'a@example.com',
      subject: 'Hello',
      html: '<p>Hi</p>',
      correlationId: uniqueKey('email'),
    });

    expect(result.providerMessageId).toBe('re_msg1');
    expect(result.status).toBe('queued');
    expect(mockResendSend).toHaveBeenCalledTimes(1);
    expect(db.insert).toHaveBeenCalledTimes(1);
    const row = db.insert.mock.calls[0][1][0];
    expect(row.channel).toBe('email');
    expect(row.provider).toBe('resend');
    expect(row.status).toBe('retrying');
    expect(row.correlation_key).toContain('email-key-');
    expect(db.update).toHaveBeenCalledTimes(1);
    const patch = db.update.mock.calls[0][1];
    expect(patch.provider_message_id).toBe('re_msg1');
    expect(patch.status).toBe('queued');
  });

  test('Resend API error object rejects with { statusCode, code } and records failed row', async () => {
    mockResendSend.mockResolvedValue({ data: null, error: { message: 'Validation failed', statusCode: 422 } });

    const err = await provider.sendEmail({
      to: 'bad@example.com',
      subject: 'x',
      text: 'y',
      correlationId: uniqueKey('email'),
    }).then(() => null, (e) => e);

    expect(err).toBeTruthy();
    expect(typeof err.statusCode).toBe('number');
    expect(err.statusCode).toBe(422);
    expect(typeof err.code).toBe('string');
    expect(mockResendSend).toHaveBeenCalledTimes(1); // 422 permanent: no retry
    const row = db.insert.mock.calls[0][1][0];
    expect(row.status).toBe('retrying');
    expect(db.update).toHaveBeenCalledTimes(1);
    const updatePatch = db.update.mock.calls[0][1];
    expect(updatePatch.status).toBe('failed');
    expect(typeof updatePatch.last_error).toBe('string');
  });

  test('duplicate correlation key sends once, second returns original', async () => {
    mockResendSend.mockResolvedValue({ data: { id: 're_dup' }, error: null });
    const correlationId = uniqueKey('email');

    const first = await provider.sendEmail({ to: 'a@example.com', subject: 's', text: 'b', correlationId });
    const second = await provider.sendEmail({ to: 'a@example.com', subject: 's', text: 'b', correlationId });

    expect(first.providerMessageId).toBe('re_dup');
    expect(second.providerMessageId).toBe('re_dup');
    expect(second.duplicate).toBe(true);
    expect(mockResendSend).toHaveBeenCalledTimes(1);
  });

  test('DB pre-check returns the original without calling the provider', async () => {
    db.select.mockResolvedValue([{
      provider_message_id: 're_orig',
      status: 'sent',
      correlation_key: 'email-key-9',
    }]);

    const result = await provider.sendEmail({
      to: 'a@example.com',
      subject: 's',
      text: 'b',
      correlationId: 'email-key-9',
    });

    expect(result.providerMessageId).toBe('re_orig');
    expect(result.duplicate).toBe(true);
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  test('missing table degrades: send still succeeds', async () => {
    db.select.mockRejectedValue(new Error('relation does not exist'));
    db.insert.mockRejectedValue(new Error('relation does not exist'));
    mockResendSend.mockResolvedValue({ data: { id: 're_degraded' }, error: null });

    const result = await provider.sendEmail({
      to: 'a@example.com',
      subject: 's',
      text: 'b',
      correlationId: uniqueKey('email'),
    });

    expect(result.providerMessageId).toBe('re_degraded');
  });

  test('transient 503 surfaces normalized error and stays retryable for the live retry loop', async () => {
    // NOTE: under jest `p-retry` is replaced by tests/mocks/p-retry-stub.js
    // (single attempt, no backoff — repo convention). Multi-attempt behavior
    // is driven by `shouldRetryMessaging` (unit-tested below) and was
    // additionally verified with real p-retry at the node level; here we
    // assert the adapter surfaces a retryable normalized error + failed row.
    mockResendSend.mockResolvedValue({ data: null, error: { message: 'Overloaded', statusCode: 503 } });

    const err = await provider.sendEmail({
      to: 'a@example.com',
      subject: 's',
      text: 'b',
      correlationId: uniqueKey('email'),
    }).then(() => null, (e) => e);

    expect(err).toBeTruthy();
    expect(err.statusCode).toBe(503);
    expect(typeof err.code).toBe('string');
    // The live loop would retry this (predicate honors the 503).
    expect(provider.shouldRetryMessaging(err)).toBe(true);
    const row = db.insert.mock.calls[0][1][0];
    expect(row.status).toBe('retrying');
    expect(db.update.mock.calls[0][1].status).toBe('failed');
  });
});

// ─── SMS adapter ──────────────────────────────────────────────────────────────

describe('sms adapter (Twilio)', () => {
  test('send resolves queued result with the Twilio sid', async () => {
    mockTwilioCreate.mockResolvedValue({ sid: 'SM123', status: 'queued' });

    const result = await provider.sendSms({
      organizationId: 'org-1',
      to: '+15550000001',
      body: 'code 123456',
      correlationId: uniqueKey('sms'),
    });

    expect(result.providerMessageId).toBe('SM123');
    expect(result.status).toBe('queued');
    expect(mockTwilioCreate).toHaveBeenCalledTimes(1);
    const row = db.insert.mock.calls[0][1][0];
    expect(row.channel).toBe('sms');
    expect(row.provider).toBe('twilio');
  });

  test('permanent Twilio error is not retried and carries error shape', async () => {
    mockTwilioCreate.mockRejectedValue(twilioError(21211, 'Invalid To number'));

    const err = await provider.sendSms({
      to: '+15550000002',
      body: 'hi',
      correlationId: uniqueKey('sms'),
    }).then(() => null, (e) => e);

    expect(err).toBeTruthy();
    expect(typeof err.statusCode).toBe('number');
    expect(typeof err.code).toBe('string');
    expect(mockTwilioCreate).toHaveBeenCalledTimes(1);
    expect(provider.isRetryable(twilioError(21211))).toBe(false);
  });

  test('provider outage (network) rejects with { statusCode, code }', async () => {
    // Single attempt under the jest p-retry stub (see note above); the live
    // loop retries network errors (isRetryable → true) before giving up here.
    mockTwilioCreate.mockRejectedValue(Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }));

    const err = await provider.sendSms({
      to: '+15550000003',
      body: 'hi',
      correlationId: uniqueKey('sms'),
    }).then(() => null, (e) => e);

    expect(err).toBeTruthy();
    expect(typeof err.statusCode).toBe('number');
    expect(typeof err.code).toBe('string');
    expect(provider.shouldRetryMessaging(
      Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }),
    )).toBe(true);
    const row = db.insert.mock.calls[0][1][0];
    expect(row.status).toBe('retrying');
    expect(db.update.mock.calls[0][1].status).toBe('failed');
  });

  test('same OTP content twice sends once; a fresh code still delivers', async () => {
    mockTwilioCreate.mockResolvedValue({ sid: 'SM-otp', status: 'queued' });

    // No explicit key: the derived (channel, recipient, content, window) key
    // suppresses the identical retry but lets the new code through.
    const first = await provider.sendSms({ to: '+15550000004', body: 'code 111111' });
    const retry = await provider.sendSms({ to: '+15550000004', body: 'code 111111' });
    const fresh = await provider.sendSms({ to: '+15550000004', body: 'code 222222' });

    expect(first.providerMessageId).toBe('SM-otp');
    expect(retry.duplicate).toBe(true);
    expect(fresh.duplicate).not.toBe(true);
    expect(mockTwilioCreate).toHaveBeenCalledTimes(2);
  });

  test('failed sends are never cached: retry after failure sends again', async () => {
    mockTwilioCreate
      .mockRejectedValueOnce(twilioError(21211, 'bad number'))
      .mockResolvedValueOnce({ sid: 'SM-fixed', status: 'queued' });
    const correlationId = uniqueKey('sms');

    await provider.sendSms({ to: '+15550000005', body: 'hi', correlationId }).then(() => null, (e) => e);
    const second = await provider.sendSms({ to: '+15550000005', body: 'hi', correlationId });

    expect(second.providerMessageId).toBe('SM-fixed');
    expect(mockTwilioCreate).toHaveBeenCalledTimes(2);
  });
});

// ─── Failure classification ───────────────────────────────────────────────────

describe('isRetryable / isInvalidPushToken', () => {
  test.each([
    ['null/undefined', null, false],
    ['empty object (unknown)', {}, true],
    ['429 rate limited', { statusCode: 429 }, true],
    ['500 server error', { statusCode: 500 }, true],
    ['503 outage', { status: 503 }, true],
    ['400 bad request', { statusCode: 400 }, false],
    ['401 unauthorized', { statusCode: 401 }, false],
    ['403 forbidden', { statusCode: 403 }, false],
    ['404 not found', { statusCode: 404 }, false],
    ['422 validation', { statusCode: 422 }, false],
    ['network reset (no status)', Object.assign(new Error('x'), { code: 'ECONNRESET' }), true],
    ['timeout (no status)', Object.assign(new Error('x'), { code: 'ETIMEDOUT' }), true],
  ])('%s → %s', (_label, err, expected) => {
    expect(provider.isRetryable(err)).toBe(expected);
  });

  test.each([
    [21211, false],
    [21610, false],
    [21614, false],
    [21408, false],
    [20003, false],
  ])('Twilio code %s is permanent', (code, expected) => {
    expect(provider.isRetryable(twilioError(code))).toBe(expected);
  });

  test('FCM transient codes are retryable, invalid-token codes are not', () => {
    expect(provider.isRetryable({ code: 'messaging/unavailable' })).toBe(true);
    expect(provider.isRetryable({ code: 'messaging/internal-error' })).toBe(true);
    expect(provider.isRetryable({ code: 'messaging/server-timeout' })).toBe(true);
    expect(provider.isRetryable({ code: 'messaging/invalid-registration-token' })).toBe(false);
    expect(provider.isRetryable({ code: 'messaging/registration-token-not-registered' })).toBe(false);
    expect(provider.isRetryable({ code: 'PUSH_INVALID_TOKEN', statusCode: 410 })).toBe(false);
  });

  test('isInvalidPushToken handles top-level, nested, and negative shapes', () => {
    expect(provider.isInvalidPushToken({ code: 'messaging/registration-token-not-registered' })).toBe(true);
    expect(provider.isInvalidPushToken({ code: 'PUSH_INVALID_TOKEN' })).toBe(true);
    expect(provider.isInvalidPushToken({ error: { code: 'messaging/invalid-registration-token' } })).toBe(true);
    expect(provider.isInvalidPushToken({ code: 'messaging/unavailable' })).toBe(false);
    expect(provider.isInvalidPushToken(null)).toBe(false);
  });

  test('retry predicate forwards the p-retry error shape to isRetryable', () => {
    // p-retry v6 passes the error itself (FailedAttemptError); older
    // wrappers passed `{ error }`. Both must classify correctly.
    const transient = Object.assign(new Error('boom'), { statusCode: 503, attemptNumber: 1, retriesLeft: 2 });
    const permanent = Object.assign(new Error('bad'), { statusCode: 400, attemptNumber: 1, retriesLeft: 2 });
    expect(provider.shouldRetryMessaging(transient)).toBe(true);
    expect(provider.shouldRetryMessaging(permanent)).toBe(false);
    expect(provider.shouldRetryMessaging({ error: transient })).toBe(true);
    expect(provider.shouldRetryMessaging({ error: permanent })).toBe(false);
  });
});

// ─── Push adapter ─────────────────────────────────────────────────────────────

describe('push adapter (FCM)', () => {
  test('single send resolves the FCM message id', async () => {
    mockFcmSend.mockResolvedValue('fcm-msg-1');

    const result = await provider.sendPush({
      token: 'token-abc',
      title: 'Hi',
      body: 'there',
      correlationId: uniqueKey('push'),
    });

    expect(result.providerMessageId).toBe('fcm-msg-1');
    expect(result.status).toBe('sent');
  });

  test('invalid token rejects with the PUSH_INVALID_TOKEN special code (no retry)', async () => {
    mockFcmSend.mockRejectedValue({ code: 'messaging/registration-token-not-registered' });

    const err = await provider.sendPush({
      token: 'dead-token',
      title: 'Hi',
      body: 'there',
      correlationId: uniqueKey('push'),
    }).then(() => null, (e) => e);

    expect(err).toBeTruthy();
    expect(err.code).toBe('PUSH_INVALID_TOKEN');
    expect(typeof err.statusCode).toBe('number');
    expect(mockFcmSend).toHaveBeenCalledTimes(1);
  });

  test('wrapper removes the stale token and resolves null (existing behavior)', async () => {
    mockFcmSend.mockRejectedValue({ code: 'messaging/invalid-registration-token' });

    const result = await pushService.sendPushNotification({
      token: 'dead-token-2',
      title: 'Hi',
      body: 'there',
      correlationId: uniqueKey('push'),
    });

    expect(result).toBeNull();
    expect(db.remove).toHaveBeenCalledWith('push_tokens', { token: 'dead-token-2' });
  });

  test('batch returns provider counts and removes only stale tokens', async () => {
    mockFcmBatch.mockResolvedValue({
      successCount: 1,
      failureCount: 1,
      responses: [
        { success: true, messageId: 'm1' },
        { success: false, error: { code: 'messaging/registration-token-not-registered' } },
      ],
    });

    const result = await pushService.sendPushToMultiple({
      tokens: ['good-token', 'dead-token-3'],
      title: 'Promo',
      body: 'Sale',
      correlationId: uniqueKey('push'),
    });

    expect(result.successCount).toBe(1);
    expect(result.failureCount).toBe(1);
    expect(db.remove).toHaveBeenCalledWith('push_tokens', { token: 'dead-token-3' });
    expect(db.remove).not.toHaveBeenCalledWith('push_tokens', expect.objectContaining({ token: 'good-token' }));
  });

  test('unconfigured push resolves null (fallback preserved)', async () => {
    testConfig.firebase.serviceAccountJson = '';
    provider._resetClients();

    await expect(pushService.sendPushNotification({ token: 't', title: 'a', body: 'b' })).resolves.toBeNull();
    await expect(pushService.sendPushToMultiple({ tokens: ['t'], title: 'a', body: 'b' })).resolves.toBeNull();
    expect(mockFcmSend).not.toHaveBeenCalled();
    expect(mockFcmBatch).not.toHaveBeenCalled();
  });
});

// ─── Wrapper backward compatibility ───────────────────────────────────────────

describe('thin wrappers preserve existing contracts', () => {
  test('email/SMS fall back with identical dev shapes when unconfigured', async () => {
    testConfig.email.apiKey = '';
    testConfig.twilio.accountSid = '';
    provider._resetClients();

    await expect(emailService.sendEmail({ to: 'a@example.com', subject: 's', text: 't' }))
      .resolves.toEqual({ id: 'dev-fallback', status: 'logged' });
    await expect(smsService.sendSMS({ to: '+10000000001', body: 'hi' }))
      .resolves.toEqual({ sid: 'dev-fallback', status: 'logged' });
    expect(mockResendSend).not.toHaveBeenCalled();
    expect(mockTwilioCreate).not.toHaveBeenCalled();
  });

  test('wrappers still throw on provider failure (OTP debugOtp path intact)', async () => {
    mockTwilioCreate.mockRejectedValue(twilioError(21211, 'bad number'));
    mockResendSend.mockResolvedValue({ data: null, error: { message: 'bad', statusCode: 400 } });

    await expect(smsService.sendSMS({ to: '+10000000001', body: 'hi', correlationId: uniqueKey('sms') }))
      .rejects.toMatchObject({ statusCode: expect.any(Number), code: expect.any(String) });
    await expect(emailService.sendEmail({ to: 'a@example.com', subject: 's', text: 't', correlationId: uniqueKey('email') }))
      .rejects.toMatchObject({ statusCode: expect.any(Number), code: expect.any(String) });
  });

  test('template helpers are untouched', () => {
    expect(typeof emailService.passwordResetEmail).toBe('function');
    expect(typeof emailService.customerOtpEmail).toBe('function');
    expect(typeof emailService.customerRecoveryEmail).toBe('function');
    expect(typeof emailService.refundConfirmationEmail).toBe('function');
    expect(typeof emailService.orderCancellationEmail).toBe('function');
    expect(typeof smsService.generateOTP).toBe('function');
    expect(emailService.customerOtpEmail('123456').subject).toContain('verification code');
    expect(smsService.generateOTP()).toMatch(/^\d{6}$/);
  });

  test('no recipient PII in logs beyond correlation ids', async () => {
    mockTwilioCreate.mockResolvedValue({ sid: 'SM-pii', status: 'queued' });
    mockResendSend.mockResolvedValue({ data: { id: 're_pii' }, error: null });
    mockFcmSend.mockResolvedValue('fcm-pii');

    const phone = '+15559876543';
    const email = 'pii-probe-xyz@example.com';
    const secretBody = 'pii-secret-body-987';
    await provider.sendSms({ to: phone, body: secretBody, correlationId: uniqueKey('sms') });
    await provider.sendEmail({ to: email, subject: 's', text: secretBody, correlationId: uniqueKey('email') });
    await provider.sendPush({ token: 'pii-token-abc', title: 't', body: secretBody, correlationId: uniqueKey('push') });

    const blobs = loggedBlobs();
    expect(blobs).not.toContain(phone);
    expect(blobs).not.toContain(email);
    expect(blobs).not.toContain(secretBody);
  });
});

// ─── Provider health honesty ──────────────────────────────────────────────────

describe('getProviderHealth', () => {
  test('configured but unused channels report unknown — never healthy without evidence', () => {
    const health = provider.getProviderHealth();
    expect(health.sms).toMatchObject({ provider: 'twilio', configured: true, status: 'unknown' });
    expect(health.email).toMatchObject({ provider: 'resend', configured: true, status: 'unknown' });
    expect(health.push).toMatchObject({ provider: 'fcm', configured: true, status: 'unknown' });
  });

  test('unconfigured channels report unconfigured', () => {
    testConfig.email.apiKey = '';
    testConfig.twilio.accountSid = '';
    testConfig.firebase.serviceAccountJson = '';
    provider._resetClients();

    const health = provider.getProviderHealth();
    expect(health.email.status).toBe('unconfigured');
    expect(health.email.configured).toBe(false);
    expect(health.sms.status).toBe('unconfigured');
    expect(health.push.status).toBe('unconfigured');
  });

  test('success → healthy; failure → degraded; five consecutive → down', async () => {
    mockTwilioCreate.mockResolvedValue({ sid: 'SM-h', status: 'queued' });
    await provider.sendSms({ to: '+10000000001', body: 'hi', correlationId: uniqueKey('sms') });
    expect(provider.getProviderHealth().sms.status).toBe('healthy');

    mockTwilioCreate.mockRejectedValue(twilioError(21211, 'bad'));
    await provider.sendSms({ to: '+10000000002', body: 'hi', correlationId: uniqueKey('sms') })
      .then(() => null, (e) => e);
    const degraded = provider.getProviderHealth().sms;
    expect(degraded.status).toBe('degraded');
    expect(degraded.consecutiveFailures).toBe(1);
    expect(typeof degraded.lastErrorCode).toBe('string');

    for (let i = 0; i < 4; i += 1) {
      await provider.sendSms({ to: `+1000000001${i}`, body: 'hi', correlationId: uniqueKey('sms') })
        .then(() => null, (e) => e);
    }
    expect(provider.getProviderHealth().sms.status).toBe('down');
  });
});

// ─── Correlation helpers ──────────────────────────────────────────────────────

describe('correlation keys', () => {
  test('buildOtpCorrelationKey shapes otp:{org}:{channel}:{digest}:{window}', () => {
    const key = provider.buildOtpCorrelationKey({
      organizationId: 'org-123',
      channel: 'phone',
      recipient: '+15550000001',
    });
    expect(key).toMatch(/^otp:org-123:phone:[0-9a-f]{32}:\d+$/);
    // Raw recipient must not leak into the key.
    expect(key).not.toContain('5550000001');
  });

  test('resolveCorrelationKey prefers explicit, falls back to derived', () => {
    expect(provider.resolveCorrelationKey('  explicit-key ', 'derived')).toBe('explicit-key');
    expect(provider.resolveCorrelationKey(null, 'derived')).toBe('derived');
    expect(provider.resolveCorrelationKey('', 'derived')).toBe('derived');
  });
});

// ─── Delivery/bounce callback (Resend, Svix-signed) ───────────────────────────

describe('messaging resend webhook', () => {
  function mockReqRes(body, headers = {}) {
    const req = { body: Buffer.from(JSON.stringify(body)), headers };
    const res = {
      statusCode: 200,
      payload: null,
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.payload = payload; return this; },
    };
    return { req, res };
  }

  const headers = { 'svix-id': 'msg_1', 'svix-timestamp': '123', 'svix-signature': 'v1,sig' };

  test('event type mapping is honest (no invented terminal states)', () => {
    expect(webhookController.statusForResendEvent('email.delivered')).toBe('sent');
    expect(webhookController.statusForResendEvent('email.sent')).toBe('sent');
    expect(webhookController.statusForResendEvent('email.bounced')).toBe('failed');
    expect(webhookController.statusForResendEvent('email.complained')).toBe('failed');
    expect(webhookController.statusForResendEvent('email.opened')).toBeNull();
    expect(webhookController.statusForResendEvent('email.clicked')).toBeNull();
    expect(webhookController.statusForResendEvent('user.created')).toBeNull();
  });

  test('missing secret answers 503 without verifying', async () => {
    delete process.env.RESEND_WEBHOOK_SECRET;
    const { req, res } = mockReqRes({ type: 'email.delivered' }, headers);
    await webhookController.resendWebhook(req, res);
    expect(res.statusCode).toBe(503);
    expect(mockSvixVerify).not.toHaveBeenCalled();
  });

  test('invalid signature answers 400', async () => {
    process.env.RESEND_WEBHOOK_SECRET = 'whsec_test';
    mockSvixVerify.mockImplementation(() => { throw new Error('bad signature'); });
    const { req, res } = mockReqRes({ type: 'email.delivered' }, headers);
    await webhookController.resendWebhook(req, res);
    expect(res.statusCode).toBe(400);
    expect(db.update).not.toHaveBeenCalled();
    delete process.env.RESEND_WEBHOOK_SECRET;
  });

  test('delivered event updates matching resend row to sent, then 2xx', async () => {
    process.env.RESEND_WEBHOOK_SECRET = 'whsec_test';
    mockSvixVerify.mockReturnValue({ type: 'email.delivered', data: { email_id: 're_msg1' } });
    db.select.mockResolvedValueOnce([{ id: 'row-resend-1', status: 'queued', last_error: null }]);
    db.update.mockResolvedValueOnce([{ id: 'row-resend-1', status: 'sent' }]);
    const { req, res } = mockReqRes({ type: 'email.delivered' }, headers);
    await webhookController.resendWebhook(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.payload).toEqual({ received: true });
    expect(db.select).toHaveBeenCalledWith(
      'message_deliveries',
      expect.objectContaining({
        filters: { provider: 'resend', provider_message_id: 're_msg1' },
      }),
    );
    expect(db.update).toHaveBeenCalledWith(
      'message_deliveries',
      expect.objectContaining({ status: 'sent' }),
      { id: 'row-resend-1', status: 'queued' },
    );
    delete process.env.RESEND_WEBHOOK_SECRET;
  });

  test('bounce event marks matching resend row failed', async () => {
    process.env.RESEND_WEBHOOK_SECRET = 'whsec_test';
    mockSvixVerify.mockReturnValue({ type: 'email.bounced', data: { email_id: 're_msg2' } });
    db.select.mockResolvedValueOnce([{ id: 'row-resend-2', status: 'queued', last_error: null }]);
    db.update.mockResolvedValueOnce([{ id: 'row-resend-2', status: 'failed' }]);
    const { req, res } = mockReqRes({ type: 'email.bounced' }, headers);
    await webhookController.resendWebhook(req, res);
    expect(res.statusCode).toBe(200);
    expect(db.update).toHaveBeenCalledWith(
      'message_deliveries',
      expect.objectContaining({ status: 'failed', last_error: 'resend:email.bounced' }),
      { id: 'row-resend-2', status: 'queued' },
    );
    delete process.env.RESEND_WEBHOOK_SECRET;
  });

  test('DB update failure returns 500 without leaking DB details', async () => {
    process.env.RESEND_WEBHOOK_SECRET = 'whsec_test';
    mockSvixVerify.mockReturnValue({ type: 'email.delivered', data: { email_id: 're_msg_fail' } });
    db.select.mockResolvedValueOnce([{ id: 'row-resend-fail', status: 'queued', last_error: null }]);
    db.update.mockRejectedValueOnce(new Error('Supabase update connection timeout'));
    const { req, res } = mockReqRes({ type: 'email.delivered' }, headers);
    await webhookController.resendWebhook(req, res);
    expect(res.statusCode).toBe(500);
    expect(res.payload).toEqual({ error: 'Processing failed' });
    delete process.env.RESEND_WEBHOOK_SECRET;
  });

  test('unknown provider message ID acks 200 without DB update', async () => {
    process.env.RESEND_WEBHOOK_SECRET = 'whsec_test';
    mockSvixVerify.mockReturnValue({ type: 'email.delivered', data: { email_id: 're_unknown' } });
    db.select.mockResolvedValueOnce([]);
    const { req, res } = mockReqRes({ type: 'email.delivered' }, headers);
    await webhookController.resendWebhook(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.payload).toEqual({ received: true });
    expect(db.update).not.toHaveBeenCalled();
    delete process.env.RESEND_WEBHOOK_SECRET;
  });

  test('same provider ID under twilio must NOT be selected by Resend', async () => {
    process.env.RESEND_WEBHOOK_SECRET = 'whsec_test';
    mockSvixVerify.mockReturnValue({ type: 'email.delivered', data: { email_id: 'shared_id_1' } });
    db.select.mockImplementationOnce(async (table, options) => {
      if (options?.filters?.provider === 'twilio' && options?.filters?.provider_message_id === 'shared_id_1') {
        return [{ id: 'twilio-row-1', status: 'queued' }];
      }
      return [];
    });
    const { req, res } = mockReqRes({ type: 'email.delivered' }, headers);
    await webhookController.resendWebhook(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.payload).toEqual({ received: true });
    expect(db.select).toHaveBeenCalledWith(
      'message_deliveries',
      expect.objectContaining({
        filters: { provider: 'resend', provider_message_id: 'shared_id_1' },
      }),
    );
    expect(db.update).not.toHaveBeenCalled();
    delete process.env.RESEND_WEBHOOK_SECRET;
  });

  test('ambiguous resend rows answers 500', async () => {
    process.env.RESEND_WEBHOOK_SECRET = 'whsec_test';
    mockSvixVerify.mockReturnValue({ type: 'email.delivered', data: { email_id: 're_ambig' } });
    db.select.mockResolvedValueOnce([
      { id: 'row-1', status: 'queued' },
      { id: 'row-2', status: 'queued' },
    ]);
    const { req, res } = mockReqRes({ type: 'email.delivered' }, headers);
    await webhookController.resendWebhook(req, res);
    expect(res.statusCode).toBe(500);
    expect(res.payload).toEqual({ error: 'Processing failed' });
    expect(db.update).not.toHaveBeenCalled();
    delete process.env.RESEND_WEBHOOK_SECRET;
  });

  test('engagement events ack without touching delivery state', async () => {
    process.env.RESEND_WEBHOOK_SECRET = 'whsec_test';
    mockSvixVerify.mockReturnValue({ type: 'email.opened', data: { email_id: 're_msg3' } });
    const { req, res } = mockReqRes({ type: 'email.opened' }, headers);
    await webhookController.resendWebhook(req, res);
    expect(res.statusCode).toBe(200);
    expect(db.update).not.toHaveBeenCalled();
    delete process.env.RESEND_WEBHOOK_SECRET;
  });
});

describe('messaging twilio status callback', () => {
  function mockTwilioReqRes(body = {}, headers = {}) {
    const req = { body, headers };
    const res = {
      statusCode: 200,
      payload: null,
      contentType: null,
      status(code) { this.statusCode = code; return this; },
      type(ct) { this.contentType = ct; return this; },
      send(payload) { this.payload = payload; return this; },
      json(payload) { this.payload = payload; return this; },
    };
    return { req, res };
  }

  test('statusForTwilioStatus maps correctly and honestly', () => {
    expect(webhookController.statusForTwilioStatus('accepted')).toBe('queued');
    expect(webhookController.statusForTwilioStatus('queued')).toBe('queued');
    expect(webhookController.statusForTwilioStatus('sending')).toBe('queued');
    expect(webhookController.statusForTwilioStatus('sent')).toBe('sent');
    expect(webhookController.statusForTwilioStatus('delivered')).toBe('sent');
    expect(webhookController.statusForTwilioStatus('failed')).toBe('failed');
    expect(webhookController.statusForTwilioStatus('undelivered')).toBe('failed');
    expect(webhookController.statusForTwilioStatus('unknown_status')).toBeNull();
    expect(webhookController.statusForTwilioStatus(null)).toBeNull();
  });

  test('missing authToken answers 503 without validating', async () => {
    testConfig.twilio.authToken = '';
    const { req, res } = mockTwilioReqRes({ MessageSid: 'SM1', MessageStatus: 'delivered' });
    await webhookController.twilioStatusCallback(req, res);
    expect(res.statusCode).toBe(503);
    expect(mockTwilioValidateRequest).not.toHaveBeenCalled();
    testConfig.twilio.authToken = 'test-token';
  });

  test('invalid signature answers 400', async () => {
    mockTwilioValidateRequest.mockReturnValue(false);
    const { req, res } = mockTwilioReqRes(
      { MessageSid: 'SM1', MessageStatus: 'delivered' },
      { 'x-twilio-signature': 'bad-sig' },
    );
    await webhookController.twilioStatusCallback(req, res);
    expect(res.statusCode).toBe(400);
    expect(db.update).not.toHaveBeenCalled();
  });

  test('delivered event marks matching twilio row sent and returns 200 XML <Response/>', async () => {
    mockTwilioValidateRequest.mockReturnValue(true);
    db.select.mockResolvedValueOnce([{ id: 'row-twilio-1', status: 'queued', last_error: null }]);
    db.update.mockResolvedValueOnce([{ id: 'row-twilio-1', status: 'sent' }]);
    const { req, res } = mockTwilioReqRes(
      { MessageSid: 'SM_deliv', MessageStatus: 'delivered' },
      { 'x-twilio-signature': 'valid-sig' },
    );
    await webhookController.twilioStatusCallback(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.contentType).toBe('text/xml');
    expect(res.payload).toBe('<Response/>');
    expect(db.select).toHaveBeenCalledWith(
      'message_deliveries',
      expect.objectContaining({
        filters: { provider: 'twilio', provider_message_id: 'SM_deliv' },
      }),
    );
    expect(db.update).toHaveBeenCalledWith(
      'message_deliveries',
      expect.objectContaining({ status: 'sent' }),
      { id: 'row-twilio-1', status: 'queued' },
    );
  });

  test('failed event sanitizes provider error code without PII and marks failed', async () => {
    mockTwilioValidateRequest.mockReturnValue(true);
    db.select.mockResolvedValueOnce([{ id: 'row-twilio-2', status: 'queued', last_error: null }]);
    db.update.mockResolvedValueOnce([{ id: 'row-twilio-2', status: 'failed' }]);
    const { req, res } = mockTwilioReqRes(
      { MessageSid: 'SM_fail', MessageStatus: 'undelivered', ErrorCode: '30007' },
      { 'x-twilio-signature': 'valid-sig' },
    );
    await webhookController.twilioStatusCallback(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.payload).toBe('<Response/>');
    expect(db.update).toHaveBeenCalledWith(
      'message_deliveries',
      expect.objectContaining({
        status: 'failed',
        last_error: 'twilio:undelivered:30007',
      }),
      { id: 'row-twilio-2', status: 'queued' },
    );
  });

  test('DB update failure returns 500 XML', async () => {
    mockTwilioValidateRequest.mockReturnValue(true);
    db.select.mockResolvedValueOnce([{ id: 'row-twilio-fail', status: 'queued', last_error: null }]);
    db.update.mockRejectedValueOnce(new Error('Twilio DB failure'));
    const { req, res } = mockTwilioReqRes(
      { MessageSid: 'SM_deliv_err', MessageStatus: 'delivered' },
      { 'x-twilio-signature': 'valid-sig' },
    );
    await webhookController.twilioStatusCallback(req, res);
    expect(res.statusCode).toBe(500);
    expect(res.contentType).toBe('text/xml');
    expect(res.payload).toBe('<Response/>');
  });

  test('unknown SID returns 200 XML without updating DB', async () => {
    mockTwilioValidateRequest.mockReturnValue(true);
    db.select.mockResolvedValueOnce([]);
    const { req, res } = mockTwilioReqRes(
      { MessageSid: 'SM_unknown', MessageStatus: 'delivered' },
      { 'x-twilio-signature': 'valid-sig' },
    );
    await webhookController.twilioStatusCallback(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.contentType).toBe('text/xml');
    expect(res.payload).toBe('<Response/>');
    expect(db.update).not.toHaveBeenCalled();
  });

  test('same SID under resend must NOT be selected by Twilio', async () => {
    mockTwilioValidateRequest.mockReturnValue(true);
    db.select.mockImplementationOnce(async (table, options) => {
      if (options?.filters?.provider === 'resend' && options?.filters?.provider_message_id === 'SM_shared_id') {
        return [{ id: 'resend-row-1', status: 'queued' }];
      }
      return [];
    });
    const { req, res } = mockTwilioReqRes(
      { MessageSid: 'SM_shared_id', MessageStatus: 'delivered' },
      { 'x-twilio-signature': 'valid-sig' },
    );
    await webhookController.twilioStatusCallback(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.contentType).toBe('text/xml');
    expect(res.payload).toBe('<Response/>');
    expect(db.select).toHaveBeenCalledWith(
      'message_deliveries',
      expect.objectContaining({
        filters: { provider: 'twilio', provider_message_id: 'SM_shared_id' },
      }),
    );
    expect(db.update).not.toHaveBeenCalled();
  });

  test('ambiguous twilio rows returns 500 XML', async () => {
    mockTwilioValidateRequest.mockReturnValue(true);
    db.select.mockResolvedValueOnce([
      { id: 'row-t1', status: 'queued' },
      { id: 'row-t2', status: 'queued' },
    ]);
    const { req, res } = mockTwilioReqRes(
      { MessageSid: 'SM_ambig', MessageStatus: 'delivered' },
      { 'x-twilio-signature': 'valid-sig' },
    );
    await webhookController.twilioStatusCallback(req, res);
    expect(res.statusCode).toBe(500);
    expect(res.contentType).toBe('text/xml');
    expect(res.payload).toBe('<Response/>');
    expect(db.update).not.toHaveBeenCalled();
  });

  test('unknown status acks 200 without modifying state', async () => {
    mockTwilioValidateRequest.mockReturnValue(true);
    const { req, res } = mockTwilioReqRes(
      { MessageSid: 'SM_unk', MessageStatus: 'read' },
      { 'x-twilio-signature': 'valid-sig' },
    );
    await webhookController.twilioStatusCallback(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.payload).toBe('<Response/>');
    expect(db.update).not.toHaveBeenCalled();
  });
});

describe('updateDeliveryStatus terminal & out-of-order safety', () => {
  test('queued -> sent transition is allowed', async () => {
    db.select.mockResolvedValueOnce([{ id: 'row-1', status: 'queued', last_error: null }]);
    const ok = await provider.updateDeliveryStatus({
      providerMessageId: 'p_1',
      status: 'sent',
    });
    expect(ok).toBe(true);
    expect(db.update).toHaveBeenCalledWith(
      'message_deliveries',
      expect.objectContaining({ status: 'sent' }),
      { provider_message_id: 'p_1' },
    );
  });

  test('queued -> failed transition is allowed', async () => {
    db.select.mockResolvedValueOnce([{ id: 'row-2', status: 'queued', last_error: null }]);
    const ok = await provider.updateDeliveryStatus({
      providerMessageId: 'p_2',
      status: 'failed',
      lastError: 'bounce',
    });
    expect(ok).toBe(true);
    expect(db.update).toHaveBeenCalledWith(
      'message_deliveries',
      expect.objectContaining({ status: 'failed', last_error: 'bounce' }),
      { provider_message_id: 'p_2' },
    );
  });

  test('sent -> queued downgrade is blocked (out-of-order delivery protection)', async () => {
    db.select.mockResolvedValueOnce([{ id: 'row-3', status: 'sent', last_error: null }]);
    const ok = await provider.updateDeliveryStatus({
      providerMessageId: 'p_3',
      status: 'queued',
    });
    expect(ok).toBe(true);
    expect(db.update).not.toHaveBeenCalled();
  });

  test('failed -> queued downgrade is blocked', async () => {
    db.select.mockResolvedValueOnce([{ id: 'row-4', status: 'failed', last_error: 'fatal err' }]);
    const ok = await provider.updateDeliveryStatus({
      providerMessageId: 'p_4',
      status: 'queued',
    });
    expect(ok).toBe(true);
    expect(db.update).not.toHaveBeenCalled();
  });

  test('failed -> sent is blocked (terminal failure preserved over late sent callback)', async () => {
    db.select.mockResolvedValueOnce([{ id: 'row-5', status: 'failed', last_error: 'hard bounce' }]);
    const ok = await provider.updateDeliveryStatus({
      providerMessageId: 'p_5',
      status: 'sent',
    });
    expect(ok).toBe(true);
    expect(db.update).not.toHaveBeenCalled();
  });

  test('sent -> failed is allowed (e.g. downstream bounce after upstream acceptance)', async () => {
    db.select.mockResolvedValueOnce([{ id: 'row-6', status: 'sent', last_error: null }]);
    const ok = await provider.updateDeliveryStatus({
      providerMessageId: 'p_6',
      status: 'failed',
      lastError: 'resend:email.bounced',
    });
    expect(ok).toBe(true);
    expect(db.update).toHaveBeenCalledWith(
      'message_deliveries',
      expect.objectContaining({ status: 'failed', last_error: 'resend:email.bounced' }),
      { provider_message_id: 'p_6' },
    );
  });
});

describe('twilio sendSms statusCallback URL propagation', () => {
  test('sendSms includes statusCallback param when public server URL is resolved', async () => {
    mockTwilioCreate.mockResolvedValueOnce({ sid: 'SM_cb', status: 'queued' });
    const result = await provider.sendSms({
      organizationId: 'org-test',
      to: '+10000000002',
      body: 'Testing callback URL',
      correlationId: 'sms-cb-key',
    });
    expect(result.providerMessageId).toBe('SM_cb');
    expect(mockTwilioCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        from: '+10000000001',
        to: '+10000000002',
        body: 'Testing callback URL',
        statusCallback: expect.stringContaining('/api/webhooks/twilio/status'),
      }),
    );
  });
});

describe('applyProviderDeliveryStatus transitions & CAS', () => {
  test('sent -> queued blocked', async () => {
    db.select.mockResolvedValueOnce([{ id: 'row-1', status: 'sent', last_error: null }]);
    const res = await provider.applyProviderDeliveryStatus({
      provider: 'resend',
      providerMessageId: 'p_1',
      status: 'queued',
    });
    expect(res).toEqual({ matched: true, applied: false, status: 'sent' });
    expect(db.update).not.toHaveBeenCalled();
  });

  test('failed -> queued blocked', async () => {
    db.select.mockResolvedValueOnce([{ id: 'row-2', status: 'failed', last_error: 'fatal err' }]);
    const res = await provider.applyProviderDeliveryStatus({
      provider: 'resend',
      providerMessageId: 'p_2',
      status: 'queued',
    });
    expect(res).toEqual({ matched: true, applied: false, status: 'failed' });
    expect(db.update).not.toHaveBeenCalled();
  });

  test('failed -> sent blocked', async () => {
    db.select.mockResolvedValueOnce([{ id: 'row-3', status: 'failed', last_error: 'hard bounce' }]);
    const res = await provider.applyProviderDeliveryStatus({
      provider: 'resend',
      providerMessageId: 'p_3',
      status: 'sent',
    });
    expect(res).toEqual({ matched: true, applied: false, status: 'failed' });
    expect(db.update).not.toHaveBeenCalled();
  });

  test('sent -> failed allowed', async () => {
    db.select.mockResolvedValueOnce([{ id: 'row-4', status: 'sent', last_error: null }]);
    db.update.mockResolvedValueOnce([{ id: 'row-4', status: 'failed' }]);
    const res = await provider.applyProviderDeliveryStatus({
      provider: 'resend',
      providerMessageId: 'p_4',
      status: 'failed',
      lastError: 'resend:email.bounced',
    });
    expect(res.matched).toBe(true);
    expect(res.applied).toBe(true);
    expect(res.status).toBe('failed');
    expect(db.update).toHaveBeenCalledWith(
      'message_deliveries',
      expect.objectContaining({ status: 'failed', last_error: 'resend:email.bounced' }),
      { id: 'row-4', status: 'sent' },
    );
  });

  test('duplicate sent -> sent idempotent', async () => {
    db.select.mockResolvedValueOnce([{ id: 'row-5', status: 'sent', last_error: null }]);
    const res = await provider.applyProviderDeliveryStatus({
      provider: 'resend',
      providerMessageId: 'p_5',
      status: 'sent',
    });
    expect(res).toEqual(expect.objectContaining({ matched: true, applied: false, status: 'sent' }));
    expect(db.update).not.toHaveBeenCalled();
  });

  test('CAS concurrency: force one CAS miss and verify retry still includes expected status predicate', async () => {
    // 1. Initial select finds row with status: 'queued'
    db.select.mockResolvedValueOnce([{ id: 'row-cas-1', status: 'queued', last_error: null }]);

    // 2. First CAS update with status: 'queued' misses (0 rows updated)
    db.update.mockResolvedValueOnce([]);

    // 3. Re-read by id finds row with status: 'sent'
    db.select.mockResolvedValueOnce([{ id: 'row-cas-1', status: 'sent', last_error: null }]);

    // 4. Second CAS update attempts transition sent -> failed, predicate status: 'sent' succeeds
    db.update.mockResolvedValueOnce([{ id: 'row-cas-1', status: 'failed' }]);

    const res = await provider.applyProviderDeliveryStatus({
      provider: 'resend',
      providerMessageId: 'cas_msg_1',
      status: 'failed',
      lastError: 'resend:email.bounced',
    });

    expect(res.matched).toBe(true);
    expect(res.applied).toBe(true);
    expect(res.status).toBe('failed');

    expect(db.update).toHaveBeenCalledTimes(2);
    // Both attempts MUST predicate on status — NEVER update with only { id }
    expect(db.update).toHaveBeenNthCalledWith(
      1,
      'message_deliveries',
      expect.objectContaining({ status: 'failed' }),
      { id: 'row-cas-1', status: 'queued' },
    );
    expect(db.update).toHaveBeenNthCalledWith(
      2,
      'message_deliveries',
      expect.objectContaining({ status: 'failed' }),
      { id: 'row-cas-1', status: 'sent' },
    );
  });
});

describe('durable ledger retry reconciliation (UNIQUE correlation key)', () => {
  let deliveryRows = [];

  function installStatefulStorage() {
    deliveryRows = [];

    db.select.mockImplementation(async (table, options = {}) => {
      if (table !== 'message_deliveries') return [];
      const filters = options.filters || {};
      let matched = deliveryRows.filter((row) => {
        for (const [key, val] of Object.entries(filters)) {
          if (row[key] !== val) return false;
        }
        return true;
      });
      if (typeof options.limit === 'number') {
        matched = matched.slice(0, options.limit);
      }
      return matched.map((r) => ({ ...r }));
    });

    db.insert.mockImplementation(async (table, data) => {
      if (table !== 'message_deliveries') return Array.isArray(data) ? data : [data];
      const items = Array.isArray(data) ? data : [data];
      const inserted = [];
      for (const item of items) {
        if (item.correlation_key && deliveryRows.some((r) => r.correlation_key === item.correlation_key)) {
          const err = new Error('duplicate key value violates unique constraint "message_deliveries_correlation_key_key"');
          err.status = 409;
          err.statusCode = 409;
          err.code = '23505';
          throw err;
        }
        const row = {
          id: item.id || `md-${deliveryRows.length + 1}`,
          created_at: new Date().toISOString(),
          ...item,
        };
        deliveryRows.push(row);
        inserted.push({ ...row });
      }
      return inserted;
    });

    db.update.mockImplementation(async (table, patch, filters = {}) => {
      if (table !== 'message_deliveries') return [patch];
      const updated = [];
      for (let i = 0; i < deliveryRows.length; i++) {
        const r = deliveryRows[i];
        let matches = true;
        for (const [key, val] of Object.entries(filters)) {
          if (r[key] !== val) {
            matches = false;
            break;
          }
        }
        if (matches) {
          deliveryRows[i] = {
            ...r,
            ...patch,
            updated_at: patch.updated_at || new Date().toISOString(),
          };
          updated.push({ ...deliveryRows[i] });
        }
      }
      return updated;
    });
  }

  beforeEach(() => {
    installStatefulStorage();
    provider._resetClients();
    provider._clearRecentSends();
    provider._resetHealth();
  });

  test('Twilio retry: failed send followed by successful retry reconciles single durable row', async () => {
    const correlationKey = 'retry-sms-1';

    // 1. First provider attempt fails
    mockTwilioCreate.mockRejectedValueOnce(twilioError(21211, 'Invalid number'));

    await expect(
      provider.sendSms({
        to: '+15550000001',
        body: 'OTP code 1234',
        correlationId: correlationKey,
      })
    ).rejects.toMatchObject({ statusCode: expect.any(Number) });

    // Assert durable state after failure: exactly 1 row, status failed, attempts >= 1
    expect(deliveryRows.length).toBe(1);
    expect(deliveryRows[0].correlation_key).toBe(correlationKey);
    expect(deliveryRows[0].status).toBe('failed');
    expect(deliveryRows[0].attempts).toBe(1);
    expect(deliveryRows[0].provider_message_id).toBeNull();
    const initialRowId = deliveryRows[0].id;

    // 2. Second call with SAME correlation key succeeds with SM-fixed
    mockTwilioCreate.mockResolvedValueOnce({ sid: 'SM-fixed', status: 'queued' });

    const result = await provider.sendSms({
      to: '+15550000001',
      body: 'OTP code 1234',
      correlationId: correlationKey,
    });

    expect(result.providerMessageId).toBe('SM-fixed');
    expect(result.status).toBe('queued');
    expect(mockTwilioCreate).toHaveBeenCalledTimes(2);

    // Assert durable state: STILL exactly 1 row, updated in place
    expect(deliveryRows.length).toBe(1);
    expect(deliveryRows[0].id).toBe(initialRowId);
    expect(deliveryRows[0].status).toBe('queued');
    expect(deliveryRows[0].provider_message_id).toBe('SM-fixed');
    expect(deliveryRows[0].last_error).toBeNull();
    expect(deliveryRows[0].attempts).toBe(2);
  });

  test('Email retry: failed Resend send followed by successful retry reconciles single durable row', async () => {
    const correlationKey = 'retry-email-1';

    // 1. First attempt fails
    mockResendSend.mockResolvedValueOnce({
      data: null,
      error: { message: 'Domain not verified', statusCode: 403 },
    });

    await expect(
      provider.sendEmail({
        to: 'buyer@example.com',
        subject: 'Receipt',
        text: 'Your order is confirmed',
        correlationId: correlationKey,
      })
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(deliveryRows.length).toBe(1);
    expect(deliveryRows[0].correlation_key).toBe(correlationKey);
    expect(deliveryRows[0].status).toBe('failed');
    expect(deliveryRows[0].attempts).toBe(1);
    const initialRowId = deliveryRows[0].id;

    // 2. Second same-correlation attempt returns re_fixed
    mockResendSend.mockResolvedValueOnce({
      data: { id: 're_fixed' },
      error: null,
    });

    const result = await provider.sendEmail({
      to: 'buyer@example.com',
      subject: 'Receipt',
      text: 'Your order is confirmed',
      correlationId: correlationKey,
    });

    expect(result.providerMessageId).toBe('re_fixed');
    expect(result.status).toBe('queued');
    expect(mockResendSend).toHaveBeenCalledTimes(2);

    // Assert durable state: single row updated
    expect(deliveryRows.length).toBe(1);
    expect(deliveryRows[0].id).toBe(initialRowId);
    expect(deliveryRows[0].status).toBe('queued');
    expect(deliveryRows[0].provider_message_id).toBe('re_fixed');
    expect(deliveryRows[0].last_error).toBeNull();
    expect(deliveryRows[0].attempts).toBe(2);
  });

  test('Repeated failure: multiple failed attempts update same durable row without duplicate insert', async () => {
    const correlationKey = 'retry-fail-twice';

    mockTwilioCreate
      .mockRejectedValueOnce(twilioError(21211, 'First failure'))
      .mockRejectedValueOnce(twilioError(21211, 'Second failure'));

    // First attempt fails
    await expect(
      provider.sendSms({
        to: '+15550000002',
        body: 'hi',
        correlationId: correlationKey,
      })
    ).rejects.toMatchObject({ statusCode: expect.any(Number) });

    expect(deliveryRows.length).toBe(1);
    expect(deliveryRows[0].status).toBe('failed');
    expect(deliveryRows[0].attempts).toBe(1);
    expect(deliveryRows[0].last_error).toContain('First failure');
    const initialRowId = deliveryRows[0].id;

    // Second same-key retry fails
    await expect(
      provider.sendSms({
        to: '+15550000002',
        body: 'hi',
        correlationId: correlationKey,
      })
    ).rejects.toMatchObject({ statusCode: expect.any(Number) });

    expect(deliveryRows.length).toBe(1);
    expect(deliveryRows[0].id).toBe(initialRowId);
    expect(deliveryRows[0].status).toBe('failed');
    expect(deliveryRows[0].attempts).toBe(2);
    expect(deliveryRows[0].last_error).toContain('Second failure');
  });

  test('FCM retry: failed push followed by successful retry reconciles to sent', async () => {
    const correlationKey = 'retry-fcm-1';

    // First attempt fails
    mockFcmSend.mockRejectedValueOnce(Object.assign(new Error('Internal server error'), { code: 'messaging/internal-error' }));

    await expect(
      provider.sendPush({
        token: 'dev-token-1',
        title: 'Order status',
        body: 'Order is on the way',
        correlationId: correlationKey,
      })
    ).rejects.toMatchObject({ statusCode: expect.any(Number) });

    expect(deliveryRows.length).toBe(1);
    expect(deliveryRows[0].status).toBe('failed');
    expect(deliveryRows[0].attempts).toBe(1);
    const initialRowId = deliveryRows[0].id;

    // Second attempt succeeds
    mockFcmSend.mockResolvedValueOnce('fcm-fixed-999');

    const result = await provider.sendPush({
      token: 'dev-token-1',
      title: 'Order status',
      body: 'Order is on the way',
      correlationId: correlationKey,
    });

    expect(result.providerMessageId).toBe('fcm-fixed-999');
    expect(result.status).toBe('sent');
    expect(deliveryRows.length).toBe(1);
    expect(deliveryRows[0].id).toBe(initialRowId);
    expect(deliveryRows[0].status).toBe('sent');
    expect(deliveryRows[0].provider_message_id).toBe('fcm-fixed-999');
    expect(deliveryRows[0].last_error).toBeNull();
    expect(deliveryRows[0].attempts).toBe(2);
  });

  test('Active duplicate regression: existing queued or sent row suppresses duplicate send', async () => {
    deliveryRows.push({
      id: 'row-active-1',
      correlation_key: 'active-key-1',
      status: 'queued',
      provider: 'resend',
      provider_message_id: 're_existing_active',
      attempts: 1,
      last_error: null,
      created_at: new Date().toISOString(),
    });

    const result = await provider.sendEmail({
      to: 'customer@example.com',
      subject: 'Hello',
      text: 'Body',
      correlationId: 'active-key-1',
    });

    expect(result.duplicate).toBe(true);
    expect(result.providerMessageId).toBe('re_existing_active');
    expect(result.status).toBe('queued');
    expect(mockResendSend).not.toHaveBeenCalled();
    expect(deliveryRows.length).toBe(1);
  });

  test('Insert race: 409 conflict during first insert reconciles with concurrently created failed row', async () => {
    const correlationKey = 'race-409-key';
    mockTwilioCreate.mockResolvedValueOnce({ sid: 'SM-race-win', status: 'queued' });

    // Simulate concurrent thread having just inserted a failed row before our insert
    db.insert.mockImplementationOnce(async (table, data) => {
      deliveryRows.push({
        id: 'row-raced-failed',
        correlation_key: correlationKey,
        status: 'failed',
        provider: 'twilio',
        provider_message_id: null,
        attempts: 1,
        last_error: 'concurrent failure',
        created_at: new Date().toISOString(),
      });
      const err = new Error('duplicate key value violates unique constraint');
      err.status = 409;
      err.statusCode = 409;
      throw err;
    });

    const result = await provider.sendSms({
      to: '+15550000003',
      body: 'Race test',
      correlationId: correlationKey,
    });

    expect(result.providerMessageId).toBe('SM-race-win');
    expect(result.status).toBe('queued');

    // The raced failed row must be reconciled to our winning send!
    expect(deliveryRows.length).toBe(1);
    expect(deliveryRows[0].id).toBe('row-raced-failed');
    expect(deliveryRows[0].status).toBe('queued');
    expect(deliveryRows[0].provider_message_id).toBe('SM-race-win');
    expect(deliveryRows[0].last_error).toBeNull();
  });

  describe('Phase 7B.1 — Provider retry concurrency hardening & crash-safe retry leases', () => {
    test('A. Concurrent failed retry: two workers racing on failed delivery call provider once and maintain 1 row', async () => {
      const correlationKey = 'concurrent-failed-key-1';
      deliveryRows.push({
        id: 'row-failed-1',
        correlation_key: correlationKey,
        channel: 'email',
        provider: 'resend',
        status: 'failed',
        attempts: 1,
        last_error: 'initial error',
        created_at: new Date().toISOString(),
      });

      mockResendSend.mockResolvedValue({ data: { id: 're_race_success' }, error: null });

      const [resA, resB] = await Promise.all([
        provider.sendEmail({ to: 'user@example.com', subject: 'A', text: 'T', correlationId: correlationKey }),
        provider.sendEmail({ to: 'user@example.com', subject: 'A', text: 'T', correlationId: correlationKey }),
      ]);

      expect(mockResendSend).toHaveBeenCalledTimes(1);
      expect(deliveryRows.length).toBe(1);
      expect(deliveryRows[0].id).toBe('row-failed-1');
      expect(deliveryRows[0].status).toBe('queued');
      expect(deliveryRows[0].provider_message_id).toBe('re_race_success');
      expect(deliveryRows[0].attempts).toBe(2);
      expect(deliveryRows[0].last_error).toBeNull();
      expect(deliveryRows[0].retry_started_at).toBeNull();
      expect(deliveryRows[0].retry_lease_expires_at).toBeNull();
      expect(deliveryRows[0].retry_owner).toBeNull();

      const winner = resA.duplicate ? resB : resA;
      const loser = resA.duplicate ? resA : resB;
      expect(winner.providerMessageId).toBe('re_race_success');
      expect(loser.duplicate).toBe(true);
    });

    test('B. Losing worker: second worker detects active retry and suppresses provider call', async () => {
      const correlationKey = 'losing-worker-key';
      deliveryRows.push({
        id: 'row-failed-b',
        correlation_key: correlationKey,
        channel: 'sms',
        provider: 'twilio',
        status: 'failed',
        attempts: 1,
        last_error: 'fail 1',
        created_at: new Date().toISOString(),
      });

      const claim1 = await provider.claimDeliveryOwnership({
        channel: 'sms',
        correlationKey,
        provider: 'twilio',
        workerId: 'worker-1',
        leaseMs: 60000,
      });
      expect(claim1.claimed).toBe(true);
      expect(deliveryRows[0].status).toBe('retrying');

      const claim2 = await provider.claimDeliveryOwnership({
        channel: 'sms',
        correlationKey,
        provider: 'twilio',
        workerId: 'worker-2',
        leaseMs: 60000,
      });
      expect(claim2.claimed).toBe(false);
      expect(claim2.reason).toBe('active_lease');

      const result = await provider.sendSms({
        to: '+15551234567',
        body: 'hello',
        correlationId: correlationKey,
      });
      expect(mockTwilioCreate).not.toHaveBeenCalled();
      expect(result.duplicate).toBe(true);
      expect(result.status).toBe('retrying');
    });

    test('C. Active lease protection: status=retrying with valid lease is not stolen', async () => {
      const correlationKey = 'active-lease-key';
      deliveryRows.push({
        id: 'row-retrying-c',
        correlation_key: correlationKey,
        channel: 'sms',
        provider: 'twilio',
        status: 'retrying',
        retry_started_at: new Date().toISOString(),
        retry_lease_expires_at: new Date(Date.now() + 30000).toISOString(),
        retry_owner: 'worker-holding-lease',
        attempts: 1,
        created_at: new Date().toISOString(),
      });

      const result = await provider.sendSms({
        to: '+15551234567',
        body: 'code',
        correlationId: correlationKey,
      });

      expect(mockTwilioCreate).not.toHaveBeenCalled();
      expect(result.duplicate).toBe(true);
      expect(result.status).toBe('retrying');
      expect(deliveryRows[0].retry_owner).toBe('worker-holding-lease');
    });

    test('D. Expired lease recovery: status=retrying with expired lease can be reclaimed and sent', async () => {
      const correlationKey = 'expired-lease-key';
      const past = new Date(Date.now() - 5000).toISOString();
      deliveryRows.push({
        id: 'row-expired-d',
        correlation_key: correlationKey,
        channel: 'sms',
        provider: 'twilio',
        status: 'retrying',
        retry_started_at: new Date(Date.now() - 65000).toISOString(),
        retry_lease_expires_at: past,
        retry_owner: 'dead-worker-pid-999',
        attempts: 1,
        created_at: new Date(Date.now() - 65000).toISOString(),
      });

      mockTwilioCreate.mockResolvedValueOnce({ sid: 'SM-reclaimed-success', status: 'queued' });

      const result = await provider.sendSms({
        to: '+15551234567',
        body: 'recovered sms',
        correlationId: correlationKey,
      });

      expect(mockTwilioCreate).toHaveBeenCalledTimes(1);
      expect(result.providerMessageId).toBe('SM-reclaimed-success');
      expect(deliveryRows[0].status).toBe('queued');
      expect(deliveryRows[0].provider_message_id).toBe('SM-reclaimed-success');
      expect(deliveryRows[0].retry_started_at).toBeNull();
      expect(deliveryRows[0].retry_lease_expires_at).toBeNull();
      expect(deliveryRows[0].retry_owner).toBeNull();
    });

    test('E. Concurrent stale-lease recovery: two workers racing on expired lease invoke provider once', async () => {
      const correlationKey = 'concurrent-stale-lease-key';
      const past = new Date(Date.now() - 10000).toISOString();
      deliveryRows.push({
        id: 'row-stale-e',
        correlation_key: correlationKey,
        channel: 'email',
        provider: 'resend',
        status: 'retrying',
        retry_started_at: new Date(Date.now() - 70000).toISOString(),
        retry_lease_expires_at: past,
        retry_owner: 'crashed-worker',
        attempts: 1,
        created_at: new Date(Date.now() - 70000).toISOString(),
      });

      mockResendSend.mockResolvedValue({ data: { id: 're_recovered_once' }, error: null });

      const [res1, res2] = await Promise.all([
        provider.sendEmail({ to: 'u@example.com', subject: 's', text: 't', correlationId: correlationKey }),
        provider.sendEmail({ to: 'u@example.com', subject: 's', text: 't', correlationId: correlationKey }),
      ]);

      expect(mockResendSend).toHaveBeenCalledTimes(1);
      expect(deliveryRows.length).toBe(1);
      expect(deliveryRows[0].status).toBe('queued');
      expect(deliveryRows[0].provider_message_id).toBe('re_recovered_once');
    });

    test('F. Provider failure releases claim: status=failed, lease cleared, subsequent retry succeeds', async () => {
      const correlationKey = 'failure-release-key';
      deliveryRows.push({
        id: 'row-f',
        correlation_key: correlationKey,
        channel: 'sms',
        provider: 'twilio',
        status: 'failed',
        attempts: 1,
        last_error: 'first err',
        created_at: new Date().toISOString(),
      });

      mockTwilioCreate.mockRejectedValueOnce(twilioError(50001, 'Internal Twilio Error'));

      await expect(
        provider.sendSms({ to: '+15550001111', body: 'msg', correlationId: correlationKey }),
      ).rejects.toMatchObject({ statusCode: expect.any(Number) });

      expect(deliveryRows[0].status).toBe('failed');
      expect(deliveryRows[0].retry_started_at).toBeNull();
      expect(deliveryRows[0].retry_lease_expires_at).toBeNull();
      expect(deliveryRows[0].retry_owner).toBeNull();
      expect(deliveryRows[0].attempts).toBe(2);

      mockTwilioCreate.mockResolvedValueOnce({ sid: 'SM-subsequent-win', status: 'queued' });
      const result = await provider.sendSms({ to: '+15550001111', body: 'msg', correlationId: correlationKey });

      expect(result.providerMessageId).toBe('SM-subsequent-win');
      expect(deliveryRows[0].status).toBe('queued');
      expect(deliveryRows[0].attempts).toBe(3);
    });

    test('G. Successful retry cleanup: status=sent/queued, last_error=null, lease fields cleared', async () => {
      const correlationKey = 'cleanup-key';
      deliveryRows.push({
        id: 'row-cleanup-g',
        correlation_key: correlationKey,
        channel: 'push',
        provider: 'fcm',
        status: 'failed',
        attempts: 2,
        last_error: 'prior error',
        created_at: new Date().toISOString(),
      });

      mockFcmSend.mockResolvedValueOnce('fcm-clean-id');

      const result = await provider.sendPush({
        token: 'device-token-g',
        title: 'Hello',
        body: 'Clean up',
        correlationId: correlationKey,
      });

      expect(result.providerMessageId).toBe('fcm-clean-id');
      expect(result.status).toBe('sent');
      expect(deliveryRows[0].status).toBe('sent');
      expect(deliveryRows[0].provider_message_id).toBe('fcm-clean-id');
      expect(deliveryRows[0].last_error).toBeNull();
      expect(deliveryRows[0].retry_started_at).toBeNull();
      expect(deliveryRows[0].retry_lease_expires_at).toBeNull();
      expect(deliveryRows[0].retry_owner).toBeNull();
      expect(deliveryRows[0].attempts).toBe(3);
    });

    test('H. Success cannot be downgraded: stale worker failure cannot overwrite sent state', async () => {
      const correlationKey = 'downgrade-guard-key';
      deliveryRows.push({
        id: 'row-h',
        correlation_key: correlationKey,
        channel: 'email',
        provider: 'resend',
        status: 'sent',
        provider_message_id: 're_already_sent',
        attempts: 1,
        created_at: new Date().toISOString(),
      });

      await provider.reconcileClaimOutcome({
        claim: { id: 'row-h', attempts: 1 },
        workerId: 'stale-worker-old',
        channel: 'email',
        correlationKey,
        provider: 'resend',
        status: 'failed',
        attempts: 1,
        lastError: 'late failure from timed-out attempt',
      });

      expect(deliveryRows[0].status).toBe('sent');
      expect(deliveryRows[0].provider_message_id).toBe('re_already_sent');
    });

    test('I. Initial-send concurrency: two simultaneous requests on unseen key invoke provider once', async () => {
      const correlationKey = 'brand-new-unseen-key';
      mockTwilioCreate.mockResolvedValue({ sid: 'SM-first-send-race', status: 'queued' });

      const [res1, res2] = await Promise.all([
        provider.sendSms({ to: '+15550009999', body: 'New code', correlationId: correlationKey }),
        provider.sendSms({ to: '+15550009999', body: 'New code', correlationId: correlationKey }),
      ]);

      expect(mockTwilioCreate).toHaveBeenCalledTimes(1);
      expect(deliveryRows.length).toBe(1);
      expect(deliveryRows[0].correlation_key).toBe(correlationKey);
      expect(deliveryRows[0].status).toBe('queued');
      expect(deliveryRows[0].provider_message_id).toBe('SM-first-send-race');

      const winner = res1.duplicate ? res2 : res1;
      const loser = res1.duplicate ? res1 : res2;
      expect(winner.providerMessageId).toBe('SM-first-send-race');
      expect(loser.duplicate).toBe(true);
    });

    test('J. Existing queued/sent duplicate suppression: never triggers provider call', async () => {
      const keyQueued = 'existing-queued-key';
      deliveryRows.push({
        id: 'row-j-queued',
        correlation_key: keyQueued,
        channel: 'email',
        provider: 'resend',
        provider_message_id: 're_existing_queued',
        status: 'queued',
        attempts: 1,
        created_at: new Date().toISOString(),
      });

      const resQueued = await provider.sendEmail({ to: 'a@example.com', subject: 's', text: 't', correlationId: keyQueued });
      expect(mockResendSend).not.toHaveBeenCalled();
      expect(resQueued.duplicate).toBe(true);
      expect(resQueued.status).toBe('queued');

      const keySent = 'existing-sent-key';
      deliveryRows.push({
        id: 'row-j-sent',
        correlation_key: keySent,
        channel: 'push',
        provider: 'fcm',
        provider_message_id: 'fcm_existing_sent',
        status: 'sent',
        attempts: 1,
        created_at: new Date().toISOString(),
      });

      const resSent = await provider.sendPush({ token: 'tok', title: 't', body: 'b', correlationId: keySent });
      expect(mockFcmSend).not.toHaveBeenCalled();
      expect(resSent.duplicate).toBe(true);
      expect(resSent.status).toBe('sent');
    });

    test('K. Provider-specific paths: Twilio, Resend, and FCM all route through atomic lease', async () => {
      mockResendSend.mockResolvedValueOnce({ data: { id: 're_k' }, error: null });
      await provider.sendEmail({ to: 'k@example.com', subject: 'k', text: 'k', correlationId: 'k-email' });
      expect(mockResendSend).toHaveBeenCalledTimes(1);
      expect(mockResendSend).toHaveBeenCalledWith(
        expect.objectContaining({
          from: expect.any(String),
          to: 'k@example.com',
          subject: 'k',
          headers: {
            'X-Entity-Ref-ID': 'k-email',
          },
        }),
        expect.objectContaining({
          idempotencyKey: 'k-email',
        }),
      );

      mockTwilioCreate.mockResolvedValueOnce({ sid: 'SM_k', status: 'queued' });
      await provider.sendSms({ to: '+15550001122', body: 'k', correlationId: 'k-sms' });
      expect(mockTwilioCreate).toHaveBeenCalledTimes(1);

      mockFcmSend.mockResolvedValueOnce('fcm_k');
      await provider.sendPush({ token: 'k-tok', title: 'k', body: 'k', correlationId: 'k-push' });
      expect(mockFcmSend).toHaveBeenCalledTimes(1);

      expect(deliveryRows.length).toBe(3);
      for (const row of deliveryRows) {
        expect(row.retry_started_at).toBeNull();
        expect(row.retry_lease_expires_at).toBeNull();
        expect(row.retry_owner).toBeNull();
      }
    });

    test('L. Resend native idempotency: same logical retry reuses exact same idempotencyKey across attempts', async () => {
      const correlationKey = 'resend-retry-stable-key';
      mockResendSend
        .mockResolvedValueOnce({ data: null, error: { message: 'Temporary error', statusCode: 500 } })
        .mockResolvedValueOnce({ data: { id: 're_retry_ok' }, error: null });

      // First attempt fails
      await expect(
        provider.sendEmail({ to: 'retry@example.com', subject: 'Receipt', text: 'Body', correlationId: correlationKey }),
      ).rejects.toMatchObject({ statusCode: expect.any(Number) });

      // Second attempt succeeds
      const res = await provider.sendEmail({
        to: 'retry@example.com',
        subject: 'Receipt',
        text: 'Body',
        correlationId: correlationKey,
      });

      expect(res.providerMessageId).toBe('re_retry_ok');
      expect(mockResendSend).toHaveBeenCalledTimes(2);

      const [firstPayload, firstOptions] = mockResendSend.mock.calls[0];
      const [secondPayload, secondOptions] = mockResendSend.mock.calls[1];

      expect(firstOptions.idempotencyKey).toBe(correlationKey);
      expect(secondOptions.idempotencyKey).toBe(correlationKey);
      expect(firstOptions.idempotencyKey).toBe(secondOptions.idempotencyKey);
      expect(firstPayload.to).toBe('retry@example.com');
      expect(secondPayload.to).toBe('retry@example.com');
    });

    test('M. Resend native idempotency: different deliveries pass different idempotencyKeys', async () => {
      mockResendSend
        .mockResolvedValueOnce({ data: { id: 're_diff_1' }, error: null })
        .mockResolvedValueOnce({ data: { id: 're_diff_2' }, error: null });

      await provider.sendEmail({ to: 'a@example.com', subject: 'A', text: 'A', correlationId: 'email-key-alpha' });
      await provider.sendEmail({ to: 'b@example.com', subject: 'B', text: 'B', correlationId: 'email-key-beta' });

      expect(mockResendSend).toHaveBeenCalledTimes(2);
      const [, optionsA] = mockResendSend.mock.calls[0];
      const [, optionsB] = mockResendSend.mock.calls[1];

      expect(optionsA.idempotencyKey).toBe('email-key-alpha');
      expect(optionsB.idempotencyKey).toBe('email-key-beta');
      expect(optionsA.idempotencyKey).not.toBe(optionsB.idempotencyKey);
    });
  });
});

