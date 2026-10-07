'use strict';

jest.mock('../lib/redis-rate-limit-store', () => ({
  createRedisRateLimitStore: jest.fn(() => null),
}));

const { authenticatedActorKey } = require('../middleware/rate-limit.middleware');

describe('sensitive rate-limit identity keys', () => {
  test('keys a customer payment actor within the organization', () => {
    const req = {
      ip: '203.0.113.5',
      organizationId: 'org-a',
      projectRef: 'workspace-a',
      customer: { id: 'customer-1' },
    };
    expect(authenticatedActorKey(req)).toBe('org-a:customer-1');
  });

  test('keys staff payment actor within the workspace when no org scope is attached', () => {
    const req = {
      ip: '203.0.113.5',
      projectRef: 'workspace-a',
      user: { id: 'staff-1' },
    };
    expect(authenticatedActorKey(req)).toBe('workspace-a:staff-1');
  });

  test('falls back to a network key only when no authenticated actor exists', () => {
    const req = { ip: '203.0.113.5' };
    expect(authenticatedActorKey(req)).toMatch(/^ip:/);
  });
});
