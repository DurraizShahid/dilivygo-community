/**
 * Stippled / halftone tile for SVG bar fills — light dots on a dark ground.
 * Use as `fill={`url(#${id})`}` on Recharts `<Bar />` or raw SVG `<rect />`.
 */
const TILE = 5;
const DOT_R = 1.38;

export function halftoneBarLtrFadeMaskId(baseId: string) {
  return `${baseId}-ltrFadeMask`;
}

/** `url(#…)` for use on `mask` — pair with `<HalftoneBarLtrFadeMaskDef baseId={…} />`. */
export function halftoneBarLtrFadeMaskUrl(baseId: string) {
  return `url(#${halftoneBarLtrFadeMaskId(baseId)})`;
}

/**
 * Left → right fade: softer on the left, full strength on the right.
 * Uses objectBoundingBox so each bar’s mask matches its own width.
 */
export function HalftoneBarLtrFadeMaskDef({
  baseId,
  leftOpacity = 0.14,
}: {
  baseId: string;
  /** White alpha at the left edge (0–1). */
  leftOpacity?: number;
}) {
  const gid = `${baseId}-ltrFadeGrad`;
  const mid = halftoneBarLtrFadeMaskId(baseId);
  return (
    <>
      <linearGradient
        id={gid}
        x1="0"
        y1="0"
        x2="1"
        y2="0"
        gradientUnits="objectBoundingBox"
      >
        <stop offset="0%" stopColor="#fff" stopOpacity={leftOpacity} />
        <stop offset="72%" stopColor="#fff" stopOpacity={0.72} />
        <stop offset="100%" stopColor="#fff" stopOpacity={1} />
      </linearGradient>
      <mask
        id={mid}
        maskUnits="objectBoundingBox"
        x="0"
        y="0"
        width="1"
        height="1"
        maskContentUnits="objectBoundingBox"
      >
        <rect x="0" y="0" width="1" height="1" fill={`url(#${gid})`} />
      </mask>
    </>
  );
}

export function HalftonePatternDef({
  id,
  dotColor,
  groundColor = "rgba(5, 5, 6, 0.78)",
}: {
  id: string;
  dotColor: string;
  groundColor?: string;
}) {
  const c = TILE / 2;
  return (
    <pattern id={id} width={TILE} height={TILE} patternUnits="userSpaceOnUse">
      <rect width={TILE} height={TILE} fill={groundColor} />
      <circle cx={c} cy={c} r={DOT_R} fill={dotColor} />
    </pattern>
  );
}
