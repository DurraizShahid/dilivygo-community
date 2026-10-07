'use strict';

const { Router } = require('express');
const publicController = require('../controllers/public.controller');
const {
  requireKnownPublicRef,
  blockSensitiveLegacyPublicRead,
} = require('../middleware/public-scope.middleware');

const router = Router();

router.get('/health',            publicController.healthCheck);
router.get('/geocode',           publicController.geocode);
router.get('/reverse-geocode',   publicController.reverseGeocode);
router.get('/route-directions',  publicController.routeDirections);

router.get('/public/theme',        publicController.resolveTheme);
router.get('/public/resolve-host', publicController.resolveHost);
router.get('/public/banners',      publicController.listActiveBanners);
router.get('/public/exchange-rates', publicController.exchangeRates);

// Any explicit public tenant ref must be real (or the deliberate legacy
// _marketplace sentinel). Unknown slugs never fall through to global data.
router.get('/public/:ref/shops',                        requireKnownPublicRef, publicController.listShops);
router.get('/public/:ref/shops/:shopId',                requireKnownPublicRef, publicController.shopDetail);
router.get('/public/:ref/shops/:shopId/products',       requireKnownPublicRef, publicController.shopProducts);
router.get('/public/:ref/shops/:shopId/categories',     requireKnownPublicRef, publicController.shopCategories);
router.get('/public/:ref/shops/:shopId/delivery-check', requireKnownPublicRef, publicController.shopDeliveryCheck);
router.get('/public/:ref/shops/:shopId/reviews',        requireKnownPublicRef, publicController.shopReviews);

// Legacy routes. Sensitive order/delivery rows are no longer exposed as
// unauthenticated bearer-by-UUID data.
router.get('/public/:ref/delivery-check', requireKnownPublicRef, publicController.deliveryCheck);
router.get(
  '/public/:ref/:table',
  requireKnownPublicRef,
  blockSensitiveLegacyPublicRead,
  publicController.publicRead,
);

module.exports = router;
