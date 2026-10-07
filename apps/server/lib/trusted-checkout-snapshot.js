'use strict';

// Symbols cannot be supplied through JSON request bodies. They distinguish
// server-validated checkout state from lookalike client objects without adding
// another signing secret to rotate around in-flight payments.
const TRUSTED_CHECKOUT_LINE = Symbol('dilivygo.trustedCheckoutLine');
const TRUSTED_CUTLERY_SNAPSHOT = Symbol('dilivygo.trustedCutlerySnapshot');
const CUTLERY_SNAPSHOT_VERSION = 1;

function defineTrust(obj, symbol) {
  if (!obj || typeof obj !== 'object') return obj;
  Object.defineProperty(obj, symbol, {
    configurable: false,
    enumerable: false,
    writable: false,
    value: true,
  });
  return obj;
}

function createTrustedCutlerySnapshot({ requested, feeCents }) {
  const fee = Math.max(0, Math.floor(Number(feeCents) || 0));
  return defineTrust({
    version: CUTLERY_SNAPSHOT_VERSION,
    requested: Boolean(requested),
    feeCents: fee,
  }, TRUSTED_CUTLERY_SNAPSHOT);
}

function isPersistedCutlerySnapshot(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Number(value.version) === CUTLERY_SNAPSHOT_VERSION
    && typeof value.requested === 'boolean'
    && Number.isInteger(Number(value.feeCents))
    && Number(value.feeCents) >= 0;
}

function isTrustedCutlerySnapshot(value) {
  return Boolean(
    isPersistedCutlerySnapshot(value)
    && value[TRUSTED_CUTLERY_SNAPSHOT] === true,
  );
}

function markPersistedCutlerySnapshotTrusted(value) {
  if (!isPersistedCutlerySnapshot(value)) return value;
  return defineTrust(value, TRUSTED_CUTLERY_SNAPSHOT);
}

function markCheckoutBatchTrusted(batch) {
  if (!batch || typeof batch !== 'object') return batch;
  for (const group of batch.groups || []) {
    for (const item of group?.items || []) {
      if (!item || typeof item !== 'object') continue;
      defineTrust(item, TRUSTED_CHECKOUT_LINE);
    }
    if (group && typeof group === 'object' && isPersistedCutlerySnapshot(group.wantsCutlery)) {
      markPersistedCutlerySnapshotTrusted(group.wantsCutlery);
    }
  }
  return batch;
}

function isTrustedCheckoutLine(item) {
  return Boolean(item && typeof item === 'object' && item[TRUSTED_CHECKOUT_LINE] === true);
}

module.exports = {
  TRUSTED_CHECKOUT_LINE,
  TRUSTED_CUTLERY_SNAPSHOT,
  CUTLERY_SNAPSHOT_VERSION,
  createTrustedCutlerySnapshot,
  isPersistedCutlerySnapshot,
  isTrustedCutlerySnapshot,
  markPersistedCutlerySnapshotTrusted,
  markCheckoutBatchTrusted,
  isTrustedCheckoutLine,
};
