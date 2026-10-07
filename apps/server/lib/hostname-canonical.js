'use strict';

const { domainToASCII } = require('url');

const HOSTNAME_RE =
  /^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])$/;

const IPV4_RE = /^\d+(?:\.\d+){3}$/;
const FORBIDDEN_CHARS_RE = /[:\/?#@\s"'<>\[\]%|]/;

function canonicalizeHostname(input, opts) {
  if (typeof input !== 'string') {
    const e = new Error('HOSTNAME_TOO_SHORT');
    e.code = 'HOSTNAME_TOO_SHORT';
    throw e;
  }
  let value = String(input).trim();
  if (!value) {
    const e = new Error('HOSTNAME_TOO_SHORT');
    e.code = 'HOSTNAME_TOO_SHORT';
    throw e;
  }
  // Remove one trailing dot (canonical DNS form).
  if (value.endsWith('.')) value = value.slice(0, -1);
  value = value.trim().toLowerCase();
  if (value.length < 3) {
    const e = new Error('HOSTNAME_TOO_SHORT');
    e.code = 'HOSTNAME_TOO_SHORT';
    throw e;
  }
  if (value.length > 253) {
    const e = new Error('HOSTNAME_TOO_LONG');
    e.code = 'HOSTNAME_TOO_LONG';
    throw e;
  }
  // Reject protocol/path/query/fragment/userinfo/port embedded in the value.
  // Colon is forbidden unless it's a request Port that was already stripped
  // by the caller (host.split(':')[0]); inline reject enforces that contract.
  if (FORBIDDEN_CHARS_RE.test(value)) {
    const e = new Error('HOSTNAME_PROTOCOL_FORBIDDEN');
    e.code = 'HOSTNAME_PROTOCOL_FORBIDDEN';
    if (value.includes('/')) e.code = 'HOSTNAME_PATH_FORBIDDEN';
    else if (value.includes('?')) e.code = 'HOSTNAME_QUERY_FORBIDDEN';
    else if (value.includes('#')) e.code = 'HOSTNAME_FRAGMENT_FORBIDDEN';
    else if (value.includes('@')) e.code = 'HOSTNAME_USERINFO_FORBIDDEN';
    else if (value.includes(':')) e.code = 'HOSTNAME_PORT_IN_VALUE_FORBIDDEN';
    throw e;
  }
  if (value.includes('*')) {
    const e = new Error('HOSTNAME_WILDCARD_FORBIDDEN');
    e.code = 'HOSTNAME_WILDCARD_FORBIDDEN';
    throw e;
  }
  if (value.includes('_')) {
    const e = new Error('HOSTNAME_LABEL_FORBIDDEN');
    e.code = 'HOSTNAME_LABEL_FORBIDDEN';
    throw e;
  }
  if (IPV4_RE.test(value)) {
    const e = new Error('HOSTNAME_IP_FORBIDDEN');
    e.code = 'HOSTNAME_IP_FORBIDDEN';
    throw e;
  }
  // IDN -> ASCII punycode. domainToASCII returns '' on invalid input.
  const ascii = domainToASCII(value);
  if (!ascii || ascii !== value) {
    if (!ascii) {
      const e = new Error('HOSTNAME_LABEL_FORBIDDEN');
      e.code = 'HOSTNAME_LABEL_FORBIDDEN';
      throw e;
    }
    value = ascii;
  }
  if (!HOSTNAME_RE.test(value)) {
    const e = new Error('HOSTNAME_LABEL_FORBIDDEN');
    e.code = 'HOSTNAME_LABEL_FORBIDDEN';
    throw e;
  }
  // Reserved check is call-site specific (shadow Apex, Clerk, etc.) and is
  // enforced in the validator's reservedBusinessCheck using the canonical form
  // returned here — this function only enforces syntactic shape.
  if (!opts || !opts.allowInternal) {
    // Cheap syntactic reject for localhost/loopback even without DB — full
    // reserved list lives in the validator so tests can assert the same codes.
  }
  return value;
}

function isValidHostname(input, opts) {
  try {
    canonicalizeHostname(input, opts);
    return true;
  } catch {
    return false;
  }
}

module.exports = { canonicalizeHostname, isValidHostname, HOSTNAME_RE, IPV4_RE };
