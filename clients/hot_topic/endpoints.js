// Hot Topic-only calls: Gen-2 bag / wishlist / stores shapes, the voucher and More screen, QAS address
// validation, and the member flow of app 26.2.0 (bearer login, profile, address book, registration).
// Standard Poq endpoints come from lib/platform/ with the tweaks in ./config.js.

import encoding from 'k6/encoding';
import { request, correlationFailure, stepBlocked } from '../../lib/http.js';
import { randomItem, randomPoint } from '../../lib/data.js';
import { productRefs } from '../../lib/platform/product.js';
import { account } from '../../lib/platform/index.js';
import client from './config.js';

export const NAMES = {
  priceFilter: 'PLP filter: price range',
  recsPdpBottom: 'Recommendations: PDP bottom',
  recsPdpTop: 'Recommendations: PDP top',
  recsRecentlyViewed: 'Recommendations: recently viewed',
  recsHomeTop: 'Recommendations: home top',
  recsHomeBottom: 'Recommendations: home bottom',
  stockByCoords: 'Store stock by coordinates',
  stockByZip: 'Store stock by zip code',
  stockDetail: 'Store stock detail',
  storeDetails: 'Store details',
  addToBag: 'Add to bag',
  updateBagItem: 'Update bag item',
  removeBagItem: 'Remove bag item',
  wishlistAdd: 'Add to wishlist',
  wishlistGet: 'Get wishlist',
  wishlistIds: 'Wishlist item ids',
  wishlistDeleteItem: 'Delete wishlist item',
  wishlistClear: 'Clear wishlist',
  stores: 'Stores',
  storesByCoords: 'Stores by coordinates',
  more: 'More screen',
  voucher: 'Add voucher',
  login: 'Login',
  updateProfile: 'Update profile',
  addresses: 'Get addresses',
  addressValidate: 'Address validate',
  addAddress: 'Add address',
  editAddress: 'Edit address',
  deleteAddress: 'Delete address',
  qasSuggestions: 'QAS: suggestions',
  qasValid: 'QAS: valid address',
  registerLookup: 'Register lookup',
  epsilonCreate: 'Loyalty profile create',
  register: 'Register',
};

const has = (...keys) => (j, res) => keys.every((k) => res.body.includes(`"${k}"`));
const WISHLIST_V3 = { 'accept-version': 'v3' };

// ---- stores (Gen-2) ----

// Store stock near a point and by zip code; if a store came back, its stock and store details.
export function storeStock(s, product) {
  const appId = s.cfg.env.appId;
  const point = randomPoint(client.storeSearchBox);
  const pick = (json) => {
    const ids = [];
    JSON.stringify(json || {}, (k, v) => {
      if (k === 'externalStoreId' && v) ids.push(v);
      return v;
    });
    return randomItem(ids);
  };
  const byCoords = request(s, {
    name: NAMES.stockByCoords,
    path: `/stores/stock/${appId}`,
    query: { lat: point.lat, lng: point.lng, sku: product.sku, notAvailableShipToStore: 'true' },
    data: { ...productRefs(product), ...point },
  });
  const byZip = request(s, {
    name: NAMES.stockByZip,
    path: `/stores/stock/${appId}`,
    query: { sku: product.sku, zipCode: client.storeSearchZip },
    data: productRefs(product),
  });
  const storeId = pick(byZip.json) || pick(byCoords.json);
  if (!storeId) return; // no store near the point / zip is a valid answer
  request(s, { name: NAMES.stockDetail, path: `/stores/stock/${appId}/${encodeURIComponent(storeId)}`, query: { sku: product.sku }, data: { ...productRefs(product), storeId } });
  // The app calls /stores/{appId}/%25?externalStoreId=… (a literal "%" path segment).
  request(s, { name: NAMES.storeDetails, path: `/stores/${appId}/%25`, query: { externalStoreId: storeId }, data: { storeId } });
}

export function stores(s) {
  const appId = s.cfg.env.appId;
  request(s, { name: NAMES.stores, path: `/stores/${appId}` });
  const point = randomPoint(client.storeSearchBox);
  request(s, { name: NAMES.storesByCoords, path: `/stores/${appId}`, query: point, data: point });
}

// ---- bag (Gen-2 bodies; updates go through POST /cart) ----

export function addToBag(s, product) {
  return request(s, {
    name: NAMES.addToBag,
    method: 'POST',
    path: '/cart/items',
    body: { quantity: 1, variantId: product.sku, productId: product.productId },
    checks: { 'has cartId': (j) => j.cartId },
    data: productRefs(product),
  }).ok;
}

