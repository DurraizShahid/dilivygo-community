'use strict';

const { retryExternal, AbortError, setTestModeRetries } = require('../lib/external-retry');

describe('lib/external-retry', () => {
  beforeAll(() => {
    setTestModeRetries(true);
  });

  afterAll(() => {
    setTestModeRetries(false);
  });

  test('resolves immediately when operation succeeds on first try', async () => {
    let attempts = 0;
    const res = await retryExternal(async (attempt) => {
      attempts++;
      return `success-${attempt}`;
    });
    expect(res).toBe('success-1');
    expect(attempts).toBe(1);
  });

  test('retries on retryable errors and succeeds after failure', async () => {
    let attempts = 0;
    const res = await retryExternal(
      async (attempt) => {
        attempts++;
        if (attempt < 3) {
          const err = new Error('Gateway Timeout');
          err.statusCode = 504;
          throw err;
        }
        return 'recovered';
      },
      { retries: 3, minTimeout: 1, factor: 1, maxTimeout: 10 }
    );
    expect(res).toBe('recovered');
    expect(attempts).toBe(3);
  });

  test('fails immediately on permanent 4xx errors', async () => {
    let attempts = 0;
    let thrownError;
    try {
      await retryExternal(
        async () => {
          attempts++;
          const err = new Error('Bad Request');
          err.statusCode = 400;
          throw err;
        },
        { retries: 3, minTimeout: 1 }
      );
    } catch (e) {
      thrownError = e;
    }
    expect(thrownError).toBeDefined();
    expect(thrownError.statusCode).toBe(400);
    expect(attempts).toBe(1);
  });

  test('fails immediately on AbortError without retry', async () => {
    let attempts = 0;
    let thrownError;
    try {
      await retryExternal(
        async () => {
          attempts++;
          throw new AbortError('Manual abort');
        },
        { retries: 3, minTimeout: 1 }
      );
    } catch (e) {
      thrownError = e;
    }
    expect(thrownError).toBeDefined();
    expect(thrownError.name).toBe('AbortError');
    expect(attempts).toBe(1);
  });

  test('calls onFailedAttempt with attempt metadata', async () => {
    const failedAttempts = [];
    try {
      await retryExternal(
        async (attempt) => {
          const err = new Error(`fail-${attempt}`);
          err.statusCode = 500;
          throw err;
        },
        {
          retries: 2,
          minTimeout: 1,
          onFailedAttempt: (ctx) => {
            failedAttempts.push({
              attemptNumber: ctx.attemptNumber,
              retriesLeft: ctx.retriesLeft,
              message: ctx.error.message,
            });
          },
        }
      );
    } catch (e) {
      expect(e.message).toBe('fail-3');
    }
    expect(failedAttempts).toEqual([
      { attemptNumber: 1, retriesLeft: 1, message: 'fail-1' },
      { attemptNumber: 2, retriesLeft: 0, message: 'fail-2' },
    ]);
  });
});
