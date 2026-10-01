// Standard Poq checkout endpoints: checkout start + webview URL, guest cart sign, Apple Pay express checkout.

import { request, correlationFailure } from '../http.js';
import { randomItem } from '../data.js';

export const NAMES = {
  checkoutStart: 'Checkout start',
  checkoutUrl: 'Open checkout URL',
  cartSign: 'Cart sign (guest checkout)',
  applePaySummary: 'Apple Pay: order summary',
  applePayAddress: 'Apple Pay: shipping address',
  applePayMethod: 'Apple Pay: shipping method',
};

// Returns the checkout response (webview url + the auth header the app sends with it).
export function checkoutStart(s) {
  return request(s, {
    key: 'checkoutStart',
    name: NAMES.checkoutStart,
    method: 'POST',
    path: '/checkout/start',
    checks: { 'has url': (j) => j.url },
  }).json;
}

// Opens the checkout URL like the app's webview: user agent + the checkout Authorization only.
export function openCheckoutUrl(s, checkout) {
  if (!checkout || !checkout.url) return;
  const auth = Array.isArray(checkout.headers) && checkout.headers[0] ? checkout.headers[0].value : undefined;
  request(s, {
    key: 'checkoutUrl',
    name: NAMES.checkoutUrl,
    url: checkout.url,
    plain: true,
    headers: auth ? { Authorization: auth } : {},
    redirects: 0,
    expect: [302],
    sensitive: true,
  });
}

export function cartSign(s, email) {
  request(s, {
    key: 'cartSign',
    name: NAMES.cartSign,
    method: 'POST',
    path: '/cart/sign',
    body: { email, hasReceivePromotionsByPost: false, isNewsletterEnabled: Math.random() < 0.5, hasReceivePartnerPromotionsByPost: false },
  });
}

// Order summary → shipping address → one of the offered shipping methods.
export function applePay(s, address) {
  const summary = request(s, { key: 'applePay', name: NAMES.applePaySummary, path: '/express/checkout/orderSummary' }).json;
  const withAddress = request(s, { key: 'applePay', name: NAMES.applePayAddress, method: 'POST', path: '/express/checkout/shipping/address', body: address }).json;
  const methods = (withAddress && withAddress.shippingMethods) || (summary && summary.shippingMethods) || [];
  const method = randomItem(methods.filter((m) => m && m.id));
  if (!method) return correlationFailure(s, NAMES.applePayAddress, 'shippingMethods[].id');
  request(s, { key: 'applePay', name: NAMES.applePayMethod, method: 'POST', path: '/express/checkout/shipping/method', body: { id: method.id } });
}
