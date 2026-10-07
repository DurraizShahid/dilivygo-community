'use strict';

/**
 * Host-header injection harness for domain forwarding (Prompt 14).
 *
 * Tests run in NODE_ENV=test where `config.trustProxyHops` is 0, so the only
 * trusted Host input is a verbatim `Host:` header. These helpers build that
 * header and render `/etc/hosts` snippets for manual `.test` simulation.
 *
 * Hosts default to the `test` apex so legit local DNS never intercepts:
 *   shop.customer.test.   -> customer storefront (org-scoped)
 *   riders.rider.test.    -> rider app (org-scoped)
 *   vendor.vendor.test.   -> vendor dashboard (workspace-scoped)
 *   pos.pos.test.         -> POS (workspace-scoped)
 */

const TEST_APEX = 'test';
const TEST_DNS_IP = '127.0.0.1';

/** `hostFor('shop', 'customer', 'test')` -> `shop.customer.test`. */
function hostFor(slug, surface, apex = TEST_APEX) {
  return `${slug}.${surface}.${apex}`;
}

/**
 * Render an `/etc/hosts` block that routes test hosts to the local backend.
 *
 * @param {Array<string|{slug: string, surface: string}>} entries
 * @param {object} [opts]
 * @param {string} [opts.ip]            Target IP (default TEST_DNS_IP).
 * @param {string} [opts.apex]          Apex suffix (default TEST_APEX).
 * @param {(host: string) => string} [opts.hostnameHook] Override per-host render.
 */
function etcHostsSnippet(entries, opts = {}) {
  const { ip = TEST_DNS_IP, apex = TEST_APEX, hostnameHook } = opts;
  const lines = ['# Dilivygo local hostname harness (.test is never a real TLD)'];
  for (const entry of entries) {
    const host = typeof entry === 'string' ? entry : hostFor(entry.slug, entry.surface, apex);
    lines.push(hostnameHook ? `${ip} ${hostnameHook(host)}` : `${ip} ${host}`);
  }
  return lines.join('\n');
}

/**
 * Return a supertest request bound to a custom Host header:
 *
 *   await hostRequest(createTestApp().app, 'shop.customer.test')
 *     .get('/api/...')
 *     .expect(200);
 */
function hostRequest(app, host) {
  const request = require('supertest');
  const base = request(app);
  return new Proxy(
    {},
    {
      get(_t, method) {
        if (typeof method !== 'string') return undefined;
        return (url, ...rest) => base[method](url, ...rest).set('Host', host);
      },
    },
  );
}

module.exports = { TEST_APEX, TEST_DNS_IP, hostFor, etcHostsSnippet, hostRequest };