# Maestro tips for capture walks

Learned while capturing the Pacsun Android/iOS dev apps (2026-09-30). Read when a flow fails or
before walking a new app.

## Setup
- MCP workflow: `list_devices` → `inspect_screen` → `run` (inline YAML with `appId:` + `---`).
  Every call needs `device_id`.
- `launchApp: { clearState: true }` gives a real first open (consent screen, new guest token, no
  cached content). A plain `launchApp` keeps state and often shows a token refresh instead.
- `waitForAnimationToEnd: { timeout: N }` after every action that loads data; then capture.

## Targeting
- Copy `txt` from `inspect_screen` exactly — text matching is a full-string, case-insensitive regex.
  Sizes like `"MED   SIZE"` contain several spaces.
- Toolbar and tab-bar items are icons: use `id:` (e.g. `…:id/action_search`, `…:id/action_bag`,
  `…:id/navigation_item_two/three/four`).
- Icons with no text or id (wishlist heart, bin, qty +/−, back arrow) → `point: "x%,y%"`; take a
  screenshot first and compute the percentage. Re-check after layout changes — a heart at the same
  point may belong to another card after scrolling.
- Controls whose label changes after use (sort bar showing the chosen sort) → `point:`.
- Sliders: `swipe: { start: "8%,52%", end: "35%,52%", duration: 800 }` on each thumb.
- `inputText` then `pressKey: Enter` submits search / ZIP fields.

## Requests that fire late or not at all
- Bag edits (quantity, delete) are sent on **Done**, filters on **Apply Filters** (after **Save
  Selection** in a sub-list), Clear All after the **Yes** confirmation.
- Cached screens send nothing on reopen (store list, shop tree) — force a fresh request (ZIP
  search, relaunch with clearState) if you need the call.
- Web views (account info pages, checkout) load the client's storefront plus trackers; only the
  API host matters. Use `SHOW_ALL=1` or the host filter to see everything when unsure.

## When a flow fails
- `Element not found` usually means a different screen is showing: take a screenshot. Common
  culprits: consent dialogs after relaunch, Google sign-in prompts (tap SKIP), a bottom sheet still
  open (use `back`), or you are one level deeper than you think (tap the back arrow, not the tab).
- Do not retry a tap the permission classifier denied (e.g. "Checkout Securely"): ask the user.
