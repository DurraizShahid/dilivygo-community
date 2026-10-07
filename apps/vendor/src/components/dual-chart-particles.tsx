"use client";

import { useId } from "react";
import type { ReactNode } from "react";
import { useDashboardChartChrome } from "@/hooks/use-dashboard-chart-chrome";

export function prng(n: number) {
  const x = Math.sin(n * 127.1 + n * 311.7) * 43758.5453123;
  return x - Math.floor(x);
}

export type DualAxisValuePt = { i: number; v: number };

/** Muted ridge tone — contrasts peach / cyan chart ink. */
export const DUAL_CHART_MOUNTAIN = "#A09D9B";

const MOUNTAIN_PEAK_HI = "#c9c4c2";

function mountainRidgeProfile(
  innerW: number,
  innerH: number,
  seed: number,
  heightMul: number,
  pad = 10,
  lite = false,
) {
  const n =
    (lite ? 11 : 18) + Math.floor(prng(seed) * (lite ? 7 : 14));
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = -pad + t * (innerW + pad * 2);
    const wobble = 0.88 + 0.24 * prng(seed + i * 53 + 11);
    const lift = innerH * heightMul * wobble * (0.28 + prng(seed + i * 17) * 0.72);
    xs.push(x);
    ys.push(innerH - lift);
  }
  return { xs, ys };
}

function ridgeYAt(xs: number[], ys: number[], x: number): number {
  if (x <= xs[0]) return ys[0];
  if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
  for (let i = 0; i < xs.length - 1; i++) {
    if (x >= xs[i] && x <= xs[i + 1]) {
      const tt = (x - xs[i]) / (xs[i + 1] - xs[i]);
      return ys[i] * (1 - tt) + ys[i + 1] * tt;
    }
  }
  return ys[ys.length - 1];
}

