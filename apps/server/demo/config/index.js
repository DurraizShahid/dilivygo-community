'use strict';

const optional = (key, fallback = undefined) => process.env[key] || fallback;

const DEMO_ENVIRONMENT = optional('DEMO_ENVIRONMENT', 'false').toLowerCase() === 'true';
const DEMO_SEED = optional('DEMO_SEED', '2026');
const DEMO_SIZE = optional('DEMO_SIZE', 'full');
const DEMO_CLERK_USER_EMAIL = optional('DEMO_CLERK_USER_EMAIL', '');
const DEMO_CLERK_USER_ID = optional('DEMO_CLERK_USER_ID', '');
const DEMO_CLERK_ORG_ID = optional('DEMO_CLERK_ORG_ID', '');

function isDemoEnvironment() {
  return DEMO_ENVIRONMENT;
}

function isFullSize() {
  return DEMO_SIZE === 'full';
}

function getSeed() {
  return parseInt(DEMO_SEED, 10) || 2026;
}

function requireDemoEnvironment() {
  if (!DEMO_ENVIRONMENT) {
    throw new Error(
      'DEMO_ENVIRONMENT must be set to "true" to perform this operation. ' +
      'This safeguard prevents accidental production modifications.'
    );
  }
}

module.exports = {
  DEMO_ENVIRONMENT,
  DEMO_SEED,
  DEMO_SIZE,
  DEMO_CLERK_USER_EMAIL,
  DEMO_CLERK_USER_ID,
  DEMO_CLERK_ORG_ID,
  isDemoEnvironment,
  isFullSize,
  getSeed,
  requireDemoEnvironment,
};
