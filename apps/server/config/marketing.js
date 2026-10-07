'use strict';

function optional(key, fallback = '') {
  return String(process.env[key] || fallback).trim();
}

const marketingConfig = {
  ayrshare: {
    apiKey: optional('AYRSHARE_API_KEY'),
    apiBaseUrl: optional('AYRSHARE_API_BASE_URL', 'https://api.ayrshare.com/api').replace(/\/$/, ''),
    domain: optional('AYRSHARE_SSO_DOMAIN'),
    privateKey: optional('AYRSHARE_SSO_PRIVATE_KEY').replace(/\\n/g, '\n'),
    redirectUrl: optional('AYRSHARE_CONNECT_REDIRECT_URL'),
    credentialEncryptionKey: optional('MARKETING_CREDENTIAL_ENCRYPTION_KEY'),
    get enabled() {
      return Boolean(this.apiKey && this.credentialEncryptionKey);
    },
    get socialLinkingEnabled() {
      return Boolean(this.enabled && this.domain && this.privateKey);
    },
  },
};

module.exports = marketingConfig;