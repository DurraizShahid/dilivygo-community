"use client";

import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import {
  Boxes,
  CheckCircle2,
  Gauge,
  Loader2,
  MapPin,
  Navigation,
  Package,
  Route,
  Sparkles,
  Star,
  Trophy,
  Truck,
  Zap,
} from "lucide-react";
import { cn } from "../lib/utils";
import "./staff-auth-split-layout.css";

export type StaffAuthDecorativeVariant = "superadmin" | "vendor" | "rider" | "pos";

export type StaffAuthSplitLayoutProps = {
  /** Row above the split (e.g. back link + language menu). */
  topBar?: ReactNode;
  /** Main form column content (logo, headings, form, footer). */
  children: ReactNode;
  /** Desktop-only; replaces the default decorative grid. */
  rightPanel?: ReactNode;
  /**
   * Which app's solid accent palette to use on the default right-panel icon tiles.
   * Ignored when `rightPanel` is set.
   */
  decorativeVariant?: StaffAuthDecorativeVariant;
  className?: string;
};

type AccentKind = "checks" | "zap" | "package" | "route" | "loader";

/** Solid tile backgrounds per app (icon + chrome in `text-white`). */
const ACCENT_SOLID_BG: Record<
  StaffAuthDecorativeVariant,
  Record<AccentKind, string>
> = {
  superadmin: {
    checks: "bg-slate-800",
    zap: "bg-sky-700",
    package: "bg-blue-800",
    route: "bg-indigo-900",
    loader: "bg-cyan-800",
  },
  vendor: {
    checks: "bg-emerald-700",
    zap: "bg-green-800",
    package: "bg-teal-700",
    route: "bg-lime-800",
    loader: "bg-emerald-900",
  },
  rider: {
    checks: "bg-blue-700",
    zap: "bg-indigo-600",
    package: "bg-violet-700",
    route: "bg-sky-600",
    loader: "bg-blue-900",
  },
  pos: {
    checks: "bg-violet-700",
    zap: "bg-fuchsia-600",
    package: "bg-purple-700",
    route: "bg-pink-700",
    loader: "bg-indigo-800",
  },
};

/** Few large tiles — bleed/scale below clips partial squares at the panel edge. */
const TILE_GRID_COLS = 5;
const TILE_GRID_ROWS = 5;

/** Non-accent filler tiles — solid theme colors only (no glass). */
function tileSolidClass(i: number) {
  const m = i % 3;
  if (m === 0) return "bg-muted";
  if (m === 1) return "bg-secondary";
  return "bg-background";
}

/** Accent tiles (same footprint as every other cell). */
const ACCENT_TILE_INDEXES = new Map<number, AccentKind>([
  [3, "checks"],
  [8, "zap"],
  [12, "package"],
  [17, "route"],
  [22, "loader"],
]);

type LucideIcon = ComponentType<{ className?: string; strokeWidth?: number }>;

type SlideTheme = "dark" | "light";

type AccentSlide = {
  Icon: LucideIcon;
  label: string;
  headline: string;
  description: string;
  metric: string;
  unit: string;
  /**
   * Flat background color applied to this slide only — swapped per card so
   * each transition is visually distinct.
   */
  bgClass: string;
  /** Text contrast: `dark` → near-black type, `light` → white type. */
  theme: SlideTheme;
};

type RotatingAccentKind = Exclude<AccentKind, "loader">;

/**
 * Flat palette — bright, editorial, no gradients. Each color is paired with
 * the text theme that has enough contrast on it (dark text on the light
 * swatches, white text on the saturated ones).
 */
const PALETTE = {
  yellow: { bgClass: "bg-[#F5FE38]", theme: "dark" as SlideTheme },
  green: { bgClass: "bg-[#00FF91]", theme: "dark" as SlideTheme },
  purple: { bgClass: "bg-[#A478EC]", theme: "light" as SlideTheme },
  orange: { bgClass: "bg-[#DF4E02]", theme: "light" as SlideTheme },
} as const;

/**
 * Promotional copy cycled through each colored accent tile. The palette
 * rotation is offset per tile so adjacent squares never share the same color
 * on the same frame.
 */
