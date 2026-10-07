'use strict';

const mockSelect = jest.fn();
const mockInsert = jest.fn();
const mockUpdate = jest.fn();
jest.mock('../lib/supabase', () => ({
  select: (...args) => mockSelect(...args),
  insert: (...args) => mockInsert(...args),
  update: (...args) => mockUpdate(...args),
  remove: jest.fn(),
  supabaseFetch: jest.fn(),
}));

const model = require('../models/integration-request.model');

describe('integration-request.model', () => {
  beforeEach(() => jest.clearAllMocks());

  test('create inserts a pending row and returns it', async () => {
    const created = { id: 'req-1', status: 'pending' };
    mockInsert.mockResolvedValueOnce([created]);

    const result = await model.create({
      organization_id: 'org-1',
      integration_name: 'quickbooks',
      integration_category: 'accounting',
      requester_name: 'Amina',
      requester_email: 'amina@example.com',
    });

    expect(result).toEqual(created);
    expect(mockInsert).toHaveBeenCalledWith('integration_requests', expect.objectContaining({
      organization_id: 'org-1',
      integration_name: 'quickbooks',
      integration_category: 'accounting',
      requester_name: 'Amina',
      requester_email: 'amina@example.com',
      status: 'pending',
    }));
  });

  test('listByOrganization filters by org with desc order', async () => {
    const rows = [{ id: 'req-1' }];
    mockSelect.mockResolvedValueOnce(rows);

    await expect(model.listByOrganization('org-1')).resolves.toEqual(rows);
    expect(mockSelect).toHaveBeenCalledWith('integration_requests', expect.objectContaining({
      filters: { organization_id: 'org-1' },
      order: 'created_at desc',
    }));
  });

  test('listAll fetches with desc order', async () => {
    const rows = [{ id: 'req-1' }, { id: 'req-2' }];
    mockSelect.mockResolvedValueOnce(rows);

    await expect(model.listAll()).resolves.toEqual(rows);
    expect(mockSelect).toHaveBeenCalledWith('integration_requests', expect.objectContaining({
      order: 'created_at desc',
    }));
  });

  test('updateStatus patches status by id and returns the row', async () => {
    const updated = { id: 'req-1', status: 'approved' };
    mockUpdate.mockResolvedValueOnce([updated]);

    const result = await model.updateStatus('req-1', 'approved');

    expect(result).toEqual(updated);
    expect(mockUpdate).toHaveBeenCalledWith(
      'integration_requests',
      expect.objectContaining({ status: 'approved' }),
      { id: 'req-1' },
    );
  });
});
