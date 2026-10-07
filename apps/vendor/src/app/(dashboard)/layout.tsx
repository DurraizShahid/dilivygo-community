"use client";

import "@/styles/dashboard-datascape.css";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  LayoutDashboard,
  ClipboardList,
  UtensilsCrossed,
  MessageCircle,
  Settings,
  LogOut,
  Store,
  Ticket,
  MessageSquareQuote,
  PanelLeftClose,
  PanelRight,
  Search,
  ChevronDown,
  Building2,
} from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ThemeToggle,
  DashboardAuthLoading,
  PlatformBrandingMark,
  WorkspaceLogoImage,
  cn,
  dashboardSidebarAsideClass,
  dashboardSidebarLogoFrameClass,
  dashboardSidebarNavIconClass,
  dashboardSidebarNavLinkInactiveClass,
  dashboardSidebarNavLinkLayoutClass,
  dashboardSidebarToggleButtonClass,
  dashboardSidebarTopRowClass,
  dashboardSidebarWidthCollapsed,
  dashboardSidebarWidthExpanded,
  useDefaultProfilePhotoUrls,
  resolveProfileAvatarUrl,
} from "@dilivygo/ui";
import { useTranslation } from "@dilivygo/i18n";
import { GlobeLanguageMenu } from "@dilivygo/i18n/globe-language-menu";
import { WSProvider } from "@/providers/ws-provider";
import { VendorPlacedOrdersProvider } from "@/providers/vendor-placed-orders";
import { VendorCurrencyProvider } from "@/providers/vendor-currency-provider";
import { VendorOrderAlerts } from "@/components/vendor-order-alerts";
import { VendorNotificationsBell, VendorOrdersNavBadge } from "@/components/vendor-orders-nav-badges";
import { useAuthStore } from "@/stores/auth-store";
import { useWorkspaceStore, staffProjectRef } from "@/stores/workspace-store";
import { ShopSelector } from "@/components/shop-selector";
import { VendorDashboardNavSticky } from "@/components/vendor-dashboard-nav-sticky";

const navItems = [
  { href: "/", labelKey: "nav.dashboard", icon: LayoutDashboard },
  { href: "/orders", labelKey: "nav.orders", icon: ClipboardList },
  { href: "/menu", labelKey: "nav.menu", icon: UtensilsCrossed },
  { href: "/shops", labelKey: "nav.shops", icon: Store },
  { href: "/chat", labelKey: "nav.chat", icon: MessageCircle },
  { href: "/reviews", labelKey: "nav.reviews", icon: MessageSquareQuote },
  { href: "/promo-codes", labelKey: "nav.promoCodes", icon: Ticket },
  { href: "/settings", labelKey: "nav.settings", icon: Settings },
];

const SIDEBAR_COLLAPSED_KEY = "dilivygo-dashboard-sidebar-collapsed";

