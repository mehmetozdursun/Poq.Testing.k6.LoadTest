---
name: app-traffic-capture
description: Discover which Poq API calls a client's mobile app really makes, by driving the iOS simulator or Android emulator with Maestro MCP and recording the traffic with Charles, then turning the capture into an endpoint inventory and k6 journeys under clients/<client>/. Use this whenever the user wants to add a new client from its app, "discover"/"capture"/"sniff" an app's endpoints, compare iOS vs Android app starts, check what a screen (bag, wishlist, store finder, filters, checkout, login…) calls, find endpoints a k6 client is missing, or shares a Charles export and asks what it covers — even if they don't say Maestro or Charles by name.
---

# App traffic capture (Maestro + Charles → k6 client)

The app is the source of truth for a client's load profile. JMeter suites and old CSVs drift; the
app's own requests do not. This skill walks the app screen by screen, records every Poq API call
per step, and maps the result onto this repo's k6 structure (see the project `CLAUDE.md`: shared
endpoints in `lib/platform/`, small differences as `config.js` tweaks, structural ones in
`clients/<client>/endpoints.js`).

Scripts live next to this file in `scripts/` — use them instead of re-writing export/filter code:

| Script | What it does |
|---|---|
| `charles_capture.py clear` / `export OUT.json --host H` | Talks to the Charles web interface. Prints matching calls with secrets masked; saves the unmasked session as evidence. |
| `capture_step.sh <dir> <step> [host]` | Export → print Poq calls → clear. One call per app action. |
| `proxy.sh android on\|off\|status` · `proxy.sh ios status` | Route the emulator through Charles and check Charles is reachable; iOS notes inside. |
| `summarize_capture.py <dir-or-files> [--timeline]` | Endpoint inventory, identity headers per platform, findings (4xx, 401-then-retry, polling). Works on a Charles export the user hands over too. |

Refer to them as `S=.claude/skills/app-traffic-capture/scripts`.

## Safety first (non-negotiable, from the project rules)

- **Dev/staging builds only** unless the user explicitly asks for a prod app in this conversation.
- **Ask before any step with external effects**: opening checkout, placing orders, applying a real
  promo code, registering, forgot-password, sign-in with real accounts. "Yes, capture it" for one
  screen is not approval for the next. If the permission classifier blocks a tap, stop and ask.
- **Evidence stays out of git.** Saved JSON exports are unmasked (tokens, cookies). Put them in the
  session scratchpad, or `results/captures/…` (gitignored). Never quote a token, password or email
  in chat or docs — the scripts' printed output is already masked; keep it that way.
- **Leave the app and device as you found them**: empty the bag and wishlist you filled, and turn
  the Android proxy off at the end (`proxy.sh android off`).

## 1. Preflight

1. **Maestro MCP tools present?** Search for `mcp__maestro__*`. If they are missing, the server is
   probably registered with local scope in another folder: tell the user
   `claude mcp add maestro -s user -- maestro mcp` and a session restart are needed (the `maestro`
   CLI still works as a fallback). Then `list_devices` → pick the connected emulator/simulator; share
   the Maestro Viewer link it prints.
2. **Charles**: `bash $S/proxy.sh android status` (or `ios status`) — must say "reachable".
3. **Route the device through Charles**
   - Android emulator: `bash $S/proxy.sh android on`.
   - iOS simulator: Charles > Proxy > macOS Proxy on, root cert installed in the simulator (see
     `proxy.sh`). Physical devices: manual Wi-Fi proxy to the Mac.
4. **Find the app id**: `adb shell pm list packages | grep -i <client>` / `xcrun simctl listapps booted`.
5. **Prove decryption before walking anything**: `python3 $S/charles_capture.py clear`, launch the
   app (`launchApp: { clearState: true }` for a true first open), then `capture_step.sh`. If the API
   host shows `!! NOT DECRYPTED` or calls end in `EXCEPTION`, fix SSL Proxying / CA trust first (the
   user may prefer to fix Charles themselves — ask).

## 2. Walk the app, one action per capture

Loop for every screen: **clear → Maestro action → wait → `capture_step.sh <dir> NN_name`**. Number
the steps (`01_launch`, `05_plp_sort`…) so files sort in order. Read the printed calls after each
step and note anything surprising right away — it is much harder to attribute later.

Maestro working habits (details and gotchas in `references/maestro-tips.md`):
- `inspect_screen` before targeting; copy `txt` values verbatim; use `id:` for toolbar/tab items.
- Labels that change after a choice (e.g. "Sort by" becomes "Price - Low to High") → tap by
  `point:` instead.
