// ─── Auth ──────────────────────────────────────────────────────────────────────

export type AdminRole = "admin" | "vendor" | "rider";

export interface User {
  id: string;
  email: string;
  role: AdminRole;
  /** Null for platform riders (any-workspace delivery pool). */
  projectRef: string | null;
  /** Optional display name (stored as `display_name` in `app_users`). */
  name?: string | null;
  /** Optional given name (`first_name`). */
  firstName?: string | null;
  /** Optional family name (`last_name`). */
  lastName?: string | null;
  totpEnabled: boolean;
  commissionOverrideBps?: number | null;
  createdAt: string;
}

export interface Customer {
  id: string;
  /** Null for email-only org customers (no phone on file). */
  phone: string | null;
  name?: string;
  email?: string;
  /** Retained only for legacy staff-side customers; new accounts are org-scoped. */
  projectRef?: string | null;
  /**
   * Organization that owns this customer identity. One customer per (organization, phone)
   * and per (organization, email) — each organization is its own marketplace.
   */
  organizationId?: string | null;
  /** Public URL of profile photo (customer-uploaded when enabled). */
  avatarUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerAddress {
  id: string;
  customerId: string;
  label: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  postcode: string;
  lat?: number;
  lon?: number;
  isDefault: boolean;
  createdAt: string;
}

// ─── Geo ──────────────────────────────────────────────────────────────────────

export interface GeoPolygon {
  type: "Polygon";
  coordinates: number[][][];
}

export interface OperatingHoursRange {
  start: string;
  end: string;
}

export interface OperatingHours {
  sun?: OperatingHoursRange[];
  mon?: OperatingHoursRange[];
  tue?: OperatingHoursRange[];
  wed?: OperatingHoursRange[];
  thu?: OperatingHoursRange[];
  fri?: OperatingHoursRange[];
  sat?: OperatingHoursRange[];
}

// ─── Shops ────────────────────────────────────────────────────────────────────

export interface Shop {
  id: string;
  projectRef: string;
  name: string;
  slug: string;
  description?: string;
  logoUrl?: string;
  bannerUrl?: string;
  address?: string;
  phone?: string;
  lat?: number;
  lon?: number;
  deliveryGeofence?: GeoPolygon | null;
  operatingHours?: OperatingHours | null;
  timezone?: string;
  isOpen?: boolean;
  currency?: string;
  averageRating?: number;
  reviewCount?: number;
  minimumOrderCents?: number;
  /** Public shop detail only: vendor offers cutlery at checkout (requires platform customer cutlery enabled). */
  cutleryOffered?: boolean;
  /** Fee in cents when cutlery is offered and charged; 0 when free. */
  cutleryFeeCents?: number;
  /** Per-shop delivery radius (km) for circle fallback; set on public shop list for client geofence parity. */
  deliveryRadiusKm?: number;
  /** Assigned in superadmin; drives customer home cuisine filters. */
  browseCategoryIds?: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RiderGeofence {
  id: string;
  userId: string;
  projectRef: string;
  geofence: GeoPolygon;
  createdAt: string;
  updatedAt: string;
}

export interface UserShop {
  id: string;
  userId: string;
  shopId: string;
  createdAt: string;
}

// ─── Orders ────────────────────────────────────────────────────────────────────

export type OrderStatus =
  | "placed"
  | "accepted"
  | "rejected"
  | "preparing"
  | "ready"
  | "assigned"
  | "picked_up"
  | "arrived"
  | "completed"
  | "cancelled"
  | "scheduled";

/** DB uses unpaid/paid/refunded/partially_refunded; some clients also use Stripe-like pending/succeeded/failed. */
export type PaymentStatus =
  | "pending"
  | "succeeded"
  | "failed"
  | "refunded"
  | "unpaid"
  | "paid"
  | "partially_refunded";

export interface OrderDelivery {
  id: string;
  riderId?: string | null;
  status: DeliveryStatus;
  isExternal?: boolean;
  externalRiderName?: string;
  externalRiderPhone?: string;
}

export interface Order {
  id: string;
  projectRef: string;
  shopId?: string;
  customerId: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentIntentId?: string;
  totalCents: number;
  deliveryFeeCents?: number;
  currency?: string;
  refundAmountCents?: number;
  refundReason?: string;
  cancellationReason?: string;
  cancelledBy?: string;
  scheduledFor?: string;
  prepTimeMinutes?: number;
  slaDeadline?: string;
  slaBreached?: boolean;
  deliveryMode?: DeliveryMode;
  /** Set for POS-created orders: quick = walk-in sale; kitchen = in-store prep (no riders). */
  posCheckoutMode?: PosCheckoutMode | null;
  rejectionReason?: string;
  discountCents?: number;
  promoCodeId?: string;
  deliveryAddress?: string;
  deliveryNotes?: string;
  cutleryRequested?: boolean;
  cutleryFeeCents?: number;
  platformCommissionCents?: number;
  vendorPayoutCents?: number;
  vendorStripeTransferId?: string | null;
  createdAt: string;
  updatedAt: string;
  items?: OrderItem[];
  delivery?: OrderDelivery;
  vendorId?: string;
  shop?: Shop;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  productVariantId?: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  notes?: string;
  modifiers?: OrderItemModifier[];
}

export type POSPaymentMethod = "cash" | "card" | "split";

/** POS: immediate walk-in sale vs ticket for in-store kitchen prep (no rider delivery). */
export type PosCheckoutMode = "quick" | "kitchen";

export interface POSCheckoutPayload {
  shopId: string;
  items: Array<{
    productId?: string;
    productVariantId?: string;
    name: string;
    quantity: number;
    unitPriceCents: number;
    notes?: string;
    modifiers?: SelectedModifier[];
  }>;
  totalCents?: number;
  paymentMethod?: POSPaymentMethod;
  note?: string;
  checkoutMode?: PosCheckoutMode;
}

// ─── Promo Codes ─────────────────────────────────────────────────────────────

export type PromoCodeType = "percentage" | "fixed_amount" | "free_delivery";

export interface PromoCode {
  id: string;
  projectRef: string | null;
  shopId: string | null;
  code: string;
  type: PromoCodeType;
  value: number;
  minOrderCents: number;
  maxDiscountCents: number | null;
  maxUses: number | null;
  maxUsesPerCustomer: number;
  timesUsed: number;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PromoValidationResult {
  valid: boolean;
  discountCents: number;
  promoCodeId: string | null;
  freeDelivery: boolean;
  message?: string;
}

// ─── Cart ──────────────────────────────────────────────────────────────────────

export interface CartSession {
  id: string;
  projectRef: string;
  shopId?: string;
  customerId?: string;
  createdAt: string;
}

export interface CartItem {
  id: string;
  sessionId: string;
  productId: string;
  /** Required when the product has menu variants. */
  productVariantId?: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  notes?: string;
  selectedModifiers?: SelectedModifier[];
  createdAt: string;
  /** Set when adding from a shop menu; required for multi-shop carts. */
  shopId?: string;
  projectRef?: string;
  shopName?: string;
}

/** Normalized cart payload from `GET/PUT /api/cart` (may omit session metadata until first sync). */
export interface CustomerCartSnapshot {
  id?: string;
  projectRef?: string;
  shopId?: string;
  customerId?: string;
  currency?: string;
  createdAt?: string;
  items: CartItem[];
  totalCents: number;
}

export interface CartSyncBody {
  items: CartItem[];
  shopId?: string | null;
  currency?: string | null;
}

// ─── Delivery ──────────────────────────────────────────────────────────────────

export type DeliveryStatus = "pending" | "assigned" | "picked_up" | "arrived" | "delivered";

/** Order context returned with available (unclaimed) deliveries for rider list cards. */
export interface RiderAvailableOrderSummary {
  shopName?: string | null;
  shopAddress?: string | null;
  deliveryAddress?: string | null;
  deliveryNotes?: string | null;
  totalCents: number;
  deliveryFeeCents?: number | null;
  itemCount: number;
  orderStatus: string;
  scheduledFor?: string | null;
  prepTimeMinutes?: number | null;
}

export interface Delivery {
  id: string;
  orderId: string;
  riderId?: string;
  status: DeliveryStatus;
  zoneId?: string;
  etaMinutes?: number;
  riderDeliveryFeeCents?: number;
  claimedAt?: string;
  externalRiderName?: string;
  externalRiderPhone?: string;
  isExternal?: boolean;
  updatedAt: string;
  createdAt: string;
  /** Present on pending pool payloads from `GET /api/deliveries/rider/deliveries?status=pending`. */
  orderSummary?: RiderAvailableOrderSummary | null;
}

export interface DeliveryCheck {
  deliverable: boolean;
  distance: number | null;
  maxRadius: number;
  note?: string;
}

export interface RiderLocation {
  id: string;
  deliveryId: string;
  riderId: string;
  lat: number;
  lon: number;
  heading?: number;
  speed?: number;
  recordedAt: string;
}

export interface Rating {
  id: string;
  orderId: string;
  fromUserId: string;
  toUserId: string;
  toRole: "vendor" | "rider";
  rating: number;
  comment?: string;
  createdAt: string;
}

export type ReviewModerationStatus = "visible" | "hidden";

export interface ShopReview {
  id: string;
  projectRef: string;
  shopId: string;
  orderId: string;
  customerId: string;
  rating: number;
  comment?: string | null;
  moderationStatus: ReviewModerationStatus;
  moderationReason?: string | null;
  moderatedBy?: string | null;
  moderatedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ShopReviewSummary {
  averageRating: number;
  reviewCount: number;
}

export interface Tip {
  id: string;
  orderId: string;
  fromCustomerId: string;
  toRiderId: string;
  amountCents: number;
  commissionBps?: number;
  platformFeeCents?: number;
  riderNetCents?: number;
  createdAt: string;
}

// ─── Rider Earnings ─────────────────────────────────────────────────────────

export type RiderEarningType = "delivery_fee" | "tip";

export interface RiderEarning {
  id: string;
  riderId: string;
  projectRef: string;
  orderId?: string;
  deliveryId?: string;
  type: RiderEarningType;
  grossCents: number;
  platformFeeCents: number;
  netCents: number;
  createdAt: string;
}

export interface RiderEarningsBreakdown {
  riderId: string;
  deliveryFeeGrossCents: number;
  deliveryFeePlatformCents: number;
  deliveryFeeNetCents: number;
  tipGrossCents: number;
  tipPlatformCents: number;
  tipNetCents: number;
  totalGrossCents: number;
  totalPlatformFeeCents: number;
  totalNetCents: number;
  count: number;
}

export interface RiderBalance extends RiderEarningsBreakdown {
  totalPaidOutCents: number;
  totalPendingPayoutCents: number;
  availableBalanceCents: number;
}

export interface RiderDailyEarnings {
  date: string;
  deliveryFeeCents: number;
  tipCents: number;
  totalCents: number;
  count: number;
}

export interface RiderWeeklyEarnings {
  weekStart: string;
  deliveryFeeCents: number;
  tipCents: number;
  totalCents: number;
  count: number;
}

export type RiderPayoutStatus = "pending" | "approved" | "processing" | "completed" | "rejected";
export type RiderPayoutMethod = "stripe_connect" | "bank_transfer" | "manual";

export interface RiderPayout {
  id: string;
  riderId: string;
  projectRef: string;
  amountCents: number;
  status: RiderPayoutStatus;
  payoutMethod: RiderPayoutMethod;
  stripeTransferId?: string;
  periodStart?: string;
  periodEnd?: string;
  note?: string;
  processedBy?: string;
  processedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type DeliveryMode = "third_party" | "vendor_rider";

/** Vendor-defined dietary tag (code is snake_case, stored on products as dietary_tags). */
export interface CustomDietaryTagDefinition {
  code: string;
  label: string;
}

export interface VendorSettings {
  id: string;
  projectRef: string;
  shopId?: string;
  autoAccept: boolean;
  defaultPrepTimeMinutes: number;
  deliveryMode: DeliveryMode;
  autoDispatchDelayMinutes?: number;
  minimumOrderCents?: number;
  /** When true, customers may request cutlery at checkout for this shop. */
  cutleryOffered?: boolean;
  /** Charged amount in cents; 0 means free when offered. */
  cutleryFeeCents?: number;
  /** Extra allergy/diet labels for this shop (beyond built-in presets). */
  customDietaryTags?: CustomDietaryTagDefinition[];
  createdAt: string;
  updatedAt: string;
}

// ─── Chat ──────────────────────────────────────────────────────────────────────

export type ConversationType =
  | "customer_vendor"
  | "vendor_rider"
  | "customer_rider"
  | "customer_support";

export interface Conversation {
  id: string;
  projectRef: string;
  /** Set for order-linked chats; null for support tickets. */
  orderId: string | null;
  type: ConversationType;
  participant1Id: string;
  participant2Id: string;
  /** Ticket title when `type === "customer_support"`. */
  supportSubject?: string | null;
  /** When set, support thread is closed until cleared (reopened). */
  supportClosedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderRole: string;
  content: string;
  readAt?: string;
  createdAt: string;
}

export interface SupportTicketRating {
  id: string;
  conversationId: string;
  projectRef: string;
  customerId: string;
  ticketSubject: string | null;
  stars: number;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupportRatingsSummary {
  totalCount: number;
  averageStars: number;
  distribution: { stars: number; count: number }[];
  seriesByDay: { date: string; count: number; averageStars: number }[];
}

// ─── Products / Menu ───────────────────────────────────────────────────────────

export interface Product {
  id: string;
  projectRef: string;
  shopId?: string;
  name: string;
  description?: string;
  priceCents: number;
  category?: string;
  imageUrl?: string;
  /** Scannable code (UPC/EAN, etc.); unique per shop when set; staff/POS only, not on public menu API. */
  barcode?: string;
  /** Internal SKU; unique per shop when set; staff/POS only, not on public menu API. */
  sku?: string;
  available: boolean;
  /** Preset codes (vegan, halal, …) or custom shop-defined codes. */
  dietaryTags?: string[];
  modifierGroups?: ModifierGroup[];
  /** When non-empty, checkout must send `productVariantId` for this product. */
  variants?: ProductVariant[];
  createdAt: string;
  updatedAt?: string;
  sortOrder?: number;
  /** Superadmin per-product commission override (bps); only when platform is in per-product mode. */
  commissionBps?: number | null;
}

/** Sellable SKU under a parent product (size, pack, volume, …). */
export interface ProductVariant {
  id: string;
  productId: string;
  name: string;
  priceCents: number;
  imageUrl?: string;
  /** Staff/POS only when returned from catalog API; omitted on public menu. */
  barcode?: string;
  sku?: string;
  available: boolean;
  sortOrder: number;
  /** Stock cap; undefined = unlimited (optional enforcement). */
  stockQuantity?: number;
  createdAt: string;
  updatedAt?: string;
}

export interface ModifierGroup {
  id: string;
  productId: string;
  name: string;
  required: boolean;
  minSelections: number;
  maxSelections: number;
  sortOrder: number;
  options: ModifierOption[];
  createdAt: string;
  updatedAt: string;
}

export interface ModifierOption {
  id: string;
  groupId: string;
  name: string;
  priceCents: number;
  isDefault: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface SelectedModifier {
  groupName: string;
  optionName: string;
  priceCents: number;
  modifierOptionId?: string;
}

export interface OrderItemModifier {
  id: string;
  orderItemId: string;
  modifierOptionId?: string;
  groupName: string;
  optionName: string;
  priceCents: number;
}

/** Built-in platform dietary codes (also valid without listing in vendor custom tags). */
export type PresetDietaryTag = "vegan" | "halal" | "gluten_free" | "nut_free";

/** Any tag code stored on a product (preset or custom). */
export type DietaryTag = string;

export const DIETARY_TAG_OPTIONS: Array<{ value: PresetDietaryTag; label: string }> = [
  { value: "vegan", label: "Vegan" },
  { value: "halal", label: "Halal" },
  { value: "gluten_free", label: "Gluten-Free" },
  { value: "nut_free", label: "Nut-Free" },
];

/** Core + platform-additional dietary presets (e.g. public theme, superadmin API). */
export interface DietaryTagPreset {
  code: string;
  label: string;
}

/** Platform-defined restaurant browse categories (superadmin → customer home chips). */
export interface BrowseCategoryPreset {
  code: string;
  label: string;
  sortOrder: number;
  /** Optional Lucide icon name for customer web (e.g. Pizza). */
  icon?: string;
  /** Optional chip image URL (https). Shown instead of the Lucide icon when set. */
  iconImageUrl?: string | null;
}

export interface FavoriteShop {
  id: string;
  shopId: string;
  createdAt: string;
  shop: Shop;
}

export interface FavoriteProduct {
  id: string;
  productId: string;
  shopId?: string | null;
  createdAt: string;
  product: Product;
}

export interface Category {
  id: string;
  projectRef: string;
  shopId?: string;
  name: string;
  sortOrder?: number;
  createdAt: string;
  updatedAt?: string;
}

export interface AdminSettings {
  id: string;
  projectRef: string;
  avgDeliveryTimeMinutes: number;
  autoDispatchDelayMinutes: number;
  maxSearchRadiusKm: number;
  createdAt: string;
  updatedAt: string;
}

export interface Workspace {
  id: string;
  projectRef: string;
  name: string;
  description?: string;
  logoUrl?: string;
  bannerUrl?: string;
  address?: string;
  phone?: string;
  lat?: number | null;
  lon?: number | null;
  currency?: string;
  promoCodesEnabled?: boolean;
  /** Default vendor commission in basis points (100 = 1%); null = unset. */
  vendorDefaultCommissionBps?: number | null;
  stripeConnectAccountId?: string | null;
  stripeConnectChargesEnabled?: boolean;
  stripeConnectPayoutsEnabled?: boolean;
  stripeConnectDetailsSubmitted?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type VendorCommissionModel = "workspace_default" | "per_product";

export interface VendorCommissionSettings {
  vendorCommissionModel: VendorCommissionModel;
  vendorConnectPayoutsEnabled: boolean;
}

export interface WorkspaceStripeConnectSummary {
  accountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
}

// ─── Payments ──────────────────────────────────────────────────────────────────

export interface PaymentIntentResponse {
  clientSecret: string | null;
  paymentIntentId: string;
  isDummy?: boolean;
  orderId?: string;
  /** Amount applied from wallet for checkout (create-intent with checkoutDraft). */
  walletAmountCents?: number;
  /** True when the order was paid entirely from wallet (no Stripe charge). */
  isWalletOnly?: boolean;
}

export type CustomerWalletLedgerType =
  | "topup_stripe"
  | "admin_credit"
  | "admin_debit"
  | "refund_credit"
  | "checkout_debit"
  | "adjustment";

export interface CustomerWalletTransaction {
  id: string;
  amountCents: number;
  type: CustomerWalletLedgerType;
  referenceType: string | null;
  referenceId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface PaymentSettings {
  demoMode: boolean;
  defaultCurrency: string;
  stripePublishableKey: string;
  riderCommissionBps: number;
  riderDeliveryFeeBps: number;
  stripeConfigured: boolean;
  stripeSecretKeyHint: string;
  webhookConfigured: boolean;
}

export interface ExchangeRates {
  base: string;
  rates: Record<string, number>;
  date: string | null;
  updatedAt: string | null;
}

// ─── Push Tokens ───────────────────────────────────────────────────────────────

export type PushPlatform = "web" | "ios" | "android";

export interface PushToken {
  id: string;
  userId: string;
  userRole: string;
  token: string;
  platform: PushPlatform;
  projectRef: string;
  createdAt: string;
}

// ─── WebSocket Events ──────────────────────────────────────────────────────────

export interface WSOrderStatusChanged {
  type: "order:status_changed";
  orderId: string;
  status: OrderStatus;
  previousStatus: OrderStatus;
  updatedAt: string;
  deliveryStatus?: DeliveryStatus;
}

export interface WSOrderRejected {
  type: "order:rejected";
  orderId: string;
  reason?: string;
}

export interface WSOrderDelayed {
  type: "order:delayed";
  orderId: string;
  slaDeadline: string;
}

export interface WSDeliveryLocationUpdate {
  type: "delivery:location_update";
  deliveryId: string;
  lat: number;
  lon: number;
  heading?: number;
  speed?: number;
}

export interface WSDeliveryRequest {
  type: "delivery:request";
  deliveryId: string;
  orderId: string;
  vendorLat?: number;
  vendorLon?: number;
}

export interface WSDeliveryRiderAssigned {
  type: "delivery:rider_assigned";
  deliveryId: string;
  orderId: string;
  riderId?: string;
  updatedAt?: string;
}

export interface WSDeliveryRiderArrived {
  type: "delivery:rider_arrived";
  deliveryId: string;
  orderId: string;
  updatedAt?: string;
}

export interface WSDeliveryCancelled {
  type: "delivery:cancelled";
  deliveryId: string;
  orderId: string;
  reason?: string;
}

export interface WSChatMessage {
  type: "chat:message";
  conversationId: string;
  message: Message;
}

export interface WSChatRead {
  type: "chat:read";
  conversationId: string;
  userId: string;
  readAt: string;
}

export interface WSChatTyping {
  type: "chat:typing";
  conversationId: string;
  userId: string;
  isTyping: boolean;
}

export interface WSChatSupportStatus {
  type: "chat:support_status";
  conversationId: string;
  supportClosedAt: string | null;
}

export interface WSThemeUpdated {
  type: "theme:updated";
  organizationId: string;
  updatedAt: string;
}

/** Refund request lifecycle or superadmin direct refund — clients should refetch order + refund request. */
export interface WSRefundRequestUpdated {
  type: "refund_request:updated";
  orderId: string;
  projectRef: string;
  customerId: string | null;
  refundRequestId: string | null;
  status: "pending" | "approved" | "rejected" | null;
}

/** CX anomaly raised event. */
export interface WSAnomalyRaised {
  type: "cx:anomaly_raised";
  anomalyId: string;
  organizationId: string;
  signal: string;
  scopeLabel: string;
  [key: string]: any;
}

/** CX case created event. */
export interface WSCaseCreated {
  type: "cx:case_created";
  caseId: string;
  severity: string;
  feedbackId?: string;
  ruleId?: string;
  [key: string]: any;
}

/** CX case updated event. */
export interface WSCaseUpdated {
  type: "cx:case_updated";
  caseId: string;
  severity?: string;
  feedbackId?: string;
  ruleId?: string;
  [key: string]: any;
}

export type WSEvent =
  | WSOrderStatusChanged
  | WSOrderRejected
  | WSOrderDelayed
  | WSDeliveryLocationUpdate
  | WSDeliveryRequest
  | WSDeliveryRiderAssigned
  | WSDeliveryRiderArrived
  | WSDeliveryCancelled
  | WSChatMessage
  | WSChatRead
  | WSChatTyping
  | WSChatSupportStatus
  | WSThemeUpdated
  | WSRefundRequestUpdated
  | WSAnomalyRaised
  | WSCaseCreated
  | WSCaseUpdated;

// ─── Public theme / branding (GET /api/public/theme) ─────────────────────────

/** Stored in platform_settings.platform_branding; also top-level fields on ResolvedTheme. */
export interface PlatformBrandingPayload {
  appName?: string;
  logoUrl?: string;
  faviconUrl?: string;
  wordmarkUrl?: string;
  ogImageUrl?: string;
  supportEmail?: string;
  helpUrl?: string;
}

/** CSS variable tokens from `GET /api/public/theme` and `platform_settings.platform_theme`. */
export interface ThemeColors {
  primary?: string;
  primaryForeground?: string;
  secondary?: string;
  secondaryForeground?: string;
  accent?: string;
  accentForeground?: string;
  background?: string;
  foreground?: string;
  muted?: string;
  mutedForeground?: string;
  destructive?: string;
  card?: string;
  cardForeground?: string;
  border?: string;
}

/** Persisted under `platform_settings.platform_theme` (JSON); superadmin `GET/PUT /api/superadmin/platform-theme`. */
export interface PlatformThemePayload {
  light?: ThemeColors;
  dark?: ThemeColors;
}

/**
 * Stored on `workspaces.public_theme_overlay` and merged (server-side) into
 * `GET /api/public/theme` when `ref` matches the workspace `project_ref`.
 * Partial branding / theme / map / delivery fee only — not platform feature toggles.
 */
export type WorkspacePublicThemeOverlay = Partial<PlatformBrandingPayload> &
  Partial<PlatformThemePayload> & {
    mapSettings?: Partial<MapSettings>;
    deliveryFeeConfig?: DeliveryFeeConfig;
  };

/**
 * A DNS record a tenant must publish at their domain provider to prove
 * ownership and enable hosting/HTTPS. Mirrors the backend
 * `VerificationRecord` produced by `buildVerificationRecords`.
 */
export interface DnsVerificationRecord {
  type: "TXT" | "CNAME" | "A";
  /** e.g. `vendor.example.com` or `_acme-challenge.vendor.example.com`. */
  host: string;
  /** e.g. `cname.vercel-dns.com` or `76.76.21.21`. */
  target: string;
  ttl?: number;
  /** `verification` | `ownership` | `certificate`. */
  purpose: string;
  /** `required` | `pending` | `verified` | `error`. */
  status: string;
}

// ─── Mobile app white-label config (future EAS pipeline) ────────────────────

/**
 * Per-surface white-label configuration for a mobile app (customer / rider /
 * vendor). Stored on `organizations.mobile_app_config` as a JSONB column — see
 * migration 080.
 *
 * **Current status:** read/write endpoints exist (`GET/PATCH
 * /api/saas/mobile-app-config`). The app-builder can queue **EAS preview**
 * builds (`POST /api/saas/mobile-app-config/builds`) that bake
 * `EXPO_PUBLIC_PROJECT_REF` like Metro; white-label fields here are still
 * optional and not required for those preview builds.
 */
export interface MobileAppSurfaceConfig {
  /** Display name for the app on the home screen / launcher (e.g. "Acme Eats"). */
  displayName?: string;
  /** Public URL of a 1024x1024 PNG icon. */
  iconUrl?: string;
  /** Public URL of a portrait splash image. */
  splashUrl?: string;
  /** Hex color for the splash background (`#RRGGBB` or `#RRGGBBAA`). */
  splashBackgroundColor?: string;
  /** Hex color that overrides the app's primary accent at runtime. */
  primaryColor?: string;
  /**
   * Deep-link scheme used for `expo-linking` (no colon, no slashes).
   * Example: `"acme-eats"` produces `acme-eats://order/123`.
   */
  deepLinkScheme?: string;
  /**
   * Suffix appended to the default bundle id when EAS produces a per-org
   * build. Example: `"acme"` → `com.dilivygo.customer.acme`.
   */
  bundleIdSuffix?: string;
}

export interface OrganizationMobileAppConfig {
  customer?: MobileAppSurfaceConfig;
  rider?: MobileAppSurfaceConfig;
  vendor?: MobileAppSurfaceConfig;
}

export interface ResolvedTheme {
  light: ThemeColors;
  dark: ThemeColors;
  appName?: string;
  logoUrl?: string;
  faviconUrl?: string;
  wordmarkUrl?: string;
  ogImageUrl?: string;
  supportEmail?: string;
  helpUrl?: string;
  currencyCode?: string;
  mapSettings?: MapSettings;
  deliveryFeeConfig?: DeliveryFeeConfig;
  languageConfig?: LanguageConfig;
  dietaryTagPresets?: DietaryTagPreset[];
  browseCategoryPresets?: BrowseCategoryPreset[];
  /** When false, customer apps should hide profile photo upload (default true). */
  customerProfilePhotoEnabled?: boolean;
  /**
   * When true, customers may add items from multiple shops into one cart and pay once
   * with a single platform delivery fee (default false).
   */
  multiShopCartEnabled?: boolean;
  /** When false, customer apps hide cutlery at checkout (default true). */
  customerCutleryEnabled?: boolean;
  /** When false, hide customer-initiated refund requests (default true). */
  customerRefundRequestsEnabled?: boolean;
  /** When true, customer wallet (top-up, checkout balance, refunds to wallet) is enabled. */
  customerWalletEnabled?: boolean;
  /** Public Supabase Storage URLs for users without a custom avatar (from server). */
  defaultProfilePhotoUrls?: string[];
  /**
   * Origin of the SaaS dashboard (`apps/saas`) — staff apps link org owners
   * here to manage billing, workspaces, branding, and team members.
   * Derived from `SAAS_APP_ORIGIN` (prod) or `http://localhost:3006` (dev).
   */
  saasPortalUrl?: string | null;
  /** When true, staff mutations are gated by org subscription status (403 WORKSPACE_SUBSCRIPTION_REQUIRED). */
  saasBillingEnabled?: boolean;
  /**
   * When true, the deployment is in demo mode (global `platform_settings.demo_mode`).
   * Customer apps use this to render a "Skip OTP (Demo mode only)" checkbox on the
   * login screen; the server hard-gates `POST /api/auth/customer/demo-login` on the
   * same flag so a tampered client can never bypass OTP in production.
   */
  demoMode?: boolean;
}

export type RefundRequestStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface RefundRequest {
  id: string;
  projectRef: string;
  orderId: string;
  customerId: string;
  status: RefundRequestStatus;
  reason: string;
  requestedAmountCents: number | null;
  conversationId: string | null;
  internalNote: string | null;
  rejectionReason: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  createdAt: string;
  updatedAt: string;
  /** Superadmin list enrichment */
  orderTotalCents?: number | null;
  orderStatus?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
}

// ─── Language / i18n ─────────────────────────────────────────────────────────

export type SupportedLanguage = "en" | "fr" | "ar";

export interface LanguageConfig {
  defaultLanguage: SupportedLanguage;
  locked: boolean;
}

// ─── Map Settings ────────────────────────────────────────────────────────────

export interface MapSettings {
  tilePreset: string;
  customTileUrl?: string;
  darkTilePreset?: string;
  customDarkTileUrl?: string;
  riderMarkerColor: string;
  shopMarkerColor: string;
  customerMarkerColor: string;
  showZoomControls: boolean;
  showAttribution: boolean;
  defaultZoom: number;
}

/**
 * Approximate `latitudeDelta` / `longitudeDelta` for react-native-maps from `MapSettings.defaultZoom` (8–18).
 * Roughly matches neighborhood scale (~0.02° at zoom 14); not survey-grade.
 */
export function latitudeDeltaFromMapDefaultZoom(zoom: number): number {
  const z = Math.min(18, Math.max(8, Math.round(Number.isFinite(zoom) ? zoom : 14)));
  return 320 / Math.pow(2, z);
}

// ─── Delivery Fee Config ─────────────────────────────────────────────────────

export type DeliveryFeeType = "flat" | "tiered";

export interface DeliveryFeeTier {
  /** Order subtotal ceiling in cents; null means "and above" (last tier). */
  upToCents: number | null;
  feeCents: number;
}

export interface DeliveryFeeConfig {
  type: DeliveryFeeType;
  /** Fee in cents when type is "flat". */
  flatFeeCents: number;
  /** Orders above this subtotal get free delivery (0 = disabled). */
  freeDeliveryThresholdCents: number;
  /** Tiers sorted ascending by upToCents; used when type is "tiered". */
  tiers: DeliveryFeeTier[];
}

export type AnalyticsRangeDays = 7 | 14 | 30 | 90;

export interface TimeSeriesPoint {
  date: string;
  orders?: number;
  revenueCents?: number;
  completed?: number;
  assigned?: number;
}

export interface PeakHourPoint {
  hour: string;
  orders?: number;
  deliveries?: number;
}

export interface StatusBreakdownPoint {
  status: string;
  count: number;
}

export interface PopularItemPoint {
  name: string;
  quantity: number;
  revenueCents: number;
}

export interface WorkspacePerformancePoint {
  projectRef: string;
  workspaceName: string;
  orders: number;
  revenueCents: number;
}

export interface VendorAnalyticsResponse {
  rangeDays: AnalyticsRangeDays;
  /** ISO-4217 code resolved from the workspace's org `default_currency` (upper-case). */
  currencyCode: string;
  summary: {
    totalOrders: number;
    completedOrders: number;
    completionRate: number;
    totalRevenueCents: number;
    averageOrderValueCents: number;
    averagePrepMinutes: number;
    orderTrendPct: number;
    revenueTrendPct: number;
  };
  series: {
    ordersByDay: TimeSeriesPoint[];
    peakHours: PeakHourPoint[];
    statusBreakdown: StatusBreakdownPoint[];
    popularItems: PopularItemPoint[];
  };
}

export interface RiderAnalyticsResponse {
  rangeDays: AnalyticsRangeDays;
  summary: {
    totalAssigned: number;
    totalCompleted: number;
    completionRate: number;
    averageDeliveryMinutes: number;
    completedTrendPct: number;
  };
  series: {
    deliveriesByDay: TimeSeriesPoint[];
    peakHours: PeakHourPoint[];
    statusBreakdown: StatusBreakdownPoint[];
  };
}

/** AI usage telemetry (metadata only — never prompts or responses). */
export interface AiUsageQueryParams {
  days?: number;
  capability?: string;
  organizationId?: string;
  projectRef?: string;
  model?: string;
  status?: "ok" | "error";
  limit?: number;
  offset?: number;
}

export interface AiUsageGroupStats {
  calls: number;
  errors: number;
  errorRate: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  cacheHits: number;
  llmAvoided: number;
}

export interface AiUsageSummary {
  window: { since: string | null; events: number; modelCalls: number };
  totals: AiUsageGroupStats & {
    tokensEstimated: boolean;
    fallbacks: number;
    routerDecisions: number;
    llmAvoidedRate: number;
  };
  byCapability: Record<string, AiUsageGroupStats>;
  byTenant: Record<string, AiUsageGroupStats>;
  byModel: Record<string, AiUsageGroupStats>;
  byDay: Record<string, AiUsageGroupStats>;
  topCostly: (AiUsageGroupStats & { capability: string })[];
  flags: { kind: string; capability?: string; errorRate?: number; calls?: number; tokens?: number }[];
}

export interface AiUsageEvent {
  type: string;
  occurredAt: string;
  traceId: string | null;
  capability: string | null;
  detail: string | null;
  organizationId: string | null;
  projectRef: string | null;
  actorKind: string | null;
  modelClass: string | null;
  provider: string | null;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  tokensEstimated: boolean;
  costUsd: number | null;
  latencyMs: number | null;
  status: string;
  errorCode: string | null;
  cacheHit: boolean;
  toolCount: number;
  fallbacks: number;
  llmAvoided: boolean;
  selectionReason: string | null;
}

export interface AiUsageEventsResponse {
  events: AiUsageEvent[];
  total: number;
}

export interface AiOptimizationRecommendation {
  kind: string;
  capability: string;
  evidence: Record<string, number | string>;
  action: string;
}

export interface AiOptimizationRecommendations {
  stats: { capabilities: number; modelCalls: number };
  recommendations: AiOptimizationRecommendation[];
}


// ─── Platform Banners ─────────────────────────────────────────────────────────

export type {
  PlatformBannerImageResize,
} from "./banner-styles";
export {
  getPlatformBannerImageBackgroundStyle,
  getPlatformBannerImageOnlyBackgroundStyle,
} from "./banner-styles";

export type {
  PlatformBannerAspectPreset,
  PlatformBannerAspectOption,
} from "./banner-presets";
export {
  PLATFORM_BANNER_ASPECT_PRESETS,
  getPlatformBannerSlideUrls,
  getPlatformBannerAspectStyle,
} from "./banner-presets";

export type {
  PlatformBannerPlacement,
  PlatformBannerPlacementOption,
} from "./banner-placements";
export { PLATFORM_BANNER_PLACEMENTS } from "./banner-placements";

export interface PlatformBanner {
  id: string;
  /** SaaS org that owns this banner (white-label isolation). */
  organizationId?: string | null;
  title: string;
  subtitle?: string | null;
  ctaText?: string | null;
  ctaLink?: string | null;
  imageUrl?: string | null;
  /** When carousel is enabled, ordered slide URLs (first is also `imageUrl`). */
  imageUrls?: string[] | null;
  carouselEnabled?: boolean;
  imageScale?: number;
  imagePosX?: number;
  imagePosY?: number;
  imageResize?: import("./banner-styles").PlatformBannerImageResize;
  imageAspectPreset?: import("./banner-presets").PlatformBannerAspectPreset;
  placement?: import("./banner-placements").PlatformBannerPlacement;
  bgGradient: string;
  textColor: string;
  sortOrder: number;
  isActive: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogEntry {
  id: string;
  userId: string | null;
  userEmail: string | null;
  userRole: string | null;
  projectRef: string | null;
  organizationId?: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  details: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
}

// ─── Notification Templates ───────────────────────────────────────────────────

export type NotificationChannel = 'email' | 'push' | 'both';

export interface NotificationTemplate {
  id: string;
  /** Present when templates are scoped per SaaS organization. */
  organizationId?: string | null;
  slug: string;
  name: string;
  description: string | null;
  channel: NotificationChannel;
  emailSubject: string | null;
  emailHtml: string | null;
  pushTitle: string | null;
  pushBody: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Promotional Notifications ────────────────────────────────────────────────

export type PromotionalNotificationAudience = 'all' | 'customers' | 'riders' | 'vendors';
export type PromotionalNotificationStatus = 'draft' | 'sending' | 'sent' | 'failed';

export interface PromotionalNotification {
  id: string;
  title: string;
  body: string;
  targetAudience: PromotionalNotificationAudience;
  data: Record<string, string>;
  status: PromotionalNotificationStatus;
  sentCount: number;
  failedCount: number;
  totalTokens: number;
  createdBy: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Integration Requests ───────────────────────────────────────────────────

export type IntegrationRequestStatus = "pending" | "approved" | "rejected";

export interface IntegrationRequest {
  id: string;
  organizationId: string;
  integrationName: string;
  integrationCategory: string;
  requesterName?: string | null;
  requesterEmail?: string | null;
  status: IntegrationRequestStatus;
  createdAt: string;
  updatedAt: string;
}

/** Per-namespace LRU counters from `GET /api/superadmin/cache/stats` (platform-operator only, never proxied). */
export interface CacheNamespaceStats {
  hits: number;
  misses: number;
  sets: number;
  invalidations: number;
  size: number;
}

export interface CacheStats {
  cacheDisabled: boolean;
  namespaces: Record<string, CacheNamespaceStats>;
}

/** `POST /api/superadmin/integration-requests` body (org pinned server-side on the SaaS path). */
export interface CreateIntegrationRequestInput {
  integrationName: string;
  integrationCategory: string;
  requesterName?: string | null;
  requesterEmail?: string | null;
}

/** `GET/PATCH /api/superadmin/customer-features` (per-org feature flags). */
export interface CustomerFeaturesPayload {
  customerProfilePhotoEnabled: boolean;
  multiShopCartEnabled: boolean;
  customerCutleryEnabled: boolean;
  customerRefundRequestsEnabled: boolean;
  customerWalletEnabled: boolean;
}

export type CustomerFeaturesUpdate = Partial<CustomerFeaturesPayload>;

/** `GET/PATCH /api/superadmin/language-settings` (per-org language policy). */
export interface LanguageSettingsPayload {
  defaultLanguage: string;
  locked: boolean;
  supportedLanguages: string[];
}

export interface LanguageSettingsUpdate {
  defaultLanguage?: string;
  locked?: boolean;
}

/** `PATCH /api/superadmin/map-settings` body (per-org map config merge). */
export type MapSettingsUpdate = Partial<MapSettings>;

/** `GET /api/superadmin/support/conversations` — server filters after fetch (list capped at 200). */
export interface SupportConversationsListParams {
  limit?: number;
  offset?: number;
  /** Case-insensitive substring match on subject / project ref / participant id. */
  search?: string;
  /** `open` = supportClosedAt null, `closed` = set, `all` (default) = no filter. */
  status?: "open" | "closed" | "all";
}

// ─── API Response Wrappers ─────────────────────────────────────────────────────

export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total?: number;
  limit: number;
  offset: number;
}

export {
  hashStringToUint32,
  hasCustomProfilePhoto,
  pickDefaultProfilePhotoUrl,
  resolveProfileAvatarUrl,
} from "./profile-avatar";

export { mergePlatformThemeColors } from "./merge-platform-theme-colors";
export {
  PLATFORM_THEME_FIELD_ROWS,
  PLATFORM_THEME_FIELD_KEYS,
  PLATFORM_THEME_FIELD_META,
  PLATFORM_THEME_FIELD_KEYS_SKIP_WEB_CSS,
  type PlatformThemeColorKey,
} from "./platform-theme-fields";
export { PLATFORM_THEME_PRESETS, type PlatformThemePreset } from "./platform-theme-presets";
export * from "./domain-contract";

/** Onboarding media is organization-scoped and does not require a workspace. */
export type OnboardingBrandingImageField = "logoUrl" | "faviconUrl" | "coverImageUrl";
export type OnboardingBrandingUploadResponse = { url: string; field: OnboardingBrandingImageField };

// ─── POS Hardware Operations ──────────────────────────────────────────────────

export type PosHardwareDeviceKind = "printer" | "drawer" | "scanner" | "terminal";
export type PosHardwareHealthState = "online" | "stale" | "offline";
export type PosPrintJobKind = "receipt" | "kitchen-ticket" | "test" | "drawer-kick";
export type PosPrintJobStatus = "queued" | "sent" | "acked" | "failed";

export interface PosHardwareDeviceDiagnostic {
  id: string;
  organizationId?: string | null;
  projectRef: string;
  shopId?: string | null;
  shopName?: string | null;
  deviceName: string;
  deviceKind: PosHardwareDeviceKind;
  station: string;
  capabilities: Record<string, unknown>;
  isMock: boolean;
  lastSeenAt: string | null;
  healthState: PosHardwareHealthState;
  createdAt: string;
  updatedAt: string;
}

export interface PosPrintJobDiagnostic {
  id: string;
  jobId: string;
  organizationId?: string | null;
  projectRef: string;
  shopId?: string | null;
  shopName?: string | null;
  deviceId?: string | null;
  deviceName?: string | null;
  station: string;
  kind: PosPrintJobKind;
  idempotencyKey: string;
  status: PosPrintJobStatus;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PosHardwareRecentFailure {
  id: string;
  jobId: string;
  shopId?: string | null;
  shopName?: string | null;
  station: string;
  deviceName?: string | null;
  error: string;
  attempts: number;
  createdAt: string;
}

export interface PosHardwareOverviewMetrics {
  workstations: number;
  online: number;
  offline: number;
  stale: number;
  mockDevices: number;
  printsToday: number;
  failedPrintsToday: number;
  failureRate: number;
  latestSuccessfulPrint: string | null;
  recentFailures: PosHardwareRecentFailure[];
}

export interface PosHardwareFiltersQuery {
  projectRef?: string;
  shopId?: string;
  station?: string;
  status?: PosPrintJobStatus;
  kind?: PosPrintJobKind;
  deviceKind?: PosHardwareDeviceKind;
  isMock?: boolean;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export interface PosHardwareHeartbeatPayload {
  deviceName: string;
  deviceKind?: PosHardwareDeviceKind;
  station?: string;
  connection?: Record<string, unknown>;
  capabilities?: Record<string, unknown>;
  isMock?: boolean;
}

export interface PosPrintJobStatusUpdatePayload {
  status: "sent" | "acked" | "failed";
  attempts?: number;
  lastError?: string | null;
  deviceId?: string | null;
}

export interface PosCreatePrintJobPayload {
  idempotencyKey: string;
  kind?: PosPrintJobKind;
  station?: string;
  payload?: Record<string, unknown>;
}

// ─── Message Delivery Operations ──────────────────────────────────────────────

export type MessageDeliveryChannel = "email" | "sms" | "push";
export type MessageDeliveryStatus = "queued" | "sent" | "failed" | "retrying";
export type MessageProviderHealthStatus = "healthy" | "degraded" | "down" | "unknown" | "unconfigured";

export interface MessageDeliveryDiagnostic {
  id: string;
  organizationId: string | null;
  channel: MessageDeliveryChannel;
  provider: string;
  providerMessageId: string | null;
  status: MessageDeliveryStatus;
  attempts: number;
  lastError: string | null;
  diagnosticRef?: string | null;
  isStale: boolean;
  isStaleRetry?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MessageDeliveryChannelMetrics {
  total: number;
  sent: number;
  failed: number;
  queued: number;
  retrying?: number;
  terminalCount?: number;
  staleQueued: number;
  staleRetrying?: number;
  failureRate: number | null;
  successRate?: number | null;
  lastSuccessAt?: string | null;
  lastFailureAt?: string | null;
}

export interface MessageDeliveryOverview {
  totalDeliveries: number;
  sentCount: number;
  failedCount: number;
  queuedCount: number;
  retryingCount?: number;
  staleQueuedCount: number;
  staleRetryCount?: number;
  terminalDeliveries?: number;
  terminalCount?: number;
  failureRate: number | null;
  successRate?: number | null;
  total?: number;
  sent?: number;
  failed?: number;
  queued?: number;
  retrying?: number;
  channels: {
    email: MessageDeliveryChannelMetrics;
    sms: MessageDeliveryChannelMetrics;
    push: MessageDeliveryChannelMetrics;
  };
  providers: Record<string, {
    total: number;
    sent: number;
    failed: number;
    queued: number;
    retrying?: number;
  }>;
  windowHours: number | null;
}

export interface MessageChannelReadiness {
  channel: MessageDeliveryChannel;
  provider: string;
  configured: boolean;
  status: MessageProviderHealthStatus;
  fromAddress?: string | null;
  apiKeyConfigured?: boolean;
  accountSidConfigured?: boolean;
  authTokenConfigured?: boolean;
  serviceAccountConfigured?: boolean;
  webhookConfigured?: boolean;
  phoneNumberConfigured?: boolean;
  statusCallbackConfigured?: boolean;
  lastSuccessAt?: string | null;
  lastFailureAt?: string | null;
  lastErrorCode?: string | null;
}

export interface MessageDeliveryReadiness {
  email: MessageChannelReadiness;
  sms: MessageChannelReadiness;
  push: MessageChannelReadiness;
}

export interface MessageDeliveryFiltersQuery {
  channel?: MessageDeliveryChannel;
  status?: MessageDeliveryStatus;
  provider?: string;
  windowHours?: number;
  staleOnly?: boolean;
  staleRetryOnly?: boolean;
  limit?: number;
  offset?: number;
}

