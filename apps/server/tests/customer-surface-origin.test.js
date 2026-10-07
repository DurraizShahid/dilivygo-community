'use strict';

const { originHostLooksLikeCustomerSurface } = require('../lib/customer-surface-origin');

describe('originHostLooksLikeCustomerSurface', () => {
  it('matches {slug}.customer.{apex} when apex is set', () => {
    expect(originHostLooksLikeCustomerSurface('acme.customer.dilivygo.com', 'dilivygo.com')).toBe(true);
    expect(originHostLooksLikeCustomerSurface('customer.dilivygo.com', 'dilivygo.com')).toBe(false);
    expect(originHostLooksLikeCustomerSurface('acme.vendor.dilivygo.com', 'dilivygo.com')).toBe(false);
  });

  it('matches *.customer.* when apex is empty (dev)', () => {
    expect(originHostLooksLikeCustomerSurface('brand-a.customer.test', '')).toBe(true);
    expect(originHostLooksLikeCustomerSurface('vendor.example.com', '')).toBe(false);
  });
});
