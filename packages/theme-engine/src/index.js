'use strict';

const color = require('./color.js');
const contrast = require('./contrast.js');
const distance = require('./distance.js');
const classify = require('./classify.js');
const generator = require('./generator.js');
const accessibility = require('./accessibility.js');
const chart = require('./chart.js');
const surfacePolicy = require('./surface-policy.js');

const SMART_THEME_ENGINE_VERSION = '1.0.0';

module.exports = {
  SMART_THEME_ENGINE_VERSION,
  ...color,
  ...contrast,
  ...distance,
  ...classify,
  ...generator,
  ...accessibility,
  ...chart,
  ...surfacePolicy,
};
