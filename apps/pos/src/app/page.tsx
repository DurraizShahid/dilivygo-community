"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "motion/react";
import { useTranslation } from "@dilivygo/i18n";
import { GlobeLanguageMenu } from "@dilivygo/i18n/globe-language-menu";
import type {
  ModifierGroup,
  ModifierOption,
  Order,
  OrderStatus,
  PosCheckoutMode,
  Product,
  ProductVariant,
  SelectedModifier,
  Shop,
  User,
} from "@dilivygo/types";
import {
  AnimatedList,
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Button,
  buttonVariants,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  PlatformBrandingMark,
  PlatformWordmark,
  StaffAuthSplitLayout,
  usePlatformBranding,
  WorkspaceLogoImage,
  PriceDisplay,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ThemeToggle,
  DotFlow,
  cn,
  dashboardSidebarFooterDividerClass,
  dashboardSidebarShellClass,
  dashboardSidebarLogoFrameClass,
  dashboardSidebarNavIconClass,
  dashboardSidebarNavLinkInactiveClass,
  dashboardSidebarNavLinkLayoutClass,
  dashboardSidebarToggleButtonClass,
  dashboardSidebarTopRowClass,
  dashboardSidebarWidthCollapsed,
  dashboardSidebarWidthExpanded,
  formatPrice,
  useCurrency,
  useDefaultProfilePhotoUrls,
  resolveProfileAvatarUrl,
} from "@dilivygo/ui";
import {
  AlertCircle,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  FileDown,
  Loader2,
  LogOut,
  PanelLeftClose,
  PanelRight,
  Printer,
  ScanBarcode,
  Search,
  Settings,
  Store,
  Upload,
  ImageIcon,
  X,
  Banknote,
  CreditCard,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Split,
  Clock,
  CheckCircle2,
  ChefHat,
  Sparkles,
  TimerReset,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";
import { tenantHostErrorTranslationKey } from "@dilivygo/api";
import { useAuthStore } from "@/stores/auth-store";
import { useShopStore } from "@/stores/shop-store";
import { useWorkspaceStore, staffProjectRef } from "@/stores/workspace-store";

/** Returns CSS class names for a panel that can animate in AND out.
 *  `show=true` → enter class; `show=false` → exit class (element stays
 *  mounted for `durationMs`, then `visible` becomes false so React unmounts it).
 */
function useExitAnimation(show: boolean, enterClass: string, exitClass: string, durationMs = 260) {
  const [visible, setVisible] = useState(show);
  const [animClass, setAnimClass] = useState(show ? enterClass : "");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (show) {
      setVisible(true);
      requestAnimationFrame(() => setAnimClass(enterClass));
    } else {
      setAnimClass(exitClass);
      timerRef.current = setTimeout(() => setVisible(false), durationMs);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [show, enterClass, exitClass, durationMs]);

  return { visible, animClass };
}

/** Catalog may include scan codes from the vendor dashboard. */
type ProductSearchable = Product;

type CartLine = {
  id: string;
  productId?: string;
  productVariantId?: string;
  name: string;
  unitPriceCents: number;
  quantity: number;
  notes?: string;
  modifiers?: SelectedModifier[];
};

function newCartLineId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `line-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function productHasConfigurableModifiers(product: Product): boolean {
  return Boolean(product.modifierGroups?.some((g) => g.options?.length));
}

function modifierSignature(modifiers?: SelectedModifier[]): string {
  const keys = (modifiers ?? []).map((m) => m.modifierOptionId ?? `${m.groupName}:${m.optionName}`);
  keys.sort();
  return keys.join("|");
}

function buildDefaultModifiers(product: Product): SelectedModifier[] {
  const groups = (product.modifierGroups ?? [])
    .filter((g) => g.options?.length)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const result: SelectedModifier[] = [];
  for (const group of groups) {
    const options = group.options.slice().sort((a, b) => a.sortOrder - b.sortOrder);
    if (!options.length) continue;
    const max = Math.max(1, group.maxSelections);
    const min = Math.max(0, group.minSelections);

    if (max === 1) {
      const def = options.find((o) => o.isDefault) ?? options[0];
      result.push({
        groupName: group.name,
        optionName: def.name,
        priceCents: def.priceCents,
        modifierOptionId: def.id,
      });
    } else {
      const defaults = options.filter((o) => o.isDefault);
      const picked: ModifierOption[] = [];
      for (const o of defaults) {
        if (picked.length >= max) break;
        picked.push(o);
      }
      for (const o of options) {
        if (picked.length >= min) break;
        if (picked.length >= max) break;
        if (!picked.some((p) => p.id === o.id)) picked.push(o);
      }
      for (const o of picked) {
        result.push({
          groupName: group.name,
          optionName: o.name,
          priceCents: o.priceCents,
          modifierOptionId: o.id,
        });
      }
    }
  }
  return result;
}

function lineUnitPriceCents(basePriceCents: number, modifiers?: SelectedModifier[]): number {
  const extra = (modifiers ?? []).reduce((sum, m) => sum + m.priceCents, 0);
  return basePriceCents + extra;
}

function pickDefaultVariant(product: Product): ProductVariant | null {
  const list = (product.variants ?? [])
    .filter((v) => v.available)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  return list[0] ?? null;
}

/** Grid “from” price when the product has sellable variants. */
function productGridPriceCents(product: Product): number {
  const available = (product.variants ?? []).filter((v) => v.available);
  if (!available.length) return product.priceCents;
  return Math.min(...available.map((v) => v.priceCents));
}

function cartLineBasePriceCents(product: Product | undefined, line: CartLine): number {
  if (!product) return 0;
  if (line.productVariantId) {
    const v = product.variants?.find((x) => x.id === line.productVariantId);
    if (v) return v.priceCents;
  }
  return product.priceCents;
}

/** Comma-separated available variant labels for POS menu tiles. */
function availableVariantNamesSummary(product: Product, maxNames = 6): string {
  const names = (product.variants ?? [])
    .filter((v) => v.available)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map((v) => v.name.trim())
    .filter(Boolean);
  if (!names.length) return "";
  const head = names.slice(0, maxNames);
  const out = head.join(", ");
  return names.length > maxNames ? `${out}…` : out;
}

const POS_VARIANT_NAME_SEP = " — ";

function splitProductVariantLabel(fullName: string): { product: string; variant?: string } {
  const i = fullName.indexOf(POS_VARIANT_NAME_SEP);
  if (i === -1) return { product: fullName };
  return { product: fullName.slice(0, i), variant: fullName.slice(i + POS_VARIANT_NAME_SEP.length) };
}

function cartLineDisplayTitles(line: CartLine, lineProduct: Product | undefined): { title: string; subtitle?: string } {
  if (line.productVariantId && lineProduct?.variants?.length) {
    const v = lineProduct.variants.find((x) => x.id === line.productVariantId);
    if (v) return { title: lineProduct.name, subtitle: v.name };
  }
  const s = splitProductVariantLabel(line.name);
  if (s.variant) return { title: s.product, subtitle: s.variant };
  return { title: line.name };
}

function escapeReceiptText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function applySingleSelectModifier(
  line: CartLine,
  group: ModifierGroup,
  option: ModifierOption
): SelectedModifier[] {
  const rest = (line.modifiers ?? []).filter((m) => m.groupName !== group.name);
  return [
    ...rest,
    {
      groupName: group.name,
      optionName: option.name,
      priceCents: option.priceCents,
      modifierOptionId: option.id,
    },
  ];
}

function toggleMultiSelectModifier(
  line: CartLine,
  group: ModifierGroup,
  option: ModifierOption
): SelectedModifier[] {
  const mods = [...(line.modifiers ?? [])];
  const groupMods = mods.filter((m) => m.groupName === group.name);
  const isOn = groupMods.some((m) => m.modifierOptionId === option.id);

  if (isOn) {
    if (groupMods.length <= group.minSelections) return mods;
    return mods.filter((m) => !(m.groupName === group.name && m.modifierOptionId === option.id));
  }
  if (groupMods.length >= group.maxSelections) return mods;
  return [
    ...mods,
    {
      groupName: group.name,
      optionName: option.name,
      priceCents: option.priceCents,
      modifierOptionId: option.id,
    },
  ];
}

type ReceiptVariant = "cashier" | "kitchen";
type TerminalPrintMode = "cashier_only" | "kitchen_only" | "both";

type TerminalPrinterProfile = {
  id: string;
  name: string;
  mode: TerminalPrintMode;
  autoPrint: boolean;
  cashierCopies: number;
  kitchenCopies: number;
};

type ReceiptSnapshot = {
  order: Order;
  lines: CartLine[];
  paymentMethod: "cash" | "card" | "split";
  shop: Shop | null;
};

type DesktopPrinter = {
  name: string;
  isDefault: boolean;
  status?: string | null;
  description?: string | null;
};

type PrinterTargets = {
  cashier: string;
  kitchen: string;
};

type DesktopPrintingBridge = {
  isNativeReceiptPrinting?: boolean;
  interceptsReceiptEvents?: boolean;
  printReceipt?: (payload: unknown) => Promise<unknown>;
  listPrinters?: () => Promise<{ printers: DesktopPrinter[]; targets: PrinterTargets }>;
  setPrinterTargets?: (targets: Partial<PrinterTargets>) => Promise<PrinterTargets>;
  testPrint?: (payload: { variant: "cashier" | "kitchen" }) => Promise<{ ok: boolean; error?: string }>;
};

const PROFILE_STORAGE_KEY = "dilivygo-pos-printer-profiles";
const ACTIVE_PROFILE_STORAGE_KEY = "dilivygo-pos-active-printer-profile";

function nextPosQueueStatus(order: Pick<Order, "status" | "posCheckoutMode">): OrderStatus | null {
  switch (order.status) {
    case "placed":
      return "accepted";
    case "accepted":
      return "preparing";
    case "preparing":
      return "ready";
    case "ready":
      return order.posCheckoutMode === "kitchen" ? "completed" : null;
    default:
      return null;
  }
}

/** Matches server extend-SLA validation: 5–60 minutes per request. */
const SLA_EXTEND_PRESET_MINUTES = [5, 10, 15, 20, 30, 45, 60] as const;

const SIDEBAR_ITEMS: Array<{ labelKey: string; icon: LucideIcon }> = [
  { labelKey: "nav.orderLine", icon: ClipboardList },
  { labelKey: "nav.settings", icon: Settings },
];

const CATEGORY_TINTS = [
  "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/50",
  "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800/50",
  "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/50",
  "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800/50",
  "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/50",
];

const STATUS_STYLES: Record<string, string> = {
  placed: "bg-amber-500/15 text-amber-600 border-amber-500/30 dark:bg-amber-500/20 dark:text-amber-400",
  accepted: "bg-blue-500/15 text-blue-600 border-blue-500/30 dark:bg-blue-500/20 dark:text-blue-400",
  preparing: "bg-violet-500/15 text-violet-600 border-violet-500/30 dark:bg-violet-500/20 dark:text-violet-400",
  ready: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30 dark:bg-emerald-500/20 dark:text-emerald-400",
};

const PAYMENT_ICONS: Record<string, LucideIcon> = {
  cash: Banknote,
  card: CreditCard,
  split: Split,
};

const MENU_LABEL_MAX_CHARS = 18;

function ellipsizeLabel(text: string, maxChars = MENU_LABEL_MAX_CHARS): string {
  const t = text.trim();
  if (t.length <= maxChars) return t;
  return `${t.slice(0, maxChars)}...`;
}

function createPrinterProfile(name: string): TerminalPrinterProfile {
  return {
    id: `terminal-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    mode: "both",
    autoPrint: true,
    cashierCopies: 1,
    kitchenCopies: 1,
  };
}

function loadPrinterConfig() {
  const fallback = createPrinterProfile("Front Counter");
  if (typeof window === "undefined") {
    return { profiles: [fallback], activeProfileId: fallback.id };
  }

  const rawProfiles = window.localStorage.getItem(PROFILE_STORAGE_KEY);
  const rawActiveId = window.localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY);
  if (!rawProfiles) {
    return { profiles: [fallback], activeProfileId: fallback.id };
  }

  try {
    const parsed = JSON.parse(rawProfiles) as TerminalPrinterProfile[];
    if (!Array.isArray(parsed) || !parsed.length) {
      return { profiles: [fallback], activeProfileId: fallback.id };
    }
    const activeProfileId = parsed.some((p) => p.id === rawActiveId)
      ? (rawActiveId as string)
      : parsed[0].id;
    return { profiles: parsed, activeProfileId };
  } catch {
    return { profiles: [fallback], activeProfileId: fallback.id };
  }
}

