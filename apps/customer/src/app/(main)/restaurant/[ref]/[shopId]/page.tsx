"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ShoppingCart,
  Plus,
  Minus,
  Heart,
  MapPin,
  Clock,
  Star,
  Store,
  Info,
  X,
  Check,
  Circle,
  CircleDot,
  Square,
  CheckSquare,
  Phone,
  Calendar,
  Bell,
  Search as SearchIcon,
  LayoutGrid,
  Utensils,
  Coffee,
  IceCream2,
  Salad,
  Pizza,
  Beef,
  Croissant,
  Soup,
  ChevronDown,
} from "lucide-react";
import {
  Button,
  Badge,
  Skeleton,
  PriceDisplay,
  cn,
  buttonVariants,
  useMultiShopCartEnabled,
  Input,
  useDeliveryFeeConfig,
  computeDeliveryFee,
  useConfirm,
} from "@dilivygo/ui";
import { useTranslation } from "@dilivygo/i18n";
import { useProducts, useShopDetail, useShopCategories } from "@/hooks/use-products";
import { useFavorites, useFavoriteMutations } from "@/hooks/use-favorites";
import { useCartStore } from "@/stores/cart-store";
import { useAuthStore } from "@/stores/auth-store";
import { useLocationStore } from "@/stores/location-store";
import {
  type Product,
  type ProductVariant,
  type ModifierGroup,
  type ModifierOption,
  type SelectedModifier,
  type OperatingHours,
} from "@dilivygo/types";
import { PromoBanner } from "@/components/promo-banner";
import { MenuProductTile } from "@/components/menu-product-tile";
import { StoreMenuBillsPanel } from "@/components/store-menu/store-menu-bills-panel";
import { api } from "@/lib/api";
import { buildCheckoutDraftGroups } from "@/lib/checkout-draft";
import { getDistanceKmBetweenCoords } from "@/lib/distance-km";

const CATEGORY_ICONS = [
  Utensils,
  Coffee,
  IceCream2,
  Salad,
  Pizza,
  Beef,
  Croissant,
  Soup,
] as const;

/* ─── Shop Info Modal ────────────────────────────────────────────────────── */

const DAY_LABELS: Record<string, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

const DAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function formatOperatingHours(hours: OperatingHours | null | undefined): string[] {
  if (!hours) return ["No hours set"];

  const lines: string[] = [];
  for (const day of DAY_ORDER) {
    const ranges = hours[day as keyof OperatingHours];
    if (ranges && ranges.length > 0) {
      const timeStr = ranges.map(r => `${r.start} - ${r.end}`).join(", ");
      lines.push(`${DAY_LABELS[day]}: ${timeStr}`);
    } else {
      lines.push(`${DAY_LABELS[day]}: Closed`);
    }
  }
  return lines;
}

