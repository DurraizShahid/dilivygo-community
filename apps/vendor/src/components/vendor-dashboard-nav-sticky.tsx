"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@dilivygo/ui";
import { useTranslation } from "@dilivygo/i18n";

/** Dashboard hub sections — same cluster as the home command center; other app routes use sidebar / top pills only. */
const ITEMS: { href: string; labelKey: string }[] = [
  { href: "/", labelKey: "nav.dashboard" },
  { href: "/analytics", labelKey: "nav.analytics" },
  { href: "/live", labelKey: "nav.liveOps" },
  { href: "/workspace", labelKey: "nav.workspace" },
  { href: "/menu-insights", labelKey: "nav.menuInsights" },
];

function navItemActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/" || pathname === "";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Sticky contextual nav — Kokonut-style smooth tab bar across vendor dashboard sections. */
export function VendorDashboardNavSticky() {
  const { t } = useTranslation("vendor");
  const pathname = usePathname() ?? "";

  const onDashboardHub = ITEMS.some((item) => navItemActive(pathname, item.href));

  if (!onDashboardHub) {
    return null;
  }

  const activeItem =
    ITEMS.find((item) => navItemActive(pathname, item.href)) ?? ITEMS[0];
  const activeItemId = activeItem.href;

  return (
    <div className="sticky top-0 z-[35] -mx-5 mb-4 bg-background/95 px-5 py-2 backdrop-blur-sm sm:-mx-6 sm:px-6 md:-mx-8 md:px-8 lg:-mx-10 lg:px-10">
      <nav
        aria-label={t("dashboard.sectionNavAria")}
        className="flex w-full items-center justify-start overflow-x-auto pb-1 scrollbar-none"
      >
        <div className="flex gap-1 rounded-lg bg-muted/50 p-1">
          {ITEMS.map((item) => {
            const isActive = activeItemId === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(item.labelKey)}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
