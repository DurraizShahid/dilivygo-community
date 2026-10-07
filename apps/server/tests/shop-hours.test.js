'use strict';

const { getShopOpenState, previousDayKey } = require('../lib/shop-hours');

describe('shop-hours helper', () => {
  it('defaults to open when no schedule is configured', () => {
    const state = getShopOpenState({ timezone: 'UTC', operating_hours: null }, new Date('2026-03-23T10:00:00Z'));
    expect(state.isOpen).toBe(true);
  });

  it('returns open during a normal same-day range', () => {
    const shop = {
      timezone: 'UTC',
      operating_hours: { mon: [{ start: '09:00', end: '17:00' }] },
    };
    expect(getShopOpenState(shop, new Date('2026-03-23T10:00:00Z')).isOpen).toBe(true);
  });

  it('returns closed outside a normal same-day range', () => {
    const shop = {
      timezone: 'UTC',
      operating_hours: { mon: [{ start: '09:00', end: '17:00' }] },
    };
    expect(getShopOpenState(shop, new Date('2026-03-23T20:00:00Z')).isOpen).toBe(false);
  });

  it('parses HH:MM:SS from storage', () => {
    const shop = {
      timezone: 'UTC',
      operating_hours: { tue: [{ start: '09:00:00', end: '23:00:00' }] },
    };
    expect(getShopOpenState(shop, new Date('2026-03-31T13:59:00Z')).isOpen).toBe(true);
  });

  it('matches operating hour day keys case-insensitively', () => {
    const shop = {
      timezone: 'UTC',
      operating_hours: { Tue: [{ start: '09:00', end: '17:00' }] },
    };
    expect(getShopOpenState(shop, new Date('2026-03-31T12:00:00Z')).isOpen).toBe(true);
  });

  it('treats closing time as inclusive for same-day ranges', () => {
    const shop = {
      timezone: 'UTC',
      operating_hours: { mon: [{ start: '09:00', end: '23:00' }] },
    };
    expect(getShopOpenState(shop, new Date('2026-03-23T23:00:00Z')).isOpen).toBe(true);
  });

  describe('overnight ranges', () => {
    const shop = {
      timezone: 'UTC',
      operating_hours: { mon: [{ start: '22:00', end: '02:00' }] },
    };

    it('opens the configured day only after the overnight start time', () => {
      expect(getShopOpenState(shop, new Date('2026-08-24T23:00:00Z')).isOpen).toBe(true); // Monday
      expect(getShopOpenState(shop, new Date('2026-08-24T01:00:00Z')).isOpen).toBe(false); // Monday morning
    });

    it('carries the previous day range through midnight', () => {
      expect(getShopOpenState(shop, new Date('2026-08-25T01:59:00Z')).isOpen).toBe(true); // Tuesday
      expect(getShopOpenState(shop, new Date('2026-08-25T02:00:00Z')).isOpen).toBe(false);
      expect(getShopOpenState(shop, new Date('2026-08-25T03:00:00Z')).isOpen).toBe(false);
    });

    it('uses the shop timezone around the day boundary', () => {
      const singaporeShop = { ...shop, timezone: 'Asia/Singapore' };
      expect(getShopOpenState(singaporeShop, new Date('2026-08-24T15:30:00Z')).isOpen).toBe(true); // Mon 23:30 SGT
      expect(getShopOpenState(singaporeShop, new Date('2026-08-24T17:00:00Z')).isOpen).toBe(true); // Tue 01:00 SGT
    });
  });

  it('wraps the previous weekday across Sunday', () => {
    expect(previousDayKey('sun')).toBe('sat');
    expect(previousDayKey('mon')).toBe('sun');
  });
});