export function updateBagItem(s, cartItemId, product, quantity) {
  request(s, {
    name: NAMES.updateBagItem,
    method: 'POST',
    path: '/cart',
    body: { items: [{ cartItemId, quantity, deleted: false, customData: {} }] },
    checks: { 'has cartId': (j) => j.cartId },
    data: { ...productRefs(product), cartItemId },
  });
}

export function removeBagItem(s, cartItemId, product) {
  request(s, {
    name: NAMES.removeBagItem,
    method: 'POST',
    path: '/cart',
    body: { items: [{ cartItemId, quantity: 0, deleted: true, customData: {} }] },
    data: { ...productRefs(product), cartItemId },
  });
}

export function voucher(s) {
  request(s, { name: NAMES.voucher, method: 'POST', path: `/vouchers/${s.cfg.env.appId}`, body: { voucherCode: client.voucherCode } });
}

// ---- wishlist v3 (Gen-2 shapes): add → get → delete this item → clear ----

export function wishlist(s, product) {
  request(s, {
    name: NAMES.wishlistAdd,
    method: 'POST',
    path: '/wishlist/items',
    headers: WISHLIST_V3,
    body: [{ listingId: product.listingId, productId: product.productId }],
    expect: [204],
    data: productRefs(product),
  });
  request(s, {
    name: NAMES.wishlistGet,
    path: '/wishlist',
    headers: WISHLIST_V3,
    checks: { 'not empty': (j) => Array.isArray(j.ids) && j.ids.length > 0, 'has pagination': has('pagination', 'numberOfItems') },
  });
  // JMeter sent {"productId": "${clientId}"} — an undefined variable; the intent is this product.
  request(s, {
    name: NAMES.wishlistDeleteItem,
    method: 'DELETE',
    path: '/wishlist',
    headers: WISHLIST_V3,
    body: [{ productId: product.productId }],
    expect: [204],
    data: productRefs(product),
  });
  request(s, { name: NAMES.wishlistClear, method: 'DELETE', path: '/wishlist', headers: WISHLIST_V3, expect: [204] });
}

export function more(s) {
  request(s, { name: NAMES.more, path: `/pages/${s.cfg.env.appId}/0`, checks: { 'has title': has('title') } });
}

// App start and login re-read the ids of the wishlist hearts (v3).
export function wishlistIds(s) {
  request(s, { name: NAMES.wishlistIds, path: '/wishlist/item-ids', headers: WISHLIST_V3, checks: { 'is a list': (j) => Array.isArray(j) } });
}

// The logged-in landing page reads the whole wishlist once (not the add/get/delete steps above).
export function wishlistLanding(s) {
  request(s, { name: NAMES.wishlistGet, path: '/wishlist', headers: WISHLIST_V3, checks: { 'has ids': (j) => Array.isArray(j.ids) } });
}

// ---- member flow (app 26.2.0): guest token → bearer login → profile / address book → logout ----
// The app keeps its device poq-user-id after the guest token (plan rev 20), so the id is restored.
// Every request in these journeys is signed with poq-auth (lib/http.js, s.authKey).

export function guestSession(s) {
  const deviceId = s.poqUserId;
  const session = account.guestToken(s);
  s.poqUserId = deviceId;
  return Boolean(session);
}

export function login(s, acct) {
  const { json } = request(s, {
    name: NAMES.login,
    method: 'POST',
    path: '/account/login',
    body: { password: acct.password, username: acct.email },
    checks: { 'has accessToken': (j) => j.accessToken, 'has refreshToken': (j) => j.refreshToken },
    sensitive: true,
  });
  if (!json || !json.accessToken) {
    correlationFailure(s, NAMES.login, 'accessToken');
    return false;
  }
  startMemberSession(s, json);
  return true;
}

function startMemberSession(s, tokens) {
  s.token = tokens.accessToken;
  s.refreshToken = tokens.refreshToken;
  s.headers['poq-slot-conditions'] = 'loggedIn=true';
}

// Returns the profile (the update must send it back whole), or null.
export function getProfile(s) {
  const { json } = request(s, {
    name: account.NAMES.accountProfile,
    path: '/account/profile',
    checks: { 'has profile fields': has('email', 'firstName', 'lastName', 'phone', 'customData') },
    sensitive: true,
  });
  if (!json || !json.email) {
    correlationFailure(s, account.NAMES.accountProfile, 'profile');
    return null;
  }
  return json;
}