- Many edits only send a request on confirm ("Done", "Apply Filters", "Save Selection", "Yes").
- System dialogs (Google sign-in, OneTrust consent) can appear — screenshot when a flow fails.

### Screens to cover (guest first)

Walk every row that exists in the app; say explicitly which ones you skipped and why.

| Area | Actions |
|---|---|
| App open | cold start (clearState) incl. consent; relaunch (token refresh); scroll home (carousels, stories) |
| Catalogue | shop tab + a sub-category; PLP + scroll (page 2); **every** sort; each filter type incl. the **price slider**; search: type (predictive) then submit + scroll |
| PDP | open from PLP and from search; colour/size change; reviews / recommendations if shown |
| Bag | add (with size), open bag, quantity change, remove, **Move to Wishlist**, promo code (ask first) |
| Wishlist | add from PLP heart and PDP, open tab, single delete, **Clear All** (with 2+ items) |
| Stores | store finder nearby, **ZIP search**, store detail, map tab |
| Account (guest) | every page in the tab — many are web views; note which Poq calls they make |
| Ask first | checkout (stop at the checkout page, submit nothing), sign-in / logged-in journey, register |

### Both platforms

Capture at least the **app open on iOS and on Android**: that is where platform-only endpoints show
up (e.g. the iOS splash vs Android `settings/config`). Everything else hits the same backend
endpoints, and k6 uses one session type that includes each platform-only call. If only one device
is available, ask the user for a Charles export from the other (File > Export Session > JSON) and
run `summarize_capture.py --timeline` on it.

## 3. Analyse

Run `python3 $S/summarize_capture.py <dir> --timeline` and read it with these questions:

- **Which Poq endpoints and parameters** does each step use (query keys, bodies, accept-version)?
- **Identity headers per platform** — these become the client config's static/per-platform headers.
- **Auth**: guest token? refresh? `poq-auth` signature (constant on GETs = HMAC over an empty body;
  check with one dev request whether it is enforced)? Calls sent before the token (401 → retry)?
- **Noise vs load**: endpoints polled constantly or always failing (e.g. an unconfigured Dynamic
  Yield `identifiers` returning 404) are findings, not journey steps — a 4xx is never a pass.
- **Repeats**: the app re-reads some calls (shop, wishlist, bag). The user's rule for k6: each
  common request **once per session**; take ids from responses you already have.
- **Session identity**: `poq-user-id` is one id per session — generated at app start and used for
  every step (catalogue, PDP, bag, wishlist, stores…); a new session starts with a new id. Check the
  capture confirms it, and keep it after the guest token (don't switch to `externalUserId`).
- **Web views**: client storefront pages are not Poq's and are not load-tested; only the Poq calls
  they trigger (e.g. `/assets/web/css|js/...`) count.
- **Security findings**: secrets or other clients' URLs in public settings/splash config.

## 4. Map to the k6 client

Follow the project `CLAUDE.md` and the existing clients (`clients/twc`, `clients/hot_topic`,
`clients/pacsun` — Pacsun was built with this workflow and is the closest template):

1. Standard endpoint as-is → call `lib/platform/*`. Only a path/query/header/check difference → a
   tweak in `config.js` `endpoints`. Different shape (body, method, flow) → `clients/<client>/endpoints.js`.
   Request **names** match other clients for the same endpoint.
2. iOS vs Android: the backend treats them the same, so use **one session type** — do not split
   sessions or headers by platform. The app start makes the common calls once plus every
   platform-only endpoint (e.g. Android `settings/config` and the iOS splash).
3. Product ids for the validator: crawl category PLPs on the **same non-prod environment** at a
   gentle rate (≤ 60 req/min) into `clients/<client>/input/products_<env>.txt`, then validate with
   `node prep/validate-products.mjs <client> --env <env>` (sanity subset allowed only for sanity runs).
4. Verify: `k6 inspect` for every touched client, then a dev smoke — report requests/iteration,
   failures with their failure-log reason, one `poq-user-id` per session, and that cleanup left
   bag/wishlist empty.
5. Record what was captured, left out (and why) and findings as a new revision row in
   `.claude/k6-migration-plan.md`; client details go in `clients/<client>/README.md` (the root
   README stays generic).

## 5. Report back

Give the user: the endpoint table (per app start + shared journey), what each new step added,
what is deliberately left out and why (e.g. checkout 403 on dev, DY 404), open decisions
(provisional mix, load target, limits, keywords), and app/platform findings.
Finish by restoring the proxy and saying whether the app's bag/wishlist were left empty.
