'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadSharedCartSync() {
  const sourcePath = path.join(__dirname, '../../../packages/api/src/cart-sync.ts');
  const source = fs.readFileSync(sourcePath, 'utf8')
    .replace(/^import type .*;\r?\n/, '')
    .replace(/export function cartLineFingerprint\(item: CartItem\): string \{/, 'function cartLineFingerprint(item) {')
    .replace(/export function mergeCartLinesForLogin\(remote: CartItem\[], local: CartItem\[]\): CartItem\[] \{/, 'function mergeCartLinesForLogin(remote, local) {')
    .replace(/new Map<string, CartItem>\(\)/g, 'new Map()')
    .replace(/new Map<string, string>\(\)/g, 'new Map()');
  const context = { module: { exports: {} } };
  vm.runInNewContext(`${source}\nmodule.exports = { cartLineFingerprint, mergeCartLinesForLogin };`, context);
  return context.module.exports;
}

describe('shared cart sync helpers', () => {
  it('keeps product variants as distinct login merge lines', () => {
    const { mergeCartLinesForLogin } = loadSharedCartSync();

    const merged = mergeCartLinesForLogin(
      [
        {
          id: 'remote-small',
          productId: 'pizza',
          productVariantId: 'small',
          shopId: 'shop-1',
          projectRef: 'project-1',
          name: 'Pizza small',
          quantity: 1,
          unitPriceCents: 1000,
        },
      ],
      [
        {
          id: 'local-large',
          productId: 'pizza',
          productVariantId: 'large',
          shopId: 'shop-1',
          projectRef: 'project-1',
          name: 'Pizza large',
          quantity: 2,
          unitPriceCents: 1600,
        },
      ]
    );

    expect(merged).toHaveLength(2);
    expect(Array.from(merged, (line) => line.productVariantId).sort()).toEqual([
      'large',
      'small',
    ]);
  });
});