const ACCENT_SLIDES: Record<RotatingAccentKind, AccentSlide[]> = {
  checks: [
    {
      Icon: CheckCircle2,
      label: "Operations",
      headline: "Orders delivered",
      description:
        "Real-time completion tracking across every brand, storefront and shift.",
      metric: "1,204",
      unit: "today",
      ...PALETTE.yellow,
    },
    {
      Icon: Trophy,
      label: "Service level",
      headline: "On-time delivery",
      description:
        "Every stop timed to the second so customers never wait past their ETA.",
      metric: "98.7%",
      unit: "within ETA",
      ...PALETTE.green,
    },
    {
      Icon: Star,
      label: "Momentum",
      headline: "Targets exceeded",
      description:
        "Weekly revenue and volume goals tracked with smart benchmarks per brand.",
      metric: "+24%",
      unit: "week over week",
      ...PALETTE.purple,
    },
  ],
  zap: [
    {
      Icon: Zap,
      label: "Realtime",
      headline: "Instant sync",
      description:
        "Every rider, cashier and dashboard stays current with sub-100 ms latency.",
      metric: "< 100ms",
      unit: "end-to-end",
      ...PALETTE.orange,
    },
    {
      Icon: Sparkles,
      label: "AI ops",
      headline: "Autopilot on",
      description:
        "Smart routing, pricing and inventory auto-tuned every few minutes.",
      metric: "24/7",
      unit: "autonomous ops",
      ...PALETTE.yellow,
    },
    {
      Icon: Gauge,
      label: "Reliability",
      headline: "Always fresh",
      description:
        "Live metrics streamed every second — no stale dashboards, no refresh.",
      metric: "99.99%",
      unit: "uptime",
      ...PALETTE.green,
    },
  ],
  package: [
    {
      Icon: Package,
      label: "Inventory",
      headline: "Smart stock",
      description:
        "Auto-reorders trigger the moment stock dips below configured safety levels.",
      metric: "0",
      unit: "stockouts",
      ...PALETTE.purple,
    },
    {
      Icon: Boxes,
      label: "Multi-brand",
      headline: "One console",
      description:
        "Every storefront, menu and SKU managed from a single unified workspace.",
      metric: "38",
      unit: "brands live",
      ...PALETTE.orange,
    },
    {
      Icon: Truck,
      label: "Fulfillment",
      headline: "Same-day ready",
      description:
        "End-to-end tracking from pickup through customer hand-off, every time.",
      metric: "87 min",
      unit: "avg delivery",
      ...PALETTE.yellow,
    },
  ],
  route: [
    {
      Icon: Route,
      label: "Routing",
      headline: "AI dispatch",
      description:
        "Optimal stops planned and re-planned every second as the day unfolds.",
      metric: "−32%",
      unit: "miles saved",
      ...PALETTE.green,
    },
    {
      Icon: MapPin,
      label: "Visibility",
      headline: "Live ops map",
      description:
        "Every rider, order and outlet plotted on one map, updating in real time.",
      metric: "128",
      unit: "riders live",
      ...PALETTE.purple,
    },
    {
      Icon: Navigation,
      label: "Efficiency",
      headline: "Minimum fuel",
      description:
        "Stop sequencing tuned to cut distance, fuel burn and rider idle time.",
      metric: "2.4×",
      unit: "drops per trip",
      ...PALETTE.orange,
    },
  ],
};

/** Stagger each tile so their swipes don't all fire on the same frame. */
const ACCENT_START_DELAY_MS: Record<RotatingAccentKind, number> = {
  checks: 0,
  zap: 1600,
  package: 3200,
  route: 4800,
};

const SLIDE_INTERVAL_MS = 6200;
/** Must match the `staff-auth-slide-enter` / `-exit` animation duration. */
const SLIDE_ANIMATION_MS = 950;

function RotatingAccentTile({ kind }: { kind: RotatingAccentKind }) {
  const slides = ACCENT_SLIDES[kind];
  const [currentIdx, setCurrentIdx] = useState(0);
  const [outgoingIdx, setOutgoingIdx] = useState<number | null>(null);

  useEffect(() => {
    if (slides.length <= 1) return;
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mql.matches) return;

    let intervalId: ReturnType<typeof setInterval> | undefined;
    let clearOutgoingId: ReturnType<typeof setTimeout> | undefined;
    const startId = setTimeout(() => {
      intervalId = setInterval(() => {
        setCurrentIdx((prev) => {
          setOutgoingIdx(prev);
          if (clearOutgoingId) clearTimeout(clearOutgoingId);
          clearOutgoingId = setTimeout(
            () => setOutgoingIdx(null),
            SLIDE_ANIMATION_MS + 50,
          );
          return (prev + 1) % slides.length;
        });
      }, SLIDE_INTERVAL_MS);
    }, ACCENT_START_DELAY_MS[kind]);

    return () => {
      clearTimeout(startId);
      if (intervalId) clearInterval(intervalId);
      if (clearOutgoingId) clearTimeout(clearOutgoingId);
    };
  }, [kind, slides.length]);

  // Persistent backdrop keeps the outgoing slide's color in place for the full
  // length of the swipe so the shrinking/scaling cards never expose the parent
  // panel behind them. Once the transition settles, it tracks the current card.
  const backdropSlide = slides[outgoingIdx ?? currentIdx];

  return (
    <div className="relative size-full overflow-hidden">
      <div
        className={cn("absolute inset-0", backdropSlide.bgClass)}
        aria-hidden
      />
      {outgoingIdx !== null ? (
        <SlideCard
          key={`out-${outgoingIdx}`}
          slide={slides[outgoingIdx]}
          phase="exit"
        />
      ) : null}
      <SlideCard
        key={`in-${currentIdx}`}
        slide={slides[currentIdx]}
        phase="enter"
      />
    </div>
  );
}

