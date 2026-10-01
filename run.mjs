#!/usr/bin/env node
// Runs one client's k6 test with the standard outputs (plan §7, §14).
//
//   node run.mjs <client> <profile> --env <dev|staging|prod> [options] [-- extra k6 args]
//
// Options:
//   --allow-prod         required for --env prod
//   --allow-stale-data   run on validated data older than the client's limit (not allowed on prod)
//   --think <min,max>    think time in seconds between journey steps ("0" disables)
//   --max-rpm <n>        cap each VU at n requests/minute (smoke = 1 VU per scenario, so this is the run's rate)
//   --scenarios <a,b>    run only these scenarios (e.g. guestBrowse = read-only)
//   --rps <n> --duration <d> [--ramp <d>]   for the custom profile (absolute req/s, hold time, ramp-up; default ramp 10s)
//
// Each run writes results/<client>_<env>_<profile>_<timestamp>/ containing
// report.html, summary.json, endpoints.csv, failures.csv and failures.log.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const sep = argv.indexOf('--');
const args = sep === -1 ? argv : argv.slice(0, sep);
const k6Extra = sep === -1 ? [] : argv.slice(sep + 1);

const [clientName, profile] = args.filter((a, i) => !a.startsWith('--') && !['--env', '--think', '--rps', '--duration', '--ramp', '--scenarios', '--max-rpm'].includes(args[i - 1]));
const option = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const flag = (name) => args.includes(name);
const env = option('--env');

if (!clientName || !profile || !env) {
  console.error('Usage: node run.mjs <client> <profile> --env <dev|staging|prod> [--allow-prod] [--allow-stale-data] [--scenarios a,b] [--think min,max] [--rps n --duration d] [-- k6 args]');
  process.exit(2);
}
const script = join('clients', clientName, 'test.js');
if (!existsSync(script)) {
  console.error(`Unknown client "${clientName}" (no ${script})`);
  process.exit(2);
}

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
const runDir = join('results', `${clientName}_${env}_${profile}_${stamp}`);
mkdirSync(runDir, { recursive: true });

const k6Args = ['run', '-e', `ENV=${env}`, '-e', `PROFILE=${profile}`, '-e', `RUN_DIR=${runDir}`];
if (flag('--allow-prod')) k6Args.push('-e', 'ALLOW_PROD=true');
if (flag('--allow-stale-data')) k6Args.push('-e', 'ALLOW_STALE_DATA=true');
if (option('--think') !== undefined) k6Args.push('-e', `THINK_TIME=${option('--think')}`);
for (const [opt, name] of [['--rps', 'TARGET_RPS'], ['--duration', 'DURATION'], ['--ramp', 'RAMP_UP'], ['--scenarios', 'SCENARIOS'], ['--max-rpm', 'MAX_RPM_PER_VU']]) {
  if (option(opt) !== undefined) k6Args.push('-e', `${name}=${option(opt)}`);
}
const secrets = join('secrets', `${clientName}.secrets`);
if (existsSync(secrets)) k6Args.push(`--secret-source=file=${secrets}`);
// raw: failures.log holds one JSON object per failed request (plus plain setup/warning lines).
k6Args.push('--log-format', 'raw', '--console-output', join(runDir, 'failures.log'), ...k6Extra, script);

console.log(`k6 ${k6Args.join(' ')}\n`);
const result = spawnSync('k6', k6Args, {
  stdio: 'inherit',
  env: {
    ...process.env,
    K6_WEB_DASHBOARD: 'true',
    K6_WEB_DASHBOARD_EXPORT: join(runDir, 'report.html'),
  },
});
if (result.error) {
  console.error(`Could not start k6: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
