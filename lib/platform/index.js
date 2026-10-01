// Standard Poq platform endpoints, one module per area. Clients import what they use:
//   import * as platform from '../../lib/platform/index.js';  platform.catalog.search(s, keyword)
// Per-client differences go in the client's config.js `endpoints` (see lib/http.js applyTweak);
// client-only integrations go in clients/<client>/endpoints.js.

import * as account from './account.js';
import * as app from './app.js';
import * as catalog from './catalog.js';
import * as product from './product.js';
import * as cart from './cart.js';
import * as wishlist from './wishlist.js';
import * as stores from './stores.js';
import * as checkout from './checkout.js';

export { account, app, catalog, product, cart, wishlist, stores, checkout };

// Every platform request name (thresholds and reports cover all of them; unused ones stay out of the report).
export const NAMES = [account, app, catalog, product, cart, wishlist, stores, checkout].flatMap((m) => Object.values(m.NAMES));