/** Halftone columns + dotted ridge for one mountain layer (matches chart particle language). */
function MountainParticleLayer({
  innerW,
  innerH,
  seed,
  heightMul,
  strength,
  color,
  peakColor,
  lite = false,
}: {
  innerW: number;
  innerH: number;
  seed: number;
  heightMul: number;
  strength: number;
  color: string;
  peakColor: string;
  lite?: boolean;
}) {
  const chrome = useDashboardChartChrome();
  const { xs, ys } = mountainRidgeProfile(innerW, innerH, seed, heightMul, 10, lite);
  const colStep = lite ? 6.75 : 4.5;
  const rowStep = lite ? 4.9 : 3.85;
  const maxOpacity = 0.5 * strength;
  const fill: ReactNode[] = [];
  let fk = 0;

  for (let gx = colStep * 0.5; gx < innerW; gx += colStep) {
    const yTop = ridgeYAt(xs, ys, gx);
    const span = innerH - yTop;
    if (span < 2) continue;
    const colKey = Math.round(gx * 11 + seed);

    let y = innerH - rowStep * 0.2;
    while (y >= yTop) {
      const towardBase = span > 0.5 ? (y - yTop) / span : 0;
      const nearRidge = Math.max(0, Math.min(1, 1 - towardBase));
      const fade =
        Math.pow(nearRidge, 1.28) * maxOpacity * (0.78 + 0.22 * nearRidge);
      if (fade < 0.022) {
        y -= Math.max(2.2, rowStep * 0.85);
        continue;
      }
      if (prng(seed + colKey * 41 + Math.round(y) * 13) < (lite ? 0.2 : 0.12)) {
        y -= Math.max(2, rowStep * (0.36 + 0.64 * (1 - nearRidge)));
        continue;
      }
      const rBoost = 0.76 + 0.88 * nearRidge;
      const r = (0.5 + prng(seed + colKey * 19 + y) * 0.8) * rBoost;
      const useHi = nearRidge > 0.48 && prng(seed + colKey + y * 3) > 0.34;
      const fillC = useHi ? peakColor : color;
      const op = fade * (useHi ? 1.06 : 0.9);
      fill.push(
        <circle
          key={`m-${seed}-${fk++}`}
          cx={gx}
          cy={y}
          r={r}
          fill={fillC}
          opacity={Math.min(1, op)}
        />,
      );
      if (
        !lite &&
        nearRidge > 0.65 &&
        prng(seed + colKey * 99 + y) > 0.94
      ) {
        fill.push(
          <circle
            key={`ms-${seed}-${fk++}`}
            cx={gx + (prng(seed + y) - 0.5) * 1.1}
            cy={y + (prng(seed + y + 2) - 0.5) * 1.1}
            r={0.42}
            fill={chrome.particleSparkle}
            opacity={0.22 * strength}
          />,
        );
      }
      y -= Math.max(2.05, rowStep * (0.34 + 0.66 * (1 - nearRidge)));
    }
  }

  const ridgeShadow: ReactNode[] = [];
  const ridgeMain: ReactNode[] = [];
  const ridgeVerts: ReactNode[] = [];
  let rk = 0;
  const stepPx = lite ? 8.25 : 5.6;
  const dotR = lite ? 1.08 : 1.02;

  for (let i = 0; i < xs.length - 1; i++) {
    const x0 = xs[i];
    const y0 = ys[i];
    const x1 = xs[i + 1];
    const y1 = ys[i + 1];
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    const n = Math.max(1, Math.ceil(len / stepPx));
    for (let s = 0; s <= n; s++) {
      if (s % 2 === 1) continue;
      const t = s / n;
      const cx = x0 + dx * t;
      const cy = y0 + dy * t;
      if (cx < -0.5 || cx > innerW + 0.5) continue;
      const tw = 0.8 + prng(seed + i * 200 + s) * 0.2;
      if (!lite) {
        ridgeShadow.push(
          <circle
            key={`rs-${rk}`}
            cx={cx}
            cy={cy}
            r={dotR * 2.15}
            fill={color}
            opacity={0.07 * strength * tw}
          />,
        );
      }
      ridgeMain.push(
        <circle
          key={`rm-${rk}`}
          cx={cx}
          cy={cy}
          r={dotR}
          fill={color}
          opacity={(0.52 + 0.28 * tw) * Math.min(1, strength + 0.35)}
        />,
      );
      rk++;
    }
  }

  for (let i = 0; i < xs.length; i++) {
    const cx = xs[i];
    const cy = ys[i];
    if (cx < 0 || cx > innerW) continue;
    if (lite) {
      ridgeVerts.push(
        <circle
          key={`rvl-${seed}-${i}`}
          cx={cx}
          cy={cy}
          r={1.45}
          fill={peakColor}
          stroke={chrome.particleRidgeStroke}
          strokeWidth={0.45}
          opacity={0.72}
        />,
      );
      continue;
    }
    ridgeVerts.push(
      <circle
        key={`rv-${seed}-${i}`}
        cx={cx}
        cy={cy}
        r={2.05}
        fill={color}
        opacity={0.12 * strength}
      />,
    );
    ridgeVerts.push(
      <circle
        key={`rv2-${seed}-${i}`}
        cx={cx}
        cy={cy}
        r={1.35}
        fill={peakColor}
        stroke={chrome.particleRidgeStroke}
        strokeWidth={0.4}
        opacity={0.55 + 0.2 * strength}
      />,
    );
    ridgeVerts.push(
      <circle
        key={`rv3-${seed}-${i}`}
        cx={cx}
        cy={cy}
        r={0.5}
        fill={chrome.particleVertHighlight}
        opacity={0.35}
      />,
    );
  }

  return (
    <g>
      <g>{fill}</g>
      {!lite ? <g>{ridgeShadow}</g> : null}
      <g>{ridgeMain}</g>
      <g>{ridgeVerts}</g>
    </g>
  );
}

/**
 * Layered mountain ridges — same halftone columns + dotted ridge + vertex pins as the dual series chart.
 */
