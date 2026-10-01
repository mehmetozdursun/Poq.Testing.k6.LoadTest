// Pacsun journeys: the order of steps, as the dev apps made the calls (Charles captures
// 2026-09-30; there is no JMeter suite). One session type: the backend treats iOS and Android the
// same, so the app start makes the common calls once plus each platform's own call (Android
// settings/config, iOS splash). One poq-user-id per session, kept for every step.
// Standard Poq endpoints come from lib/platform/; Pacsun-only ones from ./endpoints.js.
//
// Left out on purpose:
//   - dynamicyield/identifiers: both apps poll it (Android ~80 calls in 10 min; iOS 4 in 3 s at app
//     open, with and without a token) and dev always answers 404; raised as a finding instead of
//     load-testing a 404.
//   - checkout: left out for now. On dev, POST /checkout/start returns 403 (Pacsun's dev storefront
//     refuses Poq's session call), 2026-09-30.
//   - the apps' first unauthenticated try of calls that need the token (Android: products /
//     predictive / stores; iOS: the bag at app open) — 401, then a retry: an app finding; k6 sends
//     the token first.

import { account, app, catalog, product as pdp, cart, wishlist, NAMES as PLATFORM_NAMES } from '../../lib/platform/index.js';
import { randomItem, randomPoint, think } from '../../lib/data.js';
import * as pacsun from './endpoints.js';
import client from './config.js';

export const endpointNames = [...PLATFORM_NAMES, ...Object.values(pacsun.NAMES), ...client.plpVariants.map((v) => v.name)];

// ---- guest browse: read-only (no bag or wishlist writes) ----

export function guestBrowse(s, data) {
  if (!openApp(s)) return;
  think(s.cfg);
  return browse(s, data);
}

// ---- guest shopper: browse, then bag → move to wishlist → empty wishlist → store finder → info page ----

export function guestShopper(s, data) {
  const product = guestBrowse(s, data);
  if (!product) return;
  think(s.cfg);

  const bag = pacsun.addToBag(s, product);
  think(s.cfg);
  if (bag) {
    bagScreen(s, bag, product);
  } else {
    pacsun.wishlistAdd(s, product);
  }
  think(s.cfg);

  // Wishlist tab, then leave it empty: half the sessions delete the item, half use Clear All.
  once(s, 'wishlist', () => wishlist.wishlistGet(s));
  if (Math.random() < 0.5) pacsun.wishlistDelete(s, product);
  else pacsun.wishlistClear(s);
  think(s.cfg);

  // Store finder: nearby list, then a ZIP search.
  const point = randomPoint(client.storeSearchBox);
  pacsun.storesNearby(s, point);
  think(s.cfg);
  pacsun.storesByZip(s, randomItem(client.storeSearchZips), point);
  think(s.cfg);

  pacsun.webViewAssets(s); // one Account-tab info page
}

// ---- steps ----

// App start. The common calls once, plus the platform-only ones: settings/config (Android) and
// the iOS splash. The home carousels load as the user scrolls home.
function openApp(s) {
  if (!startSession(s)) return false;
  app.launch(s, client.appVersion);
  app.settings(s); // Android
  app.splash(s); // iOS
  pacsun.wishlistItemIds(s);
  const banners = app.banners(s);
  once(s, 'shop', () => catalog.shop(s));
  const stories = storyIds(banners);
  if (stories.length) app.appStories(s, stories.join(',')); // no stories carousel configured → no call
  account.accountContent(s);
  once(s, 'wishlist', () => wishlist.wishlistGet(s));
  once(s, 'bag', () => cart.getCart(s));
  think(s.cfg);
  pacsun.homeCarousels(s, banners);
  return true;
}

// Guest token for this session. poq-user-id is one id per session, generated when the session
// starts (newSession) and used for every step; the apps keep it after the guest token, so the
// token's externalUserId does not replace it here.
function startSession(s) {
  const sessionUserId = s.poqUserId;
  if (!account.guestToken(s)) return false;
  s.poqUserId = sessionUserId;
  return true;
}

// Shop → category PLP (+ next page, sorts, filter) → search → PDP. Returns the product viewed.
function browse(s, data) {
  once(s, 'shop', () => catalog.shop(s)); // already read at app start
  think(s.cfg);

  const categoryId = randomItem(data.categories);
  catalog.plp(s, categoryId);
  pacsun.plpNextPage(s, categoryId);
  think(s.cfg);
  for (const variant of client.plpVariants) catalog.plp(s, categoryId, variant);
  think(s.cfg);

  const keyword = randomItem(data.keywords);
  pacsun.predictiveProducts(s, catalog.predictiveSearch(s, typedPrefix(keyword)));
  think(s.cfg);
  catalog.search(s, keyword);
  pacsun.searchNextPage(s, keyword);
  think(s.cfg);

  const product = randomItem(data.products);
  pdp.productDetails(s, product);
  pdp.recentlyViewed(s, product);
  return product;
}

// Bag screen (get bag, unless this session already has) → quantity 2 (Edit / Done) → "Move to
// Wishlist", which the app sends as add-to-wishlist then remove-the-line. The line id comes from
// the add-to-bag response.
function bagScreen(s, bag, product) {
  once(s, 'bag', () => cart.getCart(s));
  const item = cart.cartItemFor(s, bag, product);
  if (!item) return;
  think(s.cfg);
  pacsun.updateBagItem(s, item, product, 2);
  think(s.cfg);
  pacsun.wishlistAdd(s, product);
  pacsun.deleteBagItem(s, { ...item, quantity: 2 }, product);
}

// Common requests (shop, wishlist, bag) go out once per session, even where the app re-reads them.
function once(s, key, fn) {
  s.done = s.done || {};
  if (s.done[key]) return undefined;
  s.done[key] = true;
  return fn();
}

// Story ids of the home stories carousel (banners → dynamicContentComponent → storyIds).
function storyIds(banners) {
  const ids = [];
  JSON.stringify(banners || [], (k, v) => {
    if (k === 'storyIds' && Array.isArray(v)) ids.push(...v);
    return v;
  });
  return ids;
}

// The app queries predictive search as the user types (the capture typed a full short word).
function typedPrefix(keyword) {
  return !keyword || keyword.includes(' ') ? keyword.split(' ')[0] : keyword.slice(0, 6);
}
