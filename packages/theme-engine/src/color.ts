/**
 * Color parsing + OKLab/OKLCH conversions (sRGB ↔ linear ↔ OKLab).
 * Formulas from Björn Ottosson https://bottosson.github.io/posts/oklab/
 * Pure — runs in Node and browser, no dependencies.
 */

export interface Rgb { r: number; g: number; b: number } // 0..1 linear or sRGB depending on context
export interface Oklab { L: number; a: number; b: number }
export interface Oklch { L: number; C: number; h: number } // h in degrees 0..360

// ── sRGB gamma ───────────────────────────────────────────────────────────────
export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
export function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

// ── hex helpers ─────────────────────────────────────────────────────────────
export function normalizeHex(hex: string): string | null {
  const t = hex.trim();
  if (/^#[0-9a-f]{3}$/i.test(t)) {
    const h = t.slice(1).toLowerCase();
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`;
  }
  if (/^#[0-9a-f]{6}$/i.test(t)) return t.toLowerCase();
  if (/^#[0-9a-f]{8}$/i.test(t)) return t.toLowerCase(); // keep alpha as-is lowercased
  return null;
}

export function hexToRgb(hex: string): Rgb | null {
  const n = normalizeHex(hex);
  if (!n) return null;
  if (n.length === 7) {
    return {
      r: parseInt(n.slice(1, 3), 16) / 255,
      g: parseInt(n.slice(3, 5), 16) / 255,
      b: parseInt(n.slice(5, 7), 16) / 255,
    };
  }
  if (n.length === 9) {
    // #rrggbbaa — ignore alpha for now, but parse rgb
    return {
      r: parseInt(n.slice(1, 3), 16) / 255,
      g: parseInt(n.slice(3, 5), 16) / 255,
      b: parseInt(n.slice(5, 7), 16) / 255,
    };
  }
  return null;
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const ch = (c: number) => {
    const v = Math.round(Math.max(0, Math.min(1, c)) * 255);
    return v.toString(16).padStart(2, '0');
  };
  return `#${ch(r)}${ch(g)}${ch(b)}`;
}

// ── hsl → rgb ────────────────────────────────────────────────────────────────
export function hslToRgb(h: number, s: number, l: number): Rgb {
  // h 0..360, s,l 0..1
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rp = 0, gp = 0, bp = 0;
  if (h < 60) { rp = c; gp = x; }
  else if (h < 120) { rp = x; gp = c; }
  else if (h < 180) { gp = c; bp = x; }
  else if (h < 240) { gp = x; bp = c; }
  else if (h < 300) { rp = x; bp = c; }
  else { rp = c; bp = x; }
  return { r: rp + m, g: gp + m, b: bp + m };
}

// ── linear sRGB → OKLab (and back) ────────────────────────────────────────
export function linearRgbToOklab(rgb: Rgb): Oklab {
  // linear sRGB to LMS (via matrix)
  const l = 0.4122214708 * rgb.r + 0.5363325363 * rgb.g + 0.0514459929 * rgb.b;
  const m = 0.2119034982 * rgb.r + 0.6806995451 * rgb.g + 0.1073969566 * rgb.b;
  const s = 0.0883024619 * rgb.r + 0.2817188376 * rgb.g + 0.6299787005 * rgb.b;
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);
  return {
    L: 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  };
}

export function oklabToLinearRgb(lab: Oklab): Rgb {
  const l_ = lab.L + 0.3963377774 * lab.a + 0.2158037573 * lab.b;
  const m_ = lab.L - 0.1055613458 * lab.a - 0.0638541728 * lab.b;
  const s_ = lab.L - 0.0894841775 * lab.a - 1.2914855480 * lab.b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  return {
    r: +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  };
}

// ── OKLCH ───────────────────────────────────────────────────────────────────
export function oklabToOklch(lab: Oklab): Oklch {
  const C = Math.sqrt(lab.a * lab.a + lab.b * lab.b);
  let h = Math.atan2(lab.b, lab.a) * 180 / Math.PI;
  if (h < 0) h += 360;
  if (C < 0.0001) h = 0;
  return { L: lab.L, C, h };
}

export function oklchToOklab(lch: Oklch): Oklab {
  const rad = (lch.h * Math.PI) / 180;
  return { L: lch.L, a: lch.C * Math.cos(rad), b: lch.C * Math.sin(rad) };
}

