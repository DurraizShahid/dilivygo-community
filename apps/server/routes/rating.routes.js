'use strict';

const { Router } = require('express');
const ratingController = require('../controllers/rating.controller');
const { validate } = require('../middleware/validate.middleware');
const { requireAnyAuth } = require('../middleware/auth.middleware');
const v = require('../validators/rating.validator');

const router = Router();

router.use(requireAnyAuth);

router.post('/',                 validate(v.createRatingSchema), ratingController.createRating);
router.get('/order/:orderId',                                    ratingController.getOrderRatings);
router.get('/user/:userId',                                      ratingController.getUserRatings);

module.exports = router;
