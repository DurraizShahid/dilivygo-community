'use strict';

jest.mock('../models/vendor-settings.model', () => ({ findByShopId: jest.fn() }));
jest.mock('../models/platform-settings.model', () => ({ get: jest.fn() }));
jest.mock('../lib/supabase', () => ({
  select: jest.fn(),
  insert: jest.fn(),
  update: jest.fn(),
}));

const vendorSettingsModel = require('../models/vendor-settings.model');
const platformSettings = require('../models/platform-settings.model');
const { select, insert } = require('../lib/supabase');
const { snapshotCheckoutCutlery } = require('../middleware/cutlery-snapshot.middleware');
const checkoutBatchService = require('../services/checkout-batch.service');
const {
  parseWantsCutlery,
  resolveCutleryFromSettings,
  assertCutleryRequestAllowed,
} = require('../lib/checkout-cutlery');
const {
  createTrustedCutlerySnapshot,
  isTrustedCutlerySnapshot,
} = require('../lib/trusted-checkout-snapshot');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('cutlery fee snapshot', () => {
  test('middleware replaces client flag with server-resolved trusted snapshot', async () => {
    vendorSettingsModel.findByShopId.mockResolvedValue({
      project_ref: 'workspace-a',
      cutlery_offered: true,
      cutlery_fee_cents: 175,
    });
    platformSettings.get.mockResolvedValue('true');
    const req = {
      body: {
        checkoutDraft: {
          groups: [{
            shopId: 'shop-a',
            projectRef: 'workspace-a',
            wantsCutlery: true,
            items: [],
          }],
        },
      },
    };
    const next = jest.fn();

    await snapshotCheckoutCutlery(req, {}, next);

    expect(next).toHaveBeenCalledWith();
    const snapshot = req.body.checkoutDraft.groups[0].wantsCutlery;
    expect(isTrustedCutlerySnapshot(snapshot)).toBe(true);
    expect(snapshot).toEqual(expect.objectContaining({
      requested: true,
      feeCents: 175,
      version: 1,
    }));
  });

  test('trusted snapshot wins over later live settings during fulfillment', () => {
    const snapshot = createTrustedCutlerySnapshot({ requested: true, feeCents: 175 });
    const parsed = parseWantsCutlery(snapshot);

    expect(() => assertCutleryRequestAllowed(parsed, { cutlery_offered: false }, false)).not.toThrow();
    expect(resolveCutleryFromSettings({
      platformEnabled: false,
      vendorSettings: { cutlery_offered: false, cutlery_fee_cents: 999 },
      wantsCutlery: parsed,
    })).toEqual({ requested: true, feeCents: 175 });
  });

  test('client-shaped snapshot object is rejected by durable batch persistence', async () => {
    await expect(checkoutBatchService.saveCheckoutBatch({
      groups: [{
        shopId: 'shop-a',
        projectRef: 'workspace-a',
        wantsCutlery: { version: 1, requested: true, feeCents: 1 },
        items: [],
      }],
    })).rejects.toMatchObject({ statusCode: 400 });
    expect(insert).not.toHaveBeenCalled();
  });

  test('serialized durable snapshot is re-trusted only when loaded from checkout batch table', async () => {
    select.mockResolvedValue([{
      id: 'batch-1',
      status: 'pending',
      payload: {
        groups: [{
          shopId: 'shop-a',
          projectRef: 'workspace-a',
          wantsCutlery: { version: 1, requested: true, feeCents: 175 },
          items: [],
        }],
      },
    }]);

    const batch = await checkoutBatchService.getCheckoutBatch('batch-1');
    expect(isTrustedCutlerySnapshot(batch.groups[0].wantsCutlery)).toBe(true);
  });
});
