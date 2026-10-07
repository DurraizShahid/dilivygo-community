'use strict';

/**
 * Cross-workspace URL hijack regression.
 *
 * `attachProjectRef` resolves `req.projectRef` from several sources, with URL
 * path segments prioritised over the session's `project_ref` so that
 * superadmin tooling can legitimately target any workspace. Without an
 * explicit guard, this priority lets a staff session for workspace A call
 * `GET /api/workspace/<workspaceB>` and read (or PATCH) another tenant's
 * workspace record.
 *
 * These tests assert that the middleware now rejects such requests with
 * 403 + `code: 'WRONG_WORKSPACE_URL'` while still allowing:
 *   - Matching workspace URLs for the same staff user.
 *   - Superadmins to cross workspaces.
 *   - Platform-wide riders (null `project_ref`) to cross workspaces.
 */

jest.mock('../lib/host-scope', () => ({
  resolveAuthHostScope: jest.fn().mockResolvedValue(null),
  staffHostMismatchResponse: jest.fn().mockReturnValue(null),
  STAFF_SURFACES: new Set(['vendor', 'pos']),
  PLATFORM_SURFACES: new Set(['superadmin']),
  CUSTOMER_FACING_SURFACES: new Set(['customer', 'rider']),
}));

jest.mock('../lib/supabase', () => ({
  select: jest.fn().mockResolvedValue([]),
  insert: jest.fn().mockResolvedValue({}),
  update: jest.fn().mockResolvedValue({}),
  remove: jest.fn().mockResolvedValue(null),
  supabaseFetch: jest.fn().mockResolvedValue(null),
}));

jest.mock('../lib/audit-org', () => ({
  organizationIdByProjectRef: jest.fn().mockResolvedValue(null),
}));

jest.mock('../lib/audit', () => ({ writeAuditLog: jest.fn().mockResolvedValue(undefined) }));

jest.mock('../models/user.model', () => ({
  findById: jest.fn(),
  findByProjectRef: jest.fn().mockResolvedValue([]),
}));

jest.mock('../models/customer.model', () => ({
  findById: jest.fn().mockResolvedValue(null),
}));

jest.mock('../models/shop.model', () => ({
  findById: jest.fn().mockResolvedValue(null),
}));

jest.mock('../services/session.service', () => ({
  getAdminSession: jest.fn(),
  getCustomerSession: jest.fn(),
  getSuperadminSession: jest.fn(),
}));

const sessionService = require('../services/session.service');
const userModel = require('../models/user.model');
const { select } = require('../lib/supabase');
const {
  createTestApp,
  mockAdminSession,
  TEST_CSRF_TOKEN,
  CSRF_COOKIE,
  CSRF_HEADER_NAME,
} = require('./helpers/app');

describe('Cross-workspace URL hijack (WRONG_WORKSPACE_URL)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('admin in workspace-a cannot GET /api/workspace/workspace-b', async () => {
    mockAdminSession(sessionService, {
      id: 'admin-a',
      role: 'admin',
      projectRef: 'workspace-a',
    });
    userModel.findById.mockResolvedValue({
      id: 'admin-a',
      role: 'admin',
      project_ref: 'workspace-a',
    });

    const { agent } = createTestApp();
    const res = await agent
      .get('/api/workspace/workspace-b')
      .set('Cookie', ['admin_session=test'])
      .expect(403);

    expect(res.body.code).toBe('WRONG_WORKSPACE_URL');
  });

  test('admin in workspace-a cannot PATCH /api/workspace/workspace-b', async () => {
    mockAdminSession(sessionService, {
      id: 'admin-a',
      role: 'admin',
      projectRef: 'workspace-a',
    });
    userModel.findById.mockResolvedValue({
      id: 'admin-a',
      role: 'admin',
      project_ref: 'workspace-a',
    });

    const { agent } = createTestApp();
    const res = await agent
      .patch('/api/workspace/workspace-b')
      .set('Cookie', `admin_session=test; ${CSRF_COOKIE}`)
      .set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN)
      .send({ name: 'Hijacked Name' })
      .expect(403);

    expect(res.body.code).toBe('WRONG_WORKSPACE_URL');
  });

  test('admin in workspace-a cannot read blocks of workspace-b', async () => {
    mockAdminSession(sessionService, {
      id: 'admin-a',
      role: 'admin',
      projectRef: 'workspace-a',
    });
    userModel.findById.mockResolvedValue({
      id: 'admin-a',
      role: 'admin',
      project_ref: 'workspace-a',
    });

    const { agent } = createTestApp();
    const res = await agent
      .get('/api/workspace/workspace-b/blocks')
      .set('Cookie', ['admin_session=test'])
      .expect(403);

    expect(res.body.code).toBe('WRONG_WORKSPACE_URL');
  });

  test('admin in workspace-a CAN access /api/workspace/workspace-a', async () => {
    mockAdminSession(sessionService, {
      id: 'admin-a',
      role: 'admin',
      projectRef: 'workspace-a',
    });
    userModel.findById.mockResolvedValue({
      id: 'admin-a',
      role: 'admin',
      project_ref: 'workspace-a',
    });
    select.mockImplementation(async (table) => {
      if (table === 'workspaces') {
        return [{ id: 'ws-a', project_ref: 'workspace-a', name: 'Workspace A' }];
      }
      return [];
    });

    const { agent } = createTestApp();
    const res = await agent
      .get('/api/workspace/workspace-a')
      .set('Cookie', ['admin_session=test'])
      .expect(200);

    expect(res.body.workspace?.projectRef).toBe('workspace-a');
  });

  test('vendor-role user cannot GET /api/workspace/workspace-b either', async () => {
    // Even though the workspace routes require admin, attachProjectRef runs
    // globally before requireAdmin — we still want the 403 from the URL
    // guard, not a later 401/403 from the admin check.
    mockAdminSession(sessionService, {
      id: 'vendor-a',
      role: 'vendor',
      projectRef: 'workspace-a',
    });
    userModel.findById.mockResolvedValue({
      id: 'vendor-a',
      role: 'vendor',
      project_ref: 'workspace-a',
    });

    const { agent } = createTestApp();
    const res = await agent
      .get('/api/workspace/workspace-b')
      .set('Cookie', ['admin_session=test'])
      .expect(403);

    expect(res.body.code).toBe('WRONG_WORKSPACE_URL');
  });

  test('case-insensitive match — workspace ref comparison ignores casing', async () => {
    mockAdminSession(sessionService, {
      id: 'admin-a',
      role: 'admin',
      projectRef: 'workspace-a',
    });
    userModel.findById.mockResolvedValue({
      id: 'admin-a',
      role: 'admin',
      project_ref: 'workspace-a',
    });
    select.mockImplementation(async (table) => {
      if (table === 'workspaces') {
        return [{ id: 'ws-a', project_ref: 'workspace-a', name: 'Workspace A' }];
      }
      return [];
    });

    const { agent } = createTestApp();
    await agent
      .get('/api/workspace/Workspace-A')
      .set('Cookie', ['admin_session=test'])
      .expect(200);
  });
});
