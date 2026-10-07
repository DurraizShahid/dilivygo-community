'use strict';

const config = require('../config');
const { getPublicRouteDirections } = require('../lib/route-directions');
const { select } = require('../lib/supabase');
const cache = require('../lib/cache');
const {
  mapProduct,
  mapProductVariant,
  mapModifierGroup,
  mapCategory,
  mapWorkspace,
  mapShop,
} = require('../lib/case');
const shopReviewModel = require('../models/shop-review.model');
const { pointInPolygon, getEffectiveGeofence, haversineKm } = require('../lib/geo');
const { mergePublicDietaryPresets } = require('../lib/dietary-tags');
const { parseBrowseCategoryPresets } = require('../lib/browse-categories');
const { resolveShopCurrencySync, getPlatformCurrency, validCurrency } = require('../lib/currency');
const exchangeRateService = require('../services/exchange-rate.service');
const { getShopOpenState } = require('../lib/shop-hours');
const { MARKETPLACE_PUBLIC_REF } = require('../lib/platform-constants');
const { getDefaultProfilePhotoUrls } = require('../lib/default-profile-photo-urls');
const { resolveOrganizationContext } = require('../lib/organization-context');

function isMarketplacePublicRef(ref) {
  return String(ref) === MARKETPLACE_PUBLIC_REF;
}

/**
 * Resolve the public scope for a `ref` param.
 *
 * A `ref` can be:
 *   - An organization `public_ref`  → browse all shops across workspaces in that org.
 *   - A workspace `project_ref`     → browse shops for that single workspace (legacy).
 *   - `_marketplace`                → deployment-wide (deprecated; used by legacy apps).
 *
 * @param {string} ref
 */
async function resolvePublicScope(ref) {
  if (isMarketplacePublicRef(ref)) {
    return { kind: 'marketplace', ref };
  }
  const ctx = await resolveOrganizationContext(ref);
  if (!ctx) return { kind: 'unknown', ref };
  if (ctx.workspace) {
    return { kind: 'workspace', ref, projectRef: ctx.workspace.project_ref, organizationId: ctx.organizationId };
  }
  return { kind: 'organization', ref, organizationId: ctx.organizationId };
}

/** Resolve shop + workspace row honoring org / workspace / marketplace scopes. */
async function shopAndWorkspaceForPublic(ref, shopId) {
  const scope = await resolvePublicScope(ref);
  let shopFilters;
  if (scope.kind === 'marketplace' || scope.kind === 'unknown') {
    shopFilters = { id: shopId };
  } else if (scope.kind === 'workspace') {
    shopFilters = { id: shopId, project_ref: scope.projectRef };
  } else {
    shopFilters = { id: shopId, organization_id: scope.organizationId };
  }
  const shopRows = await select('shops', { filters: shopFilters, limit: 1 });
  const shop = shopRows?.[0];
  if (!shop) return { shop: null, workspace: null, scope };
  const wsRows = await select('workspaces', { filters: { project_ref: shop.project_ref }, limit: 1 });
  return { shop, workspace: wsRows?.[0] || null, scope };
}

async function healthCheck(req, res) {
  return res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    env: config.env,
  });
}

async function publicRead(req, res, next) {
  try {
    const { ref, table } = req.params;

    const ALLOWED_PUBLIC_TABLES = [
      'products', 'categories', 'menus', 'workspaces',
      'orders', 'deliveries',
    ];

    if (!ALLOWED_PUBLIC_TABLES.includes(table)) {
      return res.status(403).json({ error: 'Table not publicly accessible' });
    }

    const filters = { project_ref: ref };

    if ((table === 'orders' || table === 'deliveries') && !req.query.orderId) {
      return res.status(400).json({ error: 'orderId filter is required for this table' });
    }
    if (req.query.orderId) {
      if (table === 'deliveries') filters.order_id = req.query.orderId;
      else filters.id = req.query.orderId;
    }

    const rows = await select(table, { filters });
    const data = (rows || []).map((r) => {
      if (table === 'products') return mapProduct(r, { forCustomer: true });
      if (table === 'categories') return mapCategory(r);
      if (table === 'workspaces') return mapWorkspace(r);
      return r;
    });
    return res.json({ data });
  } catch (err) {
    next(err);
  }
}