function pickCreatedAt(order: Order): string {
  return (order as unknown as { createdAt?: string; created_at?: string }).createdAt
    || (order as unknown as { created_at?: string }).created_at
    || new Date().toISOString();
}

function pickTotal(order: Order): number {
  return (
    (order as unknown as { totalCents?: number; total_cents?: number }).totalCents
    || (order as unknown as { total_cents?: number }).total_cents
    || 0
  );
}

/** Returns up to 4 smart cash preset amounts (in cents): exact + round-ups. */
function cashPresets(totalCents: number): number[] {
  const presets: number[] = [totalCents];
  for (const step of [500, 1000, 2000, 5000, 10000]) {
    const rounded = Math.ceil(totalCents / step) * step;
    if (rounded > totalCents && !presets.includes(rounded)) presets.push(rounded);
    if (presets.length === 4) break;
  }
  return presets;
}

function shouldIgnoreGlobalKeys(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null;
  if (!target) return false;
  const tag = target.tagName.toLowerCase();
  if (["input", "textarea", "select", "button"].includes(tag)) return true;
  return target.isContentEditable;
}

const PAYMENT_LABEL_KEYS: Record<"cash" | "card" | "split", string> = {
  cash: "payment.cash",
  card: "payment.card",
  split: "payment.split",
};

function getDesktopPrintingBridge(): DesktopPrintingBridge | null {
  if (typeof window === "undefined") return null;
  return (
    (window as unknown as { dilivygoDesktop?: { posPrinting?: DesktopPrintingBridge } })
      .dilivygoDesktop?.posPrinting || null
  );
}

function receiptCurrencyCode(shop: Shop | null, order: Order, platformDefault: string): string {
  const pick = (raw?: string | null) => {
    const s = typeof raw === "string" ? raw.trim() : "";
    return s.length >= 3 ? s.slice(0, 3).toUpperCase() : "";
  };
  return pick(shop?.currency) || pick(order.currency) || platformDefault;
}

function buildReceiptHtml(params: {
  order: Order;
  shop: Shop | null;
  lines: CartLine[];
  paymentMethod: "cash" | "card" | "split";
  createdAt: string;
  variant: ReceiptVariant;
  terminalName: string;
  copyIndex: number;
  totalCopies: number;
  currencyCode: string;
}) {
  const ccy = params.currencyCode;
  const subtotal = params.lines.reduce((sum, line) => sum + line.unitPriceCents * line.quantity, 0);
  const lineRows = params.lines
    .map((line) => {
      const modRows = (line.modifiers ?? [])
        .map(
          (m) =>
            `<tr><td colspan="2" style="font-size:11px;color:#666;padding-left:12px;">→ ${escapeReceiptText(m.groupName)}: ${escapeReceiptText(m.optionName)}${m.priceCents ? ` (+${escapeReceiptText(formatPrice(m.priceCents, ccy))})` : ""}</td></tr>`
        )
        .join("");
      const split = splitProductVariantLabel(line.name);
      const variantRow =
        split.variant != null
          ? `<tr><td colspan="2" style="font-size:10px;color:#555;padding-left:10px;">→ ${escapeReceiptText(split.variant)}</td></tr>`
          : "";
      return `
      <tr>
        <td>${line.quantity}x ${escapeReceiptText(split.product)}</td>
        <td style="text-align:right;">${escapeReceiptText(formatPrice(line.unitPriceCents * line.quantity, ccy))}</td>
      </tr>${variantRow}${modRows}${line.notes ? `<tr><td colspan="2" style="font-size:11px;font-style:italic;color:#666;padding-left:12px;">→ ${escapeReceiptText(line.notes)}</td></tr>` : ""}`;
    })
    .join("");

  return `
  <html>
    <head>
      <title>Dilivygo ${params.variant === "kitchen" ? "Kitchen" : "Cashier"} Receipt</title>
      <style>
        body { font-family: monospace; padding: 12px; width: 280px; }
        h1,h2,p { margin: 0; }
        .spacer { margin-top: 8px; margin-bottom: 8px; border-top: 1px dashed #000; }
        table { width: 100%; border-collapse: collapse; }
        td { font-size: 12px; padding: 2px 0; }
      </style>
    </head>
    <body>
      <h2>${params.shop?.name || "Dilivygo POS"} (${params.terminalName})</h2>
      <p>${params.variant === "kitchen" ? "Kitchen Ticket" : "Customer Receipt"} · Copy ${params.copyIndex}/${params.totalCopies}</p>
      <p>Order: #${params.order.id.slice(0, 8)}</p>
      <p>Date: ${new Date(params.createdAt).toLocaleString()}</p>
      ${params.variant === "cashier" ? `<p>Payment: ${params.paymentMethod.toUpperCase()}</p>` : ""}
      <div class="spacer"></div>
      <table>${lineRows}</table>
      ${
        params.variant === "cashier"
          ? `<div class="spacer"></div>
             <table><tr><td>Total</td><td style="text-align:right;">${escapeReceiptText(formatPrice(subtotal, ccy))}</td></tr></table>`
          : ""
      }
    </body>
  </html>`;
}

async function triggerReceiptHooks(params: {
  order: Order;
  lines: CartLine[];
  paymentMethod: "cash" | "card" | "split";
  shop: Shop | null;
  profile: TerminalPrinterProfile;
  forcePrint?: boolean;
  currencyCode: string;
  printWindowBlockedMessage: string;
}) {
  const desktopPrinting = (
    typeof window !== "undefined"
      ? (window as unknown as {
          dilivygoDesktop?: {
            posPrinting?: {
              interceptsReceiptEvents?: boolean;
            };
          };
        }).dilivygoDesktop?.posPrinting
      : undefined
  );
  const nativeIntercepts = Boolean(desktopPrinting?.interceptsReceiptEvents);
  const createdAt = pickCreatedAt(params.order);
  const shouldPrint = Boolean(params.forcePrint || params.profile.autoPrint);
  if (!shouldPrint) {
    return;
  }
  const jobs: Array<{ variant: ReceiptVariant; copies: number }> = [];

  if (params.profile.mode === "cashier_only" || params.profile.mode === "both") {
    jobs.push({ variant: "cashier", copies: Math.max(1, params.profile.cashierCopies) });
  }
  if (params.profile.mode === "kitchen_only" || params.profile.mode === "both") {
    jobs.push({ variant: "kitchen", copies: Math.max(1, params.profile.kitchenCopies) });
  }

  for (const job of jobs) {
    for (let copy = 1; copy <= job.copies; copy += 1) {
      const receiptHtml = buildReceiptHtml({
        order: params.order,
        shop: params.shop,
        lines: params.lines,
        paymentMethod: params.paymentMethod,
        createdAt,
        variant: job.variant,
        terminalName: params.profile.name,
        copyIndex: copy,
        totalCopies: job.copies,
        currencyCode: params.currencyCode,
      });

      const printerKind = job.variant === "kitchen" ? "kitchen" : "receipt";
      const idempotencyKey = `${params.order.id}-${job.variant}-${copy}-${params.forcePrint ? `reprint-${Date.now()}` : "initial"}`;
      let cloudJobId: string | null = null;

      if (params.shop?.id) {
        try {
          const res = await api.posHardware.createPrintJob(
            {
              station: params.profile.name || "cashier",
              kind: printerKind === "kitchen" ? "kitchen-ticket" : "receipt",
              payload: {
                shopId: params.shop.id,
                orderId: params.order.id,
                orderNumber: (params.order as any).orderNumber || (params.order as any).order_number,
                variant: job.variant,
                copyIndex: copy,
                totalCopies: job.copies,
                itemCount: params.lines.length,
                amountCents: (params.order as any).totalAmountCents || (params.order as any).total_cents || 0,
              },
              idempotencyKey,
            },
            { shopId: params.shop.id }
          );
          cloudJobId = (res as any)?.job?.id || (res as any)?.id || null;
        } catch (err) {
          // Cloud hardware ledger failure should not block physical/local printing
          console.warn("Failed to record POS hardware print job intent:", err);
        }
      }

      window.dispatchEvent(
        new CustomEvent("dilivygo:pos-receipt", {
          detail: {
            jobId: cloudJobId,
            idempotencyKey,
            orderId: params.order.id,
            shopId: params.shop?.id || null,
            paymentMethod: params.paymentMethod,
            createdAt,
            lines: params.lines,
            terminalProfileId: params.profile.id,
            terminalName: params.profile.name,
            variant: job.variant,
            copyIndex: copy,
            totalCopies: job.copies,
            shouldPrint,
            receiptHtml,
          },
        })
      );

      if (nativeIntercepts) continue;
      const printWindow = window.open("", "_blank", "width=320,height=640");
      if (!printWindow) {
        if (cloudJobId && params.shop?.id) {
          api.posHardware
            .updateJobStatus(
              cloudJobId,
              { status: "failed", lastError: params.printWindowBlockedMessage || "Print popup blocked by browser" },
              { shopId: params.shop.id }
            )
            .catch(() => {});
        }
        return;
      }
      printWindow.document.write(receiptHtml);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
        if (cloudJobId && params.shop?.id) {
          api.posHardware
            .updateJobStatus(
              cloudJobId,
              { status: "sent" },
              { shopId: params.shop.id }
            )
            .catch(() => {});
        }
      }, 250);
    }
  }
}

const POS_SIDEBAR_COLLAPSED_KEY = "dilivygo-pos-sidebar-collapsed";

const logisticsNavActiveClass =
  "border border-primary/30 bg-primary/[0.08] text-sidebar-foreground dark:border-[#ff8c69]/35 dark:bg-gradient-to-r dark:from-[#1c1614] dark:via-[#231a16] dark:to-[rgba(255,140,105,0.12)] dark:text-white dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]";

const POS_LOADING_FLOW = [
  {
    title: "Loading POS components...",
    frames: [[24], [16, 17, 18, 23, 25, 30, 31, 32], [8, 9, 10, 11, 12, 15, 19, 22, 26, 29, 33, 36, 37, 38, 39, 40]],
    repeatCount: 1,
  },
  {
    title: "Initializing terminal...",
    frames: [[24], [23, 24, 25, 17, 31], [16, 17, 18, 23, 24, 25, 30, 31, 32]],
    repeatCount: 1,
  },
  {
    title: "Establishing secure connection...",
    frames: [[24], [16, 18, 30, 32], [8, 12, 36, 40]],
    repeatCount: 1,
  },
];

