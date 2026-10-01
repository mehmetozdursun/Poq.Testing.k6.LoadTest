// Standard Poq catalogue endpoints: categories, search, PLP.

import { request } from '../http.js';

export const NAMES = {
  shop: 'Shop categories',
  popularTerms: 'Search popular terms',
  search: 'Search by keyword',
  predictive: 'Predictive search',
  plp: 'PLP',
  barcode: 'Barcode scan',
};

export function shop(s) {
  request(s, { key: 'shop', name: NAMES.shop, path: '/shop' });
}

// Category ids for the run (called from setup): the /shop tree, flattened.
export function shopCategories(s, name = 'setup: shop categories') {
  const json = request(s, { key: 'shopCategories', name, path: '/shop', query: { 'slot-content-id': 'shop' } }).json;
  return flattenCategories(Array.isArray(json) ? json : json && json.categories);
}

export function popularTerms(s) {
  request(s, { key: 'popularTerms', name: NAMES.popularTerms, path: '/search/popular-terms' });
}

export function search(s, keyword) {
  request(s, { key: 'search', name: NAMES.search, path: '/search', query: { q: keyword }, data: { keyword } });
}

// `typed` = what the user has typed so far (the journey decides: a prefix or the whole keyword).
// Returns the suggestions JSON.
export function predictiveSearch(s, typed) {
  return request(s, { key: 'predictive', name: NAMES.predictive, path: '/search/predictive', query: { keyword: typed }, data: { keyword: typed } }).json;
}

// variant: { name, query, checks } from the client config's plpVariants (sort/filter options differ per client).
export function plp(s, categoryId, variant = {}) {
  request(s, {
    key: 'plp',
    name: variant.name || NAMES.plp,
    path: '/search',
    query: { categories: categoryId, ...variant.query, 'slot-content-id': 'plp' },
    checks: variant.checks,
    data: { category_id: categoryId },
  });
}

export function barcode(s, code, data) {
  request(s, { key: 'barcode', name: NAMES.barcode, path: '/search', query: { barcode: code }, data });
}

// Flattens the /shop category tree into category ids (same rules as the Utilities extractor).
export function flattenCategories(categories, out = []) {
  for (const c of categories || []) {
    flattenCategories(c.categories || c.children, out);
    if (c.id && c.name) out.push(String(c.id));
  }
  return out;
}