/**
 * Build the full shop-list payload for a `ref` (scope-resolved). Raw shop rows
 * and settings are kept on the cached entries as `_raw` / `_settings` so the
 * post-cache `lat`/`lon` geofence filter can still honour per-shop polygons
 * without re-hitting Supabase. Callers strip those before responding.
 */
async function loadShopListForRef(ref) {
  const scope = await resolvePublicScope(ref);

  let shopFilters;
  if (scope.kind === 'organization') {
    shopFilters = { is_active: true, organization_id: scope.organizationId };
  } else if (scope.kind === 'workspace') {
    shopFilters = { is_active: true, project_ref: scope.projectRef };
  } else {
    shopFilters = { is_active: true };
  }

  const currencyOpts =
    scope.kind === 'workspace' ? { projectRef: scope.projectRef } : undefined;

  const [rows, wsRows, platformCurrency] = await Promise.all([
    select('shops', { filters: shopFilters, order: 'created_at.asc' }),
    scope.kind === 'workspace'
      ? select('workspaces', { filters: { project_ref: scope.projectRef }, limit: 1 })
      : Promise.resolve([]),
    getPlatformCurrency(currencyOpts),
  ]);

  const workspaceMap = new Map();
  if (scope.kind === 'organization' && rows?.length) {
    const allWsRows = await select('workspaces', {
      filters: { organization_id: scope.organizationId },
      limit: 500,
    });
    for (const ws of allWsRows || []) {
      if (ws?.project_ref) workspaceMap.set(ws.project_ref, ws);
    }
  } else if (scope.kind === 'marketplace' && rows?.length) {
    const allWsRows = await select('workspaces', { limit: 500 });
    for (const ws of allWsRows || []) {
      if (ws?.project_ref) workspaceMap.set(ws.project_ref, ws);
    }
  } else {
    const workspace = wsRows?.[0] || null;
    if (workspace) workspaceMap.set(ref, workspace);
  }

  const vendorSettingsModel = require('../models/vendor-settings.model');
  const shops = await Promise.all(
    (rows || []).map(async (raw) => {
      const mapped = mapShop(raw);
      const shopWorkspace = workspaceMap.get(raw.project_ref) || null;
      mapped.currency = resolveShopCurrencySync(raw, shopWorkspace, platformCurrency);
      mapped.isOpen = getShopOpenState(raw).isOpen;
      const settings = await vendorSettingsModel.findByShopId(raw.id);
      mapped.minimumOrderCents = settings?.minimum_order_cents ?? 0;
      const radiusRaw = settings?.delivery_radius_km;
      mapped.deliveryRadiusKm =
        radiusRaw != null && Number.isFinite(Number(radiusRaw))
          ? Number(radiusRaw)
          : 5.0;
      mapped._settings = settings;
      mapped._raw = raw;
      return mapped;
    }),
  );

  return shops;
}

async function listShops(req, res, next) {
  try {
    const { ref } = req.params;
    const lat = req.query.lat ? parseFloat(req.query.lat) : null;
    const lon = req.query.lon ? parseFloat(req.query.lon) : null;

    // Cache the heavy payload keyed by `ref` only — geofence filter is purely
    // in-memory, so all lat/lon variations share one cached list per tenant.
     const cached = await cache.wrap(
       'public:shops',
       `ref:${String(ref).toLowerCase()}`,
       () => loadShopListForRef(ref),
       { req },
     );

    let shops = cached;
    if (lat != null && lon != null && !isNaN(lat) && !isNaN(lon)) {
      const filtered = [];
      for (const shop of shops) {
        const geofence = getEffectiveGeofence(shop._raw, shop._settings);
        if (!geofence) {
          filtered.push(shop);
          continue;
        }
        if (pointInPolygon(lat, lon, geofence)) {
          filtered.push(shop);
        }
      }
      shops = filtered;
    }

    // Strip the cache-only fields without mutating the cached copy.
    const payload = shops.map((s) => {
      const { _settings, _raw, ...rest } = s;
      return rest;
    });
    return res.json({ shops: payload });
  } catch (err) {
    next(err);
  }
}

/**
 * Build the full menu payload (products + modifiers + variants) for a shop.
 * Pure helper so the dietary-tag-filtered path can skip the cache without
 * duplicating this logic.
 */
