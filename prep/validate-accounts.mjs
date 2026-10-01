#!/usr/bin/env node
// Checks that the login accounts of a client work on the targeted environment before a run: for every
// account a guest token and a login, exactly as the app does (Hot Topic: bearer login, every request signed
// with poq-auth). The accounts for the `account` scenario were made for the live client; this proves they log
// in on the client the test targets (e.g. hottopic-perf).
//
//   node prep/validate-accounts.mjs <client> --env <dev|staging|prod> [options]
//
//   --allow-prod        required for --env prod
//   --max-rpm <n>       hard cap on requests per minute for the whole run (default 40; 2 requests per account)
//   --limit <n>         check only n accounts that have not been checked yet (a quick look)
//   --max-age <hours>   resume window (default 24): results younger than this are kept and not checked again
//   --fresh             ignore earlier results and check everything again
//
// Files in clients/<client>/data/ (all gitignored, they hold credentials):
//   accounts_<env>.all.json      every candidate account; created from accounts_<env>.json the first time
//   accounts_<env>.checked.json  the result per account (ok / reason / checkedAt), for resuming
//   accounts_<env>.json          the file k6 reads: every account except those known to fail (accounts not checked yet stay in)
// Credentials are never printed; progress shows only a masked address.

import { createHmac, pbkdf2Sync } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs, loadClient, createApi, nowIso } from './lib/poq-api.mjs';

const { positional, opts } = parseArgs(process.argv.slice(2), ['--env', '--max-rpm', '--limit', '--max-age']);
const [clientName] = positional;
if (!clientName || !opts.env) {
  console.error('Usage: node prep/validate-accounts.mjs <client> --env <dev|staging|prod> [--allow-prod] [--max-rpm n] [--limit n] [--max-age hours] [--fresh]');
  process.exit(2);
}
if (clientName !== 'hot_topic') {
  console.error('Only the Hot Topic login (bearer login with poq-auth signing) is implemented here. TWC logs in through its storefront and Pacsun has no accounts.');
  process.exit(2);
}

let ctx;
try {
  ctx = await loadClient(clientName, opts.env, { allowProd: opts['allow-prod'] });
} catch (e) {
  console.error(e.message);
  process.exit(2);
}

// poq-auth key: PBKDF2-HMAC-SHA256(secret key, salt, 1000, 32) from secrets/<client>.secrets (gitignored).
const secretsPath = `secrets/${clientName}.secrets`;
if (!existsSync(secretsPath)) {
  console.error(`${secretsPath} not found (needs poq-secret-key and poq-salt lines)`);
  process.exit(2);
}
const secrets = Object.fromEntries(
  readFileSync(secretsPath, 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => {
    const i = l.indexOf('=');
    return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
  }),
);
if (!secrets['poq-secret-key'] || !secrets['poq-salt']) {
  console.error(`${secretsPath} needs poq-secret-key and poq-salt`);
  process.exit(2);
}
const key = pbkdf2Sync(secrets['poq-secret-key'], secrets['poq-salt'], 1000, 32, 'sha256');
const compact = (text) => {
  let out = '';
  let inString = false;
  let escaped = false;
  for (const ch of text) {
    if (inString) {
      out += ch;
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
    } else if (ch === '"') {
      inString = true;
      out += ch;
    } else if (!/\s/.test(ch)) out += ch;
  }
  return out;
};
const sign = (body, poqUserId) => createHmac('sha256', key).update(compact(body) + poqUserId).digest('base64');

