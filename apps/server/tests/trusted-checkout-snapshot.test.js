'use strict';

jest.mock('../lib/supabase', () => ({
  select: jest.fn(),
  insert: jest.fn(),
  update: jest.fn(),
}));
jest.mock('../models/product.model', () => ({ get: jest.fn() }));
jest.mock('../models/product-variant.model', () => ({ listByProductIds: jest.fn() }));
jest.mock('../models/modifier.model', () => ({ listGroupsByProducts: jest.fn() }));

const { select } = require('../lib/supabase');
const productModel = require('../models/product.model');
const productVariantModel = require('../models/product-variant.model');
const modifierModel = require('../models/modifier.model');
const checkoutBatchService = require('../services/checkout-batch.service');
const { assertOrderItemsPricedForShop } = require('../services/order-line-pricing.service');
const { isTrustedCheckoutLine } = require('../lib/trusted-checkout-snapshot');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('durable checkout snapshot trust', () => {
  test('client JSON cannot forge the Symbol trust marker', () => {
    const forged = {
      productId: 'product-1',
      unitPriceCents: 100,
      __trustedCheckoutLine: true,
    };
    expect(isTrustedCheckoutLine(forged)).toBe(false);
  });

  test('durable checkout rows are marked trusted only when loaded from the batch service', async () => {
    select.mockResolvedValue([{
      id: 'batch-1',
      status: 'pending',
      payload: {
        groups: [{
          shopId: 'shop-1',
          projectRef: 'workspace-a',
          items: [{ productId: 'product-1', quantity: 1, unitPriceCents: 100 }],
        }],
      },
    }]);

    const batch = await checkoutBatchService.getCheckoutBatch('batch-1');
    expect(isTrustedCheckoutLine(batch.groups[0].items[0])).toBe(true);
  });

  test('trusted paid snapshot does not re-query live catalog pricing', async () => {
    select.mockResolvedValue([{
      id: 'batch-1',
      status: 'pending',
      payload: {
        groups: [{
          shopId: 'shop-1',
          projectRef: 'workspace-a',
          items: [{ productId: 'product-1', quantity: 1, unitPriceCents: 100 }],
        }],
      },
    }]);
    const batch = await checkoutBatchService.getCheckoutBatch('batch-1');

    await expect(assertOrderItemsPricedForShop({
      shopId: 'shop-1',
      projectRef: 'workspace-a',
      items: batch.groups[0].items,
    })).resolves.toBeUndefined();

    expect(productModel.get).not.toHaveBeenCalled();
    expect(productVariantModel.listByProductIds).not.toHaveBeenCalled();
    expect(modifierModel.listGroupsByProducts).not.toHaveBeenCalled();
  });

  test('untrusted client line still receives authoritative live price validation', async () => {
    productModel.get.mockResolvedValue({
      id: 'product-1',
      project_ref: 'workspace-a',
      available: true,
      price_cents: 150,
    });
    productVariantModel.listByProductIds.mockResolvedValue({ 'product-1': [] });
    modifierModel.listGroupsByProducts.mockResolvedValue({ 'product-1': [] });

    await expect(assertOrderItemsPricedForShop({
      shopId: 'shop-1',
      projectRef: 'workspace-a',
      items: [{ productId: 'product-1', quantity: 1, unitPriceCents: 100 }],
    })).rejects.toMatchObject({ statusCode: 400 });
  });
});