function SlideCard({
  slide,
  phase,
}: {
  slide: AccentSlide;
  phase: "enter" | "exit";
}) {
  const Icon = slide.Icon;
  const isDark = slide.theme === "dark";
  return (
    <div
      className={cn(
        "absolute inset-0 overflow-hidden",
        slide.bgClass,
        isDark ? "text-neutral-900" : "text-white",
        phase === "enter" ? "staff-auth-slide-enter" : "staff-auth-slide-exit",
      )}
      aria-hidden={phase === "exit"}
    >
      <div className="relative z-10 flex size-full flex-col justify-between p-3 md:p-4">
        <div className="flex items-start justify-between gap-2">
          <span className="staff-auth-slide-kicker text-[9px] font-medium uppercase tracking-[0.28em] opacity-75 md:text-[10px]">
            {slide.label}
          </span>
          <Icon
            className="staff-auth-slide-icon size-4 shrink-0 md:size-[18px]"
            strokeWidth={2.25}
          />
        </div>

        <div className="space-y-2">
          <div className="staff-auth-slide-metric">
            <div
              className={cn(
                "font-sans text-[34px] font-bold leading-[0.92] tabular-nums tracking-[-0.045em] md:text-[42px]",
                isDark ? "text-neutral-900" : "text-white",
              )}
            >
              {slide.metric}
            </div>
            <div className="mt-1 text-[9px] font-medium uppercase tracking-[0.22em] opacity-60 md:text-[10px]">
              {slide.unit}
            </div>
          </div>

          <div>
            <span
              className="staff-auth-slide-rule block h-px w-6 bg-current opacity-30"
              aria-hidden
            />
            <p className="staff-auth-slide-headline pt-2 text-[11px] font-semibold leading-tight tracking-[-0.01em] md:text-xs lg:text-[13px]">
              {slide.headline}
            </p>
            <p className="staff-auth-slide-desc mt-1 hidden text-[10px] font-normal leading-snug opacity-70 md:line-clamp-2 lg:text-[11px]">
              {slide.description}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function DefaultStaffAuthRightPanel({ variant }: { variant?: StaffAuthDecorativeVariant }) {
  let src = "https://images.unsplash.com/photo-1556742044-3c52d6e88c62?q=80&w=2000&auto=format&fit=crop";
  if (variant === "superadmin") {
    src = "/superadmin.jpeg";
  } else if (variant === "pos") {
    src = "/pos.jpeg";
  } else if (variant === "vendor") {
    src = "/vendor_login.png";
  } else if (variant === "rider") {
    src = "/rider.jpeg";
  }

  return (
    <div
      className="relative h-full min-h-0 w-full flex-1 overflow-hidden rounded-3xl"
      aria-hidden
    >
      <img
        src={src}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
      />
    </div>
  );
}

/**
 * Split staff login layout: form column (~42% on `lg+`) + decorative tile panel (desktop).
 * Pass `decorativeVariant` for per-app solid accent colors on the default right panel.
 */
export function StaffAuthSplitLayout({
  topBar,
  children,
  rightPanel,
  decorativeVariant = "superadmin",
  className,
}: StaffAuthSplitLayoutProps) {
  return (
    <div
      className={cn(
        "flex min-h-dvh w-full flex-col overflow-hidden bg-background",
        className,
      )}
    >
      {topBar ? (
        <div className="flex w-full shrink-0 items-center justify-between gap-3 border-b border-border/60 px-4 py-3 sm:px-5 sm:py-3.5">
          {topBar}
        </div>
      ) : null}

      <div className="flex min-h-0 w-full flex-1 flex-col lg:flex-row">
        <div className="relative flex min-h-0 w-full flex-1 flex-col lg:w-[42%] lg:shrink-0">
          <div className="flex flex-1 flex-col justify-center px-4 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-12">
            {children}
          </div>
        </div>

        <div className="hidden min-h-[320px] w-full min-w-0 flex-1 p-3 lg:flex lg:p-4">
          {rightPanel ?? (
            <DefaultStaffAuthRightPanel variant={decorativeVariant} />
          )}
        </div>
      </div>
    </div>
  );
}
