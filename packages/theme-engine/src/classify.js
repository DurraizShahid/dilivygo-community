'use strict';

const { parseToOklch } = require('./color.js');
const { perceptualDistance } = require('./distance.js');

function isNearWhite(color) {
  const lch = parseToOklch(color);
  if (!lch) return false;
  return lch.L > 0.97 && lch.C < 0.04;
}
function isNearBlack(color) {
  const lch = parseToOklch(color);
  if (!lch) return false;
  return lch.L < 0.15;
}
function isNeutral(color, chromaThreshold = 0.04) {
  const lch = parseToOklch(color);
  if (!lch) return false;
  return lch.C < chromaThreshold;
}
function isGrayscale(color) { return isNeutral(color, 0.02); }
function deriveNeutral(baseLch, targetL) {
  return { L: targetL, C: Math.min(0.02, baseLch.C * 0.2), h: baseLch.h };
}
function dedupeSimilar(colors, threshold = 0.06) {
  const out = [];
  for (const c of colors) {
    let dup = false;
    for (const kept of out) {
      const d = perceptualDistance(c, kept);
      if (d !== null && d < threshold) { dup = true; break; }
    }
    if (!dup) out.push(c);
  }
  return out;
}

module.exports = { isNearWhite, isNearBlack, isNeutral, isGrayscale, deriveNeutral, dedupeSimilar };