export function DualAxisMountainBackdrop({
  innerW,
  innerH,
  color = DUAL_CHART_MOUNTAIN,
  peakColor = MOUNTAIN_PEAK_HI,
  seed = 7042,
  lite = false,
}: {
  innerW: number;
  innerH: number;
  color?: string;
  peakColor?: string;
  seed?: number;
  /** Fewer nodes: wider halftone, fewer layers, simpler ridge. */
  lite?: boolean;
}) {
  const chrome = useDashboardChartChrome();
  const [g0, g15, g32, g55, g78, g100] = chrome.mountainGradOpacities;
  const fadeId = useId().replace(/:/g, "");
  const gradId = `${fadeId}-mvf`;
  const maskId = `${fadeId}-mvm`;

  if (innerW < 16 || innerH < 16) return null;

  const allLayers: { seedOff: number; strength: number; heightMul: number }[] = [
    { seedOff: 0, strength: 0.38, heightMul: 0.26 },
    { seedOff: 211, strength: 0.48, heightMul: 0.34 },
    { seedOff: 433, strength: 0.58, heightMul: 0.42 },
    { seedOff: 677, strength: 0.5, heightMul: 0.36 },
    { seedOff: 901, strength: 0.68, heightMul: 0.5 },
    { seedOff: 1129, strength: 0.55, heightMul: 0.44 },
    { seedOff: 1361, strength: 0.44, heightMul: 0.3 },
  ];
  const layers = lite
    ? [allLayers[0], allLayers[2], allLayers[4], allLayers[6]]
    : allLayers;

  return (
    <g className="pointer-events-none" aria-hidden>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
          <stop offset="0%" stopColor={chrome.mountainGradColor} stopOpacity={g0} />
          <stop offset="15%" stopColor={chrome.mountainGradColor} stopOpacity={g15} />
          <stop offset="32%" stopColor={chrome.mountainGradColor} stopOpacity={g32} />
          <stop offset="55%" stopColor={chrome.mountainGradColor} stopOpacity={g55} />
          <stop offset="78%" stopColor={chrome.mountainGradColor} stopOpacity={g78} />
          <stop offset="100%" stopColor={chrome.mountainGradColor} stopOpacity={g100} />
        </linearGradient>
        <mask
          id={maskId}
          maskUnits="objectBoundingBox"
          x="0"
          y="0"
          width="1"
          height="1"
          maskContentUnits="objectBoundingBox"
        >
          <rect x="0" y="0" width="1" height="1" fill={`url(#${gradId})`} />
        </mask>
      </defs>
      <g mask={`url(#${maskId})`}>
        {layers.map((L, i) => (
          <MountainParticleLayer
            key={i}
            innerW={innerW}
            innerH={innerH}
            seed={seed + L.seedOff}
            heightMul={L.heightMul}
            strength={L.strength}
            color={color}
            peakColor={peakColor}
            lite={lite}
          />
        ))}
      </g>
    </g>
  );
}

/** Vertical dotted grid + soft cap halos (eyecandy, still minimal). */
export function DualAxisVerticalDottedGrid({
  tickXs,
  innerH,
  lineOpacity = 0.18,
  capOpacity = 0.55,
  accentA = "rgba(235, 94, 40, 0.14)",
  accentB = "rgba(34, 211, 238, 0.12)",
  lite = false,
}: {
  tickXs: number[];
  innerH: number;
  lineOpacity?: number;
  capOpacity?: number;
  /** Subtle warm tint under every other column cap. */
  accentA?: string;
  accentB?: string;
  lite?: boolean;
}) {
  const chrome = useDashboardChartChrome();
  const stroke = chrome.gridDottedLine(lineOpacity);
  const cap = chrome.gridDottedCap(capOpacity);
  return (
    <g className="pointer-events-none" aria-hidden>
      {tickXs.map((gx, idx) => {
        const accent = idx % 2 === 0 ? accentA : accentB;
        if (lite) {
          return (
            <g key={idx}>
              <line
                x1={gx}
                y1={0}
                x2={gx}
                y2={innerH}
                stroke={stroke}
                strokeWidth={1}
                strokeDasharray="1 9"
                strokeLinecap="round"
              />
              <circle cx={gx} cy={0} r={1.65} fill={accent} opacity={0.4} />
              <circle cx={gx} cy={innerH} r={1.65} fill={accent} opacity={0.32} />
            </g>
          );
        }
        return (
          <g key={idx}>
            <line
              x1={gx}
              y1={0}
              x2={gx}
              y2={innerH}
              stroke={stroke}
              strokeWidth={1}
              strokeDasharray="1 8"
              strokeLinecap="round"
            />
            <circle cx={gx} cy={0} r={4.5} fill={accent} opacity={0.45} />
            <circle cx={gx} cy={innerH} r={4.5} fill={accent} opacity={0.35} />
            <circle cx={gx} cy={0} r={2.4} fill={chrome.gridHaloFill} />
            <circle cx={gx} cy={innerH} r={2.4} fill={chrome.gridHaloFillDim} />
            <circle cx={gx} cy={0} r={1.85} fill={cap} />
            <circle cx={gx} cy={innerH} r={1.85} fill={cap} />
            <circle cx={gx} cy={0} r={0.55} fill={chrome.gridPinFill} />
            <circle cx={gx} cy={innerH} r={0.55} fill={chrome.gridPinFillDim} />
          </g>
        );
      })}
    </g>
  );
}