export default function POSPage() {
  const { appName, helpUrl, supportEmail } = usePlatformBranding();
  const { t } = useTranslation("pos");
  const toast = useMemo(() => ({
    success: (..._args: any[]) => {},
    error: (..._args: any[]) => {},
    info: (..._args: any[]) => {},
    warning: (..._args: any[]) => {},
  }), []);
  const queryClient = useQueryClient();
  const platformCurrency = useCurrency();
  const { user, isLoading, isAuthenticated, hydrate, setUser, logout } = useAuthStore();
  const { workspace, fetchWorkspace, isLoading: isWorkspaceLoading } = useWorkspaceStore();
  
  const loadingStateLabel = useMemo(() => {
    if (!isAuthenticated) return "Authenticating...";
    if (isWorkspaceLoading) return "Syncing workspace...";
    return undefined;
  }, [isAuthenticated, isWorkspaceLoading]);

  const canUsePosApp =
    user?.role === "vendor" || user?.role === "admin";
  const { activeShop, shops, setShops, setActiveShop } = useShopStore();
  const projectRef = staffProjectRef(user);
  const defaultProfilePhotoUrls = useDefaultProfilePhotoUrls();
  const posProfileImageSrc = useMemo(
    () => resolveProfileAvatarUrl(undefined, user?.id ?? "", defaultProfilePhotoUrls),
    [user?.id, defaultProfilePhotoUrls],
  );
  const posProfileInitials = user?.email?.[0]?.toUpperCase() || "P";
  const workspaceTenantKey = projectRef ?? "";
  const [initialPrinterConfig] = useState(() => loadPrinterConfig());
  const [cart, setCart] = useState<CartLine[]>([]);
  const [leavingLineIds, setLeavingLineIds] = useState<Set<string>>(new Set());
  const [selectedLineId, setSelectedLineId] = useState<string | undefined>();
  const [barcodeValue, setBarcodeValue] = useState("");
  const barcodeInputRef = useRef<HTMLInputElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "split">("cash");
  const [tenderedInput, setTenderedInput] = useState("");
  const [orderNote, setOrderNote] = useState("");
  const [posCheckoutMode, setPosCheckoutMode] = useState<PosCheckoutMode>("quick");
  const [printerProfiles, setPrinterProfiles] = useState<TerminalPrinterProfile[]>(
    initialPrinterConfig.profiles
  );
  const [activePrinterProfileId, setActivePrinterProfileId] = useState<string>(
    initialPrinterConfig.activeProfileId
  );
  const [lastReceipt, setLastReceipt] = useState<ReceiptSnapshot | null>(null);
  const [pdfReceiptBusy, setPdfReceiptBusy] = useState(false);
  const [desktopPrinters, setDesktopPrinters] = useState<DesktopPrinter[]>([]);
  const [diagnosticsTargets, setDiagnosticsTargets] = useState<PrinterTargets>({
    cashier: "",
    kitchen: "",
  });
  const [diagnosticsBusy, setDiagnosticsBusy] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [posSidebarCollapsed, setPosSidebarCollapsed] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const desktopPrintingBridge = getDesktopPrintingBridge();
  const hasDesktopDiagnostics = Boolean(desktopPrintingBridge?.listPrinters);

  const loadPrinterDiagnostics = useCallback(async () => {
    if (!desktopPrintingBridge?.listPrinters) return;
    try {
      const result = await desktopPrintingBridge.listPrinters();
      setDesktopPrinters(result.printers || []);
      setDiagnosticsTargets(result.targets || { cashier: "", kitchen: "" });
    } catch {
      toast.error(t("errors.printerDiagFailed"));
    }
  }, [desktopPrintingBridge]);

  const savePrinterTargets = useCallback(async () => {
    if (!desktopPrintingBridge?.setPrinterTargets) return;
    setDiagnosticsBusy(true);
    try {
      const nextTargets = await desktopPrintingBridge.setPrinterTargets(diagnosticsTargets);
      setDiagnosticsTargets(nextTargets);
      toast.success(t("printer.targetsSaved"));
    } catch {
      toast.error(t("errors.printerTargetsFailed"));
    } finally {
      setDiagnosticsBusy(false);
    }
  }, [desktopPrintingBridge, diagnosticsTargets]);

  const runTestPrint = useCallback(
    async (variant: "cashier" | "kitchen") => {
      if (!desktopPrintingBridge?.testPrint) return;
      setDiagnosticsBusy(true);
      try {
        const result = await desktopPrintingBridge.testPrint({ variant });
        if (result?.ok) {
          toast.success(`${variant === "cashier" ? t("receipt.cashier") : t("receipt.kitchen")} test print sent`);
        } else {
          toast.error(result?.error || t("errors.testPrintFailed"));
        }
      } catch {
        toast.error(t("errors.testPrintError"));
      } finally {
        setDiagnosticsBusy(false);
      }
    },
    [desktopPrintingBridge]
  );

  const handleLogoUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingLogo(true);
    try {
      const { url } = await api.workspace.uploadLogo(file);
      const ref = staffProjectRef(user) ?? workspace?.projectRef ?? null;
      await fetchWorkspace(ref);
      toast.success(t("settings.logoUploaded"));
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : t("settings.logoUploadFailed");
      toast.error(errorMessage);
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  }, [fetchWorkspace, t, user, workspace?.projectRef]);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    try {
      if (localStorage.getItem(POS_SIDEBAR_COLLAPSED_KEY) === "1") {
        setPosSidebarCollapsed(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  function togglePosSidebarCollapsed() {
    setPosSidebarCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(POS_SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  useEffect(() => {
    if (isLoading) return;
    const { fetchWorkspace: loadWs, setWorkspace } = useWorkspaceStore.getState();
    if (isAuthenticated && workspaceTenantKey) {
      void loadWs(workspaceTenantKey);
    } else if (!isAuthenticated) {
      setWorkspace(null);
    }
    // Store actions are read via getState() so deps stay primitives-only (avoids HMR
    // "dependency array changed size" when this effect previously had only [fetchWorkspace]).
  }, [isLoading, isAuthenticated, workspaceTenantKey]);

  useEffect(() => {
    if (!printerProfiles.length) return;
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(printerProfiles));
  }, [printerProfiles]);

  useEffect(() => {
    if (!activePrinterProfileId) return;
    localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, activePrinterProfileId);
  }, [activePrinterProfileId]);

  useEffect(() => {
    if (!hasDesktopDiagnostics) return;
    loadPrinterDiagnostics();
  }, [hasDesktopDiagnostics, loadPrinterDiagnostics]);

  const shopsQuery = useQuery({
    queryKey: ["pos", "shops"],
    enabled: isAuthenticated,
    queryFn: () => api.shops.list({ includeInactive: false }),
  });

  useEffect(() => {
    const payload = shopsQuery.data as { shops?: Shop[] } | undefined;
    if (payload === undefined) return;
    if (!payload.shops?.length) {
      setShops([]);
      return;
    }
    setShops(payload.shops);
  }, [shopsQuery.data, setShops]);

  // Rehydrated `activeShop` from localStorage can belong to another workspace after
  // switching accounts on the same device — clear before shops load so we never
  // hit catalog/queue with a foreign shop id (server rejects, but avoids noisy errors).
  useEffect(() => {
    if (!workspaceTenantKey) {
      setShops([]);
      return;
    }
    const { activeShop } = useShopStore.getState();
    if (activeShop && activeShop.projectRef !== workspaceTenantKey) {
      setShops([]);
    }
  }, [workspaceTenantKey, setShops]);

  const productsQuery = useQuery({
    queryKey: ["pos", "products", activeShop?.id],
    enabled: isAuthenticated && !!activeShop?.id,
    queryFn: () => api.catalog.listProducts({ includeUnavailable: false }, activeShop?.id),
  });

  const queueQuery = useQuery({
    queryKey: ["pos", "queue", activeShop?.id],
    enabled: isAuthenticated && !!activeShop?.id,
    queryFn: () => api.pos.queue({ shopId: activeShop!.id, limit: 50 }),
    refetchInterval: 10_000,
  });

  const activePrinterProfile =
    printerProfiles.find((profile) => profile.id === activePrinterProfileId)
    || printerProfiles[0]
    || null;

  useEffect(() => {
    const handleReceiptResult = (event: Event) => {
      const customEvent = event as CustomEvent<{
        jobId?: string | null;
        idempotencyKey?: string;
        orderId?: string;
        variant?: string;
        result?: { ok?: boolean; printed?: boolean; error?: string; deviceName?: string | null; skipped?: boolean };
      }>;
      const detail = customEvent.detail;
      if (!detail?.jobId || !activeShop?.id) return;

      const desktop = typeof window !== "undefined" ? (window as any).dilivygoDesktop : undefined;

      if (detail.result?.printed === true) {
        api.posHardware
          .updateJobStatus(
            detail.jobId,
            {
              status: "acked",
            },
            { shopId: activeShop.id }
          )
          .then(() => {
            if (desktop?.hardware?.confirmCloudAck && detail.idempotencyKey) {
              desktop.hardware
                .confirmCloudAck({
                  idempotencyKey: detail.idempotencyKey,
                  cloudJobId: detail.jobId,
                })
                .catch(() => {});
            }
          })
          .catch((err) => console.warn("Failed to ack POS print job:", err));
      } else if (detail.result?.ok === false) {
        api.posHardware
          .updateJobStatus(
            detail.jobId,
            {
              status: "failed",
              lastError: detail.result?.error || "Print failed on desktop workstation",
            },
            { shopId: activeShop.id }
          )
          .catch((err) => console.warn("Failed to mark POS print job failed:", err));
      }
    };

    window.addEventListener("dilivygo:pos-receipt-result", handleReceiptResult);
    return () => {
      window.removeEventListener("dilivygo:pos-receipt-result", handleReceiptResult);
    };
  }, [activeShop?.id]);

  // Offline queue replay reconciliation on station init & online
  useEffect(() => {
    if (!activeShop?.id) return;
    const desktop = typeof window !== "undefined" ? (window as any).dilivygoDesktop : undefined;
    if (!desktop?.hardware?.replayQueue) return;

    const reconcileOfflineQueue = async () => {
      try {
        const replayRes = await desktop.hardware.replayQueue();
        if (Array.isArray(replayRes?.results)) {
          for (const item of replayRes.results) {
            if (!item.cloudJobId) continue;
            const targetShopId = item.shopId || activeShop.id;
            if (item.printed) {
              try {
                await api.posHardware.updateJobStatus(
                  item.cloudJobId,
                  { status: "acked" },
                  { shopId: targetShopId }
                );
                if (desktop?.hardware?.confirmCloudAck && item.idempotencyKey) {
                  await desktop.hardware.confirmCloudAck({
                    idempotencyKey: item.idempotencyKey,
                    cloudJobId: item.cloudJobId,
                  });
                }
              } catch {
                // If cloud ack fails, leave the row in local offline queue
              }
            } else if (item.error && !item.needsCloudAck) {
              await api.posHardware
                .updateJobStatus(
                  item.cloudJobId,
                  { status: "failed", lastError: item.error },
                  { shopId: targetShopId }
                )
                .catch(() => {});
            }
          }
        }
      } catch {
        // Silent catch for background offline replay reconciliation
      }
    };

    reconcileOfflineQueue();
    window.addEventListener("online", reconcileOfflineQueue);
    return () => {
      window.removeEventListener("online", reconcileOfflineQueue);
    };
  }, [activeShop?.id]);

  useEffect(() => {
    if (!activeShop?.id) return;

    const sendStationHeartbeat = async () => {
      try {
        const desktop = typeof window !== "undefined" ? (window as any).dilivygoDesktop : undefined;
        let isMock = true;
        let printersCount = 0;
        let cashierTarget = "";
        let kitchenTarget = "";

        if (desktop?.hardware?.listDevices) {
          const hwInfo = await desktop.hardware.listDevices().catch(() => null);
          if (hwInfo?.ok) {
            isMock = Boolean(hwInfo.mock);
            printersCount = hwInfo.printers?.length || 0;
          }
        } else if (desktop?.posPrinting?.listPrinters) {
          const pInfo = await desktop.posPrinting.listPrinters().catch(() => null);
          printersCount = pInfo?.printers?.length || 0;
          cashierTarget = pInfo?.targets?.cashier || "";
          kitchenTarget = pInfo?.targets?.kitchen || "";
          isMock = false;
        } else {
          isMock = true;
        }

        const stationName = activePrinterProfile?.name || "Terminal 1";
        const deviceName = desktop ? `Desktop POS (${stationName})` : `Web POS (${stationName})`;

        await api.posHardware.sendHeartbeat(
          {
            station: stationName,
            deviceName,
            deviceKind: "printer",
            isMock,
            connection: {
              platform: desktop?.platform || "browser",
              printersCount,
              cashierTarget,
              kitchenTarget,
              timestamp: new Date().toISOString(),
            },
          },
          { shopId: activeShop.id }
        );
      } catch (err) {
        // Heartbeat failures should be silent in POS UI
      }
    };

    sendStationHeartbeat();
    const interval = setInterval(sendStationHeartbeat, 60000);
    return () => clearInterval(interval);
  }, [activeShop?.id, activePrinterProfile?.name]);

  const loginMutation = useMutation({
    mutationFn: async () => {
      const result = await api.auth.login(email, password);
      if (!("user" in result)) {
        throw new Error(t("errors.twoFactorEnabled"));
      }
      return result.user as unknown as User;
    },
    onSuccess: (loggedInUser) => {
      setUser(loggedInUser);
      toast.success(t("auth.signIn"));
    },
    onError: (err: unknown) => {
      const tenantKey = tenantHostErrorTranslationKey(err);
      if (tenantKey) {
        toast.error(t(tenantKey));
        return;
      }
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message?: unknown }).message)
          : t("errors.loginFailed");
      toast.error(message);
    },
  });

  const checkoutMutation = useMutation({
    mutationFn: (params: {
      shopId: string;
      paymentMethod: "cash" | "card" | "split";
      lines: CartLine[];
      checkoutMode: PosCheckoutMode;
      note?: string;
    }) =>
      api.pos.checkout({
        shopId: params.shopId,
        paymentMethod: params.paymentMethod,
        checkoutMode: params.checkoutMode,
        ...(params.note ? { note: params.note } : {}),
        items: params.lines.map((line) => ({
          productId: line.productId,
          ...(line.productVariantId ? { productVariantId: line.productVariantId } : {}),
          name: line.name,
          quantity: line.quantity,
          unitPriceCents: line.unitPriceCents,
          ...(line.notes ? { notes: line.notes } : {}),
          ...(line.modifiers?.length ? { modifiers: line.modifiers } : {}),
        })),
      }),
    onSuccess: (order, variables) => {
      if (!activePrinterProfile) {
        toast.error(t("receipt.noPrinterProfile"));
        return;
      }
      triggerReceiptHooks({
        order,
        lines: variables.lines,
        paymentMethod: variables.paymentMethod,
        shop: activeShop || null,
        profile: activePrinterProfile,
        currencyCode: receiptCurrencyCode(activeShop || null, order, platformCurrency),
        printWindowBlockedMessage: t("receipt.printWindowBlocked"),
      });
      setLastReceipt({
        order,
        lines: variables.lines,
        paymentMethod: variables.paymentMethod,
        shop: activeShop || null,
      });
      setCart([]);
      setLeavingLineIds(new Set());
      setSelectedLineId(undefined);
      setTenderedInput("");
      setOrderNote("");
      setTimeout(() => barcodeInputRef.current?.focus(), 0);
      queryClient.invalidateQueries({ queryKey: ["pos", "queue", activeShop?.id] });
      toast.success(
        variables.checkoutMode === "quick"
          ? t("order.walkInSaleRecorded")
          : t("order.kitchenTicketCreated"),
      );
    },
    onError: (err: unknown) => {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message?: unknown }).message)
          : t("errors.checkoutFailed");
      toast.error(message);
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ orderId, status }: { orderId: string; status: string }) =>
      api.orders.updateStatus(orderId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pos", "queue", activeShop?.id] });
    },
    onError: (err: unknown) => {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message?: unknown }).message)
          : t("errors.statusUpdateFailed");
      toast.error(message);
    },
  });

  const extendSlaMutation = useMutation({
    mutationFn: ({ orderId, minutes }: { orderId: string; minutes: number }) =>
      api.orders.extendSla(orderId, minutes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pos", "queue", activeShop?.id] });
      toast.success(t("queue.extendSuccess"));
    },
    onError: (err: unknown) => {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message?: unknown }).message)
          : t("errors.extendSlaFailed");
      toast.error(message);
    },
  });

  const products = useMemo(() => {
    const payload = productsQuery.data as { products?: Product[] } | Product[] | undefined;
    if (!payload) return [];
    return Array.isArray(payload) ? payload : payload.products || [];
  }, [productsQuery.data]);
  const searchableProducts = products as ProductSearchable[];

  const categories = useMemo(() => {
    const bucket = new Map<string, number>();
    for (const product of products) {
      const key = product.category?.trim() || "__uncategorized__";
      bucket.set(key, (bucket.get(key) || 0) + 1);
    }
    return Array.from(bucket.entries()).map(([name, count]) => ({ name, count }));
  }, [products]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((product) => {
      const productCat = product.category?.trim() || "__uncategorized__";
      const inCategory = category === "all" || productCat === category;
      if (!inCategory) return false;
      if (!q) return true;
      const variantMatch = (product.variants ?? []).some((v) => {
        if (!v.available) return false;
        const vn = (v.name || "").toLowerCase();
        const sku = (v.sku || "").toLowerCase();
        const bc = (v.barcode || "").toLowerCase();
        return vn.includes(q) || (sku && sku.includes(q)) || (bc && bc.includes(q));
      });
      return (
        product.name.toLowerCase().includes(q)
        || (product.category || "").toLowerCase().includes(q)
        || (product.description || "").toLowerCase().includes(q)
        || variantMatch
      );
    });
  }, [category, products, search]);

  const queue = useMemo(() => {
    const orders = queueQuery.data || [];
    return orders.filter((order) => !["completed", "cancelled", "rejected"].includes(order.status));
  }, [queueQuery.data]);
  const pendingQueue = queue.filter((order) =>
    ["placed", "accepted", "preparing", "ready"].includes(order.status)
  );

  const cartTotalCents = cart.reduce((sum, line) => sum + line.unitPriceCents * line.quantity, 0);
  const cartCount = cart.reduce((sum, line) => sum + line.quantity, 0);

  const tenderedCents = Math.round(parseFloat(tenderedInput || "0") * 100);
  const changeCents = tenderedCents - cartTotalCents;
  const isTenderedInsufficient = tenderedInput !== "" && tenderedCents < cartTotalCents;
  const isTenderedExact = tenderedInput !== "" && tenderedCents === cartTotalCents;
  const presets = useMemo(() => cashPresets(cartTotalCents), [cartTotalCents]);

  // Exit animation for cash calculator panel
  const showCashCalc = paymentMethod === "cash" && cart.length > 0;
  const cashCalc = useExitAnimation(showCashCalc, "pos-anim-fade-down", "pos-anim-collapse-out", 260);

  const updateActivePrinterProfile = useCallback(
    (updates: Partial<TerminalPrinterProfile>) => {
      if (!activePrinterProfile) return;
      setPrinterProfiles((prev) =>
        prev.map((profile) =>
          profile.id === activePrinterProfile.id ? { ...profile, ...updates } : profile
        )
      );
    },
    [activePrinterProfile]
  );

  const addPrinterProfile = useCallback(() => {
    const profile = createPrinterProfile(`Terminal ${printerProfiles.length + 1}`);
    setPrinterProfiles((prev) => [...prev, profile]);
    setActivePrinterProfileId(profile.id);
  }, [printerProfiles.length]);

  const updateLineQuantity = useCallback((lineId: string | undefined, quantity: number) => {
    if (!lineId) return;
    const q = Math.max(0, quantity);
    if (q === 0) {
      // Trigger exit animation; actual removal happens in onAnimationEnd
      setLeavingLineIds((prev) => new Set([...prev, lineId]));
      queueMicrotask(() => {
        setSelectedLineId((cur) => (cur === lineId ? undefined : cur));
      });
      return;
    }
    setCart((prev) => {
      const idx = prev.findIndex((line) => line.id === lineId);
      if (idx === -1) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx], quantity: q };
      return next;
    });
  }, []);

  const decrementProductQuantity = useCallback((productId: string) => {
    setCart((prev) => {
      const indices: number[] = [];
      prev.forEach((line, i) => {
        if (line.productId === productId) indices.push(i);
      });
      if (!indices.length) return prev;
      const idxLast = indices[indices.length - 1]!;
      const line = prev[idxLast];
      if (line.quantity <= 1) {
        // Trigger exit animation; actual removal happens in onAnimationEnd
        setLeavingLineIds((lids) => new Set([...lids, line.id]));
        queueMicrotask(() => {
          setSelectedLineId((cur) => (cur === line.id ? undefined : cur));
        });
        return prev;
      }
      const next = [...prev];
      next[idxLast] = { ...line, quantity: line.quantity - 1 };
      return next;
    });
  }, []);

  function addToCart(product: Product, forcedVariant?: ProductVariant) {
    const variants = product.variants ?? [];
    const variant =
      forcedVariant ??
      (variants.length > 0 ? pickDefaultVariant(product) : undefined);
    if (variants.length > 0 && !variant) {
      toast.error(t("errors.noAvailableVariant"));
      return;
    }
    const basePriceCents = variant ? variant.priceCents : product.priceCents;
    const lineName = variant ? `${product.name}${POS_VARIANT_NAME_SEP}${variant.name}` : product.name;
    const productVariantId = variant?.id;

    const hasMod = productHasConfigurableModifiers(product);
    const modifiers = hasMod ? buildDefaultModifiers(product) : undefined;
    const unitPriceCents = lineUnitPriceCents(basePriceCents, modifiers);

    setCart((prev) => {
      let selectId: string;

      const sameVariant = (line: CartLine) =>
        (line.productVariantId ?? undefined) === (productVariantId ?? undefined);

      if (hasMod) {
        const sig = modifierSignature(modifiers);
        const idx = prev.findIndex(
          (line) =>
            line.productId === product.id &&
            sameVariant(line) &&
            modifierSignature(line.modifiers) === sig
        );
        if (idx === -1) {
          selectId = newCartLineId();
          queueMicrotask(() => setSelectedLineId(selectId));
          return [
            ...prev,
            {
              id: selectId,
              productId: product.id,
              ...(productVariantId ? { productVariantId } : {}),
              name: lineName,
              unitPriceCents,
              quantity: 1,
              modifiers,
            },
          ];
        }
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        selectId = next[idx].id;
        queueMicrotask(() => setSelectedLineId(selectId));
        return next;
      }

      const idx = prev.findIndex(
        (line) =>
          line.productId === product.id && sameVariant(line) && !line.modifiers?.length
      );
      if (idx === -1) {
        selectId = newCartLineId();
        queueMicrotask(() => setSelectedLineId(selectId));
        return [
          ...prev,
          {
            id: selectId,
            productId: product.id,
            ...(productVariantId ? { productVariantId } : {}),
            name: lineName,
            unitPriceCents: basePriceCents,
            quantity: 1,
          },
        ];
      }
      const next = [...prev];
      next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
      selectId = next[idx].id;
      queueMicrotask(() => setSelectedLineId(selectId));
      return next;
    });

    setTimeout(() => barcodeInputRef.current?.focus(), 0);
  }

  const checkout = useCallback(() => {
    if (!activeShop) {
      toast.error(t("errors.selectShopFirst"));
      return;
    }
    if (!cart.length || checkoutMutation.isPending) return;
    checkoutMutation.mutate({
      shopId: activeShop.id,
      paymentMethod,
      lines: cart,
      checkoutMode: posCheckoutMode,
      ...(orderNote.trim() ? { note: orderNote.trim() } : {}),
    });
  }, [activeShop, cart, checkoutMutation, orderNote, paymentMethod, posCheckoutMode]);

  const downloadLastPdfReceipt = useCallback(async () => {
    if (!lastReceipt?.order?.id) {
      toast.error(t("receipt.noReceiptYet"));
      return;
    }
    setPdfReceiptBusy(true);
    try {
      const blob = await api.orders.getReceiptPdf(lastReceipt.order.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `receipt-${lastReceipt.order.id.slice(0, 8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t("receipt.pdfDownloaded"));
    } catch {
      toast.error(t("receipt.pdfFailed"));
    } finally {
      setPdfReceiptBusy(false);
    }
  }, [lastReceipt]);

  const reprintLastReceipt = useCallback(() => {
    if (!lastReceipt) {
      toast.error(t("receipt.noReceiptReprint"));
      return;
    }
    if (!activePrinterProfile) {
      toast.error(t("receipt.noPrinterProfile"));
      return;
    }
    triggerReceiptHooks({
      order: lastReceipt.order,
      lines: lastReceipt.lines,
      paymentMethod: lastReceipt.paymentMethod,
      shop: lastReceipt.shop,
      profile: activePrinterProfile,
      forcePrint: true,
      currencyCode: receiptCurrencyCode(lastReceipt.shop, lastReceipt.order, platformCurrency),
      printWindowBlockedMessage: t("receipt.printWindowBlocked"),
    });
    toast.success(t("receipt.reprinted"));
  }, [activePrinterProfile, lastReceipt, platformCurrency]);

  function handleBarcodeSubmit(raw: string) {
    const code = raw.trim().toLowerCase();
    if (!code) return;

    for (const product of searchableProducts) {
      for (const v of product.variants ?? []) {
        const bc = String(v.barcode || "").trim().toLowerCase();
        const sk = String(v.sku || "").trim().toLowerCase();
        if ((bc && bc === code) || (sk && sk === code)) {
          addToCart(product, v);
          setBarcodeValue("");
          return;
        }
      }
    }

    const matched = searchableProducts.find((product) => {
      const id = String(product.id || "").toLowerCase();
      const name = String(product.name || "").toLowerCase();
      const barcode = String(product.barcode || "").toLowerCase();
      const sku = String(product.sku || "").toLowerCase();
      return [barcode, sku, id, name].some((candidate) => candidate === code);
    });
    if (!matched) {
      toast.error(t("errors.noProductForCode", { code: raw }));
      return;
    }
    addToCart(matched);
    setBarcodeValue("");
  }

  useEffect(() => {
    if (!isAuthenticated) return;
    barcodeInputRef.current?.focus();
  }, [isAuthenticated, activeShop?.id]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const onGlobalMouseDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("input,textarea,select,button,[role='button'],a")) return;
      barcodeInputRef.current?.focus();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (shouldIgnoreGlobalKeys(event)) return;
      if (!isAuthenticated) return;

      if (event.key === "Enter") {
        event.preventDefault();
        checkout();
        return;
      }
      if (event.key === "b" || event.key === "B") {
        event.preventDefault();
        barcodeInputRef.current?.focus();
        return;
      }
      if (event.key === "f" || event.key === "F") {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (event.key === "r" || event.key === "R") {
        event.preventDefault();
        reprintLastReceipt();
        return;
      }
      if (!selectedLineId) return;

      if (/^[1-9]$/.test(event.key)) {
        event.preventDefault();
        updateLineQuantity(selectedLineId, Number(event.key));
        return;
      }
      if (event.key === "0") {
        event.preventDefault();
        updateLineQuantity(selectedLineId, 10);
        return;
      }
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        const current = cart.find((line) => line.id === selectedLineId);
        if (current) updateLineQuantity(selectedLineId, current.quantity + 1);
        return;
      }
      if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        const current = cart.find((line) => line.id === selectedLineId);
        if (current) updateLineQuantity(selectedLineId, current.quantity - 1);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onGlobalMouseDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onGlobalMouseDown);
    };
  }, [cart, checkout, isAuthenticated, reprintLastReceipt, selectedLineId, updateLineQuantity]);

  if (isLoading) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-background">
        <DotFlow items={POS_LOADING_FLOW} loadingState={loadingStateLabel} />
      </div>
    );
  }

  if (isAuthenticated && !canUsePosApp) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
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
              }}
            >
              {t("wrongAccount.signOut")}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isAuthenticated) {
    const displayName = workspace?.name || t("terminal.title");
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="relative h-[100svh] overflow-hidden bg-background text-foreground lg:grid lg:grid-cols-[1.35fr_1fr]"
      >
        <div className="absolute right-5 top-5 z-[90] flex items-center gap-2 pointer-events-auto">
          <ThemeToggle />
          <GlobeLanguageMenu />
        </div>

        <div className="absolute inset-0 overflow-hidden lg:relative lg:inset-auto">
          <video
            className="absolute inset-0 size-full object-cover"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
          >
            <source src="/POS_login.mp4" type="video/mp4" />
          </video>
          <div className="absolute inset-0 bg-black/20" aria-hidden />

          <Link href="/" className="absolute left-5 top-5 z-10 inline-flex items-center gap-3">
            <PlatformBrandingMark className="size-10 text-base text-white" contrast="forDarkBackground" />
            <PlatformWordmark contrast="forDarkBackground">
              <span className="text-lg font-medium tracking-tight text-white">{appName}</span>
            </PlatformWordmark>
          </Link>

          <p className="absolute bottom-5 left-5 z-10 max-w-[28rem] text-xs font-normal text-white/85">
            By continuing, you agree to our Terms of Service and Privacy Policy.
          </p>
        </div>

        <div className="relative z-10 flex min-h-[100svh] items-center justify-center px-6 py-10 lg:min-h-0 lg:px-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="w-full max-w-xl translate-y-10 space-y-10 lg:translate-y-0"
          >
            <div className="space-y-2 text-left">
              <motion.div
                initial={{ scale: 0.8, rotate: -10 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 200, damping: 15 }}
                className="flex size-14 items-center justify-center overflow-hidden rounded-2xl border border-border/60 bg-background/60 shadow-sm"
              >
                {workspace?.logoUrl ? (
                  <WorkspaceLogoImage src={workspace.logoUrl} alt="" />
                ) : (
                  <PlatformBrandingMark className="size-10 text-primary" />
                )}
              </motion.div>

              <Badge variant="secondary" className="mt-4 rounded-full px-3 py-0.5 text-xs font-normal">
                {displayName}
              </Badge>
              <h1 className="mt-4 text-2xl font-medium tracking-tight text-foreground">
                {t("terminal.title")}
              </h1>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t("terminal.secureLogin")}
              </p>
            </div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="w-full space-y-6 text-left"
            >
              <div className="space-y-5">
                <label
                  className="text-[11px] font-normal uppercase tracking-widest text-muted-foreground/80"
                  htmlFor="pos-login-email"
                >
                  {t("auth.emailPlaceholder")}
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="pos-login-email"
                    type="email"
                    placeholder={t("auth.emailPlaceholder")}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-14 rounded-2xl border border-border/60 bg-background/60 pl-12 text-foreground placeholder:text-muted-foreground transition-colors focus:bg-background focus-visible:ring-ring/30"
                    autoComplete="email"
                    autoFocus
                  />
                </div>
              </div>

              <div className="space-y-5">
                <label
                  className="text-[11px] font-normal uppercase tracking-widest text-muted-foreground/80"
                  htmlFor="pos-login-password"
                >
                  {t("auth.passwordPlaceholder")}
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="pos-login-password"
                    type={showPassword ? "text" : "password"}
                    placeholder={t("auth.passwordPlaceholder")}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && email && password && !loginMutation.isPending) {
                        loginMutation.mutate();
                      }
                    }}
                    className="h-14 rounded-2xl border border-border/60 bg-background/60 pl-12 pr-11 text-foreground placeholder:text-muted-foreground transition-colors focus:bg-background focus-visible:ring-ring/30"
                    autoComplete="current-password"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full text-muted-foreground hover:bg-muted"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </Button>
                </div>
              </div>

              <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}>
                <Button
                  type="button"
                  className="h-14 w-full rounded-full bg-foreground font-medium text-background hover:bg-foreground/90"
                  size="lg"
                  disabled={!email || !password || loginMutation.isPending}
                  onClick={() => loginMutation.mutate()}
                >
                  {loginMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 size-5 animate-spin" />
                      {t("auth.signingIn")}
                    </>
                  ) : (
                    <>
                      {t("auth.signIn")}
                      <ArrowRight className="ml-2 size-4" />
                    </>
                  )}
                </Button>
              </motion.div>
            </motion.div>

            {(helpUrl || supportEmail) && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="text-left text-sm text-muted-foreground"
              >
                {t("login.needHelp")}{" "}
                {helpUrl ? (
                  <a
                    href={helpUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-foreground underline-offset-4 hover:underline"
                  >
                    {t("login.helpCenter")}
                  </a>
                ) : null}
                {helpUrl && supportEmail ? <span className="text-muted-foreground/80"> · </span> : null}
                {supportEmail ? (
                  <a
                    href={`mailto:${supportEmail}`}
                    className="font-medium text-foreground underline-offset-4 hover:underline"
                  >
                    {supportEmail}
                  </a>
                ) : null}
              </motion.p>
            )}
          </motion.div>
        </div>
      </motion.div>
    );
  }

  const selectedLine = cart.find((line) => line.id === selectedLineId);

  // Visual-only: left-border color per queue card status
  const QUEUE_BORDER: Record<string, string> = {
    placed: "#fbbf24",
    accepted: "#60a5fa",
    preparing: "#a78bfa",
    ready: "#a3e635",
    assigned: "#22d3ee",
    picked_up: "#fb7185",
  };

  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex h-dvh min-h-dvh overflow-hidden bg-background"
    >
      {/* ─── Left Sidebar ─────────────────────────────────────────────── */}
      <aside
        className={cn(
          dashboardSidebarShellClass,
          "pos-anim-fade-up pos-d-0 flex shrink-0 flex-col justify-between rounded-none border-r-0 py-3",
          posSidebarCollapsed ? dashboardSidebarWidthCollapsed : "w-[220px]",
        )}
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <div className={dashboardSidebarTopRowClass(posSidebarCollapsed)}>
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={cn(dashboardSidebarLogoFrameClass, "size-11 text-sidebar-foreground")}
            >
              {workspace?.logoUrl ? (
                <WorkspaceLogoImage src={workspace.logoUrl} alt="" />
              ) : (
                <PlatformBrandingMark className="size-6" />
              )}
            </motion.div>
            {!posSidebarCollapsed ? (
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold tracking-tight text-sidebar-foreground">
                  {workspace?.name || t("terminal.title")}
                </p>
                <p className="truncate text-[11px] text-sidebar-foreground/45">
                  {t("terminal.subtitle")}
                </p>
              </div>
            ) : null}
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              type="button"
              className={dashboardSidebarToggleButtonClass}
              aria-expanded={!posSidebarCollapsed}
              aria-label={posSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              onClick={togglePosSidebarCollapsed}
            >
              {posSidebarCollapsed ? (
                <PanelRight className="size-[18px]" />
              ) : (
                <PanelLeftClose className="size-[18px]" />
              )}
            </motion.button>
          </div>

          <nav className="mt-2 space-y-0.5 px-2 md:px-3">
            {SIDEBAR_ITEMS.map(({ labelKey, icon: Icon }, idx) => {
              const isActive = idx === 0;
              return (
                <motion.button
                  key={labelKey}
                  whileHover={{ x: 4 }}
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  title={posSidebarCollapsed ? t(labelKey) : undefined}
                  onClick={() => {
                    if (labelKey === "nav.settings") setShowSettings(true);
                  }}
                  className={cn(
                    dashboardSidebarNavLinkLayoutClass(posSidebarCollapsed),
                    "w-full text-left",
                    isActive
                      ? cn(logisticsNavActiveClass, "shadow-none")
                      : dashboardSidebarNavLinkInactiveClass,
                  )}
                >
                  <Icon className={cn(dashboardSidebarNavIconClass(isActive), "size-4")} />
                  <span className={cn("truncate", posSidebarCollapsed && "sr-only")}>
                    {t(labelKey)}
                  </span>
                </motion.button>
              );
            })}
          </nav>
        </div>

        <div className={cn(dashboardSidebarFooterDividerClass, "mt-auto space-y-2 p-2 md:p-3")}>
          {!posSidebarCollapsed ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-2.5 rounded-xl bg-muted/50 p-2.5 text-sidebar-foreground"
            >
              <Avatar className="size-8 shrink-0 border border-border">
                <AvatarImage src={posProfileImageSrc} alt="" className="object-cover" />
                <AvatarFallback className="bg-gradient-to-br from-[#ff8c69] to-[#c2410c] text-[10px] font-bold text-white">
                  {posProfileInitials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-medium">{user?.email}</p>
                <p className="truncate text-[10px] text-sidebar-foreground/50">
                  {activeShop?.name || t("terminal.noActiveShop")}
                </p>
              </div>
            </motion.div>
          ) : null}
          <motion.button
            whileHover={{ scale: 1.02, x: 4 }}
            whileTap={{ scale: 0.98 }}
            type="button"
            title={posSidebarCollapsed ? t("actions.logout") : undefined}
            className={cn(
              dashboardSidebarNavLinkLayoutClass(posSidebarCollapsed),
              dashboardSidebarNavLinkInactiveClass,
              "w-full border-transparent text-left hover:border-border/60 hover:text-destructive",
            )}
            onClick={() => logout()}
          >
            <LogOut className={cn(dashboardSidebarNavIconClass(false), "size-4")} />
            <span className={cn("truncate", posSidebarCollapsed && "sr-only")}>
              {t("actions.logout")}
            </span>
          </motion.button>
        </div>
      </aside>

      {/* ─── Center Column ────────────────────────────────────────────── */}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex shrink-0 items-center gap-4 border-b border-border/20 bg-background/60 px-5 py-2.5 backdrop-blur-md">

          {/* Title + shop context */}
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight">{t("order.title")}</h1>
                <AnimatePresence>
                  {cartCount > 0 && (
                    <motion.span
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground"
                    >
                      {cartCount}
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            </div>
            <Select
              value={activeShop?.id || "__none__"}
              onValueChange={(value) => {
                const nextShop = shops.find((shop) => shop.id === value);
                if (nextShop) setActiveShop(nextShop);
              }}
            >
              <SelectTrigger className="h-8 w-36 rounded-lg border border-border bg-muted/40 px-2.5 text-[12px] text-muted-foreground transition-all focus:ring-1 focus:ring-primary/50 hover:bg-muted/60">
                <Store className="mr-1.5 size-3 shrink-0 opacity-60" />
                <SelectValue placeholder={t("menu.selectShop")} />
              </SelectTrigger>
              <SelectContent>
                {shops.map((shop) => (
                  <SelectItem key={shop.id} value={shop.id}>
                    {shop.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Unified search pill */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex h-9 items-stretch overflow-hidden rounded-xl border border-border bg-muted/30 transition-colors focus-within:border-primary/50 focus-within:bg-muted/50"
          >
            <div className="relative flex items-center">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/50" />
              <input
                ref={searchInputRef}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("menu.searchPlaceholder")}
                className="h-full w-64 bg-transparent pl-9 pr-3 text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
              />
            </div>
            <div className="my-2 w-px bg-border/60" />
            <div className="relative flex items-center">
              <ScanBarcode className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-primary/60" />
              <input
                ref={barcodeInputRef}
                value={barcodeValue}
                onChange={(event) => setBarcodeValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  handleBarcodeSubmit(barcodeValue);
                }}
                placeholder={t("menu.barcodePlaceholder")}
                className="h-full w-48 bg-transparent pl-9 pr-8 text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
              />
              <span className="pointer-events-none absolute right-2.5 top-1/2 inline-flex -translate-y-1/2 items-center">
                {barcodeValue ? (
                  <kbd className="pos-key">↵</kbd>
                ) : (
                  <kbd className="pos-key">B</kbd>
                )}
              </span>
            </div>
          </motion.div>

          {/* Actions */}
          <div className="flex items-center gap-1">
            <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 rounded-lg text-muted-foreground hover:text-foreground"
                onClick={reprintLastReceipt}
                disabled={!lastReceipt}
                title={t("actions.reprint")}
              >
                <Printer className="size-4" />
              </Button>
            </motion.div>
            <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 rounded-lg text-muted-foreground hover:text-foreground"
                onClick={() => void downloadLastPdfReceipt()}
                disabled={!lastReceipt || pdfReceiptBusy}
                title={t("actions.pdf")}
              >
                {pdfReceiptBusy ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />}
              </Button>
            </motion.div>
            <GlobeLanguageMenu />
            <ThemeToggle />
          </div>
        </header>

        {/* ── Order Queue strip ──────────────────────────────────────── */}
        <div className="shrink-0 border-b border-border/20 bg-background/30 px-5 py-3">
          <div className="mb-2.5 flex items-center gap-2">
            <Clock className="size-3.5 text-primary" />
            <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {t("queue.title")}
            </h2>
            {pendingQueue.length > 0 && (
              <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
                {pendingQueue.length}
              </span>
            )}
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1">
            <AnimatePresence initial={false}>
              {pendingQueue.slice(0, 12).map((order, qIdx) => {
                const nextSt = nextPosQueueStatus(order);
                const borderColor = QUEUE_BORDER[order.status] ?? "rgba(255,255,255,0.15)";
                const isSlaBreached =
                  order.slaBreached === true ||
                  (order.slaDeadline && new Date(order.slaDeadline).getTime() <= Date.now());
                return (
                  <motion.div
                    key={order.id}
                    layout
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    whileHover={{ y: -2 }}
                    className="pos-queue-card p-3"
                    style={{ borderLeftColor: borderColor }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[11px] font-bold tabular-nums">#{order.id.slice(0, 6)}</p>
                      <span
                        className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
                        style={{
                          background: `${borderColor}20`,
                          color: borderColor,
                          border: `1px solid ${borderColor}40`,
                        }}
                      >
                        {order.status.replace(/_/g, " ")}
                      </span>
                    </div>
                    <p className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Clock className="size-3 shrink-0" />
                      {new Date(pickCreatedAt(order)).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="text-sm font-bold" style={{ color: borderColor }}>
                        <PriceDisplay cents={pickTotal(order)} />
                      </span>
                      {nextSt && (
                        <motion.button
                          whileTap={{ scale: 0.95 }}
                          type="button"
                          className="flex h-7 items-center gap-1 rounded-lg border border-border bg-muted/50 px-2 text-[10px] font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-40"
                          disabled={updateStatusMutation.isPending}
                          onClick={() => updateStatusMutation.mutate({ orderId: order.id, status: nextSt })}
                        >
                          {nextSt === "accepted" && <CheckCircle2 className="size-3" />}
                          {nextSt === "preparing" && <ChefHat className="size-3" />}
                          {nextSt === "ready" && <Sparkles className="size-3" />}
                          {nextSt === "completed" && <CheckCircle2 className="size-3" />}
                          {nextSt.replace(/_/g, " ")}
                        </motion.button>
                      )}
                    </div>
                    {(order.status === "accepted" || order.status === "preparing") && (
                      <div
                        className={cn(
                          "mt-2 flex flex-wrap items-center gap-1 pt-2",
                          isSlaBreached
                            ? "rounded-lg border border-destructive/35 bg-destructive/5 px-1.5 py-1.5"
                            : "border-t border-border/30",
                        )}
                      >
                        <TimerReset className="size-3 shrink-0 text-muted-foreground" aria-hidden />
                        {SLA_EXTEND_PRESET_MINUTES.map((m) => {
                          const extendingThis =
                            extendSlaMutation.isPending &&
                            extendSlaMutation.variables?.orderId === order.id;
                          const showSpinner = extendingThis && extendSlaMutation.variables?.minutes === m;
                          return (
                            <motion.button
                              key={m}
                              whileTap={{ scale: 0.9 }}
                              type="button"
                              className="flex h-5 min-w-[2rem] items-center justify-center rounded border border-border bg-muted/40 px-1.5 text-[9px] font-semibold tabular-nums text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30"
                              disabled={extendingThis}
                              title={`Extend prep by ${m} min`}
                              onClick={() => extendSlaMutation.mutate({ orderId: order.id, minutes: m })}
                            >
                              {showSpinner ? <Loader2 className="size-2.5 animate-spin" /> : `+${m}m`}
                            </motion.button>
                          );
                        })}
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
            {!pendingQueue.length && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex h-[72px] w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border/30 text-xs text-muted-foreground/50"
              >
                <CheckCircle2 className="size-4" />
                {t("queue.empty")}
              </motion.div>
            )}
          </div>
        </div>

        {/* ── Menu area ─────────────────────────────────────────────── */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-5 pt-4">
          {/* Category filter */}
          <div className="mb-3 flex shrink-0 flex-wrap gap-1.5">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              type="button"
              className={cn(
                "rounded-full border px-3.5 py-1 text-[11px] font-medium transition-all",
                category === "all"
                  ? "pos-toggle-active"
                  : "pos-toggle-inactive",
              )}
              onClick={() => setCategory("all")}
            >
              {t("menu.allMenu", { count: products.length })}
            </motion.button>
            {categories.map((entry, idx) => (
              <motion.button
                key={entry.name}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                type="button"
                className={cn(
                  "rounded-full border px-3.5 py-1 text-[11px] font-medium transition-all",
                  category === entry.name
                    ? "pos-toggle-active"
                    : CATEGORY_TINTS[idx % CATEGORY_TINTS.length],
                )}
                onClick={() => setCategory(entry.name)}
              >
                {entry.name === "__uncategorized__" ? t("menu.uncategorized") : entry.name}
                {" "}({entry.count})
              </motion.button>
            ))}
          </div>

          {/* Product grid */}
          <div className="grid min-h-0 flex-1 auto-rows-max gap-3 overflow-y-auto pb-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            <AnimatePresence mode="popLayout">
              {filteredProducts.map((product, pIdx) => {
                const qty = cart
                  .filter((line) => line.productId === product.id)
                  .reduce((sum, line) => sum + line.quantity, 0);
                return (
                  <motion.div
                    key={product.id}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ delay: Math.min(0.5, pIdx * 0.03) }}
                    className={cn(
                      "pos-product-card group",
                      qty > 0 && "in-cart",
                    )}
                  >
                    <AnimatePresence>
                      {qty > 0 && (
                        <motion.div
                          initial={{ scale: 0, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0, opacity: 0 }}
                          className="pos-qty-badge"
                        >
                          {qty}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Image — full bleed top */}
                    <button
                      type="button"
                      className="pos-img-shimmer relative block aspect-[4/3] w-full overflow-hidden"
                      onClick={() => addToCart(product)}
                      tabIndex={-1}
                      aria-hidden
                    >
                      {product.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <motion.img
                          whileHover={{ scale: 1.05 }}
                          transition={{ duration: 0.4 }}
                          src={product.imageUrl}
                          alt={product.name}
                          className="size-full object-cover"
                        />
                      ) : (
                        <div className="flex size-full items-center justify-center bg-muted/30">
                          <Store className="size-10 text-muted-foreground/20" />
                        </div>
                      )}
                    </button>

                    {/* Content */}
                    <div className="flex flex-1 flex-col p-3">
                      <button
                        type="button"
                        className="min-w-0 text-left"
                        onClick={() => addToCart(product)}
                      >
                        <p
                          className="line-clamp-2 text-[13px] font-semibold leading-tight"
                          title={product.name}
                        >
                          {product.name}
                        </p>
                        {product.description ? (
                          <p
                            className="mt-0.5 line-clamp-1 text-[11px] leading-tight text-muted-foreground"
                            title={product.description}
                          >
                            {product.description}
                          </p>
                        ) : (
                          <div className="mt-0.5 h-[14px]" />
                        )}
                      </button>

                      {availableVariantNamesSummary(product) ? (
                        <p
                          className="mt-1 line-clamp-2 text-[10px] leading-snug text-muted-foreground"
                          title={availableVariantNamesSummary(product, 40)}
                        >
                          {t("menu.variantOptions", {
                            list: availableVariantNamesSummary(product),
                          })}
                        </p>
                      ) : null}

                      <div className="mt-2.5 flex items-center justify-between gap-2">
                        <span className="text-sm font-bold text-primary">
                          <PriceDisplay cents={productGridPriceCents(product)} />
                        </span>
                        <div className="flex shrink-0 items-center gap-1">
                          <motion.button
                            whileTap={{ scale: 0.8 }}
                            type="button"
                            className="pos-qty-btn"
                            onClick={() => decrementProductQuantity(product.id)}
                            disabled={qty <= 0}
                            aria-label="Decrease quantity"
                          >
                            −
                          </motion.button>
                          <motion.span
                            key={qty}
                            initial={{ scale: 1.2 }}
                            animate={{ scale: 1 }}
                            className="w-5 text-center text-[11px] font-semibold tabular-nums"
                          >
                            {qty || ""}
                          </motion.span>
                          <motion.button
                            whileTap={{ scale: 0.8 }}
                            type="button"
                            className="pos-qty-btn add"
                            onClick={() => addToCart(product)}
                            aria-label="Add to cart"
                          >
                            +
                          </motion.button>
                        </div>
                      </div>

                      {product.category?.trim() ? (
                        <p className="mt-1.5 truncate text-[10px] text-muted-foreground/50">
                          {product.category}
                        </p>
                      ) : null}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
            {!filteredProducts.length && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="col-span-full flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/50 bg-muted/20 p-12 text-center"
              >
                <Store className="mb-3 size-10 text-muted-foreground/20" />
                <p className="text-sm text-muted-foreground">
                  {productsQuery.isLoading ? t("menu.loadingProducts") : t("menu.noProducts")}
                </p>
              </motion.div>
            )}
          </div>
        </div>
      </section>

      {/* ─── Right Cart + Payment Panel ─────────────────────────────── */}
      <aside className="flex w-[320px] shrink-0 flex-col border-l border-border/20 bg-card/30 backdrop-blur-sm">
        {/* Cart items — scrollable */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <ClipboardList className="size-3.5 text-primary" />
              <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {t("order.detailOrder")}
              </h3>
            </div>
            <AnimatePresence>
              {cartCount > 0 && (
                <motion.span
                  key={cartCount}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary"
                >
                  {t("order.items", { count: cartCount })}
                </motion.span>
              )}
            </AnimatePresence>
          </div>

          <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-0.5">
            <AnimatePresence mode="popLayout" initial={false}>
              {cart.map((line, lineIdx) => {
                const lineProduct = line.productId
                  ? products.find((p) => p.id === line.productId)
                  : undefined;
                const { title: lineTitle, subtitle: lineVariantSubtitle } = cartLineDisplayTitles(
                  line,
                  lineProduct,
                );
                const modGroups = (lineProduct?.modifierGroups ?? [])
                  .filter((g) => g.options?.length)
                  .slice()
                  .sort((a, b) => a.sortOrder - b.sortOrder);
                const isSelected = selectedLineId === line.id;
                const isLeaving = leavingLineIds.has(line.id);
                return (
                  <motion.div
                    key={line.id}
                    layout
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20, scale: 0.95 }}
                    onClick={() => !isLeaving && setSelectedLineId(line.id)}
                    onAnimationEnd={isLeaving ? () => {
                      setCart((prev) => prev.filter((l) => l.id !== line.id));
                      setLeavingLineIds((prev) => {
                        const next = new Set(prev);
                        next.delete(line.id);
                        return next;
                      });
                    } : undefined}
                    className={cn(
                      "pos-cart-line",
                      isSelected && !isLeaving && "selected"
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p
                          className="line-clamp-1 text-[12px] font-medium leading-tight"
                          title={lineVariantSubtitle ? `${lineTitle} — ${lineVariantSubtitle}` : lineTitle}
                        >
                          {lineTitle}
                        </p>
                        {lineVariantSubtitle ? (
                          <p className="mt-0.5 line-clamp-1 text-[10px] font-semibold text-primary/90">
                            {lineVariantSubtitle}
                          </p>
                        ) : null}
                      </div>
                      <motion.button
                        whileHover={{ scale: 1.1, color: "var(--destructive)" }}
                        whileTap={{ scale: 0.9 }}
                        type="button"
                        className="shrink-0 rounded-md p-0.5 text-muted-foreground/50 transition-colors hover:bg-destructive/15"
                        onClick={(event) => {
                          event.stopPropagation();
                          updateLineQuantity(line.id, 0);
                        }}
                        aria-label="Remove item"
                      >
                        <X className="size-3" />
                      </motion.button>
                    </div>

                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      <span className="text-[13px] font-bold text-primary">
                        <PriceDisplay cents={line.unitPriceCents * line.quantity} />
                      </span>
                      <div className="flex items-center gap-1">
                        <motion.button
                          whileTap={{ scale: 0.8 }}
                          type="button"
                          className="pos-qty-btn"
                          onClick={(event) => {
                            event.stopPropagation();
                            updateLineQuantity(line.id, line.quantity - 1);
                          }}
                          aria-label="Decrease"
                        >
                          −
                        </motion.button>
                        <motion.span
                          key={line.quantity}
                          initial={{ scale: 1.2 }}
                          animate={{ scale: 1 }}
                          className="w-5 text-center text-[11px] font-semibold tabular-nums"
                        >
                          {line.quantity}
                        </motion.span>
                        <motion.button
                          whileTap={{ scale: 0.8 }}
                          type="button"
                          className="pos-qty-btn add"
                          onClick={(event) => {
                            event.stopPropagation();
                            updateLineQuantity(line.id, line.quantity + 1);
                          }}
                          aria-label="Increase"
                        >
                          +
                        </motion.button>
                      </div>
                    </div>

                    <AnimatePresence>
                      {isSelected && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          onClick={(e) => e.stopPropagation()}
                          className="overflow-hidden"
                        >
                          <Input
                            placeholder={t("order.specialInstructions")}
                            value={line.notes ?? ""}
                            onChange={(event) => {
                              setCart((prev) =>
                                prev.map((l, i) =>
                                  i === lineIdx ? { ...l, notes: event.target.value || undefined } : l,
                                ),
                              );
                            }}
                            onClick={(event) => event.stopPropagation()}
                            className="mt-2 h-7 rounded-lg bg-muted/50 text-[11px] ring-1 ring-border focus:ring-primary/50"
                            maxLength={500}
                          />
                          {lineProduct && modGroups.length > 0 ? (
                            <div className="mt-2 space-y-2 border-t border-border/30 pt-2">
                              {modGroups.map((group) => {
                                const options = group.options
                                  .slice()
                                  .sort((a, b) => a.sortOrder - b.sortOrder);
                                const selectedForGroup = new Set(
                                  (line.modifiers ?? [])
                                    .filter((m) => m.groupName === group.name)
                                    .map((m) => m.modifierOptionId)
                                    .filter(Boolean) as string[],
                                );
                                const isSingle = group.maxSelections <= 1;
                                return (
                                  <div key={group.id}>
                                    <p className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                                      {group.name}
                                      {group.required ? " *" : ""}
                                    </p>
                                    <div className="flex flex-wrap gap-1">
                                      {options.map((opt) => {
                                        const on = selectedForGroup.has(opt.id);
                                        return (
                                          <motion.button
                                            key={opt.id}
                                            whileHover={{ scale: 1.05 }}
                                            whileTap={{ scale: 0.95 }}
                                            type="button"
                                            className={cn(
                                              "rounded-full border px-2 py-0.5 text-[10px] font-medium transition-all",
                                              on ? "pos-toggle-active" : "pos-toggle-inactive",
                                            )}
                                            onClick={() => {
                                              if (!lineProduct) return;
                                              const next = isSingle
                                                ? applySingleSelectModifier(line, group, opt)
                                                : toggleMultiSelectModifier(line, group, opt);
                                              const unitPriceCents = lineUnitPriceCents(
                                                cartLineBasePriceCents(lineProduct, line),
                                                next,
                                              );
                                              setCart((prev) =>
                                                prev.map((l) =>
                                                  l.id === line.id
                                                    ? {
                                                        ...l,
                                                        modifiers: next.length ? next : undefined,
                                                        unitPriceCents,
                                                      }
                                                    : l,
                                                ),
                                              );
                                            }}
                                          >
                                            {opt.name}
                                            {opt.priceCents ? (
                                              <span className="ml-1 opacity-70">
                                                +<PriceDisplay cents={opt.priceCents} />
                                              </span>
                                            ) : null}
                                          </motion.button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : null}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </AnimatePresence>
            {!cart.length && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex h-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border/50 bg-muted/20 py-10 text-center"
              >
                <ClipboardList className="size-8 text-muted-foreground/20" />
                <p className="text-[12px] text-muted-foreground/50">{t("order.noItems")}</p>
              </motion.div>
            )}
          </div>
        </div>

        {/* Payment panel — fixed bottom */}
        <div className="shrink-0 border-t border-border/20 bg-background/60 p-4 backdrop-blur-sm">
          {/* Totals */}
          <div className="mb-3 space-y-1.5 text-[12px]">
            <div className="flex items-center justify-between text-muted-foreground">
              <span>{t("payment.subtotal")}</span>
              <PriceDisplay cents={cartTotalCents} />
            </div>
            <div className="flex items-center justify-between text-muted-foreground">
              <span>{t("payment.service")}</span>
              <PriceDisplay cents={0} />
            </div>
            <motion.div
              layout
              className="flex items-center justify-between rounded-xl bg-primary/10 px-3 py-2 font-bold"
            >
              <span className="text-[13px]">{t("payment.totalPayable")}</span>
              <motion.span
                key={cartTotalCents}
                initial={{ scale: 1.1, color: "var(--primary)" }}
                animate={{ scale: 1 }}
                className="text-base text-primary"
              >
                <PriceDisplay cents={cartTotalCents} />
              </motion.span>
            </motion.div>
          </div>

          {/* Sale type toggles */}
          <div className="mb-3">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
              {t("order.saleType")}
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                type="button"
                className={cn(
                  "flex w-full flex-col items-start text-left rounded-xl border px-3 py-2 transition-all",
                  posCheckoutMode === "quick" ? "pos-toggle-active" : "pos-toggle-inactive",
                )}
                onClick={() => setPosCheckoutMode("quick")}
              >
                <span className="text-[11px] font-semibold">{t("order.walkInSale")}</span>
                <span className="mt-0.5 block w-full text-left text-[9px] font-normal leading-snug opacity-60">
                  {t("order.walkInHint")}
                </span>
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                type="button"
                className={cn(
                  "flex w-full flex-col items-start text-left rounded-xl border px-3 py-2 transition-all",
                  posCheckoutMode === "kitchen" ? "pos-toggle-active" : "pos-toggle-inactive",
                )}
                onClick={() => setPosCheckoutMode("kitchen")}
              >
                <span className="text-[11px] font-semibold">{t("order.kitchenTicket")}</span>
                <span className="mt-0.5 block w-full text-left text-[9px] font-normal leading-snug opacity-60">
                  {t("order.kitchenHint")}
                </span>
              </motion.button>
            </div>
          </div>

          {/* Order note */}
          <div className="mb-3">
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                {t("order.note")}
              </p>
              <AnimatePresence>
                {orderNote && (
                  <motion.button
                    initial={{ opacity: 0, x: 5 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 5 }}
                    type="button"
                    onClick={() => setOrderNote("")}
                    className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                  >
                    {t("actions.clear")}
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
            <textarea
              value={orderNote}
              onChange={(e) => setOrderNote(e.target.value)}
              placeholder={t("order.notePlaceholder")}
              maxLength={500}
              rows={2}
              className={cn(
                "w-full resize-none rounded-xl border bg-input px-3.5 py-2.5 text-[12px] leading-relaxed text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/10",
                orderNote
                  ? "border-primary/40 focus:border-primary/50"
                  : "border-border focus:border-primary/40",
              )}
            />
          </div>

          {/* Payment method */}
          <div className="mb-3">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
              {t("payment.method")}
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {(["cash", "card", "split"] as const).map((method) => {
                const Icon = PAYMENT_ICONS[method];
                return (
                  <motion.button
                    key={method}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    type="button"
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-xl border py-2.5 transition-all",
                      paymentMethod === method ? "pos-toggle-active" : "pos-toggle-inactive",
                    )}
                    onClick={() => setPaymentMethod(method)}
                  >
                    <Icon className="size-4" />
                    <span className="text-[9px] font-semibold uppercase tracking-wide">
                      {t(PAYMENT_LABEL_KEYS[method])}
                    </span>
                  </motion.button>
                );
              })}
            </div>
          </div>

          {/* Cash change calculator */}
          <AnimatePresence>
            {showCashCalc && (
              <motion.div
                initial={{ opacity: 0, height: 0, y: 10 }}
                animate={{ opacity: 1, height: "auto", y: 0 }}
                exit={{ opacity: 0, height: 0, y: 10 }}
                className="mb-3 overflow-hidden rounded-xl border border-border bg-muted/20 p-3"
              >
                {/* Preset quick amounts */}
                <div className="mb-2.5 flex gap-1.5">
                  {presets.map((cents) => (
                    <motion.button
                      key={cents}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      type="button"
                      onClick={() => setTenderedInput(String(cents / 100))}
                      className={cn(
                        "flex-1 rounded-lg border py-1.5 text-[11px] font-semibold transition-all",
                        tenderedCents === cents && tenderedInput !== ""
                          ? "pos-toggle-active"
                          : "pos-toggle-inactive",
                      )}
                    >
                      {cents === cartTotalCents
                        ? t("payment.exact")
                        : formatPrice(cents, platformCurrency)}
                    </motion.button>
                  ))}
                </div>

                {/* Tendered input */}
                <div className="relative mb-2">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[11px] font-medium text-muted-foreground">
                    {t("payment.tendered")}
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={tenderedInput}
                    onChange={(e) => setTenderedInput(e.target.value)}
                    placeholder="0.00"
                    className={cn(
                      "pos-input !h-9 pr-3 text-right text-[14px] font-bold",
                      isTenderedInsufficient && "!border-destructive/60 focus:!border-destructive",
                    )}
                    style={{ paddingLeft: "80px" }}
                  />
                </div>

                {/* Change due */}
                <div className={cn(
                  "flex items-center justify-between rounded-lg px-3 py-2 transition-colors",
                  isTenderedInsufficient
                    ? "bg-destructive/10"
                    : isTenderedExact
                      ? "bg-muted/40"
                      : tenderedInput
                        ? "bg-emerald-500/10 dark:bg-emerald-500/15"
                        : "bg-muted/40",
                )}>
                  <div className="flex items-center gap-1.5">
                    <ArrowLeftRight className={cn(
                      "size-3",
                      isTenderedInsufficient
                        ? "text-destructive"
                        : changeCents > 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-muted-foreground",
                    )} />
                    <span className="text-[11px] font-medium text-muted-foreground">
                      {isTenderedInsufficient ? t("payment.insufficient") : t("payment.change")}
                    </span>
                  </div>
                  <motion.span
                    key={changeCents}
                    initial={{ scale: 1.1 }}
                    animate={{ scale: 1 }}
                    className={cn(
                      "text-[14px] font-bold tabular-nums",
                      isTenderedInsufficient
                        ? "text-destructive"
                        : isTenderedExact
                          ? "text-muted-foreground"
                          : changeCents > 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-muted-foreground",
                    )}
                  >
                    {isTenderedInsufficient
                      ? formatPrice(cartTotalCents - tenderedCents, platformCurrency)
                      : formatPrice(Math.max(0, changeCents), platformCurrency)}
                  </motion.span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Secondary actions */}
          <div className="mb-2 grid grid-cols-2 gap-1.5">
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-full rounded-xl border-border/40 bg-transparent text-[11px] hover:border-border/60"
                onClick={reprintLastReceipt}
                disabled={!lastReceipt}
              >
                <Printer className="mr-1.5 size-3" />
                {t("actions.print")}
              </Button>
            </motion.div>
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-full gap-1.5 rounded-xl border-border/40 bg-transparent text-[11px] hover:border-border/60"
                onClick={() => void downloadLastPdfReceipt()}
                disabled={!lastReceipt || pdfReceiptBusy}
              >
                {pdfReceiptBusy ? <Loader2 className="size-3 animate-spin" /> : <FileDown className="size-3" />}
                {t("actions.pdf")}
              </Button>
            </motion.div>
          </div>

          {/* Place order CTA */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            type="button"
            className={cn("pos-cta", cart.length > 0 && !checkoutMutation.isPending && "pos-anim-pulse-cta")}
            disabled={!cart.length || checkoutMutation.isPending || !activeShop}
            onClick={checkout}
          >
            {checkoutMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            {checkoutMutation.isPending
              ? t("order.placing")
              : posCheckoutMode === "quick"
                ? t("order.completeSale")
                : t("order.sendToKitchen")}
          </motion.button>

          {/* Printer settings collapsible */}
          <details className="group mt-3 rounded-xl border border-border/40 bg-muted/20">
            <summary className="flex cursor-pointer items-center justify-between px-3 py-2.5 text-[11px] font-medium text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Settings className="size-3.5" />
                <span>{t("printer.title")}</span>
              </div>
              <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" />
            </summary>
            <div className="space-y-2.5 border-t border-border/20 px-3 pb-3 pt-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">{t("printer.profile")}</span>
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Button size="xs" variant="outline" className="h-6 rounded-lg text-[10px]" onClick={addPrinterProfile}>
                    {t("actions.add")}
                  </Button>
                </motion.div>
              </div>
              <Select
                value={activePrinterProfile?.id || "__none__"}
                onValueChange={(value) => setActivePrinterProfileId(value === "__none__" ? "" : value)}
              >
                <SelectTrigger className="h-8 w-full rounded-lg border border-border bg-muted/40 px-2.5 text-[11px] transition-all hover:bg-muted/60">
                  <SelectValue placeholder={t("printer.selectProfile")} />
                </SelectTrigger>
                <SelectContent>
                  {printerProfiles.map((profile) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      {profile.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {activePrinterProfile && (
                <>
                  <Input
                    value={activePrinterProfile.name}
                    onChange={(event) => updateActivePrinterProfile({ name: event.target.value })}
                    placeholder={t("printer.terminalName")}
                    className="h-8 rounded-lg border border-border bg-muted/40 text-[11px] transition-all focus:bg-background"
                  />
                  <Select
                    value={activePrinterProfile.mode}
                    onValueChange={(value) =>
                      updateActivePrinterProfile({ mode: value as TerminalPrintMode })
                    }
                  >
                    <SelectTrigger className="h-8 w-full rounded-lg border border-border bg-muted/40 px-2.5 text-[11px] transition-all hover:bg-muted/60">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cashier_only">{t("printer.cashierOnly")}</SelectItem>
                      <SelectItem value="kitchen_only">{t("printer.kitchenOnly")}</SelectItem>
                      <SelectItem value="both">{t("printer.cashierAndKitchen")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={5}
                      value={activePrinterProfile.cashierCopies}
                      onChange={(event) =>
                        updateActivePrinterProfile({
                          cashierCopies: Math.min(5, Math.max(1, Number(event.target.value || 1))),
                        })
                      }
                      className="h-8 rounded-lg border border-border bg-muted/40 text-[11px] transition-all focus:bg-background"
                    />
                    <Input
                      type="number"
                      min={1}
                      max={5}
                      value={activePrinterProfile.kitchenCopies}
                      onChange={(event) =>
                        updateActivePrinterProfile({
                          kitchenCopies: Math.min(5, Math.max(1, Number(event.target.value || 1))),
                        })
                      }
                      className="h-8 rounded-lg border border-border bg-muted/40 text-[11px] transition-all focus:bg-background"
                    />
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 text-[11px] text-muted-foreground">
                    <input
                      type="checkbox"
                      className="rounded accent-primary"
                      checked={activePrinterProfile.autoPrint}
                      onChange={(event) => updateActivePrinterProfile({ autoPrint: event.target.checked })}
                    />
                    {t("printer.autoPrint")}
                  </label>
                </>
              )}
            </div>
          </details>

          {/* Printer Diagnostics collapsible */}
          <details className="group mt-2 rounded-xl border border-border/40 bg-muted/20">
            <summary className="flex cursor-pointer items-center justify-between px-3 py-2.5 text-[11px] font-medium text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <CircleHelp className="size-3.5" />
                <span>{t("printer.diagnosticsTitle")}</span>
              </div>
              <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" />
            </summary>
            <div className="border-t border-border/20 px-3 pb-3 pt-2.5">
              {!hasDesktopDiagnostics ? (
                <p className="text-[11px] text-muted-foreground/60">{t("printer.desktopOnly")}</p>
              ) : (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">
                      {t("printer.detectedPrinters", { count: desktopPrinters.length })}
                    </span>
                    <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                      <Button
                        size="xs"
                        variant="outline"
                        className="h-6 rounded-lg text-[10px]"
                        onClick={loadPrinterDiagnostics}
                        disabled={!hasDesktopDiagnostics || diagnosticsBusy}
                      >
                        {t("actions.refresh")}
                      </Button>
                    </motion.div>
                  </div>
                  <div className="max-h-20 space-y-1 overflow-y-auto rounded-lg bg-muted/30 p-2">
                    {desktopPrinters.map((printer) => (
                      <div key={printer.name} className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span className="truncate">{printer.name}</span>
                        {printer.isDefault ? (
                          <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[9px] text-primary">
                            {t("printer.defaultPrinterBadge")}
                          </span>
                        ) : null}
                      </div>
                    ))}
                    {!desktopPrinters.length && (
                      <p className="text-[11px] text-muted-foreground/50">{t("printer.noPrinters")}</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-muted-foreground">{t("printer.cashierTarget")}</label>
                    <Select
                      value={diagnosticsTargets.cashier || "__none__"}
                      onValueChange={(value) =>
                        setDiagnosticsTargets((prev) => ({ ...prev, cashier: value === "__none__" ? "" : value }))
                      }
                    >
                      <SelectTrigger className="h-8 w-full rounded-lg border border-border bg-muted/40 px-2.5 text-[11px] transition-all hover:bg-muted/60">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">{t("printer.systemDefault")}</SelectItem>
                        {desktopPrinters.map((printer) => (
                          <SelectItem key={`cashier-${printer.name}`} value={printer.name}>
                            {printer.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-muted-foreground">{t("printer.kitchenTarget")}</label>
                    <Select
                      value={diagnosticsTargets.kitchen || "__none__"}
                      onValueChange={(value) =>
                        setDiagnosticsTargets((prev) => ({ ...prev, kitchen: value === "__none__" ? "" : value }))
                      }
                    >
                      <SelectTrigger className="h-8 w-full rounded-lg border border-border bg-muted/40 px-2.5 text-[11px] transition-all hover:bg-muted/60">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">{t("printer.systemDefault")}</SelectItem>
                        {desktopPrinters.map((printer) => (
                          <SelectItem key={`kitchen-${printer.name}`} value={printer.name}>
                            {printer.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                      <Button variant="outline" className="h-7 w-full rounded-lg text-[10px]" onClick={savePrinterTargets} disabled={diagnosticsBusy}>
                        {t("actions.save")}
                      </Button>
                    </motion.div>
                    <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                      <Button
                        variant="outline"
                        className="h-7 w-full rounded-lg text-[10px]"
                        onClick={() => runTestPrint("cashier")}
                        disabled={diagnosticsBusy}
                      >
                        {t("printer.testCashier")}
                      </Button>
                    </motion.div>
                    <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                      <Button
                        variant="outline"
                        className="h-7 w-full rounded-lg text-[10px]"
                        onClick={() => runTestPrint("kitchen")}
                        disabled={diagnosticsBusy}
                      >
                        {t("printer.testKitchen")}
                      </Button>
                    </motion.div>
                  </div>
                </div>
              )}
            </div>
          </details>

          {/* Keyboard shortcuts hint */}
          <div className="mt-3 flex items-center gap-2 text-[10px] text-muted-foreground/40">
            <CircleHelp className="size-3 shrink-0" />
            <span>
              <span className="pos-key">1-9</span>
              {" / "}
              <span className="pos-key">0</span>
              {" "}
              {t("shortcuts.description")}
            </span>
            {selectedLine && (
              <span className="ml-auto truncate text-muted-foreground/30" title={selectedLine.name}>
                ↳ {selectedLine.name}
              </span>
            )}
          </div>
        </div>
      </aside>

      {/* ─── Settings Modal ──────────────────────────────────────────── */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-md rounded-2xl border border-border/30 bg-card/95 p-6 shadow-2xl backdrop-blur-xl"
            >
              <motion.button
                whileHover={{ scale: 1.1, rotate: 90 }}
                whileTap={{ scale: 0.9 }}
                type="button"
                onClick={() => setShowSettings(false)}
                className="absolute right-4 top-4 rounded-xl p-2 text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="size-4" />
              </motion.button>
              <div className="mb-5 flex items-center gap-3">
                <motion.div
                  initial={{ rotate: -20, scale: 0.8 }}
                  animate={{ rotate: 0, scale: 1 }}
                  transition={{ type: "spring", stiffness: 200, damping: 15 }}
                  className="relative flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary"
                >
                  <div className="absolute inset-0 rounded-xl bg-primary/10 blur-md" />
                  <Settings className="relative size-5" />
                </motion.div>
                <h2 className="text-lg font-bold">{t("settings.title")}</h2>
              </div>
              <div className="space-y-4">
                <div className="rounded-xl border border-border/40 bg-muted/20 p-4">
                  <h3 className="mb-1 text-sm font-semibold">{t("settings.workspaceLogo")}</h3>
                  <p className="mb-4 text-[11px] text-muted-foreground">{t("settings.logoDescription")}</p>
                  <div className="flex items-center gap-4">
                    <motion.div
                      whileHover={{ scale: 1.05 }}
                      className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/40"
                    >
                      {workspace?.logoUrl ? (
                        <WorkspaceLogoImage src={workspace.logoUrl} alt="" />
                      ) : (
                        <ImageIcon className="size-7 text-muted-foreground/30" />
                      )}
                    </motion.div>
                    <div>
                      <input
                        ref={logoInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={handleLogoUpload}
                      />
                      <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-xl"
                          onClick={() => logoInputRef.current?.click()}
                          disabled={uploadingLogo}
                        >
                          {uploadingLogo ? (
                            <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                          ) : (
                            <Upload className="mr-1.5 size-3.5" />
                          )}
                          {uploadingLogo ? t("settings.uploading") : t("settings.uploadLogo")}
                        </Button>
                      </motion.div>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-border/40 bg-muted/20 p-4">
                  <h3 className="mb-3 text-sm font-semibold">{t("settings.workspaceInfo")}</h3>
                  <div className="space-y-2 text-[12px]">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">{t("settings.name")}</span>
                      <span className="font-medium">{workspace?.name || "—"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">{t("settings.email")}</span>
                      <span className="font-medium">{user?.email || "—"}</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.main>
  );
}