async function loadShopMenu(shopId, rawFilters) {
  const rows = await select('products', {
    filters: { shop_id: shopId, available: true },
    rawFilters,
    order: 'sort_order.asc,created_at.desc',
  });
  const products = (rows || []).map((r) => mapProduct(r, { forCustomer: true }));

  const productIds = products.map((p) => p.id);
  if (productIds.length) {
    const modifierModel = require('../models/modifier.model');
    const productVariantModel = require('../models/product-variant.model');
    const [modifiersByProduct, variantsByProduct] = await Promise.all([
      modifierModel.listGroupsByProducts(productIds),
      productVariantModel.listByProductIds(productIds),
    ]);
    for (const product of products) {
      product.modifierGroups = (modifiersByProduct[product.id] || []).map(mapModifierGroup);
      const vrows = variantsByProduct[product.id] || [];
      product.variants = vrows.map((r) => mapProductVariant(r, { forCustomer: true }));
      const availPrices = product.variants.filter((v) => v.available).map((v) => v.priceCents);
      if (availPrices.length) {
        product.priceCents = Math.min(...availPrices);
      } else if (product.variants.length) {
        product.priceCents = Math.min(...product.variants.map((v) => v.priceCents));
      }
    }
  }
  return products;
}

async function shopProducts(req, res, next) {
  try {
    const { ref, shopId } = req.params;

    const [sw, platformCurrency] = await Promise.all([
      shopAndWorkspaceForPublic(ref, shopId),
      getPlatformCurrency({ projectRef: ref }),
    ]);
    const shop = sw.shop;
    if (!shop) return res.status(404).json({ error: 'Shop not found' });

    const currency = resolveShopCurrencySync(shop, sw.workspace, platformCurrency);

    const dietaryTagQueryPattern = /^[a-z][a-z0-9_]{0,47}$/;
    const rawFilters = [];
    if (req.query.dietaryTags) {
      const tags = req.query.dietaryTags
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter((t) => dietaryTagQueryPattern.test(t));
      if (tags.length) {
        rawFilters.push(`dietary_tags=cs.{${tags.join(',')}}`);
      }
    }

    // Only cache the unfiltered "full menu" path — dietary-tag filtering is
    // rarer and would explode the cache key space. Filtered requests go
    // straight to Supabase.
    const products = rawFilters.length
      ? await loadShopMenu(shopId, rawFilters)
       : await cache.wrap('public:catalog:products', `shop:${shopId}`, () =>
           loadShopMenu(shopId, rawFilters),
           { req },
         );

    return res.json({ products, currency });
  } catch (err) {
    next(err);
  }
}

async function shopCategories(req, res, next) {
  try {
    const { ref, shopId } = req.params;

    const [sw, platformCurrency] = await Promise.all([
      shopAndWorkspaceForPublic(ref, shopId),
      getPlatformCurrency({ projectRef: ref }),
    ]);
    if (!sw.shop) return res.status(404).json({ error: 'Shop not found' });

    const currency = resolveShopCurrencySync(sw.shop, sw.workspace, platformCurrency);

     const rows = await cache.wrap('public:catalog:categories', `shop:${shopId}`, () =>
       select('categories', {
         filters: { shop_id: shopId },
         order: 'sort_order.asc,name.asc',
       }),
       { req },
     );
    return res.json({ categories: (rows || []).map(mapCategory), currency });
  } catch (err) {
    next(err);
  }
}

async function shopDetail(req, res, next) {
  try {
    const { ref, shopId } = req.params;
    const refKey = String(ref).toLowerCase();

     const mapped = await cache.wrap(
       'public:shop-detail',
       `ref:${refKey}:shop:${shopId}`,
       async () => {
         const platformSettings = require('../models/platform-settings.model');
         const vendorSettingsModel = require('../models/vendor-settings.model');
         const themeOpts = { projectRef: ref };
         const [sw, platformCurrency, settings, cutleryRaw] = await Promise.all([
           shopAndWorkspaceForPublic(ref, shopId),
           getPlatformCurrency(themeOpts),
           vendorSettingsModel.findByShopId(shopId),
           platformSettings.get('customer_cutlery_enabled', themeOpts),
         ]);
         const shop = sw.shop;
         if (!shop) return null;
         const m = mapShop(shop);
         m.currency = resolveShopCurrencySync(shop, sw.workspace, platformCurrency);
         m.isOpen = getShopOpenState(shop).isOpen;
         m.minimumOrderCents = settings?.minimum_order_cents ?? 0;
         const cutleryPlatformOn = cutleryRaw !== 'false';
         if (cutleryPlatformOn) {
           m.cutleryOffered = Boolean(settings?.cutlery_offered);
           m.cutleryFeeCents = Math.max(0, Number(settings?.cutlery_fee_cents ?? 0));
         }
         return m;
       },
       { req },
     );

    if (!mapped) return res.status(404).json({ error: 'Shop not found' });
    return res.json({ shop: mapped });
  } catch (err) {
    next(err);
  }
}

