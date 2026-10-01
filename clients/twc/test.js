// The White Company load test.
//   k6 run -e ENV=staging -e PROFILE=smoke clients/twc/test.js

import { createTest } from '../../lib/test-kit.js';
import { loadValidated, assertDataFresh } from '../../lib/data.js';
import client from './config.js';
import * as twc from './journeys.js';

// requestsPerIteration is checked against the "req/iter" column of the end-of-test summary
// after each real run. guestBrowse: 32.7 measured on prod 2026-09-28; guestShopper / loggedInShopper:
// 49 / 48 measured against the local mock (real counts vary with store and wishlist contents).
const test = createTest(client, {
  resolve: (p) => import.meta.resolve(p),
  scenarios: {
    guestBrowse: { requestsPerIteration: 33, estimatedIterationSeconds: 30 },
    guestShopper: { requestsPerIteration: 49, estimatedIterationSeconds: 45 },
    loggedInShopper: { requestsPerIteration: 48, estimatedIterationSeconds: 50 },
  },
  endpointNames: twc.endpointNames,
  accountScenarios: ['loggedInShopper'],
});
const giftBundles = loadValidated('giftBundles', import.meta.resolve(`./data/gift_bundles_${test.cfg.envName}.json`), 'bundles', { optional: true });

export const options = test.options;

export function setup() {
  const { warnings, categories } = test.baseSetup();
  // Gift bundles are only checked when the gift box can actually run.
  const giftBoxOn = Boolean(test.scenarios.loggedInShopper) && twc.giftBoxShare > 0 && !giftBundles.meta.missing;
  if (giftBoxOn) warnings.push(assertDataFresh(test.cfg, `gift_bundles_${test.cfg.envName}.json`, giftBundles.meta));

  const dataScope = [
    `products ${test.describe(test.products.meta)}`,
    giftBoxOn ? `gift bundles ${test.describe(giftBundles.meta)}` : 'gift box off',
    test.scenarios.loggedInShopper ? `accounts ${test.accounts.length}` : null,
  ].filter(Boolean).join('; ');
  console.log(`setup: ${categories.length} categories; ${dataScope}`);
  return { categories, staleWarning: warnings.filter(Boolean).join(' | ') || null, dataScope };
}

function sessionData(data) {
  return { ...data, products: test.products.items, giftBundles: giftBundles.meta.missing ? [] : giftBundles.items, accounts: test.accounts, keywords: test.keywords };
}

export function guestBrowse(data) {
  twc.guestBrowse(test.session(), sessionData(data));
}

export function guestShopper(data) {
  twc.guestShopper(test.session(), sessionData(data));
}

export function loggedInShopper(data) {
  twc.loggedInShopper(test.session(), sessionData(data));
}

export const handleSummary = test.handleSummary;
