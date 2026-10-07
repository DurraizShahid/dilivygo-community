'use strict';

const { parseColor, relativeLuminance } = require('./color.js');

function contrastRatio(lumA, lumB) {
  const L1 = Math.max(lumA, lumB);
  const L2 = Math.min(lumA, lumB);
  return (L1 + 0.05) / (L2 + 0.05);
}
function contrastRatioForColors(a, b) {
  const ra = parseColor(a); const rb = parseColor(b);
  if (!ra || !rb) return null;
  const la = relativeLuminance(ra); const lb = relativeLuminance(rb);
  return contrastRatio(la, lb);
}
const WCAG_AA_NORMAL = 4.5;
const WCAG_AA_LARGE = 3;
const WCAG_AAA_NORMAL = 7;
function meetsContrast(fg, bg, threshold = WCAG_AA_NORMAL) {
  const r = contrastRatioForColors(fg, bg);
  return r !== null && r >= threshold;
}
function chooseReadableForeground(bg) {
  const candidates = ["#ffffff", "#fafafa", "#000000", "#0a0a0a"];
  let best = "#000000"; let bestRatio = -1;
  for (const cand of candidates) {
    const r = contrastRatioForColors(cand, bg);
    if (r !== null && r > bestRatio) { bestRatio = r; best = cand; }
  }
  const pureWhiteR = contrastRatioForColors("#ffffff", bg) ?? 0;
  const pureBlackR = contrastRatioForColors("#000000", bg) ?? 0;
  if (best === "#fafafa" && Math.abs(pureWhiteR - bestRatio) < 0.1) return "#ffffff";
  if (best === "#0a0a0a" && Math.abs(pureBlackR - bestRatio) < 0.1) return "#000000";
  return best;
}
function foregroundForBrand(bg) { return chooseReadableForeground(bg); }

module.exports = { contrastRatio, contrastRatioForColors, WCAG_AA_NORMAL, WCAG_AA_LARGE, WCAG_AAA_NORMAL, meetsContrast, chooseReadableForeground, foregroundForBrand };
