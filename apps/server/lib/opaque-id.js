'use strict';

const { nanoid, customAlphabet } = require('nanoid');

/**
 * URL-safe opaque identifier for values that are not stored in Postgres `uuid`
 * columns (Redis keys, in-memory registries, upload object keys, idempotency
 * suffixes, distributed lock tokens).
 */
function opaqueId() {
  return nanoid();
}

/** Lowercase hex (12 chars), safe for `project_ref` / `public_ref` slug patterns. */
const _hex12 = customAlphabet('0123456789abcdef', 12);

function orgSlugFallback() {
  return `org-${_hex12()}`;
}

module.exports = { opaqueId, orgSlugFallback };
