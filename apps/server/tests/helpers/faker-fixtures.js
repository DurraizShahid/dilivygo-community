'use strict';

/**
 * Small composable helpers on top of `@faker-js/faker`.
 * Jest seeds the module singleton in `tests/setup.js`; import from here or
 * use `globalThis.faker` after setup runs.
 */
const { faker } = require('@faker-js/faker');

function randomProductTitle() {
  return faker.commerce.productName();
}

function randomStreetLine() {
  return faker.location.streetAddress();
}

module.exports = {
  faker,
  randomProductTitle,
  randomStreetLine,
};
