// Standard Poq account endpoints (Gen-3). Client-specific login flows live in clients/<client>/endpoints.js.

import { request, correlationFailure } from '../http.js';

export const NAMES = {
  guestToken: 'Guest token',
  refreshToken: 'Refresh token',
  accountContent: 'Account content',
  accountProfile: 'Account profile',
  accountCookies: 'Account cookies',
  logout: 'Logout',
};

// Starts a guest session: token + externalUserId (used as poq-user-id from here on).
export function guestToken(s, name = NAMES.guestToken) {
  const { json } = request(s, {
    key: 'guestToken',
    name,
    method: 'POST',
    path: '/account/guest-token',
    headers: { 'Content-Type': 'text/plain' },
    body: '',
    sensitive: true,
    checks: { 'has accessToken': (j) => j.accessToken, 'has externalUserId': (j) => j.externalUserId },
  });
  if (!json || !json.accessToken || !json.externalUserId) {
    correlationFailure(s, name, 'accessToken/externalUserId');
    return null;
  }
  s.token = json.accessToken;
  s.refreshToken = json.refreshToken;
  s.poqUserId = json.externalUserId;
  return json;
}

export function refreshToken(s) {
  if (!s.refreshToken) return correlationFailure(s, NAMES.refreshToken, 'refreshToken');
  request(s, {
    key: 'refreshToken',
    name: NAMES.refreshToken,
    method: 'POST',
    path: '/account/refresh-token',
    body: { refreshToken: s.refreshToken },
    sensitive: true,
  });
}

export function accountContent(s) {
  request(s, { key: 'accountContent', name: NAMES.accountContent, path: '/account/content' });
}

// Logged-in account pages.
export function accountPages(s) {
  accountContent(s);
  request(s, { key: 'accountProfile', name: NAMES.accountProfile, path: '/account/profile', sensitive: true });
  request(s, { key: 'accountCookies', name: NAMES.accountCookies, path: '/account/cookies', sensitive: true });
}

export function logout(s) {
  request(s, { key: 'logout', name: NAMES.logout, method: 'POST', path: '/account/logout', expect: [204] });
}
