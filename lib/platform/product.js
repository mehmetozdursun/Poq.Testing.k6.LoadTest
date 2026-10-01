// Standard Poq product endpoints: PDP, related products, reviews, recommendations.

import { request } from '../http.js';

export const NAMES = {
  productDetails: 'Product details',
  recentlyViewed: 'Recently viewed products',
  productListings: 'Search product listings',
  reviews: 'Product reviews',
  ugc: 'User generated content',
};

export const productRefs = (product) => ({ product_id: product.productId, sku: product.sku });

export function productDetails(s, product) {
  request(s, {
    key: 'productDetails',
    name: NAMES.productDetails,
    path: '/products',
    query: { ids: product.productId, 'slot-content-id': 'pdp' },
    checks: { 'returns the product': (j) => Array.isArray(j) && j.length > 0 },
    data: productRefs(product),
  });
}

export function recentlyViewed(s, product) {
  if (!product.recentlyViewedIds || !product.recentlyViewedIds.length) return;
  request(s, {
    key: 'recentlyViewed',
    name: NAMES.recentlyViewed,
    path: '/products',
    query: { ids: product.recentlyViewedIds.join(',') },
    data: productRefs(product),
  });
}

// Cross-sell listings shown on the PDP (only when the validated product has any).
export function productListings(s, product) {
  if (!product.productListings || !product.productListings.length) return;
  request(s, {
    key: 'productListings',
    name: NAMES.productListings,
    method: 'POST',
    path: '/search/product-listings',
    body: { ids: product.productListings, includeOutOfStockProducts: false },
    data: productRefs(product),
  });
}

export function reviews(s, product) {
  request(s, {
    key: 'reviews',
    name: NAMES.reviews,
    path: '/reviews',
    query: { productId: product.productId, listingId: product.listingId, variantId: product.sku, isCollection: 'false' },
    data: productRefs(product),
  });
}

export function userGeneratedContent(s, product) {
  request(s, { key: 'ugc', name: NAMES.ugc, path: '/usergeneratedcontent', query: { productId: product.productId }, data: productRefs(product) });
}

// Poq recommendations (PDP or home carousels); `name` identifies the carousel in reports.
export function recommendations(s, name, query, data) {
  request(s, { key: 'recommendations', name, path: '/recommendations', query, data });
}
