/**
 * Shared Vitest mock for `@dilivygo/ui`.
 *
 * Test files wire this up with:
 *
 *     vi.mock("@dilivygo/ui", async () => (await import("@/test/ui-mock")).default);
 *
 * The goal is a minimal, DOM-friendly stub that covers every symbol the
 * customer app imports from `@dilivygo/ui`. When `packages/ui` grows a new
 * export used by the customer app, add it here once instead of patching
 * every test file.
 */
import * as React from "react";
import { vi } from "vitest";
import { Controller } from "react-hook-form";

type PropsWithChildren<P = Record<string, unknown>> = P & {
  children?: React.ReactNode;
};

type ClassProp = { className?: string };

// ─── Primitives ──────────────────────────────────────────────────────────────
export const Button = ({
  children,
  disabled,
  onClick,
  variant,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }) => (
  <button disabled={disabled} onClick={onClick} data-variant={variant} {...props}>
    {children}
  </button>
);
export const buttonVariants = () => "";

// JSDOM + React has a long-standing interaction bug where `fireEvent.change`
// on `<input type="time">` (and to a lesser extent `type="date"`) never
// dispatches React's onChange: the internal value tracker returns a
// normalised value that React considers "unchanged", so controlled state
// stays stale. For test rendering we coerce these types to plain text so
// the same UI event plumbing actually reaches component state.
const coerceNativeDateTimeTypes = (
  type: React.HTMLInputTypeAttribute | undefined
): React.HTMLInputTypeAttribute | undefined => {
  if (type === "time" || type === "date" || type === "datetime-local") {
    return "text";
  }
  return type;
};

