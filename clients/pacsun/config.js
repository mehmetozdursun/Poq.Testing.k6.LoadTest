// Pacsun. No JMeter suite exists: values come from the dev apps captured through Charles on
// 2026-09-30 — Android (com.july.pacsun.dev, app version 87: home, shop, PLP sort/filter, search,
// PDP, bag, wishlist, store finder, walked with Maestro) and iOS (9.0.0: app open only). App
// identifiers ship inside the mobile app — they are config, not secrets. Only dev is known so far
// (staging/prod app ids not captured).
//
// Gen-3 Poq API (/clients/pacsun/…, guest-token Bearer). The app also sends a poq-auth signature;
// dev does not enforce it on guest calls (checked 2026-09-30: PDP and add-to-bag return 200 without it).

// Body check helper: the response contains all these JSON keys.
const has = (...keys) => (j, res) => keys.every((k) => res.body.includes(`"${k}"`));

export default {
  name: 'pacsun',
  displayName: 'Pacsun',
  apiPath: 'pacsun', // → /clients/pacsun/…
  session: 'guestToken',
  locale: { currency: 'USD', country: 'US', acceptLanguage: 'en-US' },

  appVersion: '87', // /launch?appVersion=87 (Android app)

  // Static app headers, as captured from the Android app. The backend treats iOS and Android the
  // same, so one header set is used for every session (user decision, 2026-09-30).
  headers: {
    'Content-Type': 'application/json; charset=UTF-8',
    platform: 'Android',
    'Currency-Code': 'USD',
    'Poq-Currency-Identifier': 'USD',
    'Poq-Country-Identifier': 'US',
    'poq-slot-conditions': 'loggedIn=false&notifications=true&inStore=false',
  },

  validatorHeaders: {},
  // Validator add-to-cart proof: the app's body {variantId, quantity, shipmentType: 'direct'};
  // success = the variant is in the returned cartItems (customData comes back empty).
  validator: { addToCart: 'direct', success: 'inCart' },

  // Tweaks to shared platform endpoints (lib/platform/), as the app calls them.
  // Structural differences (bag update/delete via POST /cart, wishlist array bodies) are in ./endpoints.js.
  endpoints: {
    guestToken: { headers: { 'Content-Type': 'Application/Json' } },
    banners: { query: { 'slot-content-id': 'home', labels: 'online' }, checks: { 'is a list': (j) => Array.isArray(j) } },
    appStories: { checks: { 'has stories': has('stories') } },
    splash: { checks: { 'has config': has('config', 'localization') } },
    accountContent: { query: { 'slot-content-id': 'account' } },
    shop: { query: { 'slot-content-id': 'shop' }, checks: { 'has categories': (j) => Array.isArray(j.categories) && j.categories.length > 0 } },
    search: { query: { 'slot-content-id': 'plp' }, checks: { 'has listings': (j) => Array.isArray(j.listings) } },
    predictive: { path: '/search/predictive/v2', checks: { 'has results': (j) => Array.isArray(j.results) } },
    plp: { checks: { 'has listings and pagination': (j) => Array.isArray(j.listings) && j.pagination } },
    getCart: { checks: { 'has cartItems': (j) => Array.isArray(j.cartItems) } },
    wishlistGet: { checks: { 'has ids': has('ids') } },
  },

  environments: {
    dev: {
      baseUrl: 'https://dev.poq.io',
      appId: 523,
      appIdentifier: '901c5f95-80e8-450a-bfd6-c7dd4983a824',
      versionCode: '1.1',
      userAgent: 'PoqApp/87',
    },
  },

  // Provisional: no analytics or JMeter baseline yet. Same browse/shop split as Hot Topic 2025.
  mix: { guestBrowse: 0.7, guestShopper: 0.3 },

  // Provisional placeholder until the team sets a target (plan §13, §16): no Pacsun baseline exists.
  load: { targetRps: 50, rampUp: '5m', hold: '25m' },

  thinkTimeSeconds: [1, 3], // provisional (plan §16)
  maxDataAgeHours: 12, // proposed default (plan §16)

  // Contiguous US, for the store finder (the app sent the device location: lat/lng).
  storeSearchBox: { lat: [24.5, 49.4], lng: [-124.8, -66.9] },
  // Store finder ZIP searches (the capture searched 90210). Provisional list of US ZIPs with stores nearby.
  storeSearchZips: ['90210', '92627', '10001', '60611', '94102', '33139', '85004', '98101'],

  // Sort and filter values the app sent on a PLP (2026-09-30). Sort ids come from the response's
  // sortOptions. "Top Rated" is offered but the app sent sort=price-high when it was picked — raised
  // as an app finding; k6 sends the offered id.
  plpVariants: [
    { name: 'PLP sort: newest', query: { sort: 'newest' } },
    { name: 'PLP sort: best sellers', query: { sort: 'Best Sellers' } },
    { name: 'PLP sort: price low-high', query: { sort: 'price-low' } },
    { name: 'PLP sort: price high-low', query: { sort: 'price-high' } },
    { name: 'PLP sort: top rated', query: { sort: 'Top Rated' } },
    { name: 'PLP sort: most reviewed', query: { sort: 'Most Reviewed' } },
    { name: 'PLP filter: size M', query: { sort: 'Featured', c_size: 'M' } },
    // Price slider: whole dollars inside the category's price range ($15–$225 on the captured PLP).
    { name: 'PLP filter: price range', query: { minPrice: 20, maxPrice: 100 } },
  ],

  // Provisional regression guards until SLOs are agreed (plan §14.1, §16 item 3). No baseline yet.
  limits: {
    maxFailedRate: 0.01,
    minChecksRate: 0.99,
    prodAbortFailedRate: 0.1,
    prodAbortDelay: '60s',
    p95Ms: { default: 1500 },
  },
};
