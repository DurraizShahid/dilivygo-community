"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  MapPin,
  Search,
  ShoppingCart,
  Heart,
  ChevronDown,
  ClipboardList,
  Home,
  Menu,
  MessageCircle,
  X,
  Globe,
  Sun,
  Moon,
  Monitor,
  Check,
  User,
  LogOut,
  Wallet,
} from "lucide-react";
import { useState, useRef, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import {
  cn,
  Avatar,
  AvatarFallback,
  AvatarImage,
  PlatformBrandingMark,
  resolveProfileAvatarUrl,
  useDefaultProfilePhotoUrls,
  useCustomerWalletEnabled,
  formatPrice,
  useCurrency,
} from "@dilivygo/ui";
import {
  useTranslation,
  useLanguage,
  LANGUAGE_LIST,
  markLanguageUserPicked,
} from "@dilivygo/i18n";
import type { SupportedLanguage } from "@dilivygo/i18n";
import { useCartStore } from "@/stores/cart-store";
import { useAuthStore } from "@/stores/auth-store";
import { useBrowseSearchStore } from "@/stores/browse-search-store";
import { HeaderLocationPicker, MobileLocationSheet } from "@/components/header-location-picker";
import { LanguageFlag } from "@/components/language-flag";
import { useHeaderDisplayAddress } from "@/hooks/use-header-display-address";
import {
  loginPathWithWorkspaceRef,
  workspaceRefFromPathname,
} from "@/lib/workspace-ref";
import { api } from "@/lib/api";

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

export function SiteHeader() {
  const { t } = useTranslation("customer");
  const { language, locked, setLanguage } = useLanguage();
  const { theme, setTheme } = useTheme();
  const pathname = usePathname();
  const router = useRouter();
  const itemCount = useCartStore((s) => s.itemCount());
  const cartProjectRef = useCartStore((s) => s.projectRef);
  const { isAuthenticated, customer, logout } = useAuthStore();
  const displayAddress = useHeaderDisplayAddress(t);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileLocationOpen, setMobileLocationOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [themeReady, setThemeReady] = useState(false);
  const searchValue = useBrowseSearchStore((s) => s.query);
  const setSearchValue = useBrowseSearchStore((s) => s.setQuery);
  const searchRef = useRef<HTMLInputElement>(null);
  const langRef = useRef<HTMLDivElement>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  // Prevent hydration mismatch for cart badge (localStorage differs server vs client)
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setThemeReady(true);
  }, []);

  useEffect(() => {
    if (searchOpen && searchRef.current) {
      searchRef.current.focus();
    }
  }, [searchOpen]);

  useEffect(() => {
    if (!langMenuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (langRef.current && !langRef.current.contains(e.target as Node)) {
        setLangMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [langMenuOpen]);

  useEffect(() => {
    if (!accountMenuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target as Node)) {
        setAccountMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [accountMenuOpen]);

  const currentLang = LANGUAGE_LIST.find((l) => l.code === language);

  const signInHref = loginPathWithWorkspaceRef(
    workspaceRefFromPathname(pathname) ?? cartProjectRef ?? undefined
  );

  const isHomePage = pathname === "/";

  const defaultProfilePhotoUrls = useDefaultProfilePhotoUrls();
  const accountAvatarSrc = useMemo(
    () =>
      resolveProfileAvatarUrl(customer?.avatarUrl, customer?.id ?? "", defaultProfilePhotoUrls),
    [customer?.avatarUrl, customer?.id, defaultProfilePhotoUrls],
  );
  const accountInitials = useMemo(
    () => initialsFromName((customer?.name || "").trim() || t("nav.account")),
    [customer?.name, t],
  );

  const customerWalletEnabled = useCustomerWalletEnabled();
  const platformCurrency = useCurrency();
  const { data: walletSnapshot } = useQuery({
    queryKey: ["customer-wallet"],
    queryFn: () => api.customerWallet.get(),
    enabled: mounted && isAuthenticated && customerWalletEnabled,
    staleTime: 45_000,
  });

  const tabLinks = useMemo(
    () =>
      [
        { href: "/", label: t("nav.home"), Icon: Home },
        { href: "/orders", label: t("nav.orders"), Icon: ClipboardList },
        { href: "/favorites", label: t("nav.favorites"), Icon: Heart },
        { href: "/chat", label: t("nav.chat"), Icon: MessageCircle },
      ] as const,
    [t],
  );

  const tabActive = useMemo(() => {
    const p = pathname ?? "";
    return {
      home: p === "/" || p.startsWith("/restaurant/"),
      orders: p.startsWith("/orders"),
      favorites: p.startsWith("/favorites"),
      chat: p.startsWith("/chat"),
    };
  }, [pathname]);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background">
      <div className="mx-auto flex h-14 max-w-7xl min-w-0 items-center gap-3 px-4 lg:px-8">
        <Link href="/" className="flex shrink-0 items-center gap-2" aria-label={t("nav.home")}>
          <span className="flex size-9 items-center justify-center rounded-xl bg-muted/50 ring-1 ring-border/50">
            <PlatformBrandingMark className="size-6 text-lg" />
          </span>
        </Link>

        <div className="flex min-w-0 flex-1 justify-center">
          <button
            type="button"
            onClick={() => setMobileLocationOpen(true)}
            className="flex max-w-full items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-2.5 py-1.5 text-sm shadow-sm transition-all hover:border-primary/35 hover:bg-muted/60 hover:shadow-md md:hidden"
            aria-haspopup="dialog"
            aria-expanded={mobileLocationOpen}
            aria-label={t("locationPicker.deliverTo")}
          >
            <MapPin className="size-3.5 shrink-0 text-primary" />
            <span className="min-w-0 max-w-[min(52vw,14rem)] truncate font-medium" suppressHydrationWarning>
              {displayAddress}
            </span>
            <ChevronDown className="size-3 shrink-0 text-muted-foreground" aria-hidden />
          </button>
          <div className="hidden min-w-0 md:block">
            <HeaderLocationPicker />
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {!isAuthenticated && mounted ? (
            <div className="hidden items-center gap-2 sm:flex">
              <Link
                href={signInHref}
                className="rounded-full border border-border/60 bg-background px-4 py-2 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-muted"
              >
                Log in
              </Link>
              <Link
                href={signInHref}
                className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/25 transition-colors hover:bg-primary/90"
              >
                Sign up for free delivery
              </Link>
            </div>
          ) : null}

          {!locked && (
            <div className="relative hidden sm:block" ref={langRef}>
              <button
                type="button"
                onClick={() => setLangMenuOpen(!langMenuOpen)}
                className="flex items-center gap-2 rounded-full border border-border/60 bg-background px-3 py-2 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-muted"
                aria-label={t("common:language.select")}
                aria-expanded={langMenuOpen}
              >
                <Globe className="size-4 text-muted-foreground" aria-hidden />
                <span className="tabular-nums">{(currentLang?.code ?? language ?? "en").toUpperCase()}</span>
                <ChevronDown
                  className={cn("size-3 text-muted-foreground transition-transform", langMenuOpen && "rotate-180")}
                  aria-hidden
                />
              </button>
              {langMenuOpen && (
                <div className="absolute right-0 top-full z-50 mt-2 min-w-[160px] overflow-hidden rounded-xl border border-border/60 bg-card shadow-xl shadow-black/10 backdrop-blur-md dark:bg-card/90 dark:shadow-black/30">
                  {LANGUAGE_LIST.map((l) => (
                    <button
                      key={l.code}
                      onClick={() => {
                        markLanguageUserPicked();
                        setLanguage(l.code as SupportedLanguage);
                        setLangMenuOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-center gap-2.5 px-3.5 py-2.5 text-sm transition-colors hover:bg-muted",
                        language === l.code && "bg-primary/10 font-medium text-primary"
                      )}
                    >
                      <LanguageFlag countryCode={l.flag} label={l.nativeName} sizePx={22} />
                      <span>{l.nativeName}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <Link
            href="/cart"
            className={cn(
              "relative flex size-10 items-center justify-center rounded-full border border-border/60 bg-background text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground",
              pathname === "/cart" && "bg-primary/10 text-primary"
            )}
            aria-label={t("nav.cart")}
          >
            <ShoppingCart className="size-5" />
            {mounted && itemCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground shadow-md ring-2 ring-background">
                {itemCount > 99 ? "99+" : itemCount}
              </span>
            )}
          </Link>

          {!isHomePage && (
            <button
              type="button"
              onClick={() => setSearchOpen(!searchOpen)}
              className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
              aria-label={t("nav.search")}
            >
              <Search className="size-5" />
            </button>
          )}

          {mounted && isAuthenticated ? (
            <div className="relative hidden sm:block" ref={accountMenuRef}>
              <button
                type="button"
                onClick={() => setAccountMenuOpen(!accountMenuOpen)}
                className={cn(
                  "rounded-full p-0.5 outline-none ring-offset-2 ring-offset-background transition-all hover:opacity-95 focus-visible:ring-2 focus-visible:ring-primary/40",
                  pathname === "/account" && "ring-2 ring-primary/35"
                )}
                aria-label={t("nav.account")}
                aria-expanded={accountMenuOpen}
                aria-haspopup="menu"
              >
                <Avatar className="size-9 border-2 border-border/50 shadow-sm">
                  <AvatarImage src={accountAvatarSrc} alt="" className="object-cover" />
                  <AvatarFallback className="bg-primary/12 text-xs font-semibold text-primary">
                    {accountInitials || <User className="size-4" />}
                  </AvatarFallback>
                </Avatar>
              </button>

              {accountMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-xl border border-border/60 bg-card py-1.5 shadow-xl shadow-black/10 backdrop-blur-md dark:bg-card/90 dark:shadow-black/30"
                >
                  {/* User info */}
                  <div className="border-b border-border/50 px-3 py-2.5">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {customer?.name?.trim() || t("nav.account")}
                    </p>
                    {customer?.email && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{customer.email}</p>
                    )}
                  </div>

                  {/* Account link */}
                  <Link
                    href="/account"
                    role="menuitem"
                    onClick={() => setAccountMenuOpen(false)}
                    className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    <User className="size-4 shrink-0 text-muted-foreground" />
                    {t("nav.account")}
                  </Link>

                  {customerWalletEnabled ? (
                    <Link
                      href="/wallet"
                      role="menuitem"
                      onClick={() => setAccountMenuOpen(false)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted"
                    >
                      <span className="flex items-center gap-2.5">
                        <Wallet className="size-4 shrink-0 text-muted-foreground" />
                        {t("nav.wallet")}
                      </span>
                      {walletSnapshot ? (
                        <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
                          {formatPrice(walletSnapshot.balanceCents, platformCurrency)}
                        </span>
                      ) : null}
                    </Link>
                  ) : null}

                  {/* Theme options */}
                  <div className="my-1 border-t border-border/50" />
                  <p className="px-3 pb-1.5 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Appearance
                  </p>
                  <div className="px-1 pb-1">
                    {themeReady ? (
                      [
                        { value: "light" as const, label: "Light", Icon: Sun },
                        { value: "dark" as const, label: "Dark", Icon: Moon },
                        { value: "system" as const, label: "System", Icon: Monitor },
                      ].map(({ value, label, Icon }) => (
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
                          <span className="flex-1">{label}</span>
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

                  {/* Sign out */}
                  <div className="my-1 border-t border-border/50" />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={async () => {
                      setAccountMenuOpen(false);
                      await logout();
                      useCartStore.getState().clear();
                      router.push("/");
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
                  >
                    <LogOut className="size-4 shrink-0" />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          ) : mounted ? (
            <Link href={signInHref} className="sm:hidden">
              <span className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/25 transition-colors hover:bg-primary/90">
                {t("nav.signIn")}
              </span>
            </Link>
          ) : null}

          {/* Mobile menu toggle */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:hidden"
            aria-label={t("nav.menu")}
          >
            {mobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      <div className="mx-auto hidden h-12 max-w-7xl min-w-0 items-center gap-6 px-4 md:flex lg:px-8">
        <nav className="flex items-center gap-3" aria-label={t("nav.menu")}>
          {tabLinks.map(({ href, label, Icon }) => {
              const active =
                href === "/"
                  ? tabActive.home
                  : href === "/orders"
                    ? tabActive.orders
                    : href === "/favorites"
                      ? tabActive.favorites
                      : tabActive.chat;

              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex items-center gap-2 border-b-2 border-transparent px-2 py-3 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground",
                    active && "border-foreground text-foreground"
                  )}
                >
                  <Icon className={cn("size-4", active ? "text-foreground" : "text-muted-foreground")} />
                  <span>{label}</span>
                </Link>
              );
            })}
        </nav>

        <div className="ml-auto w-[min(560px,46vw)]">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              type="text"
              placeholder={t("header.searchPlaceholder")}
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              autoComplete="off"
              className="box-border h-10 w-full rounded-full border border-border/60 bg-muted/30 py-0 pl-11 pr-4 text-sm text-foreground shadow-sm outline-none transition-all placeholder:text-muted-foreground focus:border-primary/40 focus:bg-background focus:shadow-md focus:ring-2 focus:ring-primary/15"
            />
          </div>
        </div>
      </div>

      {/* Mobile search bar */}
      {searchOpen && (
        <div className="px-4 py-3 md:hidden">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              ref={searchRef}
              type="text"
              placeholder={t("header.searchPlaceholderShort")}
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              autoComplete="off"
              className="box-border h-10 w-full rounded-full border border-border bg-background py-0 pl-11 pr-4 text-sm text-foreground shadow-sm outline-none transition-all placeholder:text-muted-foreground focus:border-primary/50 focus:shadow-md focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>
      )}

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="border-t border-border/50 bg-background px-4 py-4 sm:hidden">
          <div className="space-y-1">
            {[
              { href: "/", label: t("nav.home") },
              { href: "/orders", label: t("nav.orders") },
              { href: "/favorites", label: t("nav.favorites") },
              ...(customerWalletEnabled ? [{ href: "/wallet", label: t("nav.wallet") }] : []),
              { href: "/chat", label: t("nav.chat") },
              { href: "/account", label: t("nav.account") },
            ].map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileMenuOpen(false)}
                className={cn(
                  "block rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-muted",
                  pathname === href && "bg-muted font-medium"
                )}
              >
                {label}
              </Link>
            ))}

            {/* Mobile language switcher */}
            {!locked && (
              <div className="rounded-lg px-3 py-2.5 text-sm">
                <div className="mb-2 flex items-center gap-2 text-muted-foreground">
                  <Globe className="size-4 shrink-0" aria-hidden />
                  <span className="text-xs font-medium uppercase tracking-wide text-foreground/80">
                    {t("common:language.select")}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  {LANGUAGE_LIST.map((l) => (
                    <button
                      key={l.code}
                      type="button"
                      onClick={() => {
                        markLanguageUserPicked();
                        setLanguage(l.code as SupportedLanguage);
                        setMobileMenuOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted",
                        language === l.code && "bg-primary/10 font-medium text-primary"
                      )}
                    >
                      <LanguageFlag
                        countryCode={l.flag}
                        label={l.nativeName}
                        sizePx={22}
                      />
                      <span>{l.nativeName}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!isAuthenticated && (
              <Link
                href={signInHref}
                onClick={() => setMobileMenuOpen(false)}
                className="mt-2 block rounded-full bg-primary px-4 py-2.5 text-center text-sm font-medium text-primary-foreground"
              >
                {t("nav.signIn")}
              </Link>
            )}
          </div>
        </div>
      )}

      <MobileLocationSheet
        open={mobileLocationOpen}
        onClose={() => setMobileLocationOpen(false)}
      />
    </header>
  );
}
