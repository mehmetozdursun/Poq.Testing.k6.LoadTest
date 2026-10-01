// Pacsun load test.
//   k6 run -e ENV=dev -e PROFILE=smoke clients/pacsun/test.js

import { createTest } from '../../lib/test-kit.js';
import client from './config.js';
import * as pacsun from './journeys.js';

// requestsPerIteration is counted from the journeys with one home carousel, each common request
// (shop, wishlist, bag) once per session: guestBrowse 28, guestShopper 37. Check against the
// "req/iter" column of the end-of-test summary after each real run.
const test = createTest(client, {
  resolve: (p) => import.meta.resolve(p),
  scenarios: {
    guestBrowse: { requestsPerIteration: 28, estimatedIterationSeconds: 35 },
    guestShopper: { requestsPerIteration: 37, estimatedIterationSeconds: 50 },
  },
  endpointNames: pacsun.endpointNames,
});

export const options = test.options;

export function setup() {
  const { warnings, categories: all } = test.baseSetup();
  // /shop has "<id>-poqParentCategoryId" grouping nodes (Men's, Women's, Pants…); the app opens
  // their children, never a PLP for the group itself.
  const categories = all.filter((id) => !id.endsWith('-poqParentCategoryId'));
  const dataScope = `products ${test.describe(test.products.meta)}`;
  console.log(`setup: ${categories.length} categories; ${dataScope}`);
  return { categories, staleWarning: warnings.filter(Boolean).join(' | ') || null, dataScope };
}

function sessionData(data) {
  return { ...data, products: test.products.items, keywords: test.keywords };
}

export function guestBrowse(data) {
  pacsun.guestBrowse(test.session(), sessionData(data));
}

export function guestShopper(data) {
  pacsun.guestShopper(test.session(), sessionData(data));
}

export const handleSummary = test.handleSummary;
