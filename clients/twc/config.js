// The White Company. Values come from Poq.Testing.LoadTest origin/twc:twc/{dev,stg,prod}.properties
// and twc/twc.jmx. App identifiers ship inside the mobile app — they are config, not secrets.

export default {
  name: 'twc',
  displayName: 'The White Company',
  apiPath: 'twc', // → /clients/twc/…
  session: 'guestToken', // Gen-3: every session starts with a guest token
  appVersion: '1.4.4',
  locale: { currency: 'GBP', country: 'GB', acceptLanguage: 'en-GB,en;q=0.9' },

  // Static app headers (twc.jmx global HeaderManager). App ids, version, user agent, poq-user-id
  // and the token are added per environment / session by lib/http.js.
  headers: {
    'Content-Type': 'application/json; charset=UTF-8',
    platform: 'iphone',
    'Accept-Language': 'en-GB,en;q=0.9',
    'Currency-Code': 'GBP',
    'Poq-Currency-Identifier': 'GBP',
    'Poq-Country-Identifier': 'GB',
  },
  // Extra headers the validators send (as the Python validators did).
  validatorHeaders: { 'poq-locale': 'en_GB', 'poq-slot-conditions': 'inStore=false&notifications=true&loggedIn=true' },
  // Validator add-to-cart proof: 'full' body + success when customData.quantityAdded > 0.
  validator: { addToCart: 'full', success: 'quantityAdded' },

  // Tweaks to shared platform endpoints (lib/platform/). TWC follows the platform contract.
  endpoints: {},

  environments: {
    dev: {
      baseUrl: 'https://dev.poq.io',
      appId: 402,
      appIdentifier: 'b617ab81-3478-49bc-aa24-2e12e6641991',
      versionCode: '1.0',
      userAgent: 'iOS/15.8 poq.ios/19.1.13 com.thewhitecompany.app/1.0.0',
    },
    staging: {
      baseUrl: 'https://staging.poq.io',
      appId: 358,
      appIdentifier: 'bb267ede-a263-420a-bb59-360847732e3a',
      versionCode: '1.0',
      userAgent: 'iOS/15.8 poq.ios/19.1.13 com.thewhitecompany.app/1.0.0',
    },
    prod: {
      baseUrl: 'https://appservices.thewhitecompany.com',
      appId: 247,
      appIdentifier: '29f0140b-340b-4fcd-81a5-e4dc2c0cf703',
      versionCode: '1.3',
      userAgent: 'The White Company - Live/4 (iPhone; iOS/18.6.2) CFNetwork/3826.600.41 Darwin/24.6.0 poq.ios/21.1.12',
      // Storefront hosting the OAuth login pages (twc.jmx hard-coded this for every env).
      storefrontOrigin: 'https://www.thewhitecompany.com',
    },
  },

  // Non-prod envs take the storefront origin from the authorization URL the API returns;
  // login refuses to send credentials if a non-prod run is pointed at one of these.
  prodStorefrontOrigins: ['https://www.thewhitecompany.com', 'https://appservices.thewhitecompany.com'],
  oauthClientId: 'iosapp',
  loginAttempts: 3,

  // Traffic mix (share of requests). Provisional: from the JMeter thread-group ratio
  // (1,265 guest vs 25 logged-in threads) until analytics data is available (plan §13).
  // guestBrowse (read-only) is not in the mix; run it alone with -e SCENARIOS=guestBrowse.
  mix: { guestShopper: 0.95, loggedInShopper: 0.05 },

  // Share of logged-in sessions that add a gift box bundle (twc load.properties giftbox.percent_executions=3).
  giftBoxShare: 0.03,

  testEmailDomain: 'poq.performance.test.com',
  applePayAddress: { countryCode: 'GB', country: 'GB', postCode: 'E1', city: 'London' },

  // Load target from twc.jmx "Load Test" timer / load.properties: 5,225 req/min ≈ 87.08 req/s,
  // ramp 300 s then hold 1,500 s.
  load: { targetRps: 87.08, rampUp: '5m', hold: '25m' },

  // Provisional until think time is agreed (plan §16). Override per run with -e THINK_TIME=min,max.
  thinkTimeSeconds: [1, 3],

  // Proposed default, pending decision (plan §16 item 4).
  maxDataAgeHours: 12,

  // UK bounding box (from the Utilities coordinates generator) for store-availability lookups.
  storeSearchBox: { lat: [49.162, 60.8604], lng: [-8.648, 1.763] },

  // PLP sort/filter options the app sends (twc.jmx "PLP Sort & Filters").
  plpVariants: [
    { name: 'PLP sort: new in', query: { sort: '+p_days_on_site' } },
    { name: 'PLP filter: exclude store-only', query: { includeStoreStock: 'False' } },
    { name: 'PLP filter: include store-only', query: { includeStoreStock: 'True' } },
    { name: 'PLP sort: price high-low', query: { sort: '-v_price_value_gbp' } },
    { name: 'PLP sort: price low-high', query: { sort: '+v_price_value_gbp' } },
  ],

  // Provisional regression guards until SLOs are agreed (plan §14.1, §16 item 3).
  // Baseline: TWC prod sanity 2026-09-21 — most catalogue/content calls p95 < 1.1 s.
  limits: {
    maxFailedRate: 0.01,
    minChecksRate: 0.99,
    prodAbortFailedRate: 0.1, // prod safety stop above this failure rate…
    prodAbortDelay: '60s', // …evaluated from this point (override per run: -e ABORT_FAILED_RATE / -e ABORT_DELAY)
    p95Ms: { default: 1500 },
  },
};
