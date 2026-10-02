# The White Company (`twc`)

Gen-3 Poq API (`/clients/twc/…`, guest token). Reference suite: `Poq.Testing.LoadTest` branch
`twc`, `twc/twc.jmx`. Configuration: [config.js](config.js).

## Scenarios

| Scenario | In default mix | What it does |
|---|---|---|
| `guestBrowse` | no (run with `-e SCENARIOS=guestBrowse`) | **Read-only.** Guest token, open app, content data, categories, search, PLP with sort/filter, PDP. |
| `guestShopper` | 95% of requests | `guestBrowse`, then add to bag, validate, update quantity, cart sign, checkout and checkout URL, Apple Pay, delete the bag line, add to wishlist, stores. |
| `loggedInShopper` | 5% of requests | Storefront login (OAuth2 PKCE), open app, account pages, browse, bag, checkout, wishlist (emptied afterwards), gift box on 3% of sessions (bag emptied afterwards), stores, logout. |

- **Mix:** provisional, taken from the JMeter thread-group ratio.
- **Load target:** 87.08 req/s (5,225 req/min); `load` profile: 5 min ramp-up + 25 min hold.
- **Client-only calls** ([endpoints.js](endpoints.js)): Dynamic Yield, the storefront PKCE login, the gift box.

## Options

| `-e` option | Meaning |
|---|---|
| `GIFT_BOX_SHARE=0..1` | Share of logged-in sessions that add a gift box (default 0.03). `1` forces it on every logged-in session, e.g. to exercise it in a sanity run. |

## Test data

```bash
node prep/validate-products.mjs twc --env staging                   # full list: ~3.5 s per product (2,354 ≈ 2.3 h)
node prep/validate-products.mjs twc --env staging --max-valid 60    # sanity subset
node prep/validate-gift-bundles.mjs twc --env staging               # 21 bundles, a few minutes
```

- **Inputs:** `input/products.json` (2,354 ids) and `input/gift_bundles.json` (21 bundles), from Utilities `new_gen/input`.
- **Gift bundles** (`data/gift_bundles_<env>.json`) are optional: without the file, the gift box step is skipped.
- **Accounts** (`data/accounts_<env>.json`, gitignored): staging 337, prod 20, dev 326, from the JMeter suite. Prod's 20 accounts only support small logged-in concurrency.
- **Keywords:** `data/keywords.json`, 108 generic fashion terms carried over from JMeter (replacing them is an open decision).
- **Data age limit:** 12 h (`maxDataAgeHours`).

## Prod notes

- The default mix writes to live guest and customer carts and wishlists (always cleaned up afterwards). For a read-only prod check, use `-e SCENARIOS=guestBrowse`.
- Login refuses to send credentials if a non-prod run is given a prod storefront URL.
- `Recently viewed products` is slow on prod in both JMeter and k6 (p95 about 4 s): a platform finding.