function parseRouteQueryCoords(req) {
  const fromLat = parseFloat(req.query.fromLat);
  const fromLon = parseFloat(req.query.fromLon);
  const toLat = parseFloat(req.query.toLat);
  const toLon = parseFloat(req.query.toLon);
  if ([fromLat, fromLon, toLat, toLon].some((n) => Number.isNaN(n))) {
    return { error: 'fromLat, fromLon, toLat, and toLon query params are required numbers' };
  }
  if (
    fromLat < -90 ||
    fromLat > 90 ||
    toLat < -90 ||
    toLat > 90 ||
    fromLon < -180 ||
    fromLon > 180 ||
    toLon < -180 ||
    toLon > 180
  ) {
    return { error: 'coordinates out of range' };
  }
  return { fromLat, fromLon, toLat, toLon };
}

/** Public turn-by-turn style polyline for live tracking (server-side; avoids browser CORS). */
async function routeDirections(req, res, next) {
  try {
    const parsed = parseRouteQueryCoords(req);
    if (parsed.error) return res.status(400).json({ error: parsed.error });

    const { fromLat, fromLon, toLat, toLon } = parsed;
    const result = await getPublicRouteDirections(
      fromLat,
      fromLon,
      toLat,
      toLon,
      config.google.mapsApiKey,
    );
    if (!result) {
      return res.status(404).json({ error: 'No route found' });
    }
    return res.json(result);
  } catch (err) {
    next(err);
  }
}

async function geocode(req, res, next) {
  try {
    const { address } = req.query;
    if (!address) return res.status(400).json({ error: 'address query param is required' });

    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${config.google.mapsApiKey}`;
    const response = await fetch(url);
    const data = await response.json();

    return res.json(data);
  } catch (err) {
    next(err);
  }
}

async function reverseGeocode(req, res, next) {
  try {
    const lat = parseFloat(req.query.lat);
    const lon = parseFloat(req.query.lon);

    if (isNaN(lat) || isNaN(lon)) {
      return res.status(400).json({ error: 'lat and lon query params are required' });
    }

    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lon}&key=${config.google.mapsApiKey}`;
    const response = await fetch(url);
    const data = await response.json();

    // Google often returns a "Plus Code" like `55PQ+39 Gujranwala, Pakistan` at
    // the start of `formatted_address`. Strip that so the UI shows a cleaner
    // human-readable address.
    const PLUS_CODE_PREFIX_RE = /^([0-9A-Z]{4,6}\+[0-9A-Z]{2,4})(?:,)?\s*/i;
    const stripPlusCodePrefix = (s) => s.replace(PLUS_CODE_PREFIX_RE, "").trim();

    const candidates = (data?.results || [])
      .map((r) => r?.formatted_address)
      .filter((a) => typeof a === "string" && a.trim());

    // Prefer an address that doesn't start with a Plus Code. If everything starts
    // with a Plus Code, strip it as a fallback for nicer UI output.
    let address =
      candidates.find((a) => !PLUS_CODE_PREFIX_RE.test(a)) || candidates[0] || null;
    if (typeof address === "string" && PLUS_CODE_PREFIX_RE.test(address)) {
      address = stripPlusCodePrefix(address);
    }

    let countryCode = null;
    const first = data?.results?.[0];
    const comps = first?.address_components;
    if (Array.isArray(comps)) {
      for (const c of comps) {
        if (Array.isArray(c?.types) && c.types.includes("country") && c.short_name) {
          countryCode = String(c.short_name).toUpperCase();
          break;
        }
      }
    }

    return res.json({ address: address || null, countryCode });
  } catch (err) {
    next(err);
  }
}

