// Test-data loading and small runtime generators.
// Validated data (products, bundles) is produced by prep/ before each run (plan §10.1);
// k6 only loads it and refuses to start if it is stale or for the wrong environment.

import { SharedArray } from 'k6/data';
import { sleep } from 'k6';

/**
 * Loads a validated data file: { client, env, generatedAt, summary, <listKey>: [...] }.
 * Pass an absolute URL from the caller, e.g. import.meta.resolve('./data/products_staging.json').
 */
export function loadValidated(name, path, listKey, { optional = false } = {}) {
  const read = () => {
    try {
      return JSON.parse(open(path));
    } catch (e) {
      if (optional && /no such file|not exist|cannot find/i.test(String(e))) return null;
      throw e;
    }
  };
  const meta = new SharedArray(`${name}:meta`, () => {
    const doc = read();
    if (!doc) return [{ missing: true, count: 0 }];
    const { [listKey]: items, rejected, ...rest } = doc;
    return [{ ...rest, count: items.length }];
  })[0];
  const items = new SharedArray(name, () => {
    const doc = read();
    return doc ? doc[listKey] : [];
  });
  return { meta, items };
}

// Called from setup(). Returns a warning string when stale data was explicitly allowed.
export function assertDataFresh(cfg, label, meta) {
  if (meta.env !== cfg.envName) {
    throw new Error(`${label} was generated for "${meta.env}", but this run targets "${cfg.envName}"`);
  }
  if (!meta.count) throw new Error(`${label} contains no items — re-run the validator`);

  const ageHours = (Date.now() - Date.parse(meta.generatedAt)) / 3.6e6;
  if (!(ageHours <= cfg.maxDataAgeHours)) {
    const msg = `${label} is ${ageHours.toFixed(1)} h old (limit ${cfg.maxDataAgeHours} h, generated ${meta.generatedAt})`;
    if (!cfg.allowStaleData) {
      throw new Error(`${msg}. Re-run the validator before testing (or -e ALLOW_STALE_DATA=true outside prod).`);
    }
    console.warn(`STALE DATA ALLOWED: ${msg}`);
    return msg;
  }
  return null;
}

// Optional per-env list (e.g. accounts): an empty list when the file doesn't exist.
export function loadOptionalJson(name, path) {
  return new SharedArray(name, () => {
    try {
      return JSON.parse(open(path));
    } catch (e) {
      if (/no such file|not exist|cannot find/i.test(String(e))) return [];
      throw e;
    }
  });
}

export function loadList(name, path) {
  return new SharedArray(name, () => JSON.parse(open(path)));
}

export function randomItem(list) {
  return list[Math.floor(Math.random() * list.length)];
}

export function randomPoint(box) {
  return {
    lat: (box.lat[0] + Math.random() * (box.lat[1] - box.lat[0])).toFixed(6),
    lng: (box.lng[0] + Math.random() * (box.lng[1] - box.lng[0])).toFixed(6),
  };
}

export function think(cfg) {
  const [min, max] = cfg.thinkTime;
  if (max > 0) sleep(min + Math.random() * (max - min));
}
