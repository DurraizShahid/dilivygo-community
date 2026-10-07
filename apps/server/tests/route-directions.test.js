'use strict';

const { decodeGooglePolyline } = require('../lib/route-directions');

describe('decodeGooglePolyline', () => {
  it('decodes a short Google-encoded polyline', () => {
    // Known sample: path near (38.5, -120.2) → (40.7, -120.95) style encoding
    const encoded = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';
    const pts = decodeGooglePolyline(encoded);
    expect(pts.length).toBeGreaterThanOrEqual(2);
    expect(typeof pts[0].lat).toBe('number');
    expect(typeof pts[0].lon).toBe('number');
  });

  it('returns empty for empty input', () => {
    expect(decodeGooglePolyline('')).toEqual([]);
    expect(decodeGooglePolyline(null)).toEqual([]);
  });
});