async function deliveryCheck(req, res, next) {
  try {
    const { ref } = req.params;
    const lat = parseFloat(req.query.lat);
    const lon = parseFloat(req.query.lon);

    if (isNaN(lat) || isNaN(lon)) {
      return res.status(400).json({ error: 'lat and lon required' });
    }

    // Workspace-level delivery check only makes sense for a single workspace.
    // For organization-level refs we return `deliverable: true` — customers hit
    // per-shop delivery check after choosing a shop.
    const scope = await resolvePublicScope(ref);
    if (scope.kind !== 'workspace') {
      return res.json({
        deliverable: true,
        distance: null,
        maxRadius: 0,
        note: 'Organization-level delivery check — use shop-level endpoint',
      });
    }

    const vendorSettingsModel = require('../models/vendor-settings.model');
    const settings = await vendorSettingsModel.findByProjectRef(scope.projectRef);
    const maxRadius = settings?.delivery_radius_km || 5.0;

    const workspaces = await select('workspaces', { filters: { project_ref: scope.projectRef } });
    const workspace = workspaces?.[0];

    if (!workspace?.lat || !workspace?.lon) {
      return res.json({ deliverable: true, distance: null, maxRadius, note: 'Vendor location not set' });
    }

    const distance = haversineKm(lat, lon, workspace.lat, workspace.lon);
    return res.json({ deliverable: distance <= maxRadius, distance: Math.round(distance * 10) / 10, maxRadius });
  } catch (err) {
    next(err);
  }
}

async function shopDeliveryCheck(req, res, next) {
  try {
    const { ref, shopId } = req.params;
    const lat = parseFloat(req.query.lat);
    const lon = parseFloat(req.query.lon);

    if (isNaN(lat) || isNaN(lon)) {
      return res.status(400).json({ error: 'lat and lon required' });
    }

    const sw = await shopAndWorkspaceForPublic(ref, shopId);
    const shop = sw.shop;
    if (!shop) return res.status(404).json({ error: 'Shop not found' });

    const vendorSettingsModel = require('../models/vendor-settings.model');
    const settings = await vendorSettingsModel.findByShopId(shopId);
    const geofence = getEffectiveGeofence(shop, settings);

    if (!geofence) {
      return res.json({ deliverable: true, distance: null, maxRadius: 0, note: 'Shop location/geofence not set' });
    }

    const deliverable = pointInPolygon(lat, lon, geofence);
    const distance = (shop.lat && shop.lon)
      ? Math.round(haversineKm(lat, lon, Number(shop.lat), Number(shop.lon)) * 10) / 10
      : null;

    return res.json({ deliverable, distance, maxRadius: settings?.delivery_radius_km || 0 });
  } catch (err) {
    next(err);
  }
}

async function shopReviews(req, res, next) {
  try {
    const { ref, shopId } = req.params;
    const { limit = 20, offset = 0 } = req.query;
    const sw = await shopAndWorkspaceForPublic(ref, shopId);
    if (!sw.shop) return res.status(404).json({ error: 'Shop not found' });

    const [reviews, summary] = await Promise.all([
      shopReviewModel.listByShop(shopId, {
        includeHidden: false,
        limit: Number(limit),
        offset: Number(offset),
      }),
      shopReviewModel.getShopSummary(shopId),
    ]);
    return res.json({ reviews, summary });
  } catch (err) {
    next(err);
  }
}

async function resolveTheme(req, res, next) {
  try {
    const { safeProjectRefForThemeOverlay } = require('../lib/workspace-public-theme-merge');
    const crypto = require('crypto');
    const { app } = req.query;
    if (!app) return res.status(400).json({ error: 'app query param is required' });

    const themeRefKey = safeProjectRefForThemeOverlay(req.query.ref);
    const appName = String(app).trim().toLowerCase();

    // The theme payload aggregates ~14 platform_settings reads + an org/workspace
    // lookup — the single most expensive public endpoint on a cold cache. Key
    // by `(app, themeRefKey)` so each surface keeps its own cached copy.
    const cacheKey = `app:${appName}:ref:${themeRefKey == null ? '_none_' : String(themeRefKey).toLowerCase()}`;
     const payload = await cache.wrap('public:theme', cacheKey, async () => {
       return computeResolvedTheme({ themeRefKey, appName });
     }, { req });

    const raw = JSON.stringify(payload);
    const etag = `"${crypto.createHash('sha1').update(raw).digest('hex')}"`;
    res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
    res.setHeader('ETag', etag);
    const inm = req.headers['if-none-match'];
    if (typeof inm === 'string' && inm === etag) {
      return res.status(304).end();
    }
    return res.type('json').send(raw);
  } catch (err) {
    next(err);
  }
}

