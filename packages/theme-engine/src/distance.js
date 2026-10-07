'use strict';

const { parseToOklab } = require('./color.js');

function oklabDistance(a, b) {
  const dL = a.L - b.L; const da = a.a - b.a; const db = a.b - b.b;
  return Math.sqrt(dL*dL + da*da + db*db);
}
function perceptualDistance(c1, c2) {
  const la = parseToOklab(c1); const lb = parseToOklab(c2);
  if (!la || !lb) return null;
  return oklabDistance(la, lb);
}
function isVisuallySimilar(c1, c2, threshold = 0.08) {
  const d = perceptualDistance(c1, c2);
  return d !== null && d < threshold;
}

module.exports = { oklabDistance, perceptualDistance, isVisuallySimilar };