// ── parse any supported CSS color → sRGB 0..1 ─────────────────────────────
export function parseColor(raw: string): Rgb | null {
  if (!raw || typeof raw !== 'string') return null;
  const v = raw.trim();
  if (!v) return null;
  const lower = v.toLowerCase();
  if (lower === 'transparent') return { r: 0, g: 0, b: 0 };
  if (/^#[0-9a-f]{3,8}$/i.test(v)) {
    return hexToRgb(v);
  }
  // rgb / rgba
  let m = v.match(/^rgba?\(\s*([^)]+)\s*\)$/i);
  if (m) {
    const parts = m[1].split(/[\s,\/]+/).filter(Boolean);
    if (parts.length >= 3) {
      const to255 = (s: string) => s.endsWith('%') ? (parseFloat(s) / 100) * 255 : parseFloat(s);
      const r = to255(parts[0]) / 255;
      const g = to255(parts[1]) / 255;
      const b = to255(parts[2]) / 255;
      if ([r,g,b].every((x) => Number.isFinite(x))) return { r: Math.max(0,Math.min(1,r)), g: Math.max(0,Math.min(1,g)), b: Math.max(0,Math.min(1,b)) };
    }
  }
  // hsl / hsla  (h in degrees, s/l in %)
  m = v.match(/^hsla?\(\s*([^)]+)\s*\)$/i);
  if (m) {
    const parts = m[1].split(/[\s,\/]+/).filter(Boolean);
    if (parts.length >= 3) {
      const h = parseFloat(parts[0]);
      const s = parseFloat(parts[1]) / 100;
      const l = parseFloat(parts[2]) / 100;
      if ([h,s,l].every(Number.isFinite)) return hslToRgb(h, s, l);
    }
  }
  // oklab(L a b)  with L 0..1, a,b -0.4..0.4 roughly; accept with optional %
  m = v.match(/^oklab\(\s*([^)]+)\s*\)$/i);
  if (m) {
    const parts = m[1].split(/[\s,\/]+/).filter(Boolean);
    if (parts.length >= 3) {
      const L = parseFloat(parts[0].replace('%',''));
      const a = parseFloat(parts[1]);
      const b = parseFloat(parts[2]);
      const Ls = parts[0].includes('%') ? L/100 : L;
      if ([Ls,a,b].every(Number.isFinite)) {
        const lin = oklabToLinearRgb({ L: Ls, a, b });
        // convert linear → sRGB (clamped) for general use
        return { r: Math.max(0,Math.min(1, linearToSrgb(lin.r))), g: Math.max(0,Math.min(1, linearToSrgb(lin.g))), b: Math.max(0,Math.min(1, linearToSrgb(lin.b))) };
      }
    }
  }
  // oklch(L C H)
  m = v.match(/^oklch\(\s*([^)]+)\s*\)$/i);
  if (m) {
    const parts = m[1].split(/[\s,\/]+/).filter(Boolean);
    if (parts.length >= 3) {
      let Ls = parseFloat(parts[0].replace('%',''));
      if (parts[0].includes('%')) Ls = Ls/100;
      const C = parseFloat(parts[1]);
      const h = parseFloat(parts[2]);
      if ([Ls,C,h].every(Number.isFinite)) {
        const lab = oklchToOklab({ L: Ls, C, h });
        const lin = oklabToLinearRgb(lab);
        return { r: Math.max(0,Math.min(1, linearToSrgb(lin.r))), g: Math.max(0,Math.min(1, linearToSrgb(lin.g))), b: Math.max(0,Math.min(1, linearToSrgb(lin.b))) };
      }
    }
  }
  if (/^var\(/.test(v)) return null; // cannot parse CSS var
  return null;
}

// Convenience: parse → Oklab/Oklch via linear path
export function parseToOklab(raw: string): Oklab | null {
  const rgb = parseColor(raw);
  if (!rgb) return null;
  const lin: Rgb = { r: srgbToLinear(rgb.r), g: srgbToLinear(rgb.g), b: srgbToLinear(rgb.b) };
  return linearRgbToOklab(lin);
}
export function parseToOklch(raw: string): Oklch | null {
  const lab = parseToOklab(raw);
  return lab ? oklabToOklch(lab) : null;
}

// ── hex round-trip helpers ──────────────────────────────────────────────────
export function toHexString(rgb: Rgb): string { return rgbToHex(rgb); }

// ── sRGB gamut clamp (chroma reduction) ────────────────────────────────────
export function isInGamutRgb(rgb: Rgb): boolean {
  return rgb.r >= -1e-6 && rgb.r <= 1 + 1e-6 && rgb.g >= -1e-6 && rgb.g <= 1 + 1e-6 && rgb.b >= -1e-6 && rgb.b <= 1 + 1e-6;
}
export function clampOklchToGamut(lch: Oklch, maxIter = 24): Oklch {
  const lin0 = oklabToLinearRgb(oklchToOklab(lch));
  const srgb0: Rgb = { r: linearToSrgb(lin0.r), g: linearToSrgb(lin0.g), b: linearToSrgb(lin0.b) };
  if (isInGamutRgb(srgb0)) return lch;
  // Binary search chroma reduction preserving L/h
  let lo = 0, hi = lch.C;
  let best = { ...lch, C: 0 };
  for (let i = 0; i < maxIter; i++) {
    const mid = (lo + hi) / 2;
    const cand = { ...lch, C: mid };
    const lin = oklabToLinearRgb(oklchToOklab(cand));
    const srgb: Rgb = { r: linearToSrgb(lin.r), g: linearToSrgb(lin.g), b: linearToSrgb(lin.b) };
    if (isInGamutRgb(srgb)) { lo = mid; best = cand; } else { hi = mid; }
  }
  return best;
}

// ── luminance (WCAG relative) ───────────────────────────────────────────────
export function relativeLuminance(rgb: Rgb): number {
  // rgb is sRGB 0..1
  const r = srgbToLinear(rgb.r);
  const g = srgbToLinear(rgb.g);
  const b = srgbToLinear(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// ── lightness/chroma adjustment ─────────────────────────────────────────────
export function adjustOklch(lch: Oklch, delta: Partial<Oklch>): Oklch {
  return { L: delta.L !== undefined ? delta.L : lch.L, C: delta.C !== undefined ? delta.C : lch.C, h: delta.h !== undefined ? delta.h : lch.h };
}

// ── canonical equivalence (case + 3-digit + trim) ───────────────────────────
export function canonicalHex(hex: string): string | null {
  const n = normalizeHex(hex);
  return n;
}
export function colorsEquivalent(a: string, b: string): boolean {
  const pa = parseColor(a);
  const pb = parseColor(b);
  if (!pa || !pb) return a.trim().toLowerCase() === b.trim().toLowerCase();
  const ha = normalizeHex(rgbToHex(pa));
  const hb = normalizeHex(rgbToHex(pb));
  return ha === hb;
}