async function computeResolvedTheme({ themeRefKey, appName }) {
  const { parsePlatformBrandingRaw } = require('../lib/platform-branding');
  const { parsePlatformThemeRaw } = require('../lib/platform-theme');
  const platformSettings = require('../models/platform-settings.model');
  const {
    mergeOverlayIntoResolvedPublicTheme,
  } = require('../lib/workspace-public-theme-merge');

  const isCustomerFacingTheme = appName === 'customer_web' || appName === 'rider_web';
  const isPosTheme = appName === 'pos_web';

  let themeOpts;
  let workspaceThemePromise = Promise.resolve([]);
  let applyWorkspaceOverlay = true;
  if (themeRefKey != null) {
    const ctx = await resolveOrganizationContext(themeRefKey);
    if (ctx?.workspace) {
      if (isCustomerFacingTheme && ctx.organizationId) {
        themeOpts = { organizationId: ctx.organizationId };
        applyWorkspaceOverlay = false;
      } else {
        workspaceThemePromise = select('workspaces', {
          filters: { project_ref: ctx.workspace.project_ref },
          limit: 1,
        });
        themeOpts = { projectRef: ctx.workspace.project_ref };
      }
    } else if (ctx?.organizationId) {
      themeOpts = { organizationId: ctx.organizationId };
    } else {
      themeOpts = { projectRef: themeRefKey };
    }
  }

  const [
    brandingRaw,
    platformThemeRaw,
    currencyCode,
    mapSettingsRaw,
    deliveryFeeRaw,
    defaultLanguage,
    languageLockedRaw,
    dietaryTagPresetsRaw,
    browseCategoryPresetsRaw,
    customerProfilePhotoRaw,
    multiShopCartRaw,
    customerCutleryRaw,
    customerRefundRequestsRaw,
    customerWalletRaw,
    demoModeRaw,
    themeVersionRaw,
    workspaceThemeRows,
  ] = await Promise.all([
    platformSettings.get('platform_branding', themeOpts),
    platformSettings.get('platform_theme', themeOpts),
    platformSettings.get('default_currency', themeOpts),
    platformSettings.get('map_settings', themeOpts),
    platformSettings.get('delivery_fee_config', themeOpts),
    platformSettings.get('default_language', themeOpts),
    platformSettings.get('language_locked', themeOpts),
    platformSettings.get('dietary_tag_presets', themeOpts),
    platformSettings.get('browse_category_presets', themeOpts),
    platformSettings.get('customer_profile_photo_enabled', themeOpts),
    platformSettings.get('multi_shop_cart_enabled', themeOpts),
    platformSettings.get('customer_cutlery_enabled', themeOpts),
    platformSettings.get('customer_refund_requests_enabled', themeOpts),
    platformSettings.get('customer_wallet_enabled', themeOpts),
    // demo_mode is a deployment-only global key (see CLAUDE.md §12). Read it
    // without themeOpts so it's never org-scoped — one global switch controls
    // the "Skip OTP (Demo mode only)" checkbox on every customer surface.
    platformSettings.get('demo_mode'),
    platformSettings.get('theme_version', themeOpts),
    workspaceThemePromise,
  ]);

  const customerProfilePhotoEnabled = customerProfilePhotoRaw !== 'false';
  const customerCutleryEnabled = customerCutleryRaw !== 'false';
  const customerRefundRequestsEnabled = customerRefundRequestsRaw !== 'false';
  const customerWalletEnabled = customerWalletRaw === 'true';

  const dietaryTagPresets = mergePublicDietaryPresets(dietaryTagPresetsRaw);
  const browseCategoryPresets = parseBrowseCategoryPresets(browseCategoryPresetsRaw);

  let mapSettings;
  if (mapSettingsRaw) {
    try { mapSettings = JSON.parse(mapSettingsRaw); } catch { /* ignore parse error */ }
  }

  let deliveryFeeConfig;
  if (deliveryFeeRaw) {
    try { deliveryFeeConfig = JSON.parse(deliveryFeeRaw); } catch { /* ignore parse error */ }
  }

  const languageConfig = {
    defaultLanguage: defaultLanguage || 'en',
    locked: languageLockedRaw === 'true',
  };

  const normalizedCurrency = (currencyCode || 'gbp').toLowerCase();
  const branding = parsePlatformBrandingRaw(brandingRaw);
  const platformTheme = parsePlatformThemeRaw(platformThemeRaw);
  const defaultProfilePhotoUrls = getDefaultProfilePhotoUrls();
  const workspaceForTheme = workspaceThemeRows?.[0] || null;

  const saasPortalUrl =
    (config.saas?.appOrigin || '').replace(/\/$/, '') ||
    (config.isProd ? '' : 'http://localhost:3006') ||
    null;
  const saasBillingEnabled = Boolean(config.saasBilling?.enabled);

  const themeVersion = Math.max(0, parseInt(String(themeVersionRaw || '0'), 10) || 0);
  const payload = {
    light: platformTheme.light,
    dark: platformTheme.dark,
    ...branding,
    currencyCode: normalizedCurrency,
    mapSettings,
    deliveryFeeConfig,
    languageConfig,
    dietaryTagPresets,
    browseCategoryPresets,
    customerProfilePhotoEnabled,
    multiShopCartEnabled: multiShopCartRaw === 'true',
    customerCutleryEnabled,
    customerRefundRequestsEnabled,
    customerWalletEnabled,
    defaultProfilePhotoUrls,
    saasPortalUrl: saasPortalUrl || null,
    saasBillingEnabled,
    demoMode: demoModeRaw === 'true',
    themeVersion,
  };
  if (!applyWorkspaceOverlay) return payload;

  let workspaceOverlaySource = workspaceForTheme;
  if (isPosTheme) {
    const { stripWorkspaceColorsForPos } = require('../lib/pos-theme-policy');
    workspaceOverlaySource = stripWorkspaceColorsForPos(workspaceOverlaySource);
  }

  return mergeOverlayIntoResolvedPublicTheme(payload, workspaceOverlaySource);
}