/**
 * Halftone “area”: vertical dot stacks; tighter spacing + brighter dots near the line,
 * softer falloff below; optional peak highlight color.
 */
export function DualAxisHalftoneColumns({
  pts,
  yAt,
  innerW,
  innerH,
  color,
  peakColor,
  colStep: colStepProp,
  rowStep: rowStepProp,
  seed,
  maxOpacity = 0.5,
  lite = false,
}: {
  pts: DualAxisValuePt[];
  yAt: (v: number) => number;
  innerW: number;
  innerH: number;
  color: string;
  /** Brighter fill near the series peak (defaults to `color`). */
  peakColor?: string;
  colStep?: number;
  rowStep?: number;
  seed: number;
  maxOpacity?: number;
  lite?: boolean;
}) {
  const chrome = useDashboardChartChrome();
  const colStep = colStepProp ?? (lite ? 6.5 : 4.5);
  const rowStep = rowStepProp ?? (lite ? 5.25 : 4);
  const circles: ReactNode[] = [];
  let key = 0;
  const hi = peakColor ?? color;
  if (pts.length < 2) return null;

  for (let gx = colStep * 0.5; gx < innerW; gx += colStep) {
    const tn = (gx / innerW) * (pts.length - 1);
    const i0 = Math.floor(tn);
    const i1 = Math.min(pts.length - 1, i0 + 1);
    const fr = tn - i0;
    const v = pts[i0].v * (1 - fr) + pts[i1].v * fr;
    let yTop = yAt(v);
    yTop = Math.max(0, Math.min(innerH - 0.5, yTop));
    const colKey = Math.round(gx * 7);
    const span = innerH - yTop;
    if (span < 2.5) continue;

    let y = innerH - rowStep * 0.2;
    while (y >= yTop) {
      const towardBase = span > 0.5 ? (y - yTop) / span : 0;
      const nearLine = Math.max(0, Math.min(1, 1 - towardBase));
      const fade =
        Math.pow(nearLine, 1.28) * maxOpacity * (0.78 + 0.22 * nearLine);
      if (fade < 0.024) {
        const skip = Math.max(2.2, rowStep * 0.9);
        y -= skip;
        continue;
      }
      if (prng(seed + colKey * 41 + Math.round(y) * 13) < (lite ? 0.19 : 0.11)) {
        const localRow = Math.max(2, rowStep * (0.36 + 0.64 * (1 - nearLine)));
        y -= localRow;
        continue;
      }
      const rBoost = 0.78 + 0.92 * nearLine;
      const r = (0.55 + prng(seed + colKey * 19 + y) * 0.85) * rBoost;
      const useHi = nearLine > 0.5 && prng(seed + colKey + y * 3) > 0.32;
      const fill = useHi ? hi : color;
      const op = fade * (useHi ? 1.08 : 0.9);
      circles.push(
        <circle
          key={`hc-${seed}-${key++}`}
          cx={gx}
          cy={y}
          r={r}
          fill={fill}
          opacity={Math.min(1, op)}
        />,
      );
      if (
        !lite &&
        nearLine > 0.68 &&
        prng(seed + colKey * 99 + y) > 0.935
      ) {
        circles.push(
          <circle
            key={`sp-${seed}-${key++}`}
            cx={gx + (prng(seed + y) - 0.5) * 1.2}
            cy={y + (prng(seed + y + 1) - 0.5) * 1.2}
            r={0.45}
            fill={chrome.particleSparkle}
            opacity={0.58}
          />,
        );
      }
      const localRow = Math.max(2.1, rowStep * (0.34 + 0.66 * (1 - nearLine)));
      y -= localRow;
    }
  }
  return <g className="pointer-events-none">{circles}</g>;
}

