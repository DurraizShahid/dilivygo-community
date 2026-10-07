"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  MapPin,
  ChevronDown,
  LocateFixed,
  Home,
  Briefcase,
  Building2,
  Plus,
  Check,
  Loader2,
  X,
  Pencil,
} from "lucide-react";
import { cn } from "@dilivygo/ui";
import { useTranslation } from "@dilivygo/i18n";
import type { CustomerAddress } from "@dilivygo/types";
import { useAuthStore } from "@/stores/auth-store";
import { useLocationStore } from "@/stores/location-store";
import { api } from "@/lib/api";
import { formatCustomerAddressLine } from "@/lib/customer-address";
import { useHeaderDisplayAddress } from "@/hooks/use-header-display-address";
import { useCartStore } from "@/stores/cart-store";
import {
  loginPathWithWorkspaceRef,
  workspaceRefFromPathname,
} from "@/lib/workspace-ref";

const LABEL_ICONS: Record<string, typeof Home> = {
  Home,
  Work: Briefcase,
  Office: Building2,
};

function AddressRowIcon({ label }: { label: string }) {
  const Icon = LABEL_ICONS[label] ?? MapPin;
  return <Icon className="size-4 shrink-0 text-muted-foreground" />;
}

function LocationPickerBody({
  onClose,
  showDeliverToHeading = true,
}: {
  onClose: () => void;
  /** Hide when the parent sheet already shows the title (mobile). */
  showDeliverToHeading?: boolean;
}) {
  const { t } = useTranslation("customer");
  const pathname = usePathname();
  const cartProjectRef = useCartStore((s) => s.projectRef);
  const signInHref = loginPathWithWorkspaceRef(
    workspaceRefFromPathname(pathname) ?? cartProjectRef ?? undefined
  );
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const {
    address,
    status,
    lat,
    savedAddressId,
    detectLocation,
    applySavedAddress,
    clearSavedAddressSelection,
  } = useLocationStore();

  const { data: addressData, isLoading: addressesLoading } = useQuery({
    queryKey: ["addresses"],
    queryFn: () => api.addresses.list(),
    enabled: isAuthenticated,
  });
  const savedAddresses = addressData?.addresses ?? [];

  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const clearStaleSaved = useCallback(() => {
    const id = useLocationStore.getState().savedAddressId;
    if (!id || !savedAddresses.length) return;
    if (!savedAddresses.some((a) => a.id === id)) {
      useLocationStore.getState().clearSavedAddressSelection();
    }
  }, [savedAddresses]);

  useEffect(() => {
    clearStaleSaved();
  }, [clearStaleSaved]);

  const gpsActive = !savedAddressId;
  const gpsSubtitle =
    status === "loading" && gpsActive
      ? t("locationPicker.detecting")
      : address && gpsActive
        ? address
        : status === "denied"
          ? t("locationPicker.allowLocationHint")
          : t("locationPicker.useGpsSubtitle");

  async function onSelectSaved(addr: CustomerAddress) {
    setResolvingId(addr.id);
    try {
      await applySavedAddress(addr);
      onClose();
    } catch {
    } finally {
      setResolvingId(null);
    }
  }

  function onUseCurrentLocation() {
    clearSavedAddressSelection();
    detectLocation();
    onClose();
  }

  return (
    <div className="flex max-h-[min(70vh,520px)] flex-col">
      {showDeliverToHeading ? (
        <div className="border-b border-border/60 px-4 py-3">
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            {t("locationPicker.deliverTo")}
          </h2>
        </div>
      ) : null}

      <div className="overflow-y-auto overscroll-contain px-2 py-2">
        <button
          type="button"
          onClick={onUseCurrentLocation}
          className={cn(
            "flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-muted/80",
            gpsActive && "bg-primary/5"
          )}
        >
          <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
            <LocateFixed className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">
                {t("locationPicker.useCurrentLocation")}
              </span>
              {gpsActive && status === "granted" && lat != null && (
                <Check className="size-4 shrink-0 text-primary" aria-hidden />
              )}
            </div>
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
              {gpsSubtitle}
            </p>
          </div>
        </button>

        <div className="my-2 border-t border-border/50" />

        <p
          className="mb-1 px-3 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
          id="location-picker-saved-heading"
        >
          {t("locationPicker.savedAddresses")}
        </p>

        {!isAuthenticated && (
          <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-3 py-4 text-center">
            <p className="text-sm text-muted-foreground">
              {t("locationPicker.signInForSaved")}
            </p>
            <Link
              href={signInHref}
              onClick={onClose}
              className="mt-2 inline-block text-sm font-semibold text-primary hover:underline"
            >
              {t("nav.signIn")}
            </Link>
          </div>
        )}

        {isAuthenticated && addressesLoading && (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {t("locationPicker.loadingAddresses")}
          </div>
        )}

        {isAuthenticated && !addressesLoading && savedAddresses.length === 0 && (
          <p className="px-3 py-2 text-sm text-muted-foreground">
            {t("locationPicker.noSavedAddresses")}
          </p>
        )}

        {isAuthenticated &&
          savedAddresses.map((addr) => {
            const selected = savedAddressId === addr.id;
            const busy = resolvingId === addr.id;
            return (
              <button
                key={addr.id}
                type="button"
                disabled={busy}
                onClick={() => void onSelectSaved(addr)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-muted/80",
                  selected && "bg-primary/5"
                )}
              >
                <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-muted/80">
                  <AddressRowIcon label={addr.label} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-foreground">
                      {addr.label?.trim() || formatCustomerAddressLine(addr)}
                    </span>
                    {addr.isDefault && (
                      <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                        {t("locationPicker.defaultBadge")}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {formatCustomerAddressLine(addr)}
                  </p>
                </div>
                {busy ? (
                  <Loader2 className="mt-1 size-4 shrink-0 animate-spin text-muted-foreground" />
                ) : selected ? (
                  <Check className="mt-1 size-4 shrink-0 text-primary" aria-hidden />
                ) : null}
              </button>
            );
          })}
      </div>

      <div className="border-t border-border/60 bg-muted/20 px-2 py-2">
        <Link
          href="/addresses"
          onClick={onClose}
          className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/80"
        >
          <Plus className="size-4 text-primary" />
          {t("locationPicker.addNewAddress")}
        </Link>
        {isAuthenticated && (
          <Link
            href="/addresses"
            onClick={onClose}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
          >
            <Pencil className="size-4" />
            {t("locationPicker.manageAddresses")}
          </Link>
        )}
      </div>
    </div>
  );
}

export function HeaderLocationPicker() {
  const { t } = useTranslation("customer");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const displayAddress = useHeaderDisplayAddress(t);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    <div className="relative min-w-0" ref={wrapRef}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
        className="flex max-w-full items-center gap-1.5 rounded-full border border-border/60 bg-muted/60 px-2.5 py-1.5 text-sm shadow-sm backdrop-blur-sm transition-all hover:border-primary/35 hover:bg-muted hover:shadow-md sm:px-3"
      >
        <MapPin className="size-3.5 shrink-0 text-primary" />
        <span
          className="min-w-0 max-w-[min(42vw,11rem)] truncate font-medium sm:max-w-[180px] md:max-w-[220px]"
          suppressHydrationWarning
        >
          {displayAddress}
        </span>
        <ChevronDown
          className={cn(
            "size-3 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
        />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={t("locationPicker.deliverTo")}
          className="absolute left-0 top-full z-50 mt-2 w-[min(calc(100vw-2rem),380px)] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-border/60 bg-card shadow-xl shadow-black/10 backdrop-blur-md dark:bg-card/95 dark:shadow-black/30"
        >
          <LocationPickerBody onClose={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

export function MobileLocationSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation("customer");

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] md:hidden" role="presentation">
      <button
        type="button"
        aria-label={t("common:close")}
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-hidden rounded-t-2xl border border-border/60 bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <p className="text-sm font-semibold">{t("locationPicker.deliverTo")}</p>
          <button
            type="button"
            onClick={onClose}
            className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label={t("common:close")}
          >
            <X className="size-5" />
          </button>
        </div>
        <LocationPickerBody onClose={onClose} showDeliverToHeading={false} />
      </div>
    </div>
  );
}
