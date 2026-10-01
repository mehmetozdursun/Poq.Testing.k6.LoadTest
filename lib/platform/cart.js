// Standard Poq bag endpoints (Gen-3: /cart/items with PATCH / DELETE).

import { request, correlationFailure } from '../http.js';
import { productRefs } from './product.js';

export const NAMES = {
  addToBag: 'Add to bag',
  validateCart: 'Validate cart',
  getCart: 'Get bag',
  updateCartItem: 'Update bag item',
  deleteCartItem: 'Delete bag item',
};

// Returns true when the item was added.
export function addToBag(s, product) {
  return request(s, {
    key: 'addToBag',
    name: NAMES.addToBag,
    method: 'POST',
    path: '/cart/items',
    body: {
      quantity: 1,
      deleted: false,
      productId: product.productId,
      variantId: product.sku,
      customData: { productType: product.productType, productId: product.productId, categoryId: product.categoryId },
    },
    checks: { 'quantityAdded > 0': (j) => j.customData.quantityAdded > 0 },
    data: productRefs(product),
  }).ok;
}

export function validateCart(s) {
  request(s, { key: 'validateCart', name: NAMES.validateCart, method: 'POST', path: '/cart/validate' });
}

// Returns the bag JSON (or null).
export function getCart(s) {
  return request(s, { key: 'getCart', name: NAMES.getCart, path: '/cart', query: { 'slot-content-id': 'cart' } }).json;
}

// The bag line for this product's variant, or null (logged as a correlation failure).
export function cartItemFor(s, cart, product) {
  const item = cart && Array.isArray(cart.cartItems) ? cart.cartItems.find((i) => String(i.variantId) === String(product.sku)) : null;
  if (!item || !item.id) {
    correlationFailure(s, NAMES.getCart, `cart item for sku ${product.sku}`, productRefs(product));
    return null;
  }
  return item;
}

export function updateCartItem(s, cartItemId, product, quantity) {
  request(s, {
    key: 'updateCartItem',
    name: NAMES.updateCartItem,
    method: 'PATCH',
    path: '/cart/items',
    body: {
      cartItemId,
      quantity,
      variantId: product.sku,
      deleted: false,
      productId: product.productId,
      customData: { listingId: product.listingId, productType: product.productType, productId: product.productId, categoryId: product.categoryId },
    },
    checks: { 'has cartId': (j) => j.cartId },
    data: productRefs(product),
  });
}

export function deleteCartItem(s, cartItemId, data) {
  request(s, { key: 'deleteCartItem', name: NAMES.deleteCartItem, method: 'DELETE', path: `/cart/items/${encodeURIComponent(cartItemId)}`, expect: [204], data });
}

// Removes every bag line (e.g. after adding a bundle).
export function clearCart(s) {
  const cart = getCart(s);
  for (const item of (cart && cart.cartItems) || []) if (item.id) deleteCartItem(s, item.id, { cartItemId: item.id });
}
