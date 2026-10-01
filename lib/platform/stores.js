// Standard Poq store endpoints (Gen-3): store search and product availability in stores.

import { request } from '../http.js';
import { randomItem } from '../data.js';
import { productRefs } from './product.js';

export const NAMES = {
  stores: 'Stores by coordinates',
  storeDetails: 'Store details',
  storeAvailability: 'Product availability in stores',
  storeAvailabilityDetail: 'Product availability in store',
};

// Stores near a point, then one of them. No store near the point is a valid answer.
export function stores(s, point) {
  const { json, ok } = request(s, { key: 'stores', name: NAMES.stores, path: '/stores/v2', query: point, data: point });
  const store = randomItem(ok && json && Array.isArray(json.stores) ? json.stores.filter((x) => x && x.id) : []);
  if (!store) return;
  request(s, { key: 'storeDetails', name: NAMES.storeDetails, path: `/stores/v2/${encodeURIComponent(store.id)}`, data: { storeId: store.id } });
}

// Product stock in stores near a point, then in one returned store.
export function storeAvailability(s, product, point) {
  const { json, ok } = request(s, {
    key: 'storeAvailability',
    name: NAMES.storeAvailability,
    path: '/stores/availability',
    query: { lat: point.lat, lng: point.lng, sku: product.sku },
    data: { ...productRefs(product), lat: point.lat, lng: point.lng },
  });
  const hit = randomItem(ok && json && Array.isArray(json.availability) ? json.availability.filter((a) => a.store && a.store.id) : []);
  if (!hit) return;
  request(s, {
    key: 'storeAvailabilityDetail',
    name: NAMES.storeAvailabilityDetail,
    path: `/stores/${encodeURIComponent(hit.store.id)}/availability`,
    query: { sku: product.sku },
    data: { ...productRefs(product), storeId: hit.store.id },
  });
}
