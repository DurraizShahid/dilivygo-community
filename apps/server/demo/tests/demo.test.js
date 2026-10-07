'use strict';

const { seededRandom } = require('../lib/random');

/**
 * Load the demo config with an explicit set of env vars, isolated from any
 * env loaded earlier in the process (e.g. the root `.env` via tests/setup.js).
 * Returns the fresh module plus a restore function.
 */
function loadConfig(env = {}) {
  jest.resetModules();
  const saved = {};
  for (const key of Object.keys(env)) {
    saved[key] = process.env[key];
    if (env[key] === undefined) delete process.env[key];
    else process.env[key] = env[key];
  }
  const config = require('../config');
  const restore = () => {
    for (const key of Object.keys(saved)) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    jest.resetModules();
  };
  return { config, restore };
}

describe('Demo Configuration', () => {
  test('defaults to non-demo environment', () => {
    const { config, restore } = loadConfig({
      DEMO_ENVIRONMENT: undefined,
      DEMO_SEED: undefined,
      DEMO_SIZE: undefined,
    });
    try {
      expect(config.isDemoEnvironment()).toBe(false);
    } finally {
      restore();
    }
  });

  test('returns true when DEMO_ENVIRONMENT=true', () => {
    const { config, restore } = loadConfig({ DEMO_ENVIRONMENT: 'true' });
    try {
      expect(config.isDemoEnvironment()).toBe(true);
    } finally {
      restore();
    }
  });

  test('default seed is 2026', () => {
    const { config, restore } = loadConfig({ DEMO_SEED: undefined });
    try {
      expect(config.getSeed()).toBe(2026);
    } finally {
      restore();
    }
  });

  test('custom seed works', () => {
    const { config, restore } = loadConfig({ DEMO_SEED: '42' });
    try {
      expect(config.getSeed()).toBe(42);
    } finally {
      restore();
    }
  });

  test('default size is full', () => {
    const { config, restore } = loadConfig({ DEMO_SIZE: undefined });
    try {
      expect(config.DEMO_SIZE).toBe('full');
    } finally {
      restore();
    }
  });
});

describe('Seeded Random Generator', () => {
  test('same seed produces same sequence', () => {
    const rng1 = seededRandom(42);
    const rng2 = seededRandom(42);
    for (let i = 0; i < 100; i++) {
      expect(rng1.nextInt(1, 1000)).toBe(rng2.nextInt(1, 1000));
    }
  });

  test('different seeds produce different sequences', () => {
    const rng1 = seededRandom(42);
    const rng2 = seededRandom(43);
    const vals1 = Array.from({ length: 10 }, () => rng1.nextInt(1, 1000));
    const vals2 = Array.from({ length: 10 }, () => rng2.nextInt(1, 1000));
    expect(vals1).not.toEqual(vals2);
  });

  test('randomInt returns within bounds', () => {
    const rng = seededRandom(42);
    for (let i = 0; i < 100; i++) {
      const val = rng.nextInt(10, 20);
      expect(val).toBeGreaterThanOrEqual(10);
      expect(val).toBeLessThanOrEqual(20);
    }
  });

  test('randomName returns non-empty string', () => {
    const { randomName } = require('../lib/random');
    const rng = seededRandom(42);
    const name = randomName(rng, 0);
    expect(name).toBeTruthy();
    expect(name.length).toBeGreaterThan(0);
  });

  test('randomEmail returns valid email format', () => {
    const { randomEmail } = require('../lib/random');
    const rng = seededRandom(42);
    const email = randomEmail(rng, 0);
    expect(email).toMatch(/^[^@]+@[^@]+\.[^@]+$/);
  });
});

describe('Safety Guards', () => {
  test('requireDemoEnvironment throws when not demo', () => {
    const { config, restore } = loadConfig({ DEMO_ENVIRONMENT: 'false' });
    try {
      expect(() => config.requireDemoEnvironment()).toThrow('DEMO_ENVIRONMENT must be set to "true"');
    } finally {
      restore();
    }
  });

  test('requireDemoEnvironment passes when demo', () => {
    const { config, restore } = loadConfig({ DEMO_ENVIRONMENT: 'true' });
    try {
      expect(() => config.requireDemoEnvironment()).not.toThrow();
    } finally {
      restore();
    }
  });
});
