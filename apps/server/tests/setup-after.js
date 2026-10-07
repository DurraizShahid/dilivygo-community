'use strict';

/**
 * Runs AFTER the Jest test framework has been installed, so `beforeEach` is
 * available. Used to flush the in-process LRU caches between tests so
 * Supabase mocks aren't short-circuited by a cached entry from a
 * neighbouring test file.
 */

beforeEach(() => {
  try {
    const cache = require('../lib/cache');
    cache.__resetForTests();
  } catch {
    /* module might not exist during early bootstrap */
  }
});
