import type {
  Order,
  OrderItem,
  DeliveryCheck,
  Conversation,
  Message,
  Customer,
  CustomerAddress,
  Product,
  ProductVariant,
  FavoriteShop,
  FavoriteProduct,
  Category,
  Workspace,
  Shop,
  GeoPolygon,
  OperatingHours,
  PaymentIntentResponse,
  PushPlatform,
  Rating,
  ShopReview,
  ShopReviewSummary,
  Tip,
  VendorSettings,
  AdminSettings,
  User,
  ResolvedTheme,
  PlatformBanner,
  WorkspaceStripeConnectSummary,
  ExchangeRates,
  PromoCode,
  PromoValidationResult,
  CustomerCartSnapshot,
  CartSyncBody,
  AnalyticsRangeDays,
  VendorAnalyticsResponse,
  POSCheckoutPayload,
  ModifierGroup,
  ModifierOption,
  SupportTicketRating,
  RefundRequest,
  CustomerWalletTransaction,
  PosHardwareDeviceDiagnostic,
  PosPrintJobDiagnostic,
  PosHardwareHeartbeatPayload,
  PosPrintJobStatusUpdatePayload,
  PosCreatePrintJobPayload,
} from "@dilivygo/types";
import { normalizeOrder } from "./normalize-order";

// CSRF token header name
const CSRF_HEADER = "x-csrf-token";

// State-changing HTTP methods that require CSRF token
const CSRF_METHODS = ["POST", "PUT", "PATCH", "DELETE"];

// CSRF error codes that trigger token refresh
const CSRF_ERROR_CODES = ["CSRF_TOKEN_MISSING", "CSRF_TOKEN_INVALID"];

