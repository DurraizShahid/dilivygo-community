'use strict';

/**
 * Transport-level failure reporting for the Supabase REST layer.
 *
 * Regression cover for the incident where a local Supabase stack that had not
 * finished booting surfaced as an opaque `TypeError: fetch failed` HTTP 500.
 * undici hides the actionable reason in `error.cause`, so the wrapper must
 * unwrap it, log the real cause, and report a retryable 503 instead of an
 * indistinguishable generic 500.
 *
 * No network: `global.fetch` is stubbed.
 */

const { isTransientFetchError, networkErrorCode } = require('../lib/transient-network');

/**
 * Reproduce undici's shape: `TypeError: fetch failed` wrapping a cause that
 * carries the real syscall code (and, notably, a plain `Error` name).
 */
function undiciFetchFailure(code, message) {
  const err = new TypeError('fetch failed');
  err.cause = Object.assign(new Error(message), { code });
  return err;
}

describe('transient-network classification', () => {
  test('unwraps undici cause codes', () => {
    for (const code of ['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT']) {
      expect(isTransientFetchError(undiciFetchFailure(code, `connect ${code}`))).toBe(true);
    }
  });

  test('reports the root cause code, not the wrapper type', () => {
    expect(networkErrorCode(undiciFetchFailure('ECONNREFUSED', 'connect ECONNREFUSED 127.0.0.1:54321')))
      .toBe('ECONNREFUSED');
  });

  test('does not classify application errors as transient', () => {
    expect(isTransientFetchError(new Error('duplicate key value violates unique constraint'))).toBe(false);
    expect(isTransientFetchError(null)).toBe(false);
  });
});

describe('supabaseFetch transport failures', () => {
  const originalFetch = global.fetch;
  let logged;
  let errorLogger;

  beforeEach(() => {
    logged = [];
    jest.resetModules();
    const logger = require('../lib/logger');
    errorLogger = jest.spyOn(logger, 'error').mockImplementation((msg, meta) => {
      logged.push({ msg, meta });
    });
    jest.spyOn(logger, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    errorLogger.mockRestore();
    global.fetch = originalFetch;
  });

  test('turns a refused connection into a retryable 503 with the real cause', async () => {
    global.fetch = jest.fn().mockRejectedValue(
      undiciFetchFailure('ECONNREFUSED', 'connect ECONNREFUSED 127.0.0.1:54321'),
    );

    const { supabaseFetch, SupabaseError } = require('../lib/supabase');

    await expect(supabaseFetch('/rest/v1/organization_members?limit=1')).rejects.toMatchObject({
      name: 'SupabaseError',
      statusCode: 503,
      code: 'SUPABASE_UNAVAILABLE',
      isOperational: true,
      transient: true,
    });

    await expect(supabaseFetch('/rest/v1/organization_members?limit=1')).rejects.toBeInstanceOf(
      SupabaseError,
    );

    const transport = logged.find((entry) => entry.msg === 'Supabase fetch transport error');
    expect(transport).toBeDefined();
    expect(transport.meta.reason).toBe('ECONNREFUSED');
    expect(transport.meta.transient).toBe(true);
  });

  test('never logs PostgREST filter values (PII)', async () => {
    global.fetch = jest.fn().mockRejectedValue(
      undiciFetchFailure('ECONNREFUSED', 'connect ECONNREFUSED 127.0.0.1:54321'),
    );

    const { supabaseFetch } = require('../lib/supabase');

    const phone = '+447700900123';
    await expect(
      supabaseFetch(`/rest/v1/customers?phone=eq.${encodeURIComponent(phone)}`),
    ).rejects.toThrow();

    const transport = logged.find((entry) => entry.msg === 'Supabase fetch transport error');
    expect(transport).toBeDefined();
    expect(JSON.stringify(transport.meta)).not.toContain(phone);
    expect(transport.meta.target).toContain('rest/v1/customers');
  });

  test('still surfaces non-2xx Supabase responses as before', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 409,
      statusText: 'Conflict',
      text: async () => 'duplicate key',
    });

    const { supabaseFetch } = require('../lib/supabase');

    await expect(supabaseFetch('/rest/v1/x')).rejects.toMatchObject({
      name: 'SupabaseError',
      statusCode: 409,
    });
  });
});