export const Input = ({
  className,
  id,
  type,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input className={className} id={id} type={coerceNativeDateTimeTypes(type)} {...props} />
);

export const Textarea = (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea {...props} />
);

export const Separator = (props: React.HTMLAttributes<HTMLHRElement>) => <hr {...props} />;
export const Badge = ({ children }: PropsWithChildren) => <span>{children}</span>;
export const Skeleton = ({ className }: ClassProp) => <div className={className} />;
export const badgeVariants = () => "";

export const Card = ({ children, className }: PropsWithChildren<ClassProp>) => (
  <div className={className}>{children}</div>
);
export const CardHeader = Card;
export const CardTitle = ({ children, className }: PropsWithChildren<ClassProp>) => (
  <h3 className={className}>{children}</h3>
);
export const CardDescription = ({ children, className }: PropsWithChildren<ClassProp>) => (
  <p className={className}>{children}</p>
);
export const CardContent = Card;
export const CardFooter = Card;

// Select (shadcn-style) — render children so tests can find labels.
export const Select = ({ children }: PropsWithChildren) => <div>{children}</div>;
export const SelectGroup = Select;
export const SelectValue = ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>;
export const SelectTrigger = ({ children }: PropsWithChildren) => <button type="button">{children}</button>;
export const SelectContent = Select;
export const SelectLabel = ({ children }: PropsWithChildren) => <div>{children}</div>;
export const SelectItem = ({ children, value }: PropsWithChildren<{ value?: string }>) => (
  <option value={value}>{children}</option>
);
export const SelectSeparator = () => <hr />;

export const Dialog = ({ children, open }: PropsWithChildren<{ open?: boolean }>) =>
  open === false ? null : <div role="dialog">{children}</div>;
export const DialogPortal = Dialog;
export const DialogOverlay = () => null;
export const DialogClose = ({ children }: PropsWithChildren) => <button type="button">{children}</button>;
export const DialogTrigger = ({ children }: PropsWithChildren) => <button type="button">{children}</button>;
export const DialogContent = ({ children }: PropsWithChildren) => <div>{children}</div>;
export const DialogHeader = ({ children }: PropsWithChildren) => <div>{children}</div>;
export const DialogFooter = ({ children }: PropsWithChildren) => <div>{children}</div>;
export const DialogTitle = ({ children }: PropsWithChildren) => <h2>{children}</h2>;
export const DialogDescription = ({ children }: PropsWithChildren) => <p>{children}</p>;
export const ConfirmDialog = ({ children }: PropsWithChildren) => <div>{children}</div>;
export const useConfirm = () => vi.fn().mockResolvedValue(true);

export const Tooltip = ({ children }: PropsWithChildren) => <>{children}</>;
export const TooltipTrigger = ({ children }: PropsWithChildren) => <>{children}</>;
export const TooltipContent = ({ children }: PropsWithChildren) => <div>{children}</div>;
export const TooltipProvider = ({ children }: PropsWithChildren) => <>{children}</>;

export const Switch = ({
  checked,
  onCheckedChange,
}: {
  checked?: boolean;
  onCheckedChange?: (v: boolean) => void;
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={!!checked}
    data-testid="switch"
    onClick={() => onCheckedChange?.(!checked)}
  >
    {checked ? "on" : "off"}
  </button>
);

export const Avatar = ({ children }: PropsWithChildren) => <div>{children}</div>;
export const AvatarImage = (props: React.ImgHTMLAttributes<HTMLImageElement>) => <img {...props} />;
export const AvatarFallback = ({ children }: PropsWithChildren) => <span>{children}</span>;

const FormFieldContext = React.createContext<{ errorMessage?: string } | null>(null);

export const Form = ({ children }: PropsWithChildren) => <>{children}</>;
export const FormControl = ({ children }: PropsWithChildren) => <>{children}</>;
export const FormItem = ({
  children,
  className,
  id,
}: PropsWithChildren<{ className?: string; id?: string }>) => (
  <div className={className} id={id}>
    {children}
  </div>
);
export const FormLabel = ({
  children,
  className,
  htmlFor,
}: PropsWithChildren<ClassProp & { htmlFor?: string }>) => (
  <label className={className} htmlFor={htmlFor}>
    {children}
  </label>
);
export const FormMessage = ({ children }: PropsWithChildren) => {
  const ctx = React.useContext(FormFieldContext);
  const message = typeof children === "string" ? children : ctx?.errorMessage;
  return message ? <p role="alert">{message}</p> : null;
};
export const FormField = ({
  control,
  name,
  render,
}: {
  control: unknown;
  name: string;
  render: (args: { field: Record<string, unknown>; fieldState: Record<string, unknown> }) => React.ReactNode;
}) => (
  <Controller
    control={control as never}
    name={name as never}
    render={({ field, fieldState }) => (
      <FormFieldContext.Provider value={{ errorMessage: (fieldState.error as { message?: string } | undefined)?.message }}>
        {render({ field: field as never, fieldState: fieldState as never })}
      </FormFieldContext.Provider>
    )}
  />
);

// ─── Custom shared components ────────────────────────────────────────────────
export const PriceDisplay = ({
  cents,
  currency,
  className,
}: {
  cents: number;
  currency?: string;
  className?: string;
}) => (
  <span className={className} data-testid="price-display">
    {currency || "GBP"} {(cents / 100).toFixed(2)}
  </span>
);

export const ChatMessageBubble = ({ children }: PropsWithChildren) => <div>{children}</div>;
export const ChatMessagesArea = ({ children }: PropsWithChildren) => <div>{children}</div>;
export const ChatDayDivider = ({ children }: PropsWithChildren) => <div>{children}</div>;
export const ChatComposer = () => <div />;
export const FloatingChatDock = () => null;

export const ImageUpload = () => <div data-testid="image-upload" />;
export const OrderStatusBadge = ({ status }: { status?: string }) => <span>{status}</span>;
export const EmptyState = ({ children }: PropsWithChildren) => <div>{children}</div>;
export const LoadingScreen = () => <div data-testid="loading-screen" />;
export const StaffAuthSplitLayout = ({ children }: PropsWithChildren) => <div>{children}</div>;
export const MorphLoader = () => <div data-testid="morph-loader" />;
export const DotLoader = () => <div data-testid="dot-loader" />;
export const DotFlow = () => <div data-testid="dot-flow" />;
export const DashboardAuthLoading = MorphLoader;
export const DILIVYGO_LOGISTICS_LOADER_COLOR = "#000";
export const SmoothContextNav = ({ children }: PropsWithChildren) => <nav>{children}</nav>;

export const CurrencyPicker = () => <div />;
export const CurrencyFlag = () => <span />;
export const CURRENCIES: { code: string; symbol: string }[] = [];
export const PriceWithConversion = PriceDisplay;

export const PlatformBrandingMark = ({ className }: ClassProp) => (
  <div className={className}>Logo</div>
);
export const PlatformWordmark = ({ children }: PropsWithChildren) => <div>{children}</div>;
export const WorkspaceLogoImage = ({ className }: ClassProp) => <img className={className} />;
export const workspaceLogoImageClassName = () => "";

export const HalftonePatternDef = () => null;
export const HalftoneBarLtrFadeMaskDef = () => null;
export const halftoneBarLtrFadeMaskUrl = "";
export const halftoneBarLtrFadeMaskId = "";

export const DilivygoDonutChart = () => <div data-testid="donut" />;
export const DILIVYGO_DONUT_LEGEND_SWATCH_CLASSNAME = "";
export const DILIVYGO_CHART_PEACH = "#f00";
export const DILIVYGO_CHART_SKY = "#00f";
export const DILIVYGO_CHART_LIME = "#0f0";
export const DILIVYGO_CHART_VIOLET = "#80f";
export const DILIVYGO_CHART_CYAN = "#0ff";
export const DILIVYGO_CHART_AMBER = "#fc0";
export const DILIVYGO_CHART_ROSE = "#f06";
export const DILIVYGO_CHART_PALETTE: string[] = [];
export const dilivygoChartColorAt = () => "#000";
export const buildDilivygoDonutSvgMarkup = () => "";
export const DILIVYGO_DONUT_FONT_STACK = "sans-serif";
export const dilivygoContrastingLabelColor = () => "#000";
export const dilivygoDonutSegmentLabelFontSize = () => 12;
export const layoutDilivygoDonutSegments = () => [];

// ─── Theme / platform providers ──────────────────────────────────────────────
export const ThemeToggle = () => <button type="button" data-testid="theme-toggle" aria-label="Toggle theme" />;

export const DynamicThemeProvider = ({ children }: PropsWithChildren) => <>{children}</>;

export const usePlatformBranding = () => ({
  appName: "Dilivygo",
  helpUrl: "https://help.dilivygo.com",
  supportEmail: "support@dilivygo.com",
});

export const useMapSettings = () => ({ tilePreset: "osm", attribution: "OSM" });

export const useDeliveryFeeConfig = () => ({
  baseFee: 250,
  freeDeliveryThreshold: 2500,
  currency: "GBP",
});

export const useLanguageConfigFromTheme = () => ({ defaultLanguage: "en", locked: false });
export const useDietaryTagPresetsFromTheme = () => [];
export const useBrowseCategoryPresetsFromTheme = () => [];
export const useCustomerProfilePhotoEnabled = () => true;
export const useMultiShopCartEnabled = () => false;
export const useCustomerWalletEnabled = () => false;
export const useCustomerCutleryEnabled = () => true;
export const useCustomerRefundRequestsEnabled = () => true;
export const useDefaultProfilePhotoUrls = () => [] as string[];
export const useDemoMode = () => false;
export const VENDOR_LOGISTICS_THEME_SCOPES: string[] = [];
export const SUPERADMIN_LOGISTICS_THEME_SCOPES: string[] = [];
export const POS_LOGISTICS_THEME_SCOPES: string[] = [];

// ─── Re-exports / utilities ──────────────────────────────────────────────────
export const hashStringToUint32 = (s: string) => s.length;
export const hasCustomProfilePhoto = () => false;
export const pickDefaultProfilePhotoUrl = () => null;
export const resolveProfileAvatarUrl = () => null;

export const CurrencyContext = React.createContext<string>("GBP");
export const useCurrency = () => "GBP";

export const useExchangeRates = () => ({ data: {}, isLoading: false });
export const convertCents = (cents: number) => cents;

export const cn = (...args: (string | undefined | null | false | boolean)[]) =>
  args.filter(Boolean).join(" ");

export const formatPrice = (cents: number, currency?: string) =>
  `${currency || "GBP"} ${(cents / 100).toFixed(2)}`;

export const validateImageFile = () => ({ ok: true as const, file: null });
export const ACCEPTED_IMAGE_MIME_TYPES = ["image/png"];
export const ACCEPTED_IMAGE_INPUT_ATTR = "image/*";
export const DEFAULT_IMAGE_MAX_BYTES = 1_000_000;

export const dashboardSidebarAsideClass = "";
export const dashboardSidebarShellClass = "";
export const dashboardSidebarFooterDividerClass = "";
export const dashboardSidebarGroupLabelClass = "";
export const dashboardSidebarGroupSeparatorClass = "";
export const dashboardSidebarLogoFrameClass = "";
export const dashboardSidebarMobileActiveIconGlowClass = "";
export const dashboardSidebarNavIconClass = "";
export const dashboardSidebarNavLinkActiveClass = "";
export const dashboardSidebarNavLinkInactiveClass = "";
export const dashboardSidebarNavLinkLayoutClass = "";
export const dashboardSidebarToggleButtonClass = "";
export const dashboardSidebarTopRowClass = "";
export const dashboardSidebarWidthCollapsed = "w-16";
export const dashboardSidebarWidthExpanded = "w-64";

export const sortChatMessagesAscending = <T,>(xs: T[]) => xs;
export const formatChatTime = () => "00:00";
export const formatChatDayLabel = () => "Today";

export const computeDeliveryFee = (
  config: { baseFee: number; freeDeliveryThreshold: number },
  subtotal: number
) => (subtotal >= config.freeDeliveryThreshold ? 0 : config.baseFee);

export const TILE_PRESETS: Record<string, unknown> = {};
export const DEFAULT_MAP_SETTINGS = { tilePreset: "osm" };
export const resolveTileUrl = () => "";
export const resolveAttribution = () => "";
export const latitudeDeltaFromMapDefaultZoom = () => 0.1;

// Default export is the full namespace so callers can do:
//     vi.mock("@dilivygo/ui", async () => (await import("@/test/ui-mock")).default);
const mod = {
  Button,
  buttonVariants,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Textarea,
  Separator,
  Badge,
  Skeleton,
  badgeVariants,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  ConfirmDialog,
  useConfirm,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
  Switch,
  Avatar,
  AvatarImage,
  AvatarFallback,
  PriceDisplay,
  ChatMessageBubble,
  ChatMessagesArea,
  ChatDayDivider,
  ChatComposer,
  FloatingChatDock,
  ImageUpload,
  OrderStatusBadge,
  EmptyState,
  LoadingScreen,
  StaffAuthSplitLayout,
  MorphLoader,
  DashboardAuthLoading,
  DILIVYGO_LOGISTICS_LOADER_COLOR,
  SmoothContextNav,
  CurrencyPicker,
  CurrencyFlag,
  CURRENCIES,
  PriceWithConversion,
  PlatformBrandingMark,
  PlatformWordmark,
  WorkspaceLogoImage,
  workspaceLogoImageClassName,
  HalftonePatternDef,
  HalftoneBarLtrFadeMaskDef,
  halftoneBarLtrFadeMaskUrl,
  halftoneBarLtrFadeMaskId,
  DilivygoDonutChart,
  DILIVYGO_DONUT_LEGEND_SWATCH_CLASSNAME,
  DILIVYGO_CHART_PEACH,
  DILIVYGO_CHART_SKY,
  DILIVYGO_CHART_LIME,
  DILIVYGO_CHART_VIOLET,
  DILIVYGO_CHART_CYAN,
  DILIVYGO_CHART_AMBER,
  DILIVYGO_CHART_ROSE,
  DILIVYGO_CHART_PALETTE,
  dilivygoChartColorAt,
  buildDilivygoDonutSvgMarkup,
  DILIVYGO_DONUT_FONT_STACK,
  dilivygoContrastingLabelColor,
  dilivygoDonutSegmentLabelFontSize,
  layoutDilivygoDonutSegments,
  ThemeToggle,
  DynamicThemeProvider,
  usePlatformBranding,
  useMapSettings,
  useDeliveryFeeConfig,
  useLanguageConfigFromTheme,
  useDietaryTagPresetsFromTheme,
  useBrowseCategoryPresetsFromTheme,
  useCustomerProfilePhotoEnabled,
  useMultiShopCartEnabled,
  useCustomerWalletEnabled,
  useCustomerCutleryEnabled,
  useCustomerRefundRequestsEnabled,
  useDefaultProfilePhotoUrls,
  useDemoMode,
  VENDOR_LOGISTICS_THEME_SCOPES,
  SUPERADMIN_LOGISTICS_THEME_SCOPES,
  POS_LOGISTICS_THEME_SCOPES,
  hashStringToUint32,
  hasCustomProfilePhoto,
  pickDefaultProfilePhotoUrl,
  resolveProfileAvatarUrl,
  CurrencyContext,
  useCurrency,
  useExchangeRates,
  convertCents,
  cn,
  formatPrice,
  validateImageFile,
  ACCEPTED_IMAGE_MIME_TYPES,
  ACCEPTED_IMAGE_INPUT_ATTR,
  DEFAULT_IMAGE_MAX_BYTES,
  dashboardSidebarAsideClass,
  dashboardSidebarShellClass,
  dashboardSidebarFooterDividerClass,
  dashboardSidebarGroupLabelClass,
  dashboardSidebarGroupSeparatorClass,
  dashboardSidebarLogoFrameClass,
  dashboardSidebarMobileActiveIconGlowClass,
  dashboardSidebarNavIconClass,
  dashboardSidebarNavLinkActiveClass,
  dashboardSidebarNavLinkInactiveClass,
  dashboardSidebarNavLinkLayoutClass,
  dashboardSidebarToggleButtonClass,
  dashboardSidebarTopRowClass,
  dashboardSidebarWidthCollapsed,
  dashboardSidebarWidthExpanded,
  sortChatMessagesAscending,
  formatChatTime,
  formatChatDayLabel,
  computeDeliveryFee,
  TILE_PRESETS,
  DEFAULT_MAP_SETTINGS,
  resolveTileUrl,
  resolveAttribution,
  latitudeDeltaFromMapDefaultZoom,
};
export default mod;