// PUT with the whole profile; `changes` overrides the editable fields (names, newsletter).
export function updateProfile(s, profile, changes) {
  const { email, firstName, lastName, phone, dateOfBirth, isNewsletterEnabled, customData } = { ...profile, ...changes };
  return request(s, {
    name: NAMES.updateProfile,
    method: 'PUT',
    path: '/account/profile',
    body: { email, firstName, lastName, phone, dateOfBirth, isNewsletterEnabled, customData },
    expect: [204],
    sensitive: true,
  }).ok;
}

export function getAddresses(s) {
  return request(s, { name: NAMES.addresses, path: '/account/addresses', checks: { 'is a list': (j) => Array.isArray(j) }, sensitive: true }).json;
}

// POST /address/validate, as the app does before saving an address and during registration.
export function validateAddress(s, who, address, extra = {}) {
  return request(s, {
    name: NAMES.addressValidate,
    method: 'POST',
    path: '/address/validate',
    body: { addresses: [{ countryCode: 'USA', ...address }], firstName: who.firstName, lastName: who.lastName, phoneNumber: who.phone, ...extra },
    checks: { 'has match': (j) => typeof j.match === 'boolean', 'has suggestions list': (j) => Array.isArray(j.suggestedAddresses) },
    sensitive: true,
  }).json;
}

function addressBody(who, a) {
  return { firstName: who.firstName, lastName: who.lastName, phoneNumber: who.phone, address1: a.address1, city: a.city, stateCode: a.stateCode, postCode: a.postCode, countryCode: 'US' };
}

// List → add → edit (apartment) → delete a non-default address. Returns false if a step could not continue.
export function addressBook(s, profile) {
  const who = { firstName: profile.firstName, lastName: profile.lastName, phone: profile.phone };
  const a = client.addressBook;
  const lookup = { addressLine1: a.address1, city: a.city, stateCode: a.stateCode, postalCode: a.postCode };

  getAddresses(s); // the address book screen
  validateAddress(s, who, lookup);
  const added = request(s, {
    name: NAMES.addAddress,
    method: 'POST',
    path: '/account/addresses/', // the app's trailing slash
    body: { ...addressBody(who, a), isDefault: false },
    checks: { 'has id': (j) => j.id },
    sensitive: true,
  }).json;
  if (!added || !added.id) {
    correlationFailure(s, NAMES.addAddress, 'address id');
    return false;
  }
  const id = added.id;

  validateAddress(s, who, lookup);
  request(s, {
    name: NAMES.editAddress,
    method: 'PUT',
    path: `/account/addresses/${encodeURIComponent(id)}`,
    body: { ...addressBody(who, a), address2: a.address2, id, isDefault: false },
    checks: { 'has id': (j) => j.id },
    sensitive: true,
  });
  request(s, { name: NAMES.deleteAddress, method: 'DELETE', path: `/account/addresses/${encodeURIComponent(id)}`, expect: [204], sensitive: true });
  return true;
}

// ---- registration: lookup → address validate → loyalty profile → register → default address ----
// The accounts created here cannot be deleted through the API; the scenario is opt-in.

export function newPerson() {
  const r = client.registration;
  const uid = crypto.randomUUID().replace(/-/g, '');
  const [from, to] = r.birthYears;
  const year = from + Math.floor(Math.random() * (to - from + 1));
  const digits = () => 2 + Math.floor(Math.random() * 8);
  return {
    firstName: randomItem(r.firstNames),
    lastName: randomItem(r.lastNames),
    email: `k6reg.${uid.slice(0, 16)}@${r.emailDomain}`,
    // 10 digits, area code and exchange not starting with 0/1. A number the CRM already knows is
    // reported by the lookup and ends the iteration (the fixed test numbers 202-555-0143/0199 were).
    phone: `${digits()}${Math.floor(Math.random() * 100).toString().padStart(2, '0')}${digits()}${Math.floor(Math.random() * 1e6).toString().padStart(6, '0')}`,
    dateOfBirth: `${year}-0${1 + Math.floor(Math.random() * 9)}-1${Math.floor(Math.random() * 9)}T00:00:00`,
    password: `K6!${uid.slice(16, 28)}a1`, // generated per account, never logged
  };
}