function ShopInfoModal({
  shop,
  isOpen,
  onClose,
}: {
  shop: { name: string; address?: string; phone?: string; operatingHours?: OperatingHours | null; isOpen?: boolean } | null | undefined;
  isOpen: boolean;
  onClose: () => void;
}) {
  if (!isOpen || !shop) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative flex max-h-[80dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-background shadow-2xl sm:rounded-3xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/50 p-5">
          <h2 className="text-xl font-bold">Shop Information</h2>
          <button
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-full bg-muted/80 text-muted-foreground transition-colors hover:bg-muted"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Open/Closed Status */}
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "flex size-10 items-center justify-center rounded-full",
                shop.isOpen === false ? "bg-destructive/10" : "bg-primary/10",
              )}
            >
              <Clock className={cn("size-5", shop.isOpen === false ? "text-destructive" : "text-primary")} />
            </div>
            <div>
              <p className="font-semibold text-foreground">
                {shop.isOpen === false ? "Currently Closed" : "Currently Open"}
              </p>
              <p className="text-sm text-muted-foreground">
                {shop.isOpen === false ? "Not accepting orders at this time" : "Accepting orders now"}
              </p>
            </div>
          </div>

          {/* Operating Hours */}
          <div className="rounded-xl border border-border/50 bg-muted/30 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Calendar className="size-4 text-muted-foreground" />
              <h3 className="font-semibold">Operating Hours</h3>
            </div>
            <div className="space-y-1.5 text-sm">
              {formatOperatingHours(shop.operatingHours).map((line, idx) => (
                <div key={idx} className="flex justify-between">
                  <span className="text-muted-foreground">{line.split(": ")[0]}</span>
                  <span className="font-medium">{line.split(": ")[1]}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Address */}
          {shop.address && (
            <div className="flex items-start gap-3">
              <div className="flex size-10 items-center justify-center rounded-full bg-primary/10">
                <MapPin className="size-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold">Address</p>
                <p className="text-sm text-muted-foreground">{shop.address}</p>
              </div>
            </div>
          )}

          {/* Phone */}
          {shop.phone && (
            <div className="flex items-start gap-3">
              <div className="flex size-10 items-center justify-center rounded-full bg-primary/10">
                <Phone className="size-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold">Phone</p>
                <p className="text-sm text-muted-foreground">{shop.phone}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Product Detail Modal ───────────────────────────────────────────────── */

function ProductDetailModal({
  product,
  currency,
  onClose,
  onAddToCart,
}: {
  product: Product;
  currency?: string;
  onClose: () => void;
  onAddToCart: (item: {
    quantity: number;
    unitPriceCents: number;
    selectedModifiers: SelectedModifier[];
    productVariantId?: string;
    lineName?: string;
  }) => void;
}) {
  const variants = useMemo(
    () =>
      [...(product.variants ?? [])].sort(
        (a, b) => a.sortOrder - b.sortOrder
      ),
    [product.variants]
  );
  const hasVariants = variants.length > 0;

  const groups = useMemo(
    () =>
      [...(product.modifierGroups ?? [])].sort(
        (a, b) => a.sortOrder - b.sortOrder
      ),
    [product.modifierGroups]
  );

  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    () => {
      const firstAvail = variants.find((v) => v.available);
      return firstAvail?.id ?? variants[0]?.id ?? null;
    }
  );

  const [selections, setSelections] = useState<Record<string, Set<string>>>(
    () => {
      const init: Record<string, Set<string>> = {};
      for (const g of groups) {
        const defaults = g.options
          .filter((o) => o.isDefault)
          .map((o) => o.id);
        init[g.id] = new Set(defaults);
      }
      return init;
    }
  );

  const [quantity, setQuantity] = useState(1);

  const toggleOption = useCallback(
    (group: ModifierGroup, option: ModifierOption) => {
      setSelections((prev) => {
        const next = { ...prev };
        const set = new Set(prev[group.id] ?? []);
        if (group.maxSelections === 1) {
          if (set.has(option.id)) {
            if (!group.required) set.delete(option.id);
          } else {
            set.clear();
            set.add(option.id);
          }
        } else {
          if (set.has(option.id)) {
            set.delete(option.id);
          } else if (set.size < group.maxSelections) {
            set.add(option.id);
          }
        }
        next[group.id] = set;
        return next;
      });
    },
    []
  );

  const validationErrors = useMemo(() => {
    const errors: Record<string, string> = {};
    for (const g of groups) {
      const count = selections[g.id]?.size ?? 0;
      if (g.required && count < g.minSelections) {
        errors[g.id] =
          g.minSelections === 1
            ? "Required"
            : `Select at least ${g.minSelections}`;
      }
    }
    return errors;
  }, [groups, selections]);

  const selectedVariant = useMemo(
    () => variants.find((v) => v.id === selectedVariantId) ?? null,
    [variants, selectedVariantId]
  );

  const variantOk =
    !hasVariants ||
    (Boolean(selectedVariantId) &&
      Boolean(selectedVariant?.available));

  const isValid =
    Object.keys(validationErrors).length === 0 && variantOk;

  const modifierTotal = useMemo(() => {
    let total = 0;
    for (const g of groups) {
      for (const optId of selections[g.id] ?? []) {
        const opt = g.options.find((o) => o.id === optId);
        if (opt) total += opt.priceCents;
      }
    }
    return total;
  }, [groups, selections]);

  const baseUnit =
    hasVariants && selectedVariant
      ? selectedVariant.priceCents
      : product.priceCents;
  const unitPrice = baseUnit + modifierTotal;
  const lineTotal = unitPrice * quantity;

  const displayImage =
    (hasVariants && selectedVariant?.imageUrl) ||
    product.imageUrl ||
    undefined;

  function handleSubmit() {
    if (!isValid) return;
    const selectedModifiers: SelectedModifier[] = [];
    for (const g of groups) {
      for (const optId of selections[g.id] ?? []) {
        const opt = g.options.find((o) => o.id === optId);
        if (opt) {
          selectedModifiers.push({
            groupName: g.name,
            optionName: opt.name,
            priceCents: opt.priceCents,
            modifierOptionId: opt.id,
          });
        }
      }
    }
    const lineName =
      hasVariants && selectedVariant
        ? `${product.name} — ${selectedVariant.name}`
        : undefined;
    onAddToCart({
      quantity,
      unitPriceCents: unitPrice,
      selectedModifiers,
      productVariantId: hasVariants ? selectedVariantId ?? undefined : undefined,
      lineName,
    });
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-background shadow-2xl sm:rounded-3xl">
        {/* Header */}
        <div className="flex items-start gap-4 border-b border-border/50 p-5">
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold leading-tight">
              {product.name}
            </h2>
            {product.description && (
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {product.description}
              </p>
            )}
            <div className="mt-2">
              <PriceDisplay
                cents={unitPrice}
                currency={currency}
                className="text-base font-semibold"
              />
            </div>
          </div>
          {displayImage && (
            <div className="size-20 shrink-0 overflow-hidden rounded-xl">
              <img
                src={displayImage}
                alt={product.name}
                className="size-full object-cover"
              />
            </div>
          )}
          <button
            onClick={onClose}
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted/80 text-muted-foreground transition-colors hover:bg-muted"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Modifier groups */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-5">
          <div className="space-y-6">
            {hasVariants && (
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground/80">
                    Option
                  </h3>
                  <Badge variant="destructive" className="text-[10px]">
                    Required
                  </Badge>
                </div>
                {!variantOk && (
                  <p className="mb-2 text-xs text-destructive">
                    Select an available option
                  </p>
                )}
                <div className="space-y-1">
                  {variants.map((v: ProductVariant) => {
                    const isSelected = v.id === selectedVariantId;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        disabled={!v.available}
                        onClick={() => setSelectedVariantId(v.id)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-all",
                          !v.available && "opacity-50",
                          isSelected
                            ? "bg-primary/5 ring-1 ring-primary/30"
                            : "hover:bg-muted/60"
                        )}
                      >
                        <span className="shrink-0 text-primary">
                          {isSelected ? (
                            <CircleDot className="size-5" />
                          ) : (
                            <Circle className="size-5 text-muted-foreground/50" />
                          )}
                        </span>
                        <span className="flex-1 text-sm font-medium">
                          {v.name}
                          {!v.available && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              (Unavailable)
                            </span>
                          )}
                        </span>
                        <PriceDisplay
                          cents={v.priceCents}
                          currency={currency}
                          className="shrink-0 text-sm font-medium"
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {groups.map((group) => {
              const isSingle = group.maxSelections === 1;
              const selected = selections[group.id] ?? new Set();
              const error = validationErrors[group.id];
              return (
                <div key={group.id}>
                  <div className="mb-3 flex items-center gap-2">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground/80">
                      {group.name}
                    </h3>
                    {group.required && (
                      <Badge variant="destructive" className="text-[10px]">
                        Required
                      </Badge>
                    )}
                    {group.maxSelections > 1 && (
                      <span className="text-xs text-muted-foreground">
                        (up to {group.maxSelections})
                      </span>
                    )}
                  </div>
                  {error && (
                    <p className="mb-2 text-xs text-destructive">{error}</p>
                  )}
                  <div className="space-y-1">
                    {[...group.options]
                      .sort((a, b) => a.sortOrder - b.sortOrder)
                      .map((option) => {
                        const isSelected = selected.has(option.id);
                        return (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => toggleOption(group, option)}
                            className={cn(
                              "flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-all",
                              isSelected
                                ? "bg-primary/5 ring-1 ring-primary/30"
                                : "hover:bg-muted/60"
                            )}
                          >
                            <span className="shrink-0 text-primary">
                              {isSingle ? (
                                isSelected ? (
                                  <CircleDot className="size-5" />
                                ) : (
                                  <Circle className="size-5 text-muted-foreground/50" />
                                )
                              ) : isSelected ? (
                                <CheckSquare className="size-5" />
                              ) : (
                                <Square className="size-5 text-muted-foreground/50" />
                              )}
                            </span>
                            <span className="flex-1 text-sm font-medium">
                              {option.name}
                            </span>
                            {option.priceCents > 0 && (
                              <span className="shrink-0 text-sm text-muted-foreground">
                                +
                                <PriceDisplay
                                  cents={option.priceCents}
                                  currency={currency}
                                  className="inline text-sm text-muted-foreground"
                                />
                              </span>
                            )}
                          </button>
                        );
                      })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer — quantity + add to cart */}
        <div className="border-t border-border/50 bg-background p-5">
          <div className="mb-4 flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="flex size-10 items-center justify-center rounded-full border border-border transition-colors hover:bg-muted"
              aria-label="Decrease quantity"
            >
              <Minus className="size-4" />
            </button>
            <span className="w-8 text-center text-lg font-bold">
              {quantity}
            </span>
            <button
              type="button"
              onClick={() => setQuantity((q) => q + 1)}
              className="flex size-10 items-center justify-center rounded-full border border-border transition-colors hover:bg-muted"
              aria-label="Increase quantity"
            >
              <Plus className="size-4" />
            </button>
          </div>
          <Button
            onClick={handleSubmit}
            disabled={!isValid}
            className="w-full gap-2 rounded-xl py-6 text-base font-semibold"
            size="lg"
          >
            <Check className="size-5" />
            Add to Cart
            <span className="ml-auto">
              <PriceDisplay
                cents={lineTotal}
                currency={currency}
                className="text-primary-foreground"
              />
            </span>
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─── Shop Menu Page ─────────────────────────────────────────────────────── */

export default function ShopMenuPage() {
  const { t } = useTranslation("customer");
  const { ref, shopId } = useParams<{ ref: string; shopId: string }>();
  const router = useRouter();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const { data: shop, isLoading: shopLoading } = useShopDetail(ref, shopId);
  const { data: products, isLoading: prodLoading } = useProducts(ref, shopId);
  const { data: categories } = useShopCategories(ref, shopId);
  const { data: reviewData } = useQuery({
    queryKey: ["public-shop-reviews", ref, shopId],
    queryFn: () => api.public.shopReviews(ref, shopId, { limit: 1 }),
    enabled: !!ref && !!shopId,
  });
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [modalProduct, setModalProduct] = useState<Product | null>(null);
  const [showShopInfo, setShowShopInfo] = useState(false);
  const [menuSearchQuery, setMenuSearchQuery] = useState("");
  const [mobileBillsOpen, setMobileBillsOpen] = useState(false);
  const [promoCodeInput, setPromoCodeInput] = useState("");
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoError, setPromoError] = useState("");
  const menuSearchRef = useRef<HTMLInputElement>(null);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const customer = useAuthStore((s) => s.customer);
  const { lat, lon } = useLocationStore();
  const { data: favorites } = useFavorites();
  const { toggleShop, toggleProduct } = useFavoriteMutations();

  const {
    addItem,
    items,
    projectRef,
    shopId: cartShopId,
    setProjectRef,
    setShopId,
    setCurrency,
    clear,
    updateQuantity,
    totalCents,
    checkoutPromo,
    setCheckoutPromo,
    clearCheckoutPromo,
  } = useCartStore();
  const multiShopCartEnabled = useMultiShopCartEnabled();

  const derivedCategories = useMemo(() => {
    if (categories && categories.length > 0) {
      return categories.map((c) => c.name);
    }
    if (!products) return [];
    const cats = new Set(products.map((p) => p.category || "Other"));
    return Array.from(cats);
  }, [products, categories]);

  const filtered = useMemo(() => {
    if (!products) return [];
    if (!activeCategory) return products;
    return products.filter(
      (p) => (p.category || "Other") === activeCategory
    );
  }, [products, activeCategory]);

  const availableProducts = useMemo(
    () => filtered.filter((p) => p.available),
    [filtered]
  );

  const menuFiltered = useMemo(() => {
    const q = menuSearchQuery.trim().toLowerCase();
    if (!q) return availableProducts;
    return availableProducts.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description?.toLowerCase().includes(q) ?? false) ||
        (p.category?.toLowerCase().includes(q) ?? false)
    );
  }, [availableProducts, menuSearchQuery]);

  const shopCartItems = useMemo(
    () => items.filter((i) => (i.shopId ?? cartShopId) === shopId),
    [items, cartShopId, shopId]
  );

  const thumbByProductId = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of products ?? []) {
      if (p.imageUrl) m.set(p.id, p.imageUrl);
    }
    return m;
  }, [products]);

  const feeConfig = useDeliveryFeeConfig();
  const draftGroups = useMemo(() => {
    try {
      return buildCheckoutDraftGroups(items, { shopId: cartShopId, projectRef });
    } catch {
      return [];
    }
  }, [items, cartShopId, projectRef]);
  const shopSubtotal = useMemo(
    () => shopCartItems.reduce((s, i) => s + i.unitPriceCents * i.quantity, 0),
    [shopCartItems]
  );
  const shopDeliveryFee = computeDeliveryFee(feeConfig, shopSubtotal);
  const effectiveShopDeliveryFee = checkoutPromo?.freeDelivery ? 0 : shopDeliveryFee;
  const shopPromoDiscount = checkoutPromo?.discountCents ?? 0;
  const shopCartTotal = Math.max(
    shopSubtotal - shopPromoDiscount + effectiveShopDeliveryFee,
    0
  );

  const etaLabel = useMemo(() => {
    if (lat == null || lon == null || shop?.lat == null || shop?.lon == null)
      return "25-35 min";
    const distKm = getDistanceKmBetweenCoords(lat, lon, shop.lat, shop.lon);
    const mins = Math.max(15, Math.min(60, Math.round(20 + distKm * 4)));
    return `${mins} min`;
  }, [lat, lon, shop?.lat, shop?.lon]);

  async function ensureCartContext() {
    if (multiShopCartEnabled) {
      setProjectRef(ref);
      setShopId(shopId);
      if (shop?.currency) setCurrency(shop.currency.toUpperCase());
      return true;
    }
    if (cartShopId && cartShopId !== shopId) {
      const ok = await confirm({
        title: "Clear cart for this shop?",
        description:
          "You have items from another shop. Continuing will clear your cart.",
        confirmLabel: "Clear cart",
        variant: "destructive",
      });
      if (!ok) return false;
      clear();
    }
    setProjectRef(ref);
    setShopId(shopId);
    if (shop?.currency) setCurrency(shop.currency.toUpperCase());
    return true;
  }

  async function handleAddToCart(product: Product) {
    if (!(await ensureCartContext())) return;

    const hasVariants = (product.variants?.length ?? 0) > 0;
    const hasModifiers =
      product.modifierGroups?.some((g) => g.options.length > 0) ?? false;

    if (hasModifiers || hasVariants) {
      setModalProduct(product);
      return;
    }

    addItem({
      id: crypto.randomUUID(),
      sessionId: "",
      productId: product.id,
      name: product.name,
      quantity: 1,
      unitPriceCents: product.priceCents,
      createdAt: new Date().toISOString(),
      shopId,
      projectRef: ref,
      shopName: shop?.name,
    });
  }

  function handleModalAddToCart(data: {
    quantity: number;
    unitPriceCents: number;
    selectedModifiers: SelectedModifier[];
    productVariantId?: string;
    lineName?: string;
  }) {
    if (!modalProduct) return;
    addItem({
      id: crypto.randomUUID(),
      sessionId: "",
      productId: modalProduct.id,
      productVariantId: data.productVariantId,
      name: data.lineName ?? modalProduct.name,
      quantity: data.quantity,
      unitPriceCents: data.unitPriceCents,
      selectedModifiers: data.selectedModifiers,
      createdAt: new Date().toISOString(),
      shopId,
      projectRef: ref,
      shopName: shop?.name,
    });
    setModalProduct(null);
  }

  function getCartQuantity(productId: string) {
    if (!multiShopCartEnabled && cartShopId !== shopId) return 0;
    const lines = items.filter(
      (i) =>
        i.productId === productId &&
        (i.shopId ?? cartShopId) === shopId
    );
    return lines.reduce((s, i) => s + i.quantity, 0);
  }

  const isLoading = shopLoading || prodLoading;
  const isShopFavorite = !!favorites?.favoriteShops?.some((f) => f.shopId === shopId);
  const reviewSummary = reviewData?.summary;

  const dateLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        weekday: "short",
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(new Date()),
    []
  );

  const ratingTileHint = useMemo(() => {
    if (!reviewSummary?.reviewCount) return null;
    const n = reviewSummary.reviewCount;
    const reviewLabel =
      n >= 1000
        ? `${(n / 1000).toFixed(1)}K ${t("storeMenu.reviews", { defaultValue: "reviews" })}`
        : `${n} ${t("storeMenu.reviews", { defaultValue: "reviews" })}`;
    return { average: reviewSummary.averageRating, reviewLabel };
  }, [reviewSummary, t]);

  function requireAuthForFavorite() {
    return isAuthenticated;
  }

  function handleCheckoutNav() {
    if (shopCartItems.length === 0) {
      return;
    }
    setMobileBillsOpen(false);
    router.push("/checkout");
  }

  async function handleShopPromoApply() {
    if (!promoCodeInput.trim()) return;
    setPromoLoading(true);
    setPromoError("");
    try {
      const subtotal = totalCents();
      const deliveryForPromo = computeDeliveryFee(feeConfig, subtotal);
      const result = await api.promoCodes.validate({
        code: promoCodeInput.trim(),
        shopId:
          multiShopCartEnabled && draftGroups.length !== 1 ? undefined : (shopId ?? undefined),
        subtotalCents: subtotal,
        deliveryFeeCents: deliveryForPromo,
      });
      if (result.valid && result.promoCodeId) {
        setCheckoutPromo({
          code: promoCodeInput.trim().toUpperCase(),
          discountCents: result.discountCents,
          freeDelivery: result.freeDelivery,
          promoCodeId: result.promoCodeId,
        });
        setPromoError("");
      } else {
        setPromoError(result.message || t("storeMenu.promoInvalid", { defaultValue: "Invalid promo code" }));
        clearCheckoutPromo();
      }
    } catch (err: unknown) {
      setPromoError(
        err && typeof err === "object" && "message" in err
          ? String((err as { message?: unknown }).message)
          : t("storeMenu.promoValidateFailed", { defaultValue: "Failed to validate" })
      );
      clearCheckoutPromo();
    } finally {
      setPromoLoading(false);
    }
  }

  function handleShopPromoClear() {
    clearCheckoutPromo();
    setPromoCodeInput("");
    setPromoError("");
  }

  const billsPanelProps = {
    items: shopCartItems,
    currency: shop?.currency?.toUpperCase(),
    productThumb: (productId: string) => thumbByProductId.get(productId),
    onQuantityChange: (itemId: string, nextQty: number) => updateQuantity(itemId, nextQty),
    onCheckout: handleCheckoutNav,
    promoPlaceholder: t("storeMenu.promoPlaceholder", {
      defaultValue: "Enter promo code",
    }),
    promoCode: promoCodeInput,
    onPromoCodeChange: setPromoCodeInput,
    onPromoApply: handleShopPromoApply,
    promoLoading,
    promoError,
    promoApplied: checkoutPromo,
    onPromoClear: handleShopPromoClear,
  };

  return (
    <div className="flex min-h-dvh flex-col">
      {confirmDialog}
      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-border/60 bg-card px-3 py-2.5 md:hidden">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex size-10 shrink-0 items-center justify-center rounded-xl text-foreground transition-colors hover:bg-muted"
          aria-label="Go back"
        >
          <ArrowLeft className="size-5" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold text-foreground">
            {isLoading ? <Skeleton className="h-4 w-32" /> : shop?.name}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span
              className={cn(
                "inline-flex items-center gap-1 font-semibold",
                shop?.isOpen === false ? "text-destructive" : "text-primary"
              )}
            >
              <Circle className="size-2 fill-current" />
              {shop?.isOpen === false ? "Closed" : "Open"}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="size-3" />
              {etaLabel}
            </span>
          </div>
        </div>
        <Link
          href="/orders"
          className="flex size-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={t("nav.orders")}
        >
          <Bell className="size-[22px] stroke-[2]" />
        </Link>
      </header>

      <div className="flex min-h-0 min-w-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-4 py-5 lg:max-w-none lg:px-8 lg:py-8">
            <div className="hidden md:block">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                {t("storeMenu.welcome", {
                  name:
                    customer?.name?.trim() ||
                    t("storeMenu.guestName", { defaultValue: "there" }),
                  defaultValue: "Welcome, {{name}}",
                })}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">{dateLabel}</p>
            </div>

            <div className="relative mt-5 md:mt-8">
              <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={menuSearchRef}
                value={menuSearchQuery}
                onChange={(e) => setMenuSearchQuery(e.target.value)}
                placeholder={t("storeMenu.searchMenu", { defaultValue: "Search menu…" })}
                className="h-12 rounded-xl border-border/60 bg-card pl-11 pr-4 text-sm shadow-sm"
              />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-border/50 bg-card/80 px-3 py-3 text-xs md:mt-5">
              <div
                className={cn(
                  "flex shrink-0 items-center gap-1.5 font-semibold",
                  shop?.isOpen === false ? "text-destructive" : "text-primary"
                )}
              >
                <Circle className="size-2 fill-current" />
                {shop?.isOpen === false ? "Closed" : "Open"}
              </div>
              <div className="flex shrink-0 items-center gap-1 text-muted-foreground">
                <Star className="size-3.5 fill-current text-primary" />
                <span className="font-medium text-foreground">
                  {reviewSummary?.reviewCount
                    ? reviewSummary.averageRating.toFixed(1)
                    : t("storeMenu.newRating", { defaultValue: "New" })}
                </span>
                <span>({reviewSummary?.reviewCount ?? 0})</span>
              </div>
              <div className="flex shrink-0 items-center gap-1 text-muted-foreground">
                <Clock className="size-3.5" />
                {etaLabel}
              </div>
              {shop?.address ? (
                <div className="flex min-w-0 flex-1 items-center gap-1 text-muted-foreground">
                  <MapPin className="size-3.5 shrink-0" />
                  <span className="truncate">{shop.address}</span>
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => setShowShopInfo(true)}
                className="inline-flex shrink-0 items-center gap-1 font-medium text-primary hover:underline"
              >
                <Info className="size-3.5" />
                {t("storeMenu.moreInfo", { defaultValue: "More info" })}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!requireAuthForFavorite()) return;
                  void toggleShop
                    .mutateAsync({ shopId, favorite: isShopFavorite })
                    .catch(() => {});
                }}
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border/60 px-2.5 py-1 font-medium text-primary transition-colors hover:bg-primary/5"
              >
                <Heart
                  className={cn(
                    "size-3.5",
                    isShopFavorite && "fill-current text-primary"
                  )}
                />
                {isShopFavorite
                  ? t("storeMenu.saved", { defaultValue: "Saved" })
                  : t("storeMenu.save", { defaultValue: "Save" })}
              </button>
            </div>

            <div className="mt-4 md:hidden">
              <h1 className="text-xl font-bold text-foreground">
                {isLoading ? <Skeleton className="h-6 w-48" /> : shop?.name}
              </h1>
              <p className="mt-0.5 text-xs text-muted-foreground">{dateLabel}</p>
            </div>

            <div className="hide-scrollbar mt-6 flex gap-3 overflow-x-auto pb-1 md:mt-8">
              <button
                type="button"
                onClick={() => setActiveCategory(null)}
                className={cn(
                  "flex size-14 shrink-0 flex-col items-center justify-center rounded-xl border-2 text-primary-foreground shadow-sm transition-all sm:size-16",
                  activeCategory === null
                    ? "border-transparent bg-primary"
                    : "border-border/60 bg-card text-muted-foreground hover:border-primary/40"
                )}
                aria-pressed={activeCategory === null}
              >
                <LayoutGrid className="size-6" />
              </button>
              {derivedCategories.map((cat, idx) => {
                const Icon = CATEGORY_ICONS[idx % CATEGORY_ICONS.length] ?? Utensils;
                const active = activeCategory === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setActiveCategory(cat)}
                    className={cn(
                      "flex size-14 shrink-0 flex-col items-center justify-center rounded-xl border-2 transition-all sm:size-16",
                      active
                        ? "border-transparent bg-primary text-primary-foreground shadow-sm"
                        : "border-border/60 bg-card text-muted-foreground hover:border-primary/40"
                    )}
                    aria-pressed={active}
                    title={cat}
                  >
                    <Icon className="size-6" />
                  </button>
                );
              })}
            </div>

            <div className="mt-6">
              <PromoBanner placement="restaurant_menu" />
            </div>

            {isAuthenticated ? (
              <div className="mt-4 flex flex-col gap-2 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground sm:text-sm">
                  <Star className="mr-1 inline size-3.5 align-text-bottom fill-current text-primary sm:size-4" />
                  {t("storeMenu.reviewHint", {
                    defaultValue:
                      "After a completed order, you can leave a rating from your order history.",
                  })}
                </p>
                <Link
                  href="/orders"
                  className={cn(
                    buttonVariants({ variant: "secondary", size: "sm" }),
                    "shrink-0 rounded-xl text-xs sm:text-sm"
                  )}
                >
                  {t("nav.orders")}
                </Link>
              </div>
            ) : null}

            <h2 className="mt-8 text-lg font-bold text-foreground">
              {t("storeMenu.resultMenu", { defaultValue: "Result menu" })}
            </h2>

            <div className="mt-4 pb-28 lg:pb-10">
              {isLoading ? (
                <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:max-w-3xl lg:grid-cols-2 xl:grid-cols-2">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div
                      key={i}
                      className="overflow-hidden rounded-xl border border-border/40 bg-card"
                    >
                      <div className="px-3 pt-3">
                        <Skeleton className="h-[168px] w-full rounded-xl" />
                      </div>
                      <div className="space-y-2 px-3 pb-3 pt-3">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-5 w-1/3" />
                        <Skeleton className="h-3 w-full" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : availableProducts.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border/70 bg-card px-6 py-16 text-center">
                  <div className="flex size-16 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                    <Store className="size-8" />
                  </div>
                  <h3 className="mt-4 text-base font-bold">
                    {t("storeMenu.noItems", { defaultValue: "No items available" })}
                  </h3>
                  <p className="mt-2 max-w-xs text-sm text-muted-foreground">
                    {t("storeMenu.noItemsHint", {
                      defaultValue: "This category has no items right now.",
                    })}
                  </p>
                </div>
              ) : menuFiltered.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border/70 bg-card px-6 py-16 text-center">
                  <SearchIcon className="size-10 text-muted-foreground" />
                  <h3 className="mt-4 text-base font-bold">
                    {t("storeMenu.noSearchResults", {
                      defaultValue: "No dishes match your search",
                    })}
                  </h3>
                  <Button
                    variant="secondary"
                    className="mt-4 rounded-xl"
                    onClick={() => setMenuSearchQuery("")}
                  >
                    {t("filters.clearFilters")}
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:max-w-3xl lg:grid-cols-2 xl:grid-cols-2">
                  {menuFiltered.map((product) => {
                    const qty = getCartQuantity(product.id);
                    const favorite = !!favorites?.favoriteProducts?.some(
                      (f) => f.productId === product.id
                    );
                    return (
                      <MenuProductTile
                        key={product.id}
                        product={product}
                        currency={shop?.currency?.toUpperCase()}
                        quantity={qty}
                        isFavorite={favorite}
                        ratingDisplay={ratingTileHint}
                        onFavoriteClick={() => {
                          if (!requireAuthForFavorite()) return;
                          void toggleProduct
                            .mutateAsync({ productId: product.id, favorite })
                            .catch(() => {});
                        }}
                        onAdd={() => handleAddToCart(product)}
                        onIncrement={() => handleAddToCart(product)}
                        onDecrement={() => {
                          const item = items.find(
                            (i) =>
                              i.productId === product.id &&
                              (i.shopId ?? cartShopId) === shopId &&
                              !(
                                i.selectedModifiers &&
                                i.selectedModifiers.length > 0
                              )
                          );
                          if (item) updateQuantity(item.id, qty - 1);
                        }}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <aside className="sticky top-0 hidden h-dvh w-[min(380px,34vw)] shrink-0 border-l border-border/60 bg-card lg:flex">
          <StoreMenuBillsPanel className="w-full min-w-0" {...billsPanelProps} />
        </aside>
      </div>

      {shopCartItems.length > 0 ? (
        <div className="fixed bottom-0 left-[76px] right-0 z-40 border-t border-border/60 bg-card/95 p-3 backdrop-blur-md lg:hidden">
          <button
            type="button"
            onClick={() => setMobileBillsOpen(true)}
            className="flex w-full items-center justify-between rounded-xl bg-primary px-4 py-3.5 text-primary-foreground shadow-lg shadow-primary/20"
          >
            <span className="text-sm font-semibold">
              {t("storeMenu.bills", { defaultValue: "Bills" })}
            </span>
            <span className="flex items-center gap-2">
              <PriceDisplay
                cents={shopCartTotal}
                currency={shop?.currency?.toUpperCase()}
                className="text-base font-bold text-primary-foreground"
              />
              <ChevronDown
                className={cn(
                  "size-4 transition-transform",
                  mobileBillsOpen && "rotate-180"
                )}
              />
            </span>
          </button>
        </div>
      ) : null}

      {mobileBillsOpen ? (
        <div
          className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px] lg:hidden"
          role="presentation"
          onClick={() => setMobileBillsOpen(false)}
        />
      ) : null}
      {mobileBillsOpen ? (
        <div
          className="fixed inset-x-0 bottom-0 z-[60] flex max-h-[88dvh] flex-col rounded-t-3xl border border-border/60 bg-card shadow-2xl lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label={t("storeMenu.bills", { defaultValue: "Bills" })}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-3 pb-1 pt-2">
            <div className="w-10" aria-hidden />
            <div className="h-1 w-10 rounded-full bg-muted" />
            <button
              type="button"
              onClick={() => setMobileBillsOpen(false)}
              className="flex size-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label={t("storeMenu.closeBills", { defaultValue: "Close" })}
            >
              <X className="size-5" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden px-1 pb-[env(safe-area-inset-bottom)]">
            <StoreMenuBillsPanel
              {...billsPanelProps}
              className="max-h-[min(78dvh,560px)]"
            />
          </div>
        </div>
      ) : null}

      {/* Product detail modal */}
      {modalProduct && (
        <ProductDetailModal
          product={modalProduct}
          currency={shop?.currency?.toUpperCase()}
          onClose={() => setModalProduct(null)}
          onAddToCart={handleModalAddToCart}
        />
      )}

      {/* Shop info modal */}
      <ShopInfoModal
        shop={shop}
        isOpen={showShopInfo}
        onClose={() => setShowShopInfo(false)}
      />
    </div>
  );
}
