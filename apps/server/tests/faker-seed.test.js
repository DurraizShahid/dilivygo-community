'use strict';

const { faker } = require('@faker-js/faker');

describe('@faker-js/faker (seeded in tests/setup.js)', () => {
  it('re-seeding produces the same sequence', () => {
    faker.seed(999);
    const a = faker.number.int({ min: 0, max: 10_000 });
    const b = faker.internet.email({ provider: 'example.com' });
    faker.seed(999);
    const a2 = faker.number.int({ min: 0, max: 10_000 });
    const b2 = faker.internet.email({ provider: 'example.com' });
    expect(a2).toBe(a);
    expect(b2).toBe(b);
  });
});
