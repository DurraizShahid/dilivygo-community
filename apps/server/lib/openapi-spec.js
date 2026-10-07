'use strict';

/**
 * OpenAPI 3.0 document for the Dilivygo HTTP API (bootstrap slice).
 * Covers unauthenticated surface: health, CSRF bootstrap, geocoding, and
 * `public.routes.js` paths. Full route coverage is expected to move to
 * `@asteasolutions/zod-to-openapi` later (see LIBRARY_AUDIT §7).
 */
const spec = {
  openapi: '3.0.3',
  info: {
    title: 'Dilivygo API',
    version: '1.0.0',
    description:
      'Multi-tenant delivery platform HTTP API.\n\n' +
      '**CSRF:** state-changing requests (`POST`, `PUT`, `PATCH`, `DELETE`) to `/api/*` ' +
      '(except documented exemptions) require header `X-CSRF-Token` matching the `csrf_token` cookie. ' +
      'Call `GET /api/csrf-token` first, or use the embedded Swagger **Try it out** (it injects the header from the cookie).\n\n' +
      '**Auth:** most routes use session cookies or bearer tokens — see each app’s client (`@dilivygo/api`).',
  },
  servers: [{ url: '/', description: 'Current origin (same host as this UI)' }],
  tags: [
    { name: 'Meta', description: 'Health and CSRF bootstrap' },
    { name: 'Geocoding', description: 'Google-backed geocode helpers' },
    { name: 'Public', description: 'Tenant-scoped read-only catalogue and theme' },
  ],
  components: {
    parameters: {
      ProjectRef: {
        name: 'ref',
        in: 'path',
        required: true,
        schema: { type: 'string' },
        description: 'Organization public ref (subdomain / `project_ref`)',
      },
      ShopId: {
        name: 'shopId',
        in: 'path',
        required: true,
        schema: { type: 'string', format: 'uuid' },
      },
    },
    securitySchemes: {
      csrfToken: {
        type: 'apiKey',
        in: 'header',
        name: 'X-CSRF-Token',
        description: 'Must match `csrf_token` cookie (double-submit pattern)',
      },
    },
  },
  paths: {
    '/api/health': {
      get: {
        tags: ['Meta'],
        summary: 'Liveness / readiness',
        operationId: 'healthCheck',
        responses: {
          200: {
            description: 'OK',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'ok' },
                    timestamp: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/csrf-token': {
      get: {
        tags: ['Meta'],
        summary: 'Fetch CSRF token for browser clients',
        operationId: 'getCsrfToken',
        responses: {
          200: {
            description: 'Token for `X-CSRF-Token` header',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { csrfToken: { type: 'string' } },
                },
              },
            },
          },
        },
      },
    },
    '/api/geocode': {
      get: {
        tags: ['Geocoding'],
        summary: 'Forward geocode (address → coordinates)',
        operationId: 'geocode',
        parameters: [
          { name: 'address', in: 'query', required: true, schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'Geocode results' }, 400: { description: 'Bad request' } },
      },
    },
    '/api/reverse-geocode': {
      get: {
        tags: ['Geocoding'],
        summary: 'Reverse geocode (coordinates → address)',
        operationId: 'reverseGeocode',
        parameters: [
          { name: 'lat', in: 'query', required: true, schema: { type: 'number' } },
          { name: 'lon', in: 'query', required: true, schema: { type: 'number' } },
        ],
        responses: { 200: { description: 'Address components' }, 400: { description: 'Bad request' } },
      },
    },
    '/api/route-directions': {
      get: {
        tags: ['Geocoding'],
        summary: 'Road route polyline between two points',
        operationId: 'routeDirections',
        parameters: [
          { name: 'fromLat', in: 'query', required: true, schema: { type: 'number' } },
          { name: 'fromLon', in: 'query', required: true, schema: { type: 'number' } },
          { name: 'toLat', in: 'query', required: true, schema: { type: 'number' } },
          { name: 'toLon', in: 'query', required: true, schema: { type: 'number' } },
        ],
        responses: { 200: { description: 'Encoded polyline / coordinates' }, 400: { description: 'Bad request' } },
      },
    },
    '/api/public/theme': {
      get: {
        tags: ['Public'],
        summary: 'Resolve UI theme for current host',
        operationId: 'resolveTheme',
        responses: { 200: { description: 'Theme tokens' } },
      },
    },
    '/api/public/resolve-host': {
      get: {
        tags: ['Public'],
        summary: 'Resolve hostname to organization / surface (tenant edge lookup)',
        operationId: 'resolveHost',
        parameters: [
          { name: 'host', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'surface', in: 'query', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: {
            description: 'Host resolution payload',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    projectRef: { type: ['string', 'null'], description: 'org public_ref or workspace project_ref depending on kind' },
                    found: { type: 'boolean' },
                    kind: { type: ['string', 'null'], enum: ['organization', 'workspace'] },
                    organizationId: { type: ['string', 'null'], format: 'uuid' },
                    organizationPublicRef: { type: ['string', 'null'] },
                    workspaceProjectRef: { type: ['string', 'null'] },
                    canonicalHost: { type: ['string', 'null'], description: 'primary (or first active, or {publicRef}.{surface}.{apex}) host for organization scopes' },
                    host: { type: 'string', description: 'lowercased request host' },
                    surface: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/public/banners': {
      get: {
        tags: ['Public'],
        summary: 'Active promotional banners',
        operationId: 'listActiveBanners',
        responses: { 200: { description: 'Banner list' } },
      },
    },
    '/api/public/exchange-rates': {
      get: {
        tags: ['Public'],
        summary: 'Cached FX rates',
        operationId: 'exchangeRates',
        responses: { 200: { description: 'Rates by currency' } },
      },
    },
    '/api/public/{ref}/shops': {
      get: {
        tags: ['Public'],
        summary: 'List shops for an organization',
        operationId: 'listShops',
        parameters: [{ $ref: '#/components/parameters/ProjectRef' }],
        responses: { 200: { description: 'Shops' } },
      },
    },
    '/api/public/{ref}/shops/{shopId}': {
      get: {
        tags: ['Public'],
        summary: 'Shop detail',
        operationId: 'shopDetail',
        parameters: [
          { $ref: '#/components/parameters/ProjectRef' },
          { $ref: '#/components/parameters/ShopId' },
        ],
        responses: { 200: { description: 'Shop' }, 404: { description: 'Not found' } },
      },
    },
    '/api/public/{ref}/shops/{shopId}/products': {
      get: {
        tags: ['Public'],
        summary: 'Shop menu products',
        operationId: 'shopProducts',
        parameters: [
          { $ref: '#/components/parameters/ProjectRef' },
          { $ref: '#/components/parameters/ShopId' },
        ],
        responses: { 200: { description: 'Products' } },
      },
    },
    '/api/public/{ref}/shops/{shopId}/categories': {
      get: {
        tags: ['Public'],
        summary: 'Shop menu categories',
        operationId: 'shopCategories',
        parameters: [
          { $ref: '#/components/parameters/ProjectRef' },
          { $ref: '#/components/parameters/ShopId' },
        ],
        responses: { 200: { description: 'Categories' } },
      },
    },
    '/api/public/{ref}/shops/{shopId}/delivery-check': {
      get: {
        tags: ['Public'],
        summary: 'Check delivery to coordinates for this shop',
        operationId: 'shopDeliveryCheck',
        parameters: [
          { $ref: '#/components/parameters/ProjectRef' },
          { $ref: '#/components/parameters/ShopId' },
          { name: 'lat', in: 'query', required: true, schema: { type: 'number' } },
          { name: 'lon', in: 'query', required: true, schema: { type: 'number' } },
        ],
        responses: { 200: { description: 'Deliverability + distance' } },
      },
    },
    '/api/public/{ref}/shops/{shopId}/reviews': {
      get: {
        tags: ['Public'],
        summary: 'Shop reviews',
        operationId: 'shopReviews',
        parameters: [
          { $ref: '#/components/parameters/ProjectRef' },
          { $ref: '#/components/parameters/ShopId' },
        ],
        responses: { 200: { description: 'Reviews' } },
      },
    },
    '/api/public/{ref}/delivery-check': {
      get: {
        tags: ['Public'],
        summary: 'Legacy workspace-level delivery check',
        operationId: 'deliveryCheck',
        parameters: [
          { $ref: '#/components/parameters/ProjectRef' },
          { name: 'lat', in: 'query', required: true, schema: { type: 'number' } },
          { name: 'lon', in: 'query', required: true, schema: { type: 'number' } },
        ],
        responses: { 200: { description: 'Deliverability' } },
      },
    },
    '/api/public/{ref}/{table}': {
      get: {
        tags: ['Public'],
        summary: 'Legacy public read table slice',
        operationId: 'publicRead',
        parameters: [
          { $ref: '#/components/parameters/ProjectRef' },
          {
            name: 'table',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'Allowed public table name (server-enforced allow-list)',
          },
        ],
        responses: { 200: { description: 'Rows' }, 400: { description: 'Invalid table' } },
      },
    },
  },
};

module.exports = spec;
