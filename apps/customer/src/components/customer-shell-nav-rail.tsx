"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Heart,
  Home,
  LogIn,
  LogOut,
  Monitor,
  Moon,
  Search,
  ShoppingCart,
  Store,
  Sun,
  User,
} from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  cn,
  PlatformBrandingMark,
  resolveProfileAvatarUrl,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useDefaultProfilePhotoUrls,
} from "@dilivygo/ui";
import {
  useTranslation,
  useLanguage,
  LANGUAGE_LIST,
  markLanguageUserPicked,
} from "@dilivygo/i18n";
import type { SupportedLanguage } from "@dilivygo/i18n";
import { loginPathWithWorkspaceRef, workspaceRefFromPathname } from "@/lib/workspace-ref";
import { useBrowseSearchStore } from "@/stores/browse-search-store";
import { useCartStore } from "@/stores/cart-store";
import { useAuthStore } from "@/stores/auth-store";
import { LanguageFlag } from "@/components/language-flag";

const THEME_OPTION_KEYS = [
  { value: "light" as const, labelKey: "storeMenu.themeLight" as const, Icon: Sun },
  { value: "dark" as const, labelKey: "storeMenu.themeDark" as const, Icon: Moon },
  { value: "system" as const, labelKey: "storeMenu.themeSystem" as const, Icon: Monitor },
];

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) {
    const w = parts[0]!;
    return w.length >= 2 ? w.slice(0, 2).toUpperCase() : (w[0]! + w[0]!).toUpperCase();
  }
  const a = parts[0]![0] ?? "";
  const b = parts[parts.length - 1]![0] ?? "";
  return (a + b).toUpperCase();
}

type NavItemProps = {
  href: string;
  label: string;
  children: React.ReactNode;
  active?: boolean;
  badgeCount?: number;
};

function NavItem({ href, label, children, active, badgeCount }: NavItemProps) {
  return (
    <Link
      href={href}
      title={label}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex size-11 items-center justify-center rounded-xl transition-colors",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      {children}
      {badgeCount != null && badgeCount > 0 ? (
        <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground ring-2 ring-card">
          {badgeCount > 99 ? "99+" : badgeCount}
        </span>
      ) : null}
    </Link>
  );
}

function parseNavContext(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  const inRestaurant = parts[0] === "restaurant";
  return { parts, inRestaurant };
}

function MenuSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 pb-1.5 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </p>
  );
}

