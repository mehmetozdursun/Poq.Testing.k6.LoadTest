// Standard Poq wishlist endpoints (Gen-3, accept-version v3).

import { request } from '../http.js';
import { productRefs } from './product.js';

export const NAMES = {
  wishlistAdd: 'Add to wishlist',
  wishlistGet: 'Get wishlist',
  wishlistDelete: 'Delete wishlist item',
};

const V3 = { 'Accept-Version': 'v3' };

export function wishlistAdd(s, product) {
  request(s, {
    key: 'wishlistAdd',
    name: NAMES.wishlistAdd,
    method: 'POST',
    path: '/wishlist/items',
    headers: V3,
    body: { customData: null, productId: product.productId },
    expect: [204],
    data: productRefs(product),
  });
}

// Returns the wishlist item ids.
export function wishlistGet(s) {
  const { json } = request(s, { key: 'wishlistGet', name: NAMES.wishlistGet, path: '/wishlist', query: { 'slot-content-id': 'wishlist' }, headers: V3 });
  const ids = json && Array.isArray(json.ids) ? json.ids : [];
  return ids.map((i) => i && i.customData && i.customData.wishlistItemId).filter(Boolean);
}

export function wishlistDelete(s, wishlistItemId) {
  request(s, {
    key: 'wishlistDelete',
    name: NAMES.wishlistDelete,
    method: 'DELETE',
    path: `/wishlist/items/${encodeURIComponent(wishlistItemId)}`,
    headers: V3,
    expect: [204],
  });
}
