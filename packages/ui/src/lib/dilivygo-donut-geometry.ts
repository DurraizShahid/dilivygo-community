/** Same stack as web donuts — use in SVG markup & static HTML exports. */
export const DILIVYGO_DONUT_FONT_STACK =
  "var(--font-sans, ui-sans-serif), ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif";

/** Segment % labels — compact size that scales gently with chart diameter. */
export function dilivygoDonutSegmentLabelFontSize(size: number): number {
  return Math.max(8, Math.min(12, Math.round(size * 0.05)));
}

export type DilivygoDonutGeomSegment = {
  key: string;
  value: number;
  color: string;
  d: string;
  midAngle: number;
  labelR: number;
  pct: number;
  frac: number;
  labelFill: string;
};

function parseRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "").trim();
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const n = parseInt(full, 16);
  if (!Number.isFinite(n) || full.length !== 6) return { r: 128, g: 128, b: 128 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** Pick near-black or near-white for text on a solid hex fill. */
export function dilivygoContrastingLabelColor(fillHex: string): string {
  const { r, g, b } = parseRgb(fillHex);
  const rs = r / 255;
  const gs = g / 255;
  const bs = b / 255;
  const R = rs <= 0.03928 ? rs / 12.92 : Math.pow((rs + 0.055) / 1.055, 2.4);
  const G = gs <= 0.03928 ? gs / 12.92 : Math.pow((gs + 0.055) / 1.055, 2.4);
  const B = bs <= 0.03928 ? bs / 12.92 : Math.pow((bs + 0.055) / 1.055, 2.4);
  const L = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  return L > 0.52 ? "#0a0a0f" : "#fafafa";
}

function pt(cx: number, cy: number, r: number, angle: number) {
  return {
    x: cx + r * Math.cos(angle),
    y: cy + r * Math.sin(angle),
  };
}

/** SVG arc along a circle from startAngle → endAngle (angles increase clockwise from 3 o'clock in SVG coords). */
function arcD(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const start = pt(cx, cy, r, startAngle);
  const end = pt(cx, cy, r, endAngle);
  let delta = endAngle - startAngle;
  if (delta < 0) delta += Math.PI * 2;
  if (delta > Math.PI * 2) delta -= Math.PI * 2;
  const largeArc = delta > Math.PI ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

export type DilivygoDonutLayoutInput = {
  segments: { key: string; value: number; color: string }[];
  size: number;
  /** Ring thickness as a fraction of `size / 2` (max ~0.45). */
  thicknessRatio: number;
  gapDegrees: number;
  /** Midline radius as fraction of `size / 2`. */
  radiusRatio: number;
  /**
   * Label distance as a multiple of arc midline radius `r` (default `1` = centered on the stroke).
   * Values &lt; 1 pull labels toward the hole (usually wrong); &gt; 1 nudges outward.
   */
  labelRadiusScale?: number;
};

export function layoutDilivygoDonutSegments(input: DilivygoDonutLayoutInput): {
  cx: number;
  cy: number;
  strokeWidth: number;
  r: number;
  geom: DilivygoDonutGeomSegment[];
} {
  const { segments, size, thicknessRatio, gapDegrees, radiusRatio, labelRadiusScale = 1 } = input;
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size / 2;
  const strokeWidth = Math.max(4, Math.min(maxR * 0.48, maxR * thicknessRatio * 2));
  const r = maxR * radiusRatio;
  const labelR = r * labelRadiusScale;

  const visible = segments.filter((s) => s.value > 0);
  const total = visible.reduce((s, x) => s + x.value, 0);
  const gap = (gapDegrees * Math.PI) / 180;
  const n = visible.length;
  const totalGap = n > 0 ? n * gap : 0;
  const available = Math.max(0.0001, Math.PI * 2 - totalGap);

  let cursor = -Math.PI / 2 + (n > 0 ? gap / 2 : 0);
  const geom: DilivygoDonutGeomSegment[] = [];

  for (const seg of visible) {
    const frac = total > 0 ? seg.value / total : 0;
    const sweep = frac * available;
    const a0 = cursor;
    const a1 = cursor + sweep;
    const mid = (a0 + a1) / 2;
    const pct = Math.round(frac * 100);
    geom.push({
      key: seg.key,
      value: seg.value,
      color: seg.color,
      d: arcD(cx, cy, r, a0, a1),
      midAngle: mid,
      labelR,
      pct,
      frac,
      labelFill: dilivygoContrastingLabelColor(seg.color),
    });
    cursor = a1 + gap;
  }

  return { cx, cy, strokeWidth, r, geom };
}

export type DilivygoDonutSvgMarkupOpts = DilivygoDonutLayoutInput & {
  trackColor: string;
  showSegmentPercentLabels?: boolean;
  /** Minimum share (0–100) before a segment shows its % label. */
  minLabelPercent?: number;
  fontClass?: string;
};

/** Static SVG string for HTML exports (no React). Center labels should be layered in HTML/CSS over the SVG. */
export function buildDilivygoDonutSvgMarkup(opts: DilivygoDonutSvgMarkupOpts): string {
  const {
    size,
    trackColor,
    showSegmentPercentLabels = true,
    minLabelPercent = 8,
    fontClass,
  } = opts;
  const { cx, cy, strokeWidth, r, geom } = layoutDilivygoDonutSegments(opts);

  const arcs = geom
    .map(
      (g) =>
        `<path d="${g.d}" fill="none" stroke="${g.color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" />`,
    )
    .join("");

  const labels =
    showSegmentPercentLabels && geom.length
      ? geom
          .filter((g) => g.frac * 100 >= minLabelPercent)
          .map((g) => {
            const x = cx + g.labelR * Math.cos(g.midAngle);
            const y = cy + g.labelR * Math.sin(g.midAngle);
            const fs = dilivygoDonutSegmentLabelFontSize(size);
            const cls = fontClass ? ` class="${fontClass}"` : "";
            return `<text${cls} x="${x.toFixed(2)}" y="${y.toFixed(2)}" text-anchor="middle" dominant-baseline="central" fill="${g.labelFill}" font-size="${fs}" style="font-family: ${DILIVYGO_DONUT_FONT_STACK}; font-weight: 600; font-variant-numeric: lining-nums proportional-nums; letter-spacing: 0.045em">${g.pct}%</text>`;
          })
          .join("")
      : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-hidden="true" style="font-family: ${DILIVYGO_DONUT_FONT_STACK}">
<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${trackColor}" stroke-width="${strokeWidth}" opacity="0.38" />
${arcs}
${labels}
</svg>`;
}