async function request<T>(
  baseUrl: string,
  path: string,
  options: RequestInit = {},
  getAuthToken?: (() => string | null | Promise<string | null>) | undefined,
  csrfState?: { token: string | null; fetchToken: () => Promise<string> },
  defaultHeaders?: Record<string, string>
): Promise<T> {
  const url = `${baseUrl}${path}`;
  const authToken = getAuthToken ? await getAuthToken() : null;
  const method = (options.method || "GET").toUpperCase();

  // Never spread `options` onto fetch after `headers`: callers pass `{ headers }` for
  // per-request keys (e.g. x-shop-id); spreading would replace merged headers and drop
  // defaultHeaders, CSRF, and Content-Type.
  const { headers: callerHeaders, ...restInit } = options;
  
  // Get CSRF token for state-changing requests
  let csrfToken: string | null = null;
  if (csrfState && CSRF_METHODS.includes(method)) {
    csrfToken = csrfState.token || await csrfState.fetchToken();
  }
  
  const mergedHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...(defaultHeaders || {}),
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    ...(csrfToken ? { [CSRF_HEADER]: csrfToken } : {}),
    ...(callerHeaders as Record<string, string> | undefined || {}),
  };
  const res = await fetch(url, {
    credentials: "include",
    headers: mergedHeaders,
    ...restInit,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    
    // Check if this is a CSRF error and retry with fresh token
    if (res.status === 403 && csrfState && CSRF_ERROR_CODES.includes(body.code)) {
      // Refresh the CSRF token
      const newToken = await csrfState.fetchToken();
      csrfState.token = newToken;
      
      // Retry the request with the new token
      const retryHeaders: Record<string, string> = {
        ...mergedHeaders,
        [CSRF_HEADER]: newToken,
      };
      const retryRes = await fetch(url, {
        credentials: "include",
        headers: retryHeaders,
        ...restInit,
      });
      if (!retryRes.ok) {
        const retryBody = await retryRes.json().catch(() => ({}));
        throw Object.assign(
          new Error(retryBody.error || retryBody.message || retryRes.statusText),
          { statusCode: retryRes.status, body: retryBody }
        );
      }
      if (retryRes.status === 204) return undefined as T;
      return retryRes.json();
    }
    
    throw Object.assign(
      new Error(body.error || body.message || res.statusText),
      { statusCode: res.status, body }
    );
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

async function requestBinary(
  baseUrl: string,
  path: string,
  getAuthToken?: () => string | null | Promise<string | null>,
  csrfState?: { token: string | null; fetchToken: () => Promise<string> },
  defaultHeaders?: Record<string, string>,
  method: string = "GET",
): Promise<Blob> {
  const url = `${baseUrl}${path}`;
  const authToken = getAuthToken ? await getAuthToken() : null;
  const upperMethod = method.toUpperCase();

  let csrfToken: string | null = null;
  if (csrfState && CSRF_METHODS.includes(upperMethod)) {
    csrfToken = csrfState.token || (await csrfState.fetchToken());
  } else if (csrfState) {
    csrfToken = csrfState.token;
  }

  const buildHeaders = (token: string | null): Record<string, string> => {
    const h: Record<string, string> = { ...(defaultHeaders || {}) };
    if (authToken) h.Authorization = `Bearer ${authToken}`;
    if (token) h[CSRF_HEADER] = token;
    return h;
  };

  let res = await fetch(url, {
    method: upperMethod,
    credentials: "include",
    headers: buildHeaders(csrfToken),
  });
  if (!res.ok) {
    const body = await res.clone().json().catch(() => ({}));
    if (
      res.status === 403 &&
      csrfState &&
      CSRF_ERROR_CODES.includes((body as { code?: string }).code || "")
    ) {
      const fresh = await csrfState.fetchToken();
      csrfState.token = fresh;
      res = await fetch(url, {
        method: upperMethod,
        credentials: "include",
        headers: buildHeaders(fresh),
      });
      if (!res.ok) {
        const retryBody = await res.json().catch(() => ({}));
        throw Object.assign(
          new Error((retryBody as { error?: string }).error || res.statusText),
          { statusCode: res.status, body: retryBody },
        );
      }
      return res.blob();
    }
    throw Object.assign(
      new Error((body as { error?: string }).error || res.statusText),
      { statusCode: res.status, body },
    );
  }
  return res.blob();
}

/**
 * Multipart/form-data POST with CSRF retry parity. Matches `request()`'s
 * 403-on-stale-CSRF behaviour so rotated CSRF cookies never brick file
 * uploads. Accepts pre-built FormData (we can't stringify a Blob to JSON).
 */
async function requestMultipart<T>(
  baseUrl: string,
  path: string,
  formData: FormData,
  getAuthToken?: () => string | null | Promise<string | null>,
  csrfState?: { token: string | null; fetchToken: () => Promise<string> },
  defaultHeaders?: Record<string, string>,
  method: string = "POST",
): Promise<T> {
  const url = `${baseUrl}${path}`;
  const authToken = getAuthToken ? await getAuthToken() : null;
  const upperMethod = method.toUpperCase();

  let csrfToken: string | null = null;
  if (csrfState && CSRF_METHODS.includes(upperMethod)) {
    csrfToken = csrfState.token || (await csrfState.fetchToken());
  } else if (csrfState) {
    csrfToken = csrfState.token;
  }

  const buildHeaders = (token: string | null): Record<string, string> => {
    // Important: do NOT set Content-Type — fetch will add the correct
    // multipart boundary automatically. Setting it manually breaks parsing.
    const h: Record<string, string> = { ...(defaultHeaders || {}) };
    if (authToken) h.Authorization = `Bearer ${authToken}`;
    if (token) h[CSRF_HEADER] = token;
    return h;
  };

  let res = await fetch(url, {
    method: upperMethod,
    credentials: "include",
    body: formData,
    headers: buildHeaders(csrfToken),
  });

  if (!res.ok) {
    const body = await res.clone().json().catch(() => ({}));
    if (
      res.status === 403 &&
      csrfState &&
      CSRF_ERROR_CODES.includes((body as { code?: string }).code || "")
    ) {
      const fresh = await csrfState.fetchToken();
      csrfState.token = fresh;
      res = await fetch(url, {
        method: upperMethod,
        credentials: "include",
        body: formData,
        headers: buildHeaders(fresh),
      });
      if (!res.ok) {
        const retryBody = await res.json().catch(() => ({}));
        throw Object.assign(
          new Error(
            (retryBody as { error?: string }).error ||
              (retryBody as { message?: string }).message ||
              res.statusText,
          ),
          { statusCode: res.status, body: retryBody },
        );
      }
      if (res.status === 204) return undefined as T;
      return res.json();
    }
    throw Object.assign(
      new Error(
        (body as { error?: string }).error ||
          (body as { message?: string }).message ||
          res.statusText,
      ),
      { statusCode: res.status, body },
    );
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export interface ApiClient {
  auth: {
    sendOTP(
      phone: string,
      projectRef?: string
    ): Promise<{ ok: boolean; channel?: "phone" | "email"; debugOtp?: string }>;
    sendOTP(params: {
      projectRef?: string;
      channel?: "phone" | "email";
      phone?: string;
      email?: string;
    }): Promise<{ ok: boolean; channel?: "phone" | "email"; debugOtp?: string }>;
    verifyOTP(params: {
      channel?: "phone" | "email";
      phone: string;
      code: string;
      projectRef?: string;
      name?: string;
      email?: string;
    } | {
      channel?: "phone" | "email";
      email: string;
      code: string;
      projectRef?: string;
    }): Promise<{ customer: Customer; created?: boolean; token?: string }>;
    /**
     * Demo-only OTP bypass. Only succeeds when the deployment has global
     * `platform_settings.demo_mode = 'true'`; otherwise returns 403 with
     * `code: 'DEMO_MODE_DISABLED'`. Clients should only call this when the
     * `/api/public/theme` payload reports `demoMode: true`.
     */
    customerDemoLogin(params: {
      channel?: "phone" | "email";
      phone?: string;
      email?: string;
      name?: string;
      projectRef?: string;
    }): Promise<{ customer: Customer; created: boolean; token?: string; demo: true }>;
    customerRecoverySend(params: {
      projectRef?: string;
      email: string;
    }): Promise<{ ok: boolean; debugOtp?: string }>;
    customerRecoveryVerify(params: {
      projectRef?: string;
      email: string;
      code: string;
      newPhone: string;
    }): Promise<{ customer: Customer; recovered: boolean; token?: string }>;
    updateCustomerProfile(params: {
      name?: string;
      email?: string;
    }): Promise<{ customer: Customer; token?: string }>;
    uploadCustomerAvatar(
      file: File | Blob | { uri: string; name: string; type: string },
    ): Promise<{ customer: Customer; token?: string }>;
    deleteCustomerAvatar(): Promise<{ customer: Customer; token?: string }>;
    login(
      email: string,
      password: string
    ): Promise<
      | { user: User; token?: string }
      | { requiresTwoFactor: true; preAuthToken: string }
    >;
    login2FA(sessionToken: string, totpToken: string): Promise<{ user: User; token?: string }>;
    logout(): Promise<void>;
    /** Clears `admin_session` (vendor / rider / POS staff). */
    logoutAdmin(): Promise<void>;
    getSession(): Promise<{ customer: Customer } | null>;
    getAdminSession(): Promise<{ user: User } | null>;
  };
  orders: {
    list(params?: {
      status?: string;
      limit?: number;
      offset?: number;
      shopId?: string;
    }): Promise<Order[]>;
    get(id: string): Promise<Order & { items: OrderItem[] }>;
    updateStatus(id: string, status: string): Promise<Order>;
    cancel(
      id: string,
      params?: { reason?: string; initiator?: string }
    ): Promise<Order>;
    refund(
      id: string,
      params?: { amountCents?: number; reason?: string }
    ): Promise<Order>;
    accept(id: string, prepTimeMinutes?: number): Promise<Order>;
    reject(id: string, reason?: string): Promise<Order>;
    complete(id: string): Promise<Order>;
    extendSla(id: string, additionalMinutes?: number): Promise<{ ok: boolean; newDeadline: string }>;
    getRiderLocation(id: string): Promise<{ location: { lat: number; lon: number; heading?: number; speed?: number; updatedAt: string }; deliveryId: string }>;
    reorder(id: string, clearExisting?: boolean): Promise<{ ok: boolean; addedItems: number }>;
    analytics(params?: { rangeDays?: AnalyticsRangeDays; shopId?: string }): Promise<VendorAnalyticsResponse>;
    getReceiptPdf(id: string): Promise<Blob>;
    createRefundRequest(
      orderId: string,
      params: {
        reason: string;
        requestedAmountCents?: number;
        conversationId?: string;
      },
    ): Promise<{ refundRequest: RefundRequest }>;
    getRefundRequest(orderId: string): Promise<{ refundRequest: RefundRequest | null }>;
  };
  pos: {
    checkout(payload: POSCheckoutPayload): Promise<Order>;
    queue(params: { shopId: string; status?: string; limit?: number; offset?: number }): Promise<Order[]>;
  };
  posHardware: {
    createPrintJob(data: PosCreatePrintJobPayload, options?: { shopId?: string }): Promise<{ job: PosPrintJobDiagnostic; deduped: boolean }>;
    listPrintJobs(query?: { status?: string; limit?: number }, options?: { shopId?: string }): Promise<{ jobs: PosPrintJobDiagnostic[]; count: number }>;
    cancelPrintJob(id: string, options?: { shopId?: string }): Promise<{ job: PosPrintJobDiagnostic; cancelled: boolean }>;
    updateJobStatus(id: string, data: PosPrintJobStatusUpdatePayload, options?: { shopId?: string }): Promise<{ job: PosPrintJobDiagnostic }>;
    sendHeartbeat(data: PosHardwareHeartbeatPayload, options?: { shopId?: string }): Promise<{ ok: boolean; device: PosHardwareDeviceDiagnostic; created: boolean }>;
  };
  cart: {
    get: (headers?: Record<string, string>) => Promise<CustomerCartSnapshot>;
    sync: (body: CartSyncBody, headers?: Record<string, string>) => Promise<CustomerCartSnapshot>;
    addItem(item: {
      productId?: string;
      name?: string;
      quantity?: number;
      unitPriceCents?: number;
    }): Promise<unknown>;
    updateItem(itemId: string, quantity: number): Promise<unknown>;
    removeItem(itemId: string): Promise<void>;
    merge: (guestSessionId: string, headers?: Record<string, string>) => Promise<CustomerCartSnapshot>;
  };
  addresses: {
    list(): Promise<{ addresses: CustomerAddress[] }>;
    create(params: Omit<CustomerAddress, 'id' | 'customerId' | 'createdAt'>): Promise<{ address: CustomerAddress }>;
    update(id: string, params: Partial<Omit<CustomerAddress, 'id' | 'customerId' | 'createdAt'>>): Promise<{ address: CustomerAddress }>;
    setDefault(id: string): Promise<{ ok: boolean }>;
    delete(id: string): Promise<{ ok: boolean }>;
  };
  favorites: {
    list(): Promise<{ favoriteShops: FavoriteShop[]; favoriteProducts: FavoriteProduct[] }>;
    addShop(shopId: string): Promise<{ ok: boolean }>;
    removeShop(shopId: string): Promise<{ ok: boolean }>;
    addProduct(productId: string): Promise<{ ok: boolean }>;
    removeProduct(productId: string): Promise<{ ok: boolean }>;
  };
  chat: {
    createConversation(params: {
      orderId: string;
      type: "customer_vendor" | "vendor_rider" | "customer_rider";
    }): Promise<Conversation>;
    listConversations(): Promise<Conversation[]>;
    getMessages(
      conversationId: string,
      page?: number
    ): Promise<Message[]>;
    sendMessage(
      conversationId: string,
      content: string
    ): Promise<Message>;
    markRead(conversationId: string): Promise<void>;
    createSupportTicket(params: {
      subject: string;
      message: string;
    }): Promise<{ conversation: Conversation; message: Message }>;
    /** Close or reopen a support ticket (customer owns the thread). */
    patchSupportStatus(
      conversationId: string,
      closed: boolean
    ): Promise<{ conversation: Conversation }>;
    getSupportRating(
      conversationId: string
    ): Promise<{ rating: SupportTicketRating | null }>;
    /** First submit only; server returns 403 if already rated. */
    putSupportRating(
      conversationId: string,
      params: { stars: number; comment?: string }
    ): Promise<{ rating: SupportTicketRating }>;
  };
  customerWallet: {
    get(): Promise<{ balanceCents: number; transactions: CustomerWalletTransaction[] }>;
    topupIntent(params: { amountCents: number; currency?: string }): Promise<PaymentIntentResponse>;
  };
  payments: {
    createIntent(params: {
      amountCents: number;
      walletAmountCents?: number;
      currency?: string;
      metadata?: Record<string, string>;
      checkoutDraft?: {
        groups: Array<{
          projectRef: string;
          shopId: string;
          items: Array<{
            productId?: string;
            name: string;
            quantity: number;
            unitPriceCents: number;
            notes?: string;
            modifiers?: Array<{
              modifierOptionId?: string;
              groupName: string;
              optionName: string;
              priceCents?: number;
            }>;
          }>;
          subtotalCents: number;
        }>;
        deliveryFeeCents: number;
        address: string;
        notes?: string | null;
        scheduledFor?: string | null;
        promoCode?: string | null;
      };
    }): Promise<PaymentIntentResponse>;
  };
  push: {
    register(token: string, platform: PushPlatform): Promise<void>;
    unregister(platform?: PushPlatform): Promise<void>;
  };
  ratings: {
    create(params: {
      orderId: string;
      toUserId: string;
      toRole: "vendor" | "rider";
      rating: number;
      comment?: string;
    }): Promise<Rating>;
    getByOrder(orderId: string): Promise<Rating[]>;
    getByUser(userId: string): Promise<{ ratings: Rating[]; average: number }>;
  };
  reviews: {
    create(params: {
      orderId: string;
      rating: number;
      comment?: string;
    }): Promise<ShopReview>;
    getMyOrderReview(orderId: string): Promise<ShopReview | null>;
    listShop(params: { shopId: string; limit?: number; offset?: number }): Promise<{ reviews: ShopReview[]; summary: ShopReviewSummary }>;
  };
  tips: {
    create(params: {
      orderId: string;
      toRiderId: string;
      amountCents: number;
    }): Promise<Tip>;
  };
  shops: {
    list(params?: { includeInactive?: boolean }): Promise<{ shops: Shop[] }>;
    get(shopId: string): Promise<{ shop: Shop }>;
    create(params: {
      name: string;
      slug: string;
      description?: string | null;
      logoUrl?: string | null;
      bannerUrl?: string | null;
      address?: string | null;
      phone?: string | null;
      lat?: number | null;
      lon?: number | null;
      deliveryGeofence?: GeoPolygon | null;
      operatingHours?: OperatingHours | null;
      timezone?: string;
      currency?: string | null;
      browseCategoryIds?: string[];
      isActive?: boolean;
    }): Promise<{ shop: Shop }>;
    update(shopId: string, params: Partial<{
      name: string;
      slug: string;
      description: string | null;
      logoUrl: string | null;
      bannerUrl: string | null;
      address: string | null;
      phone: string | null;
      lat: number | null;
      lon: number | null;
      deliveryGeofence: GeoPolygon | null;
      operatingHours: OperatingHours | null;
      timezone: string;
      currency: string | null;
      browseCategoryIds: string[];
      isActive: boolean;
    }>): Promise<{ shop: Shop }>;
    delete(shopId: string): Promise<{ ok: boolean }>;
    listUsers(shopId: string): Promise<{ users: Array<{ id: string; email: string; role: string }> }>;
    assignUser(shopId: string, userId: string): Promise<{ ok: boolean }>;
    removeUser(shopId: string, userId: string): Promise<{ ok: boolean }>;
    uploadShopImage(file: File | Blob): Promise<{ url: string }>;
  };
  vendorStripeConnect: {
    createAccountLink(): Promise<{ url: string }>;
    getStatus(): Promise<WorkspaceStripeConnectSummary>;
  };
  vendorSettings: {
    get(shopId?: string): Promise<VendorSettings | null>;
    update(settings: Partial<{
      autoAccept: boolean;
      defaultPrepTimeMinutes: number;
      deliveryMode: string;
      autoDispatchDelayMinutes: number;
      minimumOrderCents: number;
      cutleryOffered: boolean;
      cutleryFeeCents: number;
      customDietaryTags: Array<{ code: string; label: string }>;
    }>, shopId?: string): Promise<VendorSettings>;
  };
  workspace: {
    get(projectRef: string): Promise<{ workspace: Workspace }>;
    update(projectRef: string, params: Partial<{
      name: string;
      description: string | null;
      logoUrl: string | null;
      bannerUrl: string | null;
      address: string | null;
      phone: string | null;
    }>): Promise<{ workspace: Workspace }>;
    uploadLogo(file: File | Blob): Promise<{ url: string }>;
  };
  adminSettings: {
    get(): Promise<{ settings: AdminSettings }>;
    update(settings: Partial<{
      avgDeliveryTimeMinutes: number;
      autoDispatchDelayMinutes: number;
      maxSearchRadiusKm: number;
    }>): Promise<{ settings: AdminSettings }>;
  };
  promoCodes: {
    validate(params: { code: string; shopId?: string; subtotalCents: number; deliveryFeeCents?: number }): Promise<PromoValidationResult>;
    list(): Promise<{ promoCodes: PromoCode[] }>;
    create(params: Partial<PromoCode> & { code: string; type: string }): Promise<{ promoCode: PromoCode }>;
    update(id: string, params: Partial<PromoCode>): Promise<{ promoCode: PromoCode }>;
    delete(id: string): Promise<{ ok: boolean }>;
  };
  catalog: {
    listCategories(shopId?: string): Promise<{ categories: Category[] }>;
    createCategory(params: { name: string; sortOrder?: number }, shopId?: string): Promise<{ category: Category }>;
    updateCategory(id: string, params: Partial<{ name: string; sortOrder: number }>, shopId?: string): Promise<{ category: Category }>;
    deleteCategory(id: string, shopId?: string): Promise<{ ok: boolean }>;

    listProducts(params?: { includeUnavailable?: boolean }, shopId?: string): Promise<{ products: Product[] }>;
    createProduct(params: {
      name: string;
      description?: string | null;
      priceCents: number;
      category?: string | null;
      imageUrl?: string | null;
      barcode?: string | null;
      sku?: string | null;
      available?: boolean;
      sortOrder?: number;
      dietaryTags?: string[];
    }, shopId?: string): Promise<{ product: Product }>;
    bulkCreateProducts(
      params: {
        items: Array<{
          name: string;
          description?: string | null;
          priceCents: number;
          category?: string | null;
          imageUrl?: string | null;
          barcode?: string | null;
          sku?: string | null;
          available?: boolean;
          sortOrder?: number;
          dietaryTags?: string[];
          initialVariant?: {
            name: string;
            priceCents: number;
            sku?: string | null;
            barcode?: string | null;
            imageUrl?: string | null;
            available?: boolean;
            sortOrder?: number;
            stockQuantity?: number | null;
          };
        }>;
      },
      shopId?: string
    ): Promise<{
      created: number;
      categoriesCreated: number;
      dietaryTagsCreated: number;
      variantsCreated?: number;
      products: Product[];
    }>;
    updateProduct(id: string, params: Partial<{
      name: string;
      description: string | null;
      priceCents: number;
      category: string | null;
      imageUrl: string | null;
      barcode: string | null;
      sku: string | null;
      available: boolean;
      sortOrder: number;
      dietaryTags: string[];
    }>, shopId?: string): Promise<{ product: Product }>;
    deleteProduct(id: string, shopId?: string): Promise<{ ok: boolean }>;

    listProductVariants(productId: string, shopId?: string): Promise<{ variants: ProductVariant[] }>;
    createProductVariant(
      productId: string,
      params: {
        name: string;
        priceCents: number;
        imageUrl?: string | null;
        barcode?: string | null;
        sku?: string | null;
        available?: boolean;
        sortOrder?: number;
        stockQuantity?: number | null;
      },
      shopId?: string
    ): Promise<{ variant: ProductVariant }>;
    updateProductVariant(
      variantId: string,
      params: Partial<{
        name: string;
        priceCents: number;
        imageUrl: string | null;
        barcode: string | null;
        sku: string | null;
        available: boolean;
        sortOrder: number;
        stockQuantity: number | null;
      }>,
      shopId?: string
    ): Promise<{ variant: ProductVariant }>;
    deleteProductVariant(variantId: string, shopId?: string): Promise<{ ok: boolean }>;

    listModifierGroups(productId: string, shopId?: string): Promise<{ modifierGroups: ModifierGroup[] }>;
    createModifierGroup(productId: string, params: { name: string; required?: boolean; minSelections?: number; maxSelections?: number; sortOrder?: number }, shopId?: string): Promise<{ modifierGroup: ModifierGroup }>;
    updateModifierGroup(groupId: string, params: Partial<{ name: string; required: boolean; minSelections: number; maxSelections: number; sortOrder: number }>, shopId?: string): Promise<{ modifierGroup: ModifierGroup }>;
    deleteModifierGroup(groupId: string, shopId?: string): Promise<{ ok: boolean }>;
    createModifierOption(groupId: string, params: { name: string; priceCents?: number; isDefault?: boolean; sortOrder?: number }, shopId?: string): Promise<{ modifierOption: ModifierOption }>;
    updateModifierOption(optionId: string, params: Partial<{ name: string; priceCents: number; isDefault: boolean; sortOrder: number }>, shopId?: string): Promise<{ modifierOption: ModifierOption }>;
    deleteModifierOption(optionId: string, shopId?: string): Promise<{ ok: boolean }>;
    uploadProductImage(file: File | Blob): Promise<{ url: string }>;
  };
  public: {
    products(
      ref: string,
      table?: string
    ): Promise<Product[]>;
    workspace(ref: string): Promise<Workspace>;
    shops(ref: string, lat?: number, lon?: number): Promise<Shop[]>;
    shopDetail(ref: string, shopId: string): Promise<Shop>;
    shopProducts(ref: string, shopId: string): Promise<Product[]>;
    shopCategories(ref: string, shopId: string): Promise<Category[]>;
    geocode(address: string): Promise<{ lat: number; lon: number }>;
      reverseGeocode(
        lat: number,
        lon: number
      ): Promise<{ address: string | null; countryCode?: string | null }>;
    routeDirections(
      fromLat: number,
      fromLon: number,
      toLat: number,
      toLon: number
    ): Promise<{ coordinates: Array<{ lat: number; lon: number }>; source: string }>;
    deliveryCheck(ref: string, lat: number, lon: number): Promise<DeliveryCheck>;
    shopDeliveryCheck(ref: string, shopId: string, lat: number, lon: number): Promise<DeliveryCheck>;
    shopReviews(ref: string, shopId: string, params?: { limit?: number; offset?: number }): Promise<{ reviews: ShopReview[]; summary: ShopReviewSummary }>;
    theme(app: string, ref?: string): Promise<ResolvedTheme | null>;
    banners(placement?: string, projectRef?: string): Promise<{ banners: PlatformBanner[] }>;
    exchangeRates(base?: string): Promise<ExchangeRates>;
  };
}

function shopHeader(shopId?: string): Record<string, string> {
  return shopId ? { "x-shop-id": shopId } : {};
}

export function createApiClient(
  baseUrl: string,
  options: {
    getAuthToken?: () => string | null | Promise<string | null>;
    /** Sent on every request unless overridden by per-call headers (e.g. x-project-ref). */
    defaultHeaders?: Record<string, string>;
  } = {}
): ApiClient {
  const defaultHeaders = options.defaultHeaders;
  // CSRF token state management
  const csrfState: { token: string | null; fetchToken: () => Promise<string> } = {
    token: null,
    fetchToken: async () => {
      const res = await fetch(`${baseUrl}/api/csrf-token`, {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error("Failed to fetch CSRF token");
      }
      const data = await res.json();
      csrfState.token = data.csrfToken;
      return data.csrfToken;
    },
  };

  /**
   * FormData upload helper with full CSRF refresh-and-retry parity.
   * Wraps `requestMultipart()` so every multipart call-site gets the same
   * 403-stale-CSRF recovery path as JSON `request()` — otherwise a rotated
   * CSRF cookie silently bricks file uploads until a page reload.
   */
  const multipart = <T>(
    path: string,
    formData: FormData,
    method: string = "POST",
  ): Promise<T> =>
    requestMultipart<T>(
      baseUrl,
      path,
      formData,
      options.getAuthToken,
      csrfState,
      defaultHeaders,
      method,
    );

  const get = <T>(path: string, headers?: Record<string, string>) =>
    request<T>(baseUrl, path, headers ? { headers } : {}, options.getAuthToken, csrfState, defaultHeaders);
  const post = <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    request<T>(baseUrl, path, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
      ...(headers ? { headers } : {}),
    }, options.getAuthToken, csrfState, defaultHeaders);
  const patch = <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    request<T>(baseUrl, path, {
      method: "PATCH",
      body: body ? JSON.stringify(body) : undefined,
      ...(headers ? { headers } : {}),
    }, options.getAuthToken, csrfState, defaultHeaders);
  const put = <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    request<T>(baseUrl, path, {
      method: "PUT",
      body: body ? JSON.stringify(body) : undefined,
      ...(headers ? { headers } : {}),
    }, options.getAuthToken, csrfState, defaultHeaders);
  const del = <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    request<T>(baseUrl, path, {
      method: "DELETE",
      body: body ? JSON.stringify(body) : undefined,
      ...(headers ? { headers } : {}),
    }, options.getAuthToken, csrfState, defaultHeaders);

  return {
    auth: {
      sendOTP: (phoneOrParams: string | { projectRef?: string; channel?: "phone" | "email"; phone?: string; email?: string }, projectRef?: string) => {
        const body = typeof phoneOrParams === "string"
          ? {
              phone: phoneOrParams,
              ...(projectRef ? { projectRef } : {}),
              channel: "phone" as const,
            }
          : phoneOrParams;
        return post<{ ok: boolean; channel?: "phone" | "email"; debugOtp?: string }>("/api/auth/otp/send", body);
      },
      verifyOTP: (params) => post("/api/auth/otp/verify", params),
      customerDemoLogin: (params) =>
        post<{ customer: Customer; created: boolean; token?: string; demo: true }>(
          "/api/auth/customer/demo-login",
          params,
        ),
      customerRecoverySend: (params) =>
        post<{ ok: boolean; debugOtp?: string }>("/api/auth/customer/recovery/send", params),
      customerRecoveryVerify: (params) =>
        post<{ customer: Customer; recovered: boolean; token?: string }>("/api/auth/customer/recovery/verify", params),
      updateCustomerProfile: (params) =>
        patch<{ customer: Customer; token?: string }>("/api/auth/customer/profile", params),
      uploadCustomerAvatar: (file) => {
        const formData = new FormData();
        // React Native passes `{ uri, name, type }`; browsers pass File/Blob.
        formData.append("photo", file as never);
        return multipart<{ customer: Customer; token?: string }>(
          "/api/auth/customer/avatar",
          formData,
        );
      },
      deleteCustomerAvatar: () =>
        del<{ customer: Customer; token?: string }>("/api/auth/customer/avatar"),
      login: (email, password) =>
        post("/api/auth/login", { email, password }),
      login2FA: (sessionToken, totpToken) =>
        post("/api/auth/2fa/login", { sessionToken, totpToken }),
      logout: () => post("/api/auth/customer/logout"),
      logoutAdmin: () => post("/api/auth/logout"),
      getSession: () =>
        get<{ customer: Customer } | null>("/api/auth/customer/session").catch(
          () => null
        ),
      getAdminSession: () =>
        get<{ user: User } | null>("/api/auth/session").catch(() => null),
    },
    orders: {
      list: (params) => {
        const qs = new URLSearchParams();
        if (params?.status) qs.set("status", params.status);
        if (params?.limit) qs.set("limit", String(params.limit));
        if (params?.offset) qs.set("offset", String(params.offset));
        if (params?.shopId) qs.set("shopId", params.shopId);
        const q = qs.toString();
        return get<{ orders: unknown[] }>(`/api/orders${q ? `?${q}` : ""}`).then(
          (r) =>
            (r.orders ?? [])
              .map((row) => normalizeOrder(row))
              .filter((o): o is Order => o !== null)
        );
      },
      get: (id) =>
        get<unknown>(`/api/orders/${id}`).then((res) => {
          const payload =
            res && typeof res === "object" && res !== null && "order" in res
              ? (res as { order: unknown }).order
              : res;
          const normalized = normalizeOrder(payload);
          if (!normalized) {
            throw new Error("Invalid order response");
          }
          return { ...normalized, items: normalized.items ?? [] };
        }),
      updateStatus: (id, status) =>
        patch(`/api/orders/${id}/status`, { status }),
      cancel: (id, params) => post(`/api/orders/${id}/cancel`, params),
      refund: (id, params) => post(`/api/orders/${id}/refund`, params),
      accept: (id, prepTimeMinutes) =>
        post(`/api/orders/${id}/accept`, prepTimeMinutes ? { prepTimeMinutes } : {}),
      reject: (id, reason) =>
        post(`/api/orders/${id}/reject`, reason ? { reason } : {}),
      complete: (id) => post(`/api/orders/${id}/complete`),
      extendSla: (id, additionalMinutes) => post(`/api/orders/${id}/extend-sla`, additionalMinutes ? { additionalMinutes } : {}),
      getRiderLocation: (id) => get(`/api/orders/${id}/rider-location`),
      analytics: (params) => {
        const qs = new URLSearchParams();
        if (params?.rangeDays) qs.set("rangeDays", String(params.rangeDays));
        if (params?.shopId) qs.set("shopId", params.shopId);
        const q = qs.toString();
        return get(`/api/orders/analytics${q ? `?${q}` : ""}`);
      },
      reorder: (id, clearExisting = true) =>
        post(`/api/orders/${id}/reorder`, { clearExisting }),
      getReceiptPdf: (id: string) =>
        requestBinary(baseUrl, `/api/orders/${id}/receipt.pdf`, options.getAuthToken, csrfState, defaultHeaders),
      createRefundRequest: (orderId, params) =>
        post<{ refundRequest: RefundRequest }>(`/api/orders/${orderId}/refund-requests`, params),
      getRefundRequest: (orderId) =>
        get<{ refundRequest: RefundRequest | null }>(`/api/orders/${orderId}/refund-requests`),
    },
    pos: {
      checkout: (payload) =>
        post<{ order: Order }>("/api/orders/pos/checkout", payload).then((r) => r.order),
      queue: (params) => {
        const qs = new URLSearchParams();
        qs.set("shopId", params.shopId);
        if (params.status) qs.set("status", params.status);
        if (params.limit) qs.set("limit", String(params.limit));
        if (params.offset) qs.set("offset", String(params.offset));
        return get<{ orders: unknown[] }>(`/api/orders?${qs.toString()}`).then(
          (r) =>
            (r.orders ?? [])
              .map((row) => normalizeOrder(row))
              .filter((o): o is Order => o !== null)
        );
      },
    },
    posHardware: {
      createPrintJob: (data, options) =>
        post<{ job: PosPrintJobDiagnostic; deduped: boolean }>(
          "/api/pos-hardware/print-jobs",
          data,
          shopHeader(options?.shopId)
        ),
      listPrintJobs: (query, options) => {
        const q = query ? new URLSearchParams(Object.entries(query).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])).toString() : "";
        return get<{ jobs: PosPrintJobDiagnostic[]; count: number }>(
          `/api/pos-hardware/print-jobs${q ? `?${q}` : ""}`,
          shopHeader(options?.shopId)
        );
      },
      cancelPrintJob: (id, options) =>
        post<{ job: PosPrintJobDiagnostic; cancelled: boolean }>(
          `/api/pos-hardware/print-jobs/${encodeURIComponent(id)}/cancel`,
          {},
          shopHeader(options?.shopId)
        ),
      updateJobStatus: (id, data, options) =>
        patch<{ job: PosPrintJobDiagnostic }>(
          `/api/pos-hardware/print-jobs/${encodeURIComponent(id)}/status`,
          data,
          shopHeader(options?.shopId)
        ),
      sendHeartbeat: (data, options) =>
        post<{ ok: boolean; device: PosHardwareDeviceDiagnostic; created: boolean }>(
          "/api/pos-hardware/devices/heartbeat",
          data,
          shopHeader(options?.shopId)
        ),
    },
    cart: {
      get: (headers) =>
        get<{ cart: CustomerCartSnapshot }>("/api/cart", headers).then(
          (r) => r.cart ?? { items: [], totalCents: 0 }
        ),
      sync: (body, headers) =>
        put<{ cart: CustomerCartSnapshot }>("/api/cart", body, headers).then(
          (r) => r.cart ?? { items: [], totalCents: 0 }
        ),
      addItem: (item) => post("/api/cart", item),
      updateItem: (itemId, quantity) =>
        patch(`/api/cart/${itemId}`, { quantity }),
      removeItem: (itemId) => del(`/api/cart/${itemId}`),
      merge: (guestSessionId, headers) =>
        post<{ cart: CustomerCartSnapshot }>(
          "/api/cart/merge",
          { guestSessionId },
          headers
        ).then((r) => r.cart ?? { items: [], totalCents: 0 }),
    },
    addresses: {
      list: () => get("/api/addresses"),
      create: (params) => post("/api/addresses", params),
      update: (id, params) => patch(`/api/addresses/${id}`, params),
      setDefault: (id) => post(`/api/addresses/${id}/default`),
      delete: (id) => del(`/api/addresses/${id}`),
    },
    favorites: {
      list: () => get("/api/favorites"),
      addShop: (shopId) => post(`/api/favorites/shops/${shopId}`),
      removeShop: (shopId) => del(`/api/favorites/shops/${shopId}`),
      addProduct: (productId) => post(`/api/favorites/products/${productId}`),
      removeProduct: (productId) => del(`/api/favorites/products/${productId}`),
    },
    customerWallet: {
      get: () =>
        get<{ balanceCents: number; transactions: CustomerWalletTransaction[] }>("/api/customer/wallet"),
      topupIntent: (params) =>
        post<PaymentIntentResponse>("/api/customer/wallet/topup-intent", params),
    },
    chat: {
      createConversation: (params) =>
        post("/api/chat/conversations", params),
      listConversations: () =>
        get<{ conversations: Conversation[] }>("/api/chat/conversations").then(
          (r) => r.conversations
        ),
      getMessages: (conversationId, page) =>
        get<{ messages: Message[] }>(
          `/api/chat/conversations/${conversationId}/messages${page ? `?page=${page}` : ""}`
        ).then((r) => r.messages),
      sendMessage: (conversationId, content) =>
        post<{ message: Message }>(`/api/chat/conversations/${conversationId}/messages`, {
          content,
        }).then((r) => r.message),
      markRead: (conversationId) =>
        patch(`/api/chat/conversations/${conversationId}/read`),
      createSupportTicket: (params) =>
        post<{ conversation: Conversation; message: Message }>(
          "/api/chat/support-tickets",
          params
        ),
      patchSupportStatus: (conversationId, closed) =>
        patch<{ conversation: Conversation }>(
          `/api/chat/conversations/${conversationId}/support-status`,
          { closed }
        ),
      getSupportRating: (conversationId) =>
        get<{ rating: SupportTicketRating | null }>(
          `/api/chat/conversations/${conversationId}/support-rating`
        ),
      putSupportRating: (conversationId, params) =>
        put<{ rating: SupportTicketRating }>(
          `/api/chat/conversations/${conversationId}/support-rating`,
          params
        ),
    },
    payments: {
      createIntent: (params) => post("/api/payments/create-intent", params),
    },
    push: {
      register: (token, platform) =>
        post("/api/push/register", { token, platform }),
      unregister: (platform) =>
        del(
          `/api/push/register${platform ? `?platform=${encodeURIComponent(platform)}` : ""}`,
          undefined,
        ),
    },
    ratings: {
      create: (params) => post("/api/ratings", params),
      getByOrder: (orderId) => get(`/api/ratings/order/${orderId}`),
      getByUser: (userId) => get(`/api/ratings/user/${userId}`),
    },
    reviews: {
      create: (params) => post<{ review: ShopReview }>("/api/reviews", params).then((r) => r.review),
      getMyOrderReview: (orderId) =>
        get<{ review: ShopReview | null }>(`/api/reviews/order/${orderId}/me`).then((r) => r.review),
      listShop: (params) => {
        const qs = new URLSearchParams();
        qs.set("shopId", params.shopId);
        if (params.limit) qs.set("limit", String(params.limit));
        if (params.offset) qs.set("offset", String(params.offset));
        return get<{ reviews: ShopReview[]; summary: ShopReviewSummary }>(`/api/reviews/shop?${qs.toString()}`);
      },
    },
    tips: {
      create: (params) => post("/api/tips", params),
    },
    shops: {
      list: (params) => {
        const qs = new URLSearchParams();
        if (params?.includeInactive) qs.set("includeInactive", "true");
        const q = qs.toString();
        return get(`/api/shops${q ? `?${q}` : ""}`);
      },
      get: (shopId) => get(`/api/shops/${shopId}`),
      create: (params) => post("/api/shops", params),
      update: (shopId, params) => patch(`/api/shops/${shopId}`, params),
      delete: (shopId) => del(`/api/shops/${shopId}`),
      listUsers: (shopId) => get(`/api/shops/${shopId}/users`),
      assignUser: (shopId, userId) => post(`/api/shops/${shopId}/users`, { userId }),
      removeUser: (shopId, userId) => del(`/api/shops/${shopId}/users/${userId}`),
      uploadShopImage: (file) => {
        const formData = new FormData();
        formData.append("image", file);
        return multipart<{ url: string }>("/api/uploads/shop-image", formData);
      },
    },
    vendorSettings: {
      get: (shopId) => {
        const qs = shopId ? `?shopId=${shopId}` : "";
        return get<{ settings: VendorSettings | null }>(`/api/vendor-settings${qs}`).then((r) => r.settings ?? null);
      },
      update: (settings, shopId) => {
        const body = shopId ? { ...settings, shopId } : settings;
        return patch<{ settings: VendorSettings }>("/api/vendor-settings", body).then((r) => r.settings);
      },
    },
    vendorStripeConnect: {
      createAccountLink: () => post("/api/vendor/stripe-connect/account-link", {}),
      getStatus: () => get("/api/vendor/stripe-connect/status"),
    },
    workspace: {
      get: (projectRef) => get(`/api/workspace/${projectRef}`),
      update: (projectRef, params) => patch(`/api/workspace/${projectRef}`, params),
      uploadLogo: (file) => {
        const formData = new FormData();
        formData.append("logo", file);
        return multipart<{ url: string }>("/api/uploads/workspace-logo", formData);
      },
    },
    adminSettings: {
      get: () => get("/api/admin-settings"),
      update: (settings) => patch("/api/admin-settings", settings),
    },
    promoCodes: {
      validate: (params) => post("/api/promo-codes/validate", params),
      list: () => get("/api/promo-codes"),
      create: (params) => post("/api/promo-codes", params),
      update: (id, params) => patch(`/api/promo-codes/${id}`, params),
      delete: (id) => del(`/api/promo-codes/${id}`),
    },
    catalog: {
      listCategories: (shopId) =>
        get("/api/catalog/categories", shopHeader(shopId)),
      createCategory: (params, shopId) =>
        post("/api/catalog/categories", params, shopHeader(shopId)),
      updateCategory: (id, params, shopId) =>
        patch(`/api/catalog/categories/${id}`, params, shopHeader(shopId)),
      deleteCategory: (id, shopId) =>
        del(`/api/catalog/categories/${id}`, undefined, shopHeader(shopId)),

      listProducts: (params, shopId) => {
        const qs = new URLSearchParams();
        if (params?.includeUnavailable === false) qs.set("includeUnavailable", "false");
        const q = qs.toString();
        return get(`/api/catalog/products${q ? `?${q}` : ""}`, shopHeader(shopId));
      },
      createProduct: (params, shopId) =>
        post("/api/catalog/products", params, shopHeader(shopId)),
      bulkCreateProducts: (params, shopId) =>
        post("/api/catalog/products/bulk", params, shopHeader(shopId)),
      updateProduct: (id, params, shopId) =>
        patch(`/api/catalog/products/${id}`, params, shopHeader(shopId)),
      deleteProduct: (id, shopId) =>
        del(`/api/catalog/products/${id}`, undefined, shopHeader(shopId)),

      listProductVariants: (productId, shopId) =>
        get(`/api/catalog/products/${productId}/variants`, shopHeader(shopId)),
      createProductVariant: (productId, params, shopId) =>
        post(`/api/catalog/products/${productId}/variants`, params, shopHeader(shopId)),
      updateProductVariant: (variantId, params, shopId) =>
        patch(`/api/catalog/product-variants/${variantId}`, params, shopHeader(shopId)),
      deleteProductVariant: (variantId, shopId) =>
        del(`/api/catalog/product-variants/${variantId}`, undefined, shopHeader(shopId)),

      listModifierGroups: (productId, shopId) =>
        get(`/api/catalog/products/${productId}/modifiers`, shopHeader(shopId)),
      createModifierGroup: (productId, params, shopId) =>
        post(`/api/catalog/products/${productId}/modifiers`, params, shopHeader(shopId)),
      updateModifierGroup: (groupId, params, shopId) =>
        patch(`/api/catalog/modifiers/groups/${groupId}`, params, shopHeader(shopId)),
      deleteModifierGroup: (groupId, shopId) =>
        del(`/api/catalog/modifiers/groups/${groupId}`, undefined, shopHeader(shopId)),
      createModifierOption: (groupId, params, shopId) =>
        post(`/api/catalog/modifiers/groups/${groupId}/options`, params, shopHeader(shopId)),
      updateModifierOption: (optionId, params, shopId) =>
        patch(`/api/catalog/modifiers/options/${optionId}`, params, shopHeader(shopId)),
      deleteModifierOption: (optionId, shopId) =>
        del(`/api/catalog/modifiers/options/${optionId}`, undefined, shopHeader(shopId)),
      uploadProductImage: (file) => {
        const formData = new FormData();
        formData.append("image", file);
        return multipart<{ url: string }>("/api/uploads/product-image", formData);
      },
    },
    public: {
      products: (ref, table = "products") =>
        get<unknown>(`/api/public/${ref}/${table}`).then((data) => {
          if (Array.isArray(data)) return data as Product[];
          if (
            data &&
            typeof data === "object" &&
            "products" in data &&
            Array.isArray((data as any).products)
          )
            return (data as any).products as Product[];
          if (
            data &&
            typeof data === "object" &&
            "items" in data &&
            Array.isArray((data as any).items)
          )
            return (data as any).items as Product[];
          return [];
        }),
      workspace: (ref) => get(`/api/workspace/${ref}`),
      shops: (ref, lat?, lon?) => {
        const qs = new URLSearchParams();
        if (lat != null) qs.set("lat", String(lat));
        if (lon != null) qs.set("lon", String(lon));
        const q = qs.toString();
        return get<{ shops: Shop[] }>(`/api/public/${ref}/shops${q ? `?${q}` : ""}`).then((r) => r.shops);
      },
      shopDetail: (ref, shopId) =>
        get<{ shop: Shop }>(`/api/public/${ref}/shops/${shopId}`).then((r) => r.shop),
      shopProducts: (ref, shopId) =>
        get<{ products: Product[] }>(`/api/public/${ref}/shops/${shopId}/products`).then((r) => r.products),
      shopCategories: (ref, shopId) =>
        get<{ categories: Category[] }>(`/api/public/${ref}/shops/${shopId}/categories`).then((r) => r.categories),
      geocode: (address) =>
        get(`/api/geocode?address=${encodeURIComponent(address)}`),
      reverseGeocode: (lat, lon) =>
        get<{ address: string | null; countryCode?: string | null }>(
          `/api/reverse-geocode?lat=${lat}&lon=${lon}`
        ),
      /** Rider → dropoff path for live tracking (Google Directions or OSRM fallback). */
      routeDirections: (fromLat: number, fromLon: number, toLat: number, toLon: number) =>
        get<{ coordinates: Array<{ lat: number; lon: number }>; source: string }>(
          `/api/route-directions?fromLat=${encodeURIComponent(String(fromLat))}&fromLon=${encodeURIComponent(String(fromLon))}&toLat=${encodeURIComponent(String(toLat))}&toLon=${encodeURIComponent(String(toLon))}`,
        ),
      deliveryCheck: (ref, lat, lon) =>
        get(`/api/public/${ref}/delivery-check?lat=${lat}&lon=${lon}`),
      shopDeliveryCheck: (ref, shopId, lat, lon) =>
        get(`/api/public/${ref}/shops/${shopId}/delivery-check?lat=${lat}&lon=${lon}`),
      shopReviews: (ref, shopId, params) => {
        const qs = new URLSearchParams();
        if (params?.limit) qs.set("limit", String(params.limit));
        if (params?.offset) qs.set("offset", String(params.offset));
        const q = qs.toString();
        return get<{ reviews: ShopReview[]; summary: ShopReviewSummary }>(`/api/public/${ref}/shops/${shopId}/reviews${q ? `?${q}` : ""}`);
      },
      theme: (app, ref?) => {
        const qs = new URLSearchParams({ app });
        if (ref) qs.set("ref", ref);
        return get<ResolvedTheme>(`/api/public/theme?${qs}`).catch(() => null);
      },
      banners: (placement, projectRef) => {
        const qs = new URLSearchParams();
        qs.set("placement", placement ?? "home_promotions");
        if (projectRef) qs.set("ref", projectRef);
        return get<{ banners: PlatformBanner[] }>(`/api/public/banners?${qs.toString()}`);
      },
      exchangeRates: (base) =>
        get(`/api/public/exchange-rates?base=${encodeURIComponent(base ?? "gbp")}`),
    },
    };
}
