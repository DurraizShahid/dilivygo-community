'use strict';

const { DEFAULT_CURRENCY } = require('./currency');

/**
 * Format integer cents as a localized currency string (Node Intl).
 * @param {number} cents
 * @param {string} [currencyCode] ISO 4217, any case
 */
function formatMoneyCents(cents, currencyCode = DEFAULT_CURRENCY) {
  const code = String(currencyCode || DEFAULT_CURRENCY)
    .trim()
    .toUpperCase()
    .slice(0, 3);
  if (code.length !== 3) {
    return `${(Number(cents) / 100).toFixed(2)} ${String(currencyCode || '').toUpperCase()}`;
  }
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency: code }).format(Number(cents) / 100);
  } catch {
    return `${(Number(cents) / 100).toFixed(2)} ${code}`;
  }
}

module.exports = { formatMoneyCents };
