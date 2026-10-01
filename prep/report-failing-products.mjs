#!/usr/bin/env node
// Groups a run's failures by product so catalogue problems (sold out during the run,
// delisted since validation) can be told apart from platform problems (plan §14.2).
//
//   node prep/report-failing-products.mjs results/<run>/failures.log
//
// Note: failures.log holds full detail only up to FAILURE_LOG_LIMIT per VU / request / status;
// failures.csv has the complete counts.

import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node prep/report-failing-products.mjs <run-dir>/failures.log');
  process.exit(2);
}

const groups = new Map();
let failures = 0;
for (const line of readFileSync(file, 'utf8').split('\n')) {
  if (!line.startsWith('{')) continue; // setup/info lines are plain text
  let entry;
  try {
    entry = JSON.parse(line);
  } catch {
    continue;
  }
  failures++;
  const productId = entry.data && entry.data.product_id;
  if (!productId) continue;
  const status = entry.actual ? entry.actual.status : entry.reason;
  const key = [productId, entry.data.sku || '', entry.request, status].join('\t');
  groups.set(key, (groups.get(key) || 0) + 1);
}

const rows = [...groups].map(([key, count]) => [...key.split('\t'), count]).sort((a, b) => b[4] - a[4]);
console.log(`${failures} logged failures, ${rows.length} product/request/status combinations\n`);
console.log(['product_id', 'sku', 'request', 'status', 'count'].join(','));
for (const r of rows) console.log(r.map((c) => (/[",]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(','));
