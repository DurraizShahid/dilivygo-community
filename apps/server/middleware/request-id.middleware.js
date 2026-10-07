'use strict';

const hyperid = require('hyperid');

// Module-scoped instance: URL-safe + fixed length keeps access logs tidy.
// hyperid seeds from crypto and generates IDs ~10x faster than uuid.v4().
const nextId = hyperid({ urlSafe: true, fixedLength: true });

// Only honor upstream-supplied IDs that look safe. Rejects log-injection,
// header-splitting, and over-long values from untrusted proxies.
const SAFE_INCOMING = /^[\w.-]{1,128}$/;

function requestId(req, res, next) {
  const incoming = req.get('X-Request-Id');
  const id = incoming && SAFE_INCOMING.test(incoming) ? incoming : nextId();
  req.id = id;
  res.setHeader('X-Request-Id', id);
  next();
}

module.exports = { requestId };
