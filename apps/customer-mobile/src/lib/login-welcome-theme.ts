import type { ThemeColors } from "@dilivygo/types";

/** Login welcome + full-screen auth chrome (matches marketing mock; light / dark). */
export type LoginWelcomePalette = {
  screenBg: string;
  primaryText: string;
  secondaryText: string;
  graphicLines: string;
  primaryBtnBg: string;
  primaryBtnText: string;
  secondaryBtnBg: string;
  secondaryBtnText: string;
  legalMuted: string;
  linkText: string;
  cardBg: string;
  cardBorder: string;
  mutedFill: string;
  destructiveSoft: string;
};

function hexToRgba(hex: string, alpha: number): string | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function defaultWelcomePalette(isDark: boolean): LoginWelcomePalette {
  if (isDark) {
    return {
      screenBg: "#000000",
      primaryText: "#FFFFFF",
      secondaryText: "#8E8E93",
      graphicLines: "rgba(255,255,255,0.9)",
      primaryBtnBg: "#FFFFFF",
      primaryBtnText: "#000000",
      secondaryBtnBg: "#262626",
      secondaryBtnText: "#FFFFFF",
      legalMuted: "#8E8E93",
      linkText: "#FFFFFF",
      cardBg: "#1C1C1E",
      cardBorder: "#38383A",
      mutedFill: "#2C2C2E",
      destructiveSoft: "rgba(255,59,48,0.15)",
    };
  }
  return {
    screenBg: "#FFFFFF",
    primaryText: "#000000",
    secondaryText: "#636366",
    graphicLines: "rgba(0,0,0,0.5)",
    primaryBtnBg: "#000000",
    primaryBtnText: "#FFFFFF",
    secondaryBtnBg: "#F2F2F7",
    secondaryBtnText: "#000000",
    legalMuted: "#636366",
    linkText: "#000000",
    cardBg: "#FFFFFF",
    cardBorder: "#E5E5EA",
    mutedFill: "#F2F2F7",
    destructiveSoft: "rgba(255,59,48,0.12)",
  };
}

/** When `platform` is set, maps shadcn-like tokens into the login chrome palette. */
export function getLoginWelcomePalette(
  isDark: boolean,
  platform?: ThemeColors | null,
): LoginWelcomePalette {
  const base = defaultWelcomePalette(isDark);
  if (!platform) return base;
  const soft =
    platform.destructive && /^#[0-9a-f]{6}$/i.test(platform.destructive.trim())
      ? hexToRgba(platform.destructive, isDark ? 0.15 : 0.12)
      : base.destructiveSoft;
  return {
    screenBg: platform.background ?? base.screenBg,
    primaryText: platform.foreground ?? base.primaryText,
    secondaryText: platform.mutedForeground ?? base.secondaryText,
    graphicLines: base.graphicLines,
    primaryBtnBg: platform.primary ?? base.primaryBtnBg,
    primaryBtnText: platform.primaryForeground ?? base.primaryBtnText,
    secondaryBtnBg: platform.muted ?? base.secondaryBtnBg,
    secondaryBtnText: platform.foreground ?? base.secondaryBtnText,
    legalMuted: platform.mutedForeground ?? base.legalMuted,
    linkText: platform.foreground ?? base.linkText,
    cardBg: platform.card ?? base.cardBg,
    cardBorder: platform.border ?? base.cardBorder,
    mutedFill: platform.muted ?? base.mutedFill,
    destructiveSoft: soft ?? base.destructiveSoft,
  };
}
