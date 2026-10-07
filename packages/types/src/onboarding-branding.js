'use strict';

// Platform-neutral helpers shared by the onboarding preview and Express finalizer.
function isHexColor(value) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}
function rgb(hex) {
  if (!isHexColor(hex)) throw new Error('Expected a six-digit hex color');
  return [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
}
function hex(channels) {
  return '#' + channels.map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0')).join('').toUpperCase();
}
function luminance(color) {
  const [r, g, b] = rgb(color).map((value) => {
    const s = value / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrastRatio(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
function readableForeground(color) {
  return contrastRatio(color, '#FFFFFF') >= contrastRatio(color, '#000000') ? '#FFFFFF' : '#000000';
}
function visibleTone(color, background) {
  const target = luminance(background) > 0.5 ? 0 : 255;
  const source = rgb(color);
  for (let step = 0; step <= 100; step++) {
    const candidate = hex(source.map((value) => value + (target - value) * step / 100));
    if (contrastRatio(candidate, background) >= 3) return candidate;
  }
  return hex([target, target, target]);
}
function createBrandTheme(primary, accent) {
  const mode = (background) => {
    const tokens = {};
    for (const [key, value] of [['primary', primary], ['accent', accent]]) {
      if (!isHexColor(value)) continue;
      tokens[key] = visibleTone(value, background);
      tokens[key + 'Foreground'] = readableForeground(tokens[key]);
    }
    if (tokens.primary) tokens.ring = tokens.primary;
    return tokens;
  };
  return { light: mode('#FFFFFF'), dark: mode('#111827') };
}

// Quantize at most a small thumbnail's pixels. Ignore transparent pixels and
// prefer actual colored ink over white backgrounds, black outlines and shadows.
function extractPalette(pixels, limit = 5) {
  const buckets = new Map();
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (pixels[i + 3] < 160) continue;
    const c = [pixels[i], pixels[i + 1], pixels[i + 2]];
    const key = c.map((v) => Math.min(255, Math.round(v / 24) * 24)).join(',');
    const bucket = buckets.get(key) || { count: 0, sum: [0, 0, 0] };
    bucket.count++;
    c.forEach((v, j) => { bucket.sum[j] += v; });
    buckets.set(key, bucket);
  }
  const ranked = Array.from(buckets.values()).map((b) => {
    const c = b.sum.map((v) => v / b.count);
    const saturation = Math.max(...c) - Math.min(...c);
    return { c, count: b.count, colorful: saturation > 35 && Math.max(...c) > 45 && Math.min(...c) < 235 };
  }).sort((a, b) => b.count - a.count);
  const colored = ranked.filter((b) => b.colorful && b.count >= Math.max(2, (ranked[0]?.count || 0) * 0.005));
  const candidates = colored.length ? colored : ranked;
  const chosen = [];
  for (const candidate of candidates) {
    if (chosen.some((c) => Math.hypot(...c.map((v, i) => v - candidate.c[i])) < 65)) continue;
    chosen.push(candidate.c);
    if (chosen.length >= limit) break;
  }
  return chosen.map(hex);
}
module.exports = { isHexColor, contrastRatio, readableForeground, createBrandTheme, extractPalette };
