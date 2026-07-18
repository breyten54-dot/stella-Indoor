// Unit proof for K-9: localDateStr (src/lib/dates.ts) vs the old toISOString date keys,
// exactly inside the 00:00–02:00 SAST window where UTC is still yesterday.
// Imports the REAL shipped implementation — no copy. Fails loudly (exit 1) on any failure.
// Run: node testing-tools/local-date-str-check.mts
import { localDateStr } from '../stella-indoor-source/src/lib/dates.ts';

let failures = 0;
function check(name: string, actual: string, expected: string) {
  const ok = actual === expected;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: got '${actual}', expected '${expected}'`);
  if (!ok) failures++;
}

// PRECONDITION (loud): these exact-string assertions assume a UTC+2 machine (the Stella E2E host).
// getTimezoneOffset() returns minutes BEHIND UTC, so UTC+2 => -120.
check('precondition: machine timezone is UTC+2', String(new Date().getTimezoneOffset()), '-120');

// INSIDE the bug window: 2026-07-19 00:30 SAST is still 2026-07-18 22:30 UTC.
const inWindow = new Date('2026-07-19T00:30:00+02:00');
check('window 00:30 — OLD toISOString key (the BUG: yesterday)', inWindow.toISOString().split('T')[0], '2026-07-18');
check('window 00:30 — NEW localDateStr key (the FIX: local day)', localDateStr(inWindow), '2026-07-19');

// Just BEFORE the window: 2026-07-18 23:59 SAST = 2026-07-18 21:59 UTC (both agree).
const before = new Date('2026-07-18T23:59:00+02:00');
check('before window 23:59 — localDateStr agrees with local day', localDateStr(before), '2026-07-18');
check('before window 23:59 — toISOString agrees too', before.toISOString().split('T')[0], '2026-07-18');

// Just AFTER the window: 2026-07-19 02:00 SAST = 2026-07-19 00:00 UTC (both agree again).
const after = new Date('2026-07-19T02:00:00+02:00');
check('after window 02:00 — localDateStr', localDateStr(after), '2026-07-19');
check('after window 02:00 — toISOString agrees too', after.toISOString().split('T')[0], '2026-07-19');

// Zero-padding of single-digit month/day.
check('zero-padding 2026-03-05', localDateStr(new Date('2026-03-05T12:00:00+02:00')), '2026-03-05');

if (failures > 0) {
  console.error(`\nFATAL: ${failures} check(s) FAILED`);
  process.exit(1);
}
console.log('\nAll checks passed — localDateStr differs from the old UTC key EXACTLY inside 00:00–02:00 SAST.');