export function CustomerShellNavRail() {
  const { t } = useTranslation("customer");
  const { language, locked, setLanguage } = useLanguage();
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const requestBrowseSearchFocus = useBrowseSearchStore((s) => s.requestBrowseSearchFocus);
  const cartProjectRef = useCartStore((s) => s.projectRef);
  const itemCount = useCartStore((s) => s.itemCount());
  const customer = useAuthStore((s) => s.customer);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const logout = useAuthStore((s) => s.logout);
  const defaultAvatars = useDefaultProfilePhotoUrls();

  const [mounted, setMounted] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [themeReady, setThemeReady] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setThemeReady(true);
  }, []);

  useEffect(() => {
    if (!profileOpen) return;
    function handlePointerDown(e: PointerEvent) {
      const el = e.target as HTMLElement | null;
      if (!el) return;
      if (profileRef.current?.contains(el)) return;
      // Radix Select list is portaled outside the profile panel
      if (el.closest("[data-slot='select-content']")) return;
      setProfileOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setProfileOpen(false);
    }
    const id = requestAnimationFrame(() => {
      document.addEventListener("pointerdown", handlePointerDown, true);
    });
    document.addEventListener("keydown", handleKey);
    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKey);
    };
  }, [profileOpen]);

  const workspaceRef = useMemo(
    () => workspaceRefFromPathname(pathname) ?? cartProjectRef ?? null,
    [pathname, cartProjectRef]
  );
  const loginHref = loginPathWithWorkspaceRef(workspaceRef);

  const { inRestaurant } = parseNavContext(pathname);
  const homeActive = pathname === "/";
  const cartActive = pathname.startsWith("/cart");
  const favoritesActive = pathname.startsWith("/favorites");

  const currentLanguageInfo = useMemo(
    () => LANGUAGE_LIST.find((l) => l.code === language),
    [language]
  );

  const avatarSrc = customer
    ? resolveProfileAvatarUrl(
        customer.avatarUrl ?? undefined,
        customer.id,
        defaultAvatars
      )
    : undefined;

  function handleSearchClick() {
    requestBrowseSearchFocus();
    if (pathname !== "/") {
      router.push("/");
    }
  }

  function closeProfile() {
    setProfileOpen(false);
  }

  return (
    <aside className="fixed left-0 top-0 z-50 flex h-dvh w-[76px] flex-col items-center overflow-visible border-r border-border/60 bg-card py-4">
      <div className="flex min-h-0 w-full flex-1 flex-col items-center overflow-y-auto overflow-x-visible">
        <Link
          href="/"
          className="mb-4 flex size-11 items-center justify-center rounded-xl bg-muted/50 text-foreground ring-1 ring-border/50 transition-colors hover:bg-muted"
          aria-label={t("nav.home")}
        >
          <PlatformBrandingMark className="size-7 text-lg" />
        </Link>

        <button
          type="button"
          onClick={handleSearchClick}
          className="mb-3 flex size-11 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={t("nav.search")}
        >
          <Search className="size-[22px] stroke-[2]" />
        </button>

        <nav className="flex flex-col items-center gap-2" aria-label={t("nav.menu")}>
          <NavItem href="/" label={t("nav.home")} active={homeActive}>
            <Home className="size-[22px] stroke-[2]" />
          </NavItem>
          {inRestaurant ? (
            <span
              title={t("storeMenu.inRestaurant", { defaultValue: "Menu" })}
              className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm"
              aria-current="page"
            >
              <Store className="size-[22px] stroke-[2]" />
            </span>
          ) : (
            <NavItem
              href="/"
              label={t("storeMenu.browseRestaurants", { defaultValue: "Restaurants" })}
              active={false}
            >
              <Store className="size-[22px] stroke-[2]" />
            </NavItem>
          )}
          <NavItem
            href="/cart"
            label={t("nav.cart")}
            active={cartActive}
            badgeCount={mounted && itemCount > 0 ? itemCount : undefined}
          >
            <ShoppingCart className="size-[22px] stroke-[2]" />
          </NavItem>
          <NavItem href="/favorites" label={t("nav.favorites")} active={favoritesActive}>
            <Heart className="size-[22px] stroke-[2]" />
          </NavItem>
        </nav>
      </div>

      <div className="flex shrink-0 flex-col items-center pt-4">
        <div className="relative overflow-visible" ref={profileRef}>
          <button
            type="button"
            onClick={() => setProfileOpen((o) => !o)}
            aria-expanded={profileOpen}
            aria-haspopup="menu"
            aria-label={t("storeMenu.profileMenu", { defaultValue: "Profile menu" })}
            className="rounded-full outline-none ring-offset-2 ring-offset-card focus-visible:ring-2 focus-visible:ring-ring"
          >
            {isAuthenticated && customer ? (
              <Avatar className="size-10 border border-border/60 shadow-sm">
                <AvatarImage src={avatarSrc} alt="" />
                <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                  {initialsFromName(customer.name ?? customer.phone ?? "") || (
                    <User className="size-5" />
                  )}
                </AvatarFallback>
              </Avatar>
            ) : (
              <span className="flex size-10 items-center justify-center rounded-full border border-dashed border-border text-xs font-semibold text-muted-foreground transition-all hover:border-primary/50 hover:bg-primary/5 hover:text-primary">
                <User className="size-5" />
              </span>
            )}
          </button>

          {profileOpen ? (
            <div
              role="menu"
              className={cn(
                "absolute bottom-0 left-full z-[70] ml-2 w-[min(280px,calc(100vw-5rem))] overflow-hidden rounded-xl border border-border/60 bg-card py-1.5 shadow-xl",
                "origin-bottom-left motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-left-4 motion-safe:duration-300 motion-safe:ease-out"
              )}
            >
              {isAuthenticated && customer ? (
                <>
                  <div className="border-b border-border/50 px-3 py-2">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {customer.name?.trim() || t("nav.account")}
                    </p>
                    {customer.phone ? (
                      <p className="truncate text-xs text-muted-foreground">{customer.phone}</p>
                    ) : null}
                  </div>
                  <Link
                    href="/account"
                    role="menuitem"
                    onClick={closeProfile}
                    className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    <User className="size-4 shrink-0 text-muted-foreground" />
                    {t("storeMenu.myAccount", { defaultValue: "My account" })}
                  </Link>
                </>
              ) : (
                <Link
                  href={loginHref}
                  role="menuitem"
                  onClick={closeProfile}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted"
                >
                  <LogIn className="size-4 shrink-0 text-muted-foreground" />
                  {t("nav.signIn")}
                </Link>
              )}

              {!locked ? (
                <>
                  <div className="my-1 border-t border-border/50" />
                  <div className="px-3 py-2">
                    <label
                      className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                      htmlFor="customer-profile-language"
                    >
                      {t("common:language.select")}
                    </label>
                    <Select
                      value={language}
                      onValueChange={(v) => {
                        markLanguageUserPicked();
                        setLanguage(v as SupportedLanguage);
                      }}
                    >
                      <SelectTrigger
                        id="customer-profile-language"
                        size="sm"
                        className="h-9 w-full border-border/60 bg-muted/20 shadow-none hover:bg-muted/40"
                        aria-label={t("common:language.select")}
                      >
                        <div className="flex min-h-0 min-w-0 flex-1 items-center gap-2 self-stretch">
                          {currentLanguageInfo ? (
                            <LanguageFlag
                              countryCode={currentLanguageInfo.flag}
                              label={currentLanguageInfo.nativeName}
                              sizePx={18}
                              className="shrink-0 self-center rounded-md"
                            />
                          ) : null}
                          <SelectValue
                            placeholder={t("common:language.select")}
                            className="min-w-0 flex-1 truncate text-start text-xs leading-5"
                          >
                            {currentLanguageInfo?.nativeName}
                          </SelectValue>
                        </div>
                      </SelectTrigger>
                      <SelectContent
                        position="popper"
                        side="right"
                        align="end"
                        sideOffset={8}
                        className="z-[200] max-h-[min(280px,50vh)]"
                      >
                        {LANGUAGE_LIST.map((l) => (
                          <SelectItem
                            key={l.code}
                            value={l.code}
                            textValue={`${l.nativeName} ${l.name}`}
                            className="cursor-pointer py-2 pl-2 pr-8"
                          >
                            <span className="flex w-full min-w-0 items-center gap-2.5">
                              <LanguageFlag
                                countryCode={l.flag}
                                label={l.nativeName}
                                sizePx={20}
                                className="shrink-0 rounded-md"
                              />
                              <span
                                className="min-w-0 flex-1 truncate font-medium"
                                dir={l.dir}
                              >
                                {l.nativeName}
                              </span>
                              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                {l.code}
                              </span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              ) : null}

              <div className="my-1 border-t border-border/50" />
              <MenuSectionLabel>
                {t("storeMenu.appearance", { defaultValue: "Appearance" })}
              </MenuSectionLabel>
              <div className="px-1 pb-1">
                {themeReady ? (
                  THEME_OPTION_KEYS.map(({ value, labelKey, Icon }) => (
                    <button
                      key={value}
                      type="button"
                      role="menuitemradio"
                      aria-checked={theme === value}
                      onClick={() => setTheme(value)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm font-medium transition-colors hover:bg-muted",
                        theme === value
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <Icon className="size-4 shrink-0" />
                      <span className="flex-1">
                        {t(labelKey, {
                          defaultValue:
                            value === "light"
                              ? "Light"
                              : value === "dark"
                                ? "Dark"
                                : "System",
                        })}
                      </span>
                      {theme === value ? (
                        <Check className="size-4 shrink-0 text-primary" aria-hidden />
                      ) : (
                        <span className="size-4 shrink-0" aria-hidden />
                      )}
                    </button>
                  ))
                ) : (
                  <div className="px-2 py-2 text-xs text-muted-foreground">…</div>
                )}
              </div>

              {isAuthenticated ? (
                <>
                  <div className="my-1 border-t border-border/50" />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      closeProfile();
                      void logout().then(() => router.push("/"));
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
                  >
                    <LogOut className="size-4 shrink-0" />
                    {t("storeMenu.signOut", { defaultValue: "Sign out" })}
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