const dir = `clients/${clientName}/data`;
const livePath = `${dir}/accounts_${opts.env}.json`;
const allPath = `${dir}/accounts_${opts.env}.all.json`;
const checkedPath = `${dir}/accounts_${opts.env}.checked.json`;
if (!existsSync(allPath)) {
  if (!existsSync(livePath)) {
    console.error(`${livePath} not found`);
    process.exit(2);
  }
  copyFileSync(livePath, allPath); // the candidate list is kept; accounts_<env>.json will hold only the valid ones
}
const all = JSON.parse(readFileSync(allPath, 'utf8'));
const maxAgeMs = Number(opts['max-age'] ?? 24) * 3.6e6;
const results = new Map(); // email → { ok, reason, checkedAt }
if (!opts.fresh && existsSync(checkedPath)) {
  const doc = JSON.parse(readFileSync(checkedPath, 'utf8'));
  if (doc.env === opts.env && doc.apiPath === ctx.apiPath) {
    for (const [email, r] of Object.entries(doc.results || {})) if (Date.now() - Date.parse(r.checkedAt) <= maxAgeMs) results.set(email, r);
  }
}
const todo = all.filter((a) => !results.has(a.email)).slice(0, opts.limit ? Number(opts.limit) : undefined);
const api = createApi(ctx, { maxRpm: Number(opts['max-rpm'] ?? 40) });
const mask = (email) => `${email.slice(0, 2)}***@${email.split('@')[1] || '?'}`;

console.log(`Checking logins for ${clientName} ${opts.env} via ${ctx.apiPath}: ${all.length} accounts, ${results.size} carried over (younger than ${opts['max-age'] ?? 24} h), ${todo.length} to check, at most ${opts['max-rpm'] ?? 40} requests/min`);

process.on('SIGINT', () => {
  save();
  console.log('\nInterrupted: results saved. Run the same command to resume.');
  process.exit(130);
});

let n = 0;
for (const acct of todo) {
  n++;
  const r = await check(acct);
  results.set(acct.email, { ...r, checkedAt: nowIso() });
  console.log(`[${n}/${todo.length}] ${mask(acct.email)}: ${r.ok ? 'ok' : r.reason}`);
  if (n % 10 === 0) save();
}
const { valid, bad, usable } = save();
const reasons = {};
for (const r of bad) reasons[r.reason] = (reasons[r.reason] || 0) + 1;
console.log(`\n${valid.length} of ${all.length} accounts log in on ${ctx.apiPath}; not usable: ${bad.length}${bad.length ? ` ${JSON.stringify(reasons)}` : ''}; not checked yet: ${all.length - valid.length - bad.length}; ${livePath} now holds ${usable.length}; ${api.requestCount()} requests`);
process.exit(valid.length ? 0 : 1);

// One device, a guest token, then the login: the order of the app's account tab. Every request is signed.
async function check(acct) {
  const session = { poqUserId: crypto.randomUUID().toUpperCase(), token: null };
  const guest = await api.send(session, 'POST', '/account/guest-token', { body: '', headers: { 'Content-Type': 'text/plain', 'poq-auth': sign('', session.poqUserId) } });
  if (guest.status !== 200 || !guest.json || !guest.json.accessToken) return { ok: false, reason: `guest token failed (status ${guest.status})` };
  session.token = guest.json.accessToken; // the device id stays the poq-user-id, as in the journey
  const body = JSON.stringify({ password: acct.password, username: acct.email });
  const login = await api.send(session, 'POST', '/account/login', { body, headers: { 'poq-auth': sign(body, session.poqUserId) } });
  if (login.status === 200 && login.json && login.json.accessToken) return { ok: true };
  return { ok: false, reason: `login failed (status ${login.status})` };
}

function save() {
  const checked = Object.fromEntries(results);
  writeFileSync(checkedPath, JSON.stringify({ client: clientName, env: opts.env, apiPath: ctx.apiPath, savedAt: nowIso(), results: checked }, null, 1));
  const valid = all.filter((a) => results.get(a.email) && results.get(a.email).ok);
  const bad = all.filter((a) => results.get(a.email) && !results.get(a.email).ok).map((a) => results.get(a.email));
  // Accounts not checked yet stay in the file k6 reads, so a partial check (--limit, Ctrl+C) only removes known failures.
  const usable = all.filter((a) => !results.has(a.email) || results.get(a.email).ok);
  writeFileSync(livePath, JSON.stringify(usable.map(({ email, password }) => ({ email, password })), null, 1));
  return { valid, bad, usable };
}