export function register(s) {
  const p = newPerson();
  const a = client.registration.address;
  const who = { firstName: p.firstName, lastName: p.lastName, phone: p.phone };
  const id = { person: `${p.firstName} ${p.lastName}` };

  const lookup = request(s, {
    name: NAMES.registerLookup,
    method: 'POST',
    path: `/Account/register/lookup/${s.cfg.env.appId}`,
    body: { emailAddress: p.email, firstName: p.firstName, lastName: p.lastName, phoneNumber: p.phone },
    checks: { 'has lookup flags': has('epsilonExists', 'epsilonPartial', 'sfccExists', 'sfccPartial') },
    sensitive: true,
  }).json;
  if (!lookup) return correlationFailure(s, NAMES.registerLookup, 'lookup flags', id);
  // The app refuses to continue on any match ("Account Already in Use"); so does the journey.
  if (lookup.epsilonExists || lookup.epsilonPartial || lookup.sfccExists || lookup.sfccPartial) {
    return stepBlocked(s, NAMES.registerLookup, 'generated person already known to the CRM', id);
  }

  validateAddress(s, who, a, { emailAddress: p.email, birthDate: p.dateOfBirth });
  const loyalty = request(s, {
    name: NAMES.epsilonCreate,
    method: 'POST',
    path: '/epsilon/create',
    body: { lastName: p.lastName, firstName: p.firstName, phoneNumber: p.phone, birthDate: p.dateOfBirth, addresses: [{ countryCode: 'USA', addressLine1: a.addressLine1, addressLine2: '', postalCode: a.postalCode, city: a.city, stateCode: a.stateCode }], emailAddress: p.email },
    checks: { 'has profileId and cardNumber': (j) => j.profileId && j.cardNumber },
    sensitive: true,
  }).json;
  if (!loyalty || !loyalty.profileId) return correlationFailure(s, NAMES.epsilonCreate, 'profileId/cardNumber', id);

  // The register call that works in the team's Postman suite (2026-10-01): the Gen-2 path with the app id
  // and device id, the Gen-2 body (encryptedPassword, MM/DD/YYYY birth date), no poq-auth and no bearer.
  // The Gen-3 body captured from app 26.2.0 was refused with 403 on hottopic-perf.
  const birthDate = `${p.dateOfBirth.slice(5, 7)}/${p.dateOfBirth.slice(8, 10)}/${p.dateOfBirth.slice(0, 4)}`;
  const saved = { token: s.token, authKey: s.authKey };
  s.token = null;
  s.authKey = null;
  const { json } = request(s, {
    name: NAMES.register,
    method: 'POST',
    path: `/account/register/${s.cfg.env.appId}/${s.poqUserId}`,
    body: {
      profile: {
        phone: p.phone,
        allowDataSharing: false,
        firstName: p.firstName,
        customData: { cardNumber: loyalty.cardNumber, profileId: loyalty.profileId },
        birthDate,
        email: p.email,
        isPromotion: false,
        encryptedPassword: p.password,
        lastName: p.lastName,
      },
      credentials: { username: p.email, password: p.password },
      isPromotion: false,
    },
    checks: { 'has encryptedPassword and accountId': (j) => j.encryptedPassword && j.accountId },
    sensitive: true,
  });
  s.token = saved.token;
  s.authKey = saved.authKey;
  if (!json || !json.encryptedPassword) return correlationFailure(s, NAMES.register, 'encryptedPassword', id);

  // Default address, Gen-2 as in Postman: Basic auth with the new account's email and encryptedPassword.
  request(s, {
    name: NAMES.addAddress,
    method: 'POST',
    path: `/account/address/${s.cfg.env.appId}/${s.poqUserId}`,
    headers: { Authorization: `Basic ${encoding.b64encode(`${p.email}:${json.encryptedPassword}`)}` },
    body: { isDefaultBilling: true, firstName: p.firstName, lastName: p.lastName, address1: a.addressLine1, city: a.city, state: a.stateCode, country: 'US', postCode: Number(a.postalCode), phone: p.phone },
    checks: { 'has externalAddressId': (j) => j.externalAddressId },
    sensitive: true,
  });
}

export function qas(s) {
  const phoneNumber = `2${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;
  const body = (addr) => ({
    firstName: client.qasCustomer.firstName,
    lastName: client.qasCustomer.lastName,
    phoneNumber,
    addresses: [{ countryCode: 'USA', ...addr }],
    birthDate: client.qasCustomer.birthDate,
  });
  request(s, {
    name: NAMES.qasSuggestions,
    method: 'POST',
    path: '/address/validate',
    body: body(client.qasSuggestAddress),
    checks: { 'match false with suggestions': (j) => j.match === false && Array.isArray(j.suggestedAddresses) && j.suggestedAddresses.length > 0 },
  });
  request(s, {
    name: NAMES.qasValid,
    method: 'POST',
    path: '/address/validate',
    body: body(client.qasValidAddress),
    checks: { 'match true': (j) => j.match === true },
  });
}
