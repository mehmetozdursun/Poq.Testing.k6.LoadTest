// Hot Topic journeys: the order of steps. Step order follows hot_topic.jmx (working tree, 2026-09-28):
//   "Concurrent Users" → browser, "Ramp Up Users" → shopper, "Account Users" → account.
// Each VU is one device with a persistent poq-user-id (lib/test-kit.js session()), so its bag and
// wishlist persist across iterations — every journey removes what it added.

import { app, account as accountApi, catalog, product as pdp, cart, checkout, NAMES as PLATFORM_NAMES } from '../../lib/platform/index.js';
import { randomItem, think } from '../../lib/data.js';
import * as ht from './endpoints.js';
import client from './config.js';

export const endpointNames = [...new Set([...PLATFORM_NAMES, ...Object.values(ht.NAMES), ...client.plpVariants.map((v) => v.name)])];

// "Concurrent Users": browse-heavy, bag + wishlist, stores, content.
export function browser(s, data) {
  openApp(s);
  think(s.cfg);
  catalog.shop(s);
  think(s.cfg);
  searchSteps(s, randomItem(data.keywords));
  think(s.cfg);
  sortAndFilter(s, randomItem(data.categories));
  think(s.cfg);

  const product = randomItem(data.products);
  // The JMeter module here points at "View PDP / Reviews" only, so the browser group fetches reviews, not the PDP.
  pdp.reviews(s, product);
  ht.storeStock(s, product);
  think(s.cfg);

  const cartItemId = bagAndUpdate(s, product);
  think(s.cfg);
  ht.wishlist(s, product);
  think(s.cfg);
  catalog.barcode(s, product.productId, pdp.productRefs(product));
  ht.stores(s);
  ht.more(s);
  app.universalLink(s, randomItem(data.universalLinks));
  carousels(s);
  // Not in the JMeter group (its device cart just grew each iteration); here the device is persistent.
  if (cartItemId) ht.removeBagItem(s, cartItemId, product);
}

// "Ramp Up Users": full PDP, bag → checkout → remove.
export function shopper(s, data) {
  openApp(s);
  think(s.cfg);
  catalog.shop(s);
  think(s.cfg);
  searchSteps(s, randomItem(data.keywords));
  think(s.cfg);
  catalog.plp(s, randomItem(data.categories));
  think(s.cfg);

  const product = randomItem(data.products);
  viewPdp(s, product);
  ht.storeStock(s, product);
  think(s.cfg);

  const cartItemId = bagAndUpdate(s, product);
  checkout.checkoutStart(s);
  if (cartItemId) ht.removeBagItem(s, cartItemId, product);
  think(s.cfg);

  catalog.barcode(s, product.productId, pdp.productRefs(product));
  ht.wishlist(s, product);
  think(s.cfg);
  ht.stores(s);
  ht.more(s);
  carousels(s);
  app.universalLink(s, randomItem(data.universalLinks));
}

// "Account Users", rebuilt from the prod iOS app 26.2.0 capture (2026-10-01): app start → account
// tab (guest token) → bearer login → landing reads → profile → address book (add, edit, delete) →
// the shopping path of the JMeter group → sign out. Every request is signed with poq-auth.
export function account(s, data, acct) {
  s.authKey = data.authKey;
  openApp(s);
  think(s.cfg);
  if (!ht.guestSession(s)) return;
  accountApi.accountContent(s);
  think(s.cfg);
  if (!ht.login(s, acct)) return;
  cart.getCart(s);
  ht.wishlistIds(s); // hearts for the logged-in user
  ht.wishlistLanding(s);
  accountApi.accountContent(s); // the logged-in version of the page
  think(s.cfg);

  const profile = ht.getProfile(s);
  // edit the last name, then put the original back (the account is reused by this VU every iteration)
  if (profile && ht.updateProfile(s, profile, { lastName: `${profile.lastName}x` })) ht.updateProfile(s, profile, {});
  think(s.cfg);
  if (profile) ht.addressBook(s, profile);
  think(s.cfg);
  ht.qas(s);
  think(s.cfg);
  searchSteps(s, randomItem(data.keywords));
  catalog.plp(s, randomItem(data.categories));
  think(s.cfg);

  const product = randomItem(data.products);
  ht.storeStock(s, product);
  viewPdp(s, product);
  think(s.cfg);

  const cartItemId = bagAndUpdate(s, product);
  checkout.checkoutStart(s);
  if (cartItemId) ht.removeBagItem(s, cartItemId, product);
  think(s.cfg);
  ht.more(s);
  accountApi.logout(s);
}

// Opt-in (creates real accounts): app start → guest token → registration → default address.
export function register(s, data) {
  s.authKey = data.authKey;
  openApp(s);
  think(s.cfg);
  if (!ht.guestSession(s)) return;
  accountApi.accountContent(s);
  think(s.cfg);
  ht.register(s);
}

// ---- steps ----

// App 26.2.0 start: splash, launch, stories, wishlist hearts, banners (no settings/config call any more).
function openApp(s) {
  app.splash(s);
  app.launch(s, client.appVersion);
  app.appStories(s);
  ht.wishlistIds(s);
  app.banners(s);
}

function searchSteps(s, keyword) {
  catalog.search(s, keyword);
  catalog.predictiveSearch(s, keyword); // Hot Topic sends the whole keyword
}

function sortAndFilter(s, categoryId) {
  for (const variant of client.plpVariants) catalog.plp(s, categoryId, variant);
  // No price-range call: the app's filter screen has no price filter (JMeter sent one; it returned 500 for many categories).
}

function viewPdp(s, product) {
  pdp.productDetails(s, product);
  pdp.reviews(s, product);
  const refs = pdp.productRefs(product);
  pdp.recommendations(s, ht.NAMES.recsPdpBottom, { productId: product.productId, recommenderName: 'pdp-bottom-product-to-product' }, refs);
  pdp.recommendations(s, ht.NAMES.recsPdpTop, { productId: product.productId, recommenderName: 'pdp-top-products-to-product' }, refs);
  pdp.recommendations(s, ht.NAMES.recsRecentlyViewed, { productId: product.productId }, refs);
}

// Add → get bag → quantity 2. Returns this product's bag line id (or null).
function bagAndUpdate(s, product) {
  if (!ht.addToBag(s, product)) return null;
  // The device's bag can hold other lines; use this product's line (JMeter took cartItems[0]).
  const item = cart.cartItemFor(s, cart.getCart(s), product);
  if (!item) return null;
  ht.updateBagItem(s, item.id, product, 2);
  return item.id;
}

// Home carousels + voucher (as the JMeter "Various Carousels" module).
function carousels(s) {
  pdp.recommendations(s, ht.NAMES.recsHomeTop, { recommenderName: 'hp-top-products-in-all-categories' });
  pdp.recommendations(s, ht.NAMES.recsHomeBottom, { recommenderName: 'hp-bottom-products-in-all-categories' });
  ht.voucher(s);
}