async function listActiveBanners(req, res, next) {
  // Community Edition: the commercial platform-banner system is not included.
  // Endpoint kept for API compatibility; always returns no banners.
  try {
    return res.json({ banners: [] });
  } catch (err) {
    next(err);
  }
}

async function exchangeRates(req, res, next) {
  try {
    const rawBase = typeof req.query.base === 'string' ? req.query.base.trim() : '';
    const base = validCurrency(rawBase) || (await getPlatformCurrency());
    const data = await exchangeRateService.getRates(base);
    return res.json(data);
  } catch (err) {
    next(err);
  }
}

/** SaaS: map browser host + app surface → tenant scope for Next.js middleware. */
async function resolveHost(req, res, next) {
  try {
    const host = typeof req.query.host === 'string' ? req.query.host : '';
    const surface =
      typeof req.query.surface === 'string' && req.query.surface.trim()
        ? req.query.surface.trim().toLowerCase()
        : 'customer';
    const { resolveHostScope } = require('../services/saas-tenant-resolve.service');
    const scope = await resolveHostScope(host, surface, { canonical: true });
    // Organization scopes expose the org public_ref (customer/rider tenant);
    // workspace scopes expose the workspace project_ref (staff tools).
    const projectRef =
      scope?.kind === 'organization'
        ? scope.organizationPublicRef || null
        : scope?.workspaceProjectRef || null;
    return res.json({
      projectRef,
      found: Boolean(scope),
      kind: scope?.kind ?? null,
      organizationId: scope?.organizationId ?? null,
      organizationPublicRef: scope?.organizationPublicRef ?? null,
      workspaceProjectRef: scope?.workspaceProjectRef ?? null,
      canonicalHost: scope?.canonicalHost ?? null,
      host: typeof host === 'string' ? host.toLowerCase() : host,
      surface,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  healthCheck,
  publicRead,
  listShops,
  shopProducts,
  shopCategories,
  shopReviews,
  shopDetail,
  geocode,
  routeDirections,
  reverseGeocode,
  deliveryCheck,
  shopDeliveryCheck,
  resolveTheme,
  listActiveBanners,
  exchangeRates,
  resolveHost,
};
