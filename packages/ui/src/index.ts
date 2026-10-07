// Primitives
export { Button, buttonVariants } from "./components/button";
export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "./components/card";
export { Input } from "./components/input";
export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
} from "./components/select";
export { Textarea } from "./components/textarea";
export { Label } from "./components/label";
export {
  Form,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  FormField,
  useFormField,
} from "./components/form";
export { Badge, badgeVariants } from "./components/badge";
export { Skeleton } from "./components/skeleton";
export { Separator } from "./components/separator";
export {
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
} from "./components/dialog";
export { ConfirmDialog, useConfirm } from "./components/confirm-dialog";
export type {
  ConfirmDialogProps,
  ConfirmDialogVariant,
} from "./components/confirm-dialog";
export {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "./components/tooltip";
export { Switch } from "./components/switch";
export { Avatar, AvatarImage, AvatarFallback } from "./components/avatar";
export { supportInboxThreadRows } from "./components/support-inbox-thread-rows";
export {
  ChatMessageBubble,
  type ChatMessageBubbleProps,
} from "./components/chat-message-bubble";
export { ChatMessagesArea, type ChatMessagesAreaProps } from "./components/chat-messages-area";
export { ChatDayDivider } from "./components/chat-day-divider";
export { ChatComposer, type ChatComposerProps } from "./components/chat-composer";
export {
  ChatPeerTypingBar,
  type ChatPeerTypingBarProps,
} from "./components/chat-peer-typing-bar";
export {
  OrderChatShell,
  type OrderChatShellProps,
} from "./components/order-chat-shell";
export {
  OrderChatMessageList,
  type OrderChatMessageListProps,
} from "./components/order-chat-message-list";
export {
  FloatingChatDock,
  type FloatingDockChatItem,
  type FloatingChatDockProps,
} from "./components/floating-chat-dock";
export {
  AnimatedTbody,
  AnimatedList,
  AnimatedUl,
  useAutoAnimate,
} from "./components/animated-containers";
export { VirtualWindowList, type VirtualWindowListProps } from "./components/virtual-window-list";
export {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
  useSidebar,
} from "./components/sidebar";

// Custom shared components
export { ImageUpload } from "./components/image-upload";
export { OrderStatusBadge } from "./components/order-status-badge";
export { EmptyState } from "./components/empty-state";
export { LoadingScreen } from "./components/loading-screen";
export {
  StaffAuthSplitLayout,
  type StaffAuthDecorativeVariant,
  type StaffAuthSplitLayoutProps,
} from "./components/staff-auth-split-layout";
export {
  MorphLoader,
  DashboardAuthLoading,
  DILIVYGO_LOGISTICS_LOADER_COLOR,
  type MorphLoaderProps,
  type DashboardAuthLoadingProps,
} from "./components/morph-loader";
export { DotLoader } from "./components/dot-loader";
export { DotFlow, type DotFlowProps } from "./components/dot-flow";
export {
  SmoothContextNav,
  type SmoothContextNavItem,
  type SmoothContextNavLinkProps,
  type SmoothContextNavProps,
} from "./components/smooth-context-nav";
export { PriceDisplay } from "./components/price-display";
export {
  CurrencyPicker,
  CurrencyFlag,
  CURRENCIES,
  type CurrencyOption,
} from "./components/currency-picker";
export { PriceWithConversion } from "./components/price-with-conversion";
export { PlatformBrandingMark } from "./components/platform-branding-mark";
export { PlatformWordmark } from "./components/platform-wordmark";
export type { PlatformLogoContrast } from "./lib/platform-logo-contrast";
export {
  WorkspaceLogoImage,
  workspaceLogoImageClassName,
} from "./components/workspace-logo-image";
export {
  HalftonePatternDef,
  HalftoneBarLtrFadeMaskDef,
  halftoneBarLtrFadeMaskUrl,
  halftoneBarLtrFadeMaskId,
} from "./components/chart-halftone-pattern";
export {
  DilivygoDonutChart,
  DILIVYGO_DONUT_LEGEND_SWATCH_CLASSNAME,
  type DilivygoDonutChartProps,
  type DilivygoDonutSegment,
} from "./components/dilivygo-donut-chart";
export {
  DILIVYGO_CHART_PEACH,
  DILIVYGO_CHART_SKY,
  DILIVYGO_CHART_LIME,
  DILIVYGO_CHART_VIOLET,
  DILIVYGO_CHART_CYAN,
  DILIVYGO_CHART_AMBER,
  DILIVYGO_CHART_ROSE,
  DILIVYGO_CHART_PALETTE,
  dilivygoChartColorAt,
} from "./lib/dilivygo-chart-palette";
export {
  buildDilivygoDonutSvgMarkup,
  DILIVYGO_DONUT_FONT_STACK,
  dilivygoContrastingLabelColor,
  dilivygoDonutSegmentLabelFontSize,
  layoutDilivygoDonutSegments,
  type DilivygoDonutGeomSegment,
  type DilivygoDonutSvgMarkupOpts,
} from "./lib/dilivygo-donut-geometry";

// Providers
export {
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
  type PlatformBranding,
  type ThemeColorScopes,
} from "./providers/dynamic-theme-provider";
export {
  hashStringToUint32,
  hasCustomProfilePhoto,
  pickDefaultProfilePhotoUrl,
  resolveProfileAvatarUrl,
} from "@dilivygo/types";
export { CurrencyContext, useCurrency } from "./providers/currency-context";
export { ThemeToggle } from "./components/theme-toggle";
export {
  buildThemeCssBlock,
  collectThemeCssDeclarations,
  themeColorsToCssVarMapForWebInjection,
} from "./lib/expand-theme-css-vars";

// Hooks
export { useExchangeRates, convertCents } from "./hooks/use-exchange-rates";

// Utilities
export { cn, formatPrice } from "./lib/utils";
export {
  validateImageFile,
  ACCEPTED_IMAGE_MIME_TYPES,
  ACCEPTED_IMAGE_INPUT_ATTR,
  DEFAULT_IMAGE_MAX_BYTES,
  type ValidateImageFileOptions,
  type ValidateImageFileResult,
} from "./lib/validate-image";
export {
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
} from "./lib/dashboard-sidebar-styles";
export {
  sortChatMessagesAscending,
  formatChatTime,
  formatChatDayLabel,
} from "./lib/chat-utils";
export { computeDeliveryFee } from "./lib/delivery-fee";
export {
  TILE_PRESETS,
  DEFAULT_MAP_SETTINGS,
  resolveTileUrl,
  resolveAttribution,
  latitudeDeltaFromMapDefaultZoom,
} from "./lib/map-settings";
