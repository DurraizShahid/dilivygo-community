'use strict';

const { haversineKm, pointInPolygon } = require('../lib/geo');

describe('lib/geo with geolib', () => {
  test('haversineKm matches known London–Paris distance (~344 km)', () => {
    const km = haversineKm(51.5074, -0.1278, 48.8566, 2.3522);
    expect(km).toBeGreaterThan(330);
    expect(km).toBeLessThan(360);
  });

  test('pointInPolygon: point inside unit square ring [lng,lat]', () => {
    const poly = {
      type: 'Polygon',
      coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]],
    };
    expect(pointInPolygon(0.5, 0.5, poly)).toBe(true);
    expect(pointInPolygon(2, 2, poly)).toBe(false);
  });
});