/** Dotted polyline with soft shadow pass + jewelled vertices. */
export function DualAxisDottedTrendLine({
  pts,
  xAt,
  yAt,
  color,
  stepPx: stepPxProp,
  r: rProp,
  vertexR: vertexRProp,
  lite = false,
}: {
  pts: DualAxisValuePt[];
  xAt: (i: number) => number;
  yAt: (v: number) => number;
  color: string;
  stepPx?: number;
  r?: number;
  vertexR?: number;
  lite?: boolean;
}) {
  const chrome = useDashboardChartChrome();
  const stepPx = stepPxProp ?? (lite ? 8.5 : 5.75);
  const r = rProp ?? (lite ? 1.18 : 1.12);
  const vertexR = vertexRProp ?? (lite ? 2.15 : 2.35);
  const shadow: ReactNode[] = [];
  const main: ReactNode[] = [];
  const verts: ReactNode[] = [];
  let k = 0;

  for (let i = 0; i < pts.length - 1; i++) {
    const x0 = xAt(pts[i].i);
    const y0 = yAt(pts[i].v);
    const x1 = xAt(pts[i + 1].i);
    const y1 = yAt(pts[i + 1].v);
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    const n = Math.max(1, Math.ceil(len / stepPx));
    for (let s = 0; s <= n; s++) {
      if (s % 2 === 1) continue;
      const t = s / n;
      const cx = x0 + dx * t;
      const cy = y0 + dy * t;
      const twinkle = 0.78 + prng(i * 200 + s * 17) * 0.22;
      if (!lite) {
        shadow.push(
          <circle
            key={`sh-${k}`}
            cx={cx}
            cy={cy}
            r={r * 2.35}
            fill={color}
            opacity={0.09 * twinkle}
          />,
        );
      }
      main.push(
        <circle
          key={`dl-${k}`}
          cx={cx}
          cy={cy}
          r={r}
          fill={color}
          opacity={0.88 + 0.12 * twinkle}
        />,
      );
      k++;
    }
  }

  pts.forEach((p, i) => {
    const cx = xAt(p.i);
    const cy = yAt(p.v);
    if (lite) {
      verts.push(
        <circle
          key={`vl-${i}`}
          cx={cx}
          cy={cy}
          r={vertexR + 1.6}
          fill={color}
          opacity={0.14}
        />,
      );
      verts.push(
        <circle
          key={`vl2-${i}`}
          cx={cx}
          cy={cy}
          r={vertexR}
          fill={color}
          stroke={chrome.trendVertStrokeLite}
          strokeWidth={0.48}
        />,
      );
      verts.push(
        <circle
          key={`vl3-${i}`}
          cx={cx}
          cy={cy}
          r={0.55}
          fill={chrome.trendSparkleSmall}
          opacity={0.55}
        />,
      );
      return;
    }
    verts.push(
      <circle
        key={`v0-${i}`}
        cx={cx}
        cy={cy}
        r={vertexR + 5}
        fill={color}
        opacity={0.1}
      />,
    );
    verts.push(
      <circle
        key={`v1-${i}`}
        cx={cx}
        cy={cy}
        r={vertexR + 2.2}
        fill="none"
        stroke={color}
        strokeOpacity={0.28}
        strokeWidth={0.55}
      />,
    );
    verts.push(
      <circle
        key={`v2-${i}`}
        cx={cx}
        cy={cy}
        r={vertexR}
        fill={color}
        stroke={chrome.trendVertStrokeFull}
        strokeWidth={0.5}
      />,
    );
    verts.push(
      <circle
        key={`v3-${i}`}
        cx={cx}
        cy={cy}
        r={1.05}
        fill={chrome.trendSparkleSmall}
        opacity={0.42}
      />,
    );
    verts.push(
      <circle
        key={`v4-${i}`}
        cx={cx}
        cy={cy}
        r={0.45}
        fill={chrome.trendSparkleTiny}
        opacity={0.75}
      />,
    );
  });

  return (
    <g className="pointer-events-none">
      <g opacity={1}>{shadow}</g>
      <g>{main}</g>
      <g>{verts}</g>
    </g>
  );
}
