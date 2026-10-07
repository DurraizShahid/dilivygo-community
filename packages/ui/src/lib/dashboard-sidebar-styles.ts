import { cn } from "./utils";

/** Shared shell (bg, rounding, transition). Use inside a flex parent. */
export const dashboardSidebarShellClass =
  "min-h-0 shrink-0 flex-col overflow-hidden bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-out rounded-tl-2xl";

/** Desktop sidebar column: hidden on small screens, flex from `md`. */
export const dashboardSidebarAsideClass = cn(
  "hidden md:flex",
  dashboardSidebarShellClass,
);

export const dashboardSidebarWidthExpanded = "w-[260px]";
export const dashboardSidebarWidthCollapsed = "w-[76px]";

/**
 * Top row — logo + title on sidebar bg; bottom border separates from nav.
 */
export function dashboardSidebarTopRowClass(collapsed: boolean): string {
  return cn(
    "flex shrink-0 items-center border-b border-sidebar-border",
    collapsed ? "flex-col gap-3 px-3 pb-3 pt-5" : "gap-3 px-4 pb-4 pt-5 md:px-5",
  );
}

/** Logo / mark — flat on sidebar (no frosted frame). */
export const dashboardSidebarLogoFrameClass =
  "flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-transparent text-sidebar-foreground";

/** Collapse / expand control. */
export const dashboardSidebarToggleButtonClass =
  "flex size-9 shrink-0 items-center justify-center rounded-lg text-sidebar-foreground/45 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/40";

/**
 * Right-edge indigo → violet glow on a dark surface (fade toward center), shared by
 * desktop nav rows + mobile tab icons.
 */
const dashboardSidebarActiveGlowBackground =
  "bg-[linear-gradient(90deg,rgb(40,40,43)_0%,rgb(36,36,39)_42%,rgba(55,48,163,0.12)_62%,rgba(99,102,241,0.26)_76%,rgba(124,58,237,0.42)_88%,rgba(168,85,247,0.5)_96%,rgba(192,132,252,0.42)_100%)]";

/**
 * Selected nav row — rounded rectangle, dark fill, violet→indigo light along the right edge.
 */
export const dashboardSidebarNavLinkActiveClass = cn(
  "border-0 text-sidebar-foreground shadow-none",
  dashboardSidebarActiveGlowBackground,
);

/** Default nav row. */
export const dashboardSidebarNavLinkInactiveClass =
  "border border-transparent text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground/90";

export function dashboardSidebarNavLinkLayoutClass(collapsed: boolean): string {
  return cn(
    "group flex items-center rounded-2xl text-[13px] font-medium transition-all duration-200",
    collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5",
  );
}

export function dashboardSidebarNavIconClass(active: boolean): string {
  return cn(
    "size-[18px] shrink-0 transition-colors",
    active
      ? "text-sidebar-foreground"
      : "text-sidebar-foreground/45 group-hover:text-sidebar-foreground/85",
  );
}

/** Footer sign-out row divider — minimal light edge. */
export const dashboardSidebarFooterDividerClass = "border-t border-sidebar-border";

/** Muted group label above nav sections. */
export const dashboardSidebarGroupLabelClass =
  "px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-sidebar-foreground/40";

/** Between nav groups. */
export const dashboardSidebarGroupSeparatorClass = "mt-2 border-t border-sidebar-border pt-2";

/** Mobile / compact tab: add to icon wrapper when active (same glow as desktop). */
export const dashboardSidebarMobileActiveIconGlowClass = dashboardSidebarActiveGlowBackground;
