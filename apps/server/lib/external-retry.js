'use strict';

const DEFAULT = {
  retries: 3,
  minTimeout: 400,
  factor: 2,
  maxTimeout: 8000,
};

/**
 * Whether an HTTP-style provider error should be retried.
 * Retries 429/5xx and unknown/network failures; skips other 4xx.
 */
function shouldRetryHttpStatus(error) {
  const status =
    error?.status ??
    error?.statusCode ??
    error?.code; // some SDKs put numeric HTTP code in `code`
  if (typeof status !== 'number') return true;
  if (status === 429) return true;
  if (status >= 400 && status < 500) return false;
  if (status >= 500) return true;
  return true;
}

class AbortError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AbortError';
  }
}

let testRetriesEnabled = false;

function setTestModeRetries(enabled) {
  testRetriesEnabled = Boolean(enabled);
}

/**
 * Exponential backoff for flaky outbound calls (Resend, Twilio, etc.).
 * Native CommonJS implementation: removes runtime ESM/CJS loader crashes.
 *
 * @param {(attempt: number) => Promise<unknown>} fn
 * @param {object} [options]
 */
async function retryExternal(fn, options = {}) {
  // In Jest test suite, preserve repo convention (single attempt, no backoff)
  // unless explicitly requested by unit tests testing the retry loop itself.
  if (process.env.NODE_ENV === 'test' && !testRetriesEnabled && !options.forceRetryInTest) {
    return fn(1);
  }

  const retries = typeof options.retries === 'number' ? options.retries : DEFAULT.retries;
  const minTimeout = typeof options.minTimeout === 'number' ? options.minTimeout : DEFAULT.minTimeout;
  const factor = typeof options.factor === 'number' ? options.factor : DEFAULT.factor;
  const maxTimeout = typeof options.maxTimeout === 'number' ? options.maxTimeout : DEFAULT.maxTimeout;
  const userShouldRetry = options.shouldRetry;
  const onFailedAttempt = options.onFailedAttempt;

  let attempt = 0;
  while (true) {
    attempt++;
    try {
      return await fn(attempt);
    } catch (err) {
      if (err instanceof AbortError) {
        throw err;
      }
      const retriesLeft = retries - (attempt - 1);
      if (retriesLeft <= 0) {
        throw err;
      }

      // Context shape matches both p-retry convention and custom extractors
      const ctx = {
        error: err,
        attemptNumber: attempt,
        retriesLeft: retriesLeft - 1,
      };
      if (err && typeof err === 'object') {
        err.attemptNumber = attempt;
        err.retriesLeft = retriesLeft - 1;
      }

      let allowRetry;
      if (typeof userShouldRetry === 'function') {
        allowRetry = await userShouldRetry(ctx);
      } else {
        allowRetry = shouldRetryHttpStatus(err);
      }

      if (!allowRetry) {
        throw err;
      }

      if (typeof onFailedAttempt === 'function') {
        await onFailedAttempt(ctx);
      }

      const delay = Math.min(minTimeout * Math.pow(factor, attempt - 1), maxTimeout);
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
}

module.exports = { retryExternal, shouldRetryHttpStatus, AbortError, DEFAULT, setTestModeRetries };