/** Active rail item — aligned with superadmin logistics shell */
const logisticsNavActiveClass = "bg-primary/22 text-foreground";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { t } = useTranslation("vendor");
  const pathname = usePathname();
  const router = useRouter();
  const hydrate = useAuthStore((s) => s.hydrate);
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);
  const { isAuthenticated, isLoading } = useAuthStore();
  const { workspace, fetchWorkspace } = useWorkspaceStore();
  const projectRef = staffProjectRef(user);
  const canUseVendorApp =
    user?.role === "vendor" || user?.role === "admin";
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const defaultProfilePhotoUrls = useDefaultProfilePhotoUrls();

  const displayName =
    user?.email?.split("@")[0]?.replace(/[._]/g, " ") || t("nav.vendorPortal");
  const initials = displayName
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "V";
  const profileImageSrc = useMemo(
    () => resolveProfileAvatarUrl(undefined, user?.id ?? "", defaultProfilePhotoUrls),
    [user?.id, defaultProfilePhotoUrls],
  );
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    try {
      if (localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1") {
        setSidebarCollapsed(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  function toggleSidebarCollapsed() {
    setSidebarCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated && projectRef) {
      void fetchWorkspace(projectRef);
    } else if (!isAuthenticated) {
      useWorkspaceStore.getState().setWorkspace(null);
    }
  }, [isLoading, isAuthenticated, projectRef, fetchWorkspace]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return <DashboardAuthLoading variant="logistics" className="bg-background" />;
  }
  if (!isAuthenticated) return null;

  if (!canUseVendorApp) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
        <Card className="w-full max-w-md border-border/60 shadow-md">
          <CardHeader>
            <CardTitle>{t("wrongAccount.title")}</CardTitle>
            <CardDescription>{t("wrongAccount.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              className="w-full"
              onClick={async () => {
                await logout();
                router.replace("/login");
              }}
            >
              {t("wrongAccount.signOut")}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <WSProvider>
      <VendorPlacedOrdersProvider>
        <VendorCurrencyProvider>
        <div
          className="min-h-screen bg-background text-foreground"
          data-vendor-shell="logistics"
        >
          <div className="flex min-h-screen">
          <aside
            className={cn(
              dashboardSidebarAsideClass,
              "rounded-none border-r border-sidebar-border",
              sidebarCollapsed ? dashboardSidebarWidthCollapsed : dashboardSidebarWidthExpanded,
            )}
          >
            <div className={dashboardSidebarTopRowClass(sidebarCollapsed)}>
              <div className={cn(dashboardSidebarLogoFrameClass, "text-sidebar-foreground")}>
                {workspace?.logoUrl ? (
                  <WorkspaceLogoImage src={workspace.logoUrl} alt="" className="size-full object-cover" />
                ) : (
                  <PlatformBrandingMark className="size-6 text-xs" />
                )}
              </div>
              {!sidebarCollapsed ? (
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="truncate text-[15px] font-semibold tracking-tight text-sidebar-foreground">
                    {workspace?.name || t("nav.vendorPortal")}
                  </p>
                  <div className="truncate text-xs text-sidebar-foreground/45">
                    {user?.email || t("nav.vendorPortal")}
                  </div>
                </div>
              ) : null}
              <button
                type="button"
                className={dashboardSidebarToggleButtonClass}
                aria-expanded={!sidebarCollapsed}
                aria-label={
                  sidebarCollapsed ? t("layout.expandSidebar") : t("layout.collapseSidebar")
                }
                onClick={toggleSidebarCollapsed}
              >
                {sidebarCollapsed ? (
                  <PanelRight className="size-[18px]" />
                ) : (
                  <PanelLeftClose className="size-[18px]" />
                )}
              </button>
            </div>

            <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-2 pt-1 md:px-3">
              {navItems.map(({ href, labelKey, icon: Icon }) => {
                const isActive =
                  href === "/" ? pathname === "/" : pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    title={sidebarCollapsed ? t(labelKey) : undefined}
                    className={cn(
                      dashboardSidebarNavLinkLayoutClass(sidebarCollapsed),
                      isActive
                        ? cn(logisticsNavActiveClass, "shadow-none")
                        : dashboardSidebarNavLinkInactiveClass,
                      href === "/orders" && "relative",
                    )}
                  >
                    <Icon className={dashboardSidebarNavIconClass(isActive)} />
                    <span className={cn("truncate", sidebarCollapsed && "sr-only")}>
                      {t(labelKey)}
                    </span>
                    {href === "/orders" ? (
                      <VendorOrdersNavBadge className="absolute -right-0.5 -top-0.5 sm:right-0 sm:top-0" />
                    ) : null}
                  </Link>
                );
              })}
            </nav>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col bg-background">
            <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-md">
              <div className="flex min-h-[72px] flex-wrap items-center gap-3 px-4 py-2 sm:gap-4 sm:px-6 lg:px-8">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3 sm:max-w-[min(280px,40%)]">
                  <Link href="/" className="hidden shrink-0 items-center gap-2 lg:flex">
                    <span className="truncate text-lg font-semibold tracking-tight text-foreground dark:text-white">
                      {workspace?.name || t("nav.vendorPortal")}
                    </span>
                  </Link>
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-primary to-orange-700 text-primary-foreground shadow-sm md:hidden">
                      {workspace?.logoUrl ? (
                        <WorkspaceLogoImage src={workspace.logoUrl} alt="" />
                      ) : (
                        <PlatformBrandingMark className="size-8 text-xs" />
                      )}
                    </div>
                    <ShopSelector />
                  </div>
                </div>

                <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
                  <div className="flex w-fit min-w-0 shrink-0 items-center gap-1.5 rounded-2xl border border-border bg-background/95 py-1.5 pl-1.5 pr-2 shadow-sm backdrop-blur-md sm:gap-2 sm:pr-2.5">
                    <ThemeToggle className="size-10 shrink-0 rounded-xl bg-transparent [&>button]:flex [&>button]:size-10 [&>button]:items-center [&>button]:justify-center [&>button]:rounded-xl [&>button]:border-0 [&>button]:bg-transparent [&>button]:text-muted-foreground [&>button]:shadow-none [&>button]:hover:bg-muted/80 [&>button]:hover:text-foreground" />
                    <button
                      type="button"
                      className="hidden size-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted/80 hover:text-foreground sm:flex"
                      aria-label={t("layout.search")}
                    >
                      <Search className="size-[18px]" />
                    </button>
                    <VendorNotificationsBell />
                    <GlobeLanguageMenu
                      align="right"
                      className="shrink-0"
                      buttonClassName="size-10 rounded-xl hover:bg-muted/80"
                    />

                    <div className="relative shrink-0">
                      <button
                        type="button"
                        onClick={() => setProfileOpen((o) => !o)}
                        className="flex items-center gap-2 rounded-xl py-1 pl-1 pr-2 hover:bg-muted/80 sm:gap-3 sm:pr-2.5"
                        aria-expanded={profileOpen}
                        aria-haspopup="menu"
                      >
                        <Avatar className="size-9">
                          <AvatarImage
                            src={profileImageSrc || undefined}
                            alt=""
                            className="object-cover"
                          />
                          <AvatarFallback className="bg-gradient-to-br from-primary to-primary/80 text-xs font-semibold text-primary-foreground">
                            {initials}
                          </AvatarFallback>
                        </Avatar>
                        <div className="hidden text-left sm:block">
                          <div className="max-w-[120px] truncate text-[13px] font-medium leading-tight text-foreground">
                            {displayName}
                          </div>
                          <div className="max-w-[120px] truncate text-[11px] capitalize text-muted-foreground">
                            {user?.role || "vendor"}
                          </div>
                        </div>
                        <ChevronDown
                          className={cn(
                            "size-4 shrink-0 text-muted-foreground",
                            profileOpen && "rotate-180",
                          )}
                        />
                      </button>
                      {profileOpen ? (
                        <>
                          <button
                            type="button"
                            className="fixed inset-0 z-40 cursor-default"
                            aria-label={t("layout.closeMenu")}
                            onClick={() => setProfileOpen(false)}
                          />
                          <div className="absolute right-0 top-full z-50 mt-2 w-52 rounded-xl border border-border bg-popover py-1 text-popover-foreground shadow-xl">
                            <Link
                              href="/settings"
                              className="flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-muted dark:text-white/80 dark:hover:bg-white/[0.05]"
                              onClick={() => setProfileOpen(false)}
                            >
                              <Settings className="size-4 opacity-60" />
                              {t("nav.settings")}
                            </Link>
                            <div className="my-1 h-px bg-border/60" />
                            <button
                              type="button"
                              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-destructive hover:bg-muted"
                              onClick={() => {
                                setProfileOpen(false);
                                logout();
                              }}
                            >
                              <LogOut className="size-4 opacity-80" />
                              {t("nav.signOut")}
                            </button>
                          </div>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </header>

            <VendorOrderAlerts />

            <main className="relative flex-1 overflow-y-auto pb-20 md:pb-0">
              <div
                className="relative mx-auto min-h-full w-full max-w-[1600px] px-4 pb-6 pt-0 sm:px-6 sm:pb-8 lg:px-8"
                data-dashboard-datascape="true"
              >
                <VendorDashboardNavSticky />
                {children}
              </div>
            </main>

            <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-sidebar/95 backdrop-blur-sm md:hidden">
              <div className="mx-auto flex max-w-lg items-center justify-around overflow-x-auto py-1 [&::-webkit-scrollbar]:h-0">
                {navItems.map(({ href, labelKey, icon: Icon }) => {
                  const isActive =
                    href === "/" ? pathname === "/" : pathname.startsWith(href);
                  return (
                    <Link
                      key={href}
                      href={href}
                      className={cn(
                        "relative flex min-w-[4.5rem] flex-col items-center gap-1 px-2 py-2 text-[10px] font-medium transition-colors",
                        isActive
                          ? "text-foreground dark:text-white"
                          : "text-muted-foreground dark:text-white/45",
                      )}
                    >
                      <div
                        className={cn(
                          "relative flex size-8 items-center justify-center rounded-2xl transition-all duration-200",
                          isActive && logisticsNavActiveClass,
                        )}
                      >
                        <Icon className="size-[18px]" />
                        {href === "/orders" ? (
                          <VendorOrdersNavBadge className="absolute -right-1 -top-1 ring-1 ring-background" />
                        ) : null}
                      </div>
                      <span className="line-clamp-1 text-center">{t(labelKey)}</span>
                    </Link>
                  );
                })}
              </div>
            </nav>
          </div>
        </div>
      </div>
        </VendorCurrencyProvider>
      </VendorPlacedOrdersProvider>
    </WSProvider>
  );
}
