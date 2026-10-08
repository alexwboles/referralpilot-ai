#!/usr/bin/env bash
# ReferralPilot AI — smoke tests. Fail fast. Exit code = number of failures.
set -u
cd "$(dirname "$0")/.."

PASS=0
FAIL=0

pass() { PASS=$((PASS + 1)); echo "PASS: $1"; }
fail() { FAIL=$((FAIL + 1)); echo "FAIL: $1"; }

# --- 1. File existence ---
for f in index.html css/style.css js/logic.js js/app.js README.md test/smoke.sh test/e2e.sh; do
  if [ -f "$f" ]; then pass "file exists: $f"; else fail "file exists: $f"; fi
done
if [ "$FAIL" -gt 0 ]; then echo "RESULT: $PASS passed, $FAIL failed"; exit "$FAIL"; fi

# --- 2. Syntax checks ---
if node --check js/logic.js; then pass "node --check js/logic.js"; else fail "node --check js/logic.js"; fi
if node --check js/app.js; then pass "node --check js/app.js"; else fail "node --check js/app.js"; fi
if [ "$FAIL" -gt 0 ]; then echo "RESULT: $PASS passed, $FAIL failed"; exit "$FAIL"; fi

# --- 3. Logic checks (node heredoc, relative require from repo root) ---
node <<'EOF'
const L = require('./js/logic.js');
let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log('PASS: ' + name); } else { fail++; console.log('FAIL: ' + name); } }

// 3a. Code format: MAIN-ST-7K2Q style
const c = L.generateCode('MAIN-ST');
ok('generateCode format', /^[A-Z0-9-]{1,17}-[A-Z0-9]{4}$/.test(c) && c.startsWith('MAIN-ST-'));
ok('generateCode sanitizes prefix', L.generateCode('  main st!! ').startsWith('MAIN-ST-'));

// 3b. Batch uniqueness
const batch = L.generateBatch('TEST', 50);
ok('generateBatch length', batch.length === 50);
ok('generateBatch uniqueness', new Set(batch).size === 50);

// 3c. Rule summary sentence
const rule = L.buildRule({ give: 10, get: 10, type: 'dollars', minPurchase: 25 });
ok('buildRule summary', rule.summary === 'Give $10 off, get $10 off, min purchase $25');
ok('buildRule cost', rule.costPerReferral === 10);
const ruleNoMin = L.buildRule({ give: 20, get: 15, type: 'percent', minPurchase: 0 });
ok('buildRule no-min summary', ruleNoMin.summary === 'Give 20% off, get 15% off');

// 3d. Status transition validation (incl. illegal skip)
const r1 = L.createReferral(L.generateCode('X'), 'Alice', 'Bob', '');
ok('createReferral starts sent', r1.status === 'sent');
let threw = false;
try { L.advanceStatus(r1, 'rewarded'); } catch (e) { threw = true; }
ok('illegal skip sent->rewarded rejected', threw && r1.status === 'sent');
L.advanceStatus(r1); ok('sent->completed allowed', r1.status === 'completed');
threw = false;
try { L.advanceStatus(r1, 'sent'); } catch (e) { threw = true; }
ok('backward transition rejected', threw);
L.advanceStatus(r1, 'rewarded'); ok('completed->rewarded allowed', r1.status === 'rewarded');
ok('rewarded is terminal', L.nextStatus(r1) === null && !L.canAdvance(r1));

// 3e. Leaderboard ordering
const mk = (code, name, status) => { const r = L.createReferral(code, name, 'F', ''); r.status = status; return r; };
const refs = [
  mk('B-AA2A', 'Zoe', 'rewarded'), mk('B-BB2B', 'Zoe', 'rewarded'),
  mk('B-CC3C', 'Amy', 'completed'), mk('B-DD4D', 'Amy', 'completed'), mk('B-EE5E', 'Amy', 'completed'),
  mk('B-FF6F', 'Max', 'sent')
];
const lb = L.leaderboard(refs, { get: 5 });
ok('leaderboard ranks by completed first', lb[0].name === 'Amy');
ok('leaderboard tiebreak by rewarded', (() => {
  const tie = [mk('B-GG7G', 'P', 'rewarded'), mk('B-HH8H', 'P', 'rewarded'),
               mk('B-JJ9J', 'Q', 'completed'), mk('B-KK2K', 'Q', 'completed')];
  return L.leaderboard(tie)[0].name === 'P';
})());
ok('leaderboard rewards paid math', lb.filter(x => x.name === 'Zoe')[0].rewardsPaid === 10);

// 3f. Template placeholder fill
const filled = L.fillTemplate('Hi {business}, use {code}: give {give}, get {get}.', { business: 'Acme', code: 'ACME-1A2B', give: '$10 off', get: '15% off' });
ok('fillTemplate fills all placeholders', filled === 'Hi Acme, use ACME-1A2B: give $10 off, get 15% off.');

// 3g. Stats math
const stats = L.computeStats([
  mk('B-KK2K', 'A', 'sent'), mk('B-RR3R', 'A', 'completed'), mk('B-MM4M', 'A', 'rewarded'), mk('B-NN5N', 'A', 'completed')
], { get: 10 });
ok('stats totals', stats.totalSent === 4 && stats.completed === 2 && stats.rewarded === 1);
ok('stats conversion rate', stats.conversionRate === 75);
ok('stats rewards owed', stats.rewardsOwedCount === 2 && stats.rewardsOwedValue === 20);

// 3h. Exports sanity
ok('exports all public functions', ['generateCode','generateBatch','buildRule','advanceStatus','leaderboard','fillTemplate','computeStats','createReferral','isValidCodeFormat','referralsToCSV','filterReferrals','findDuplicate','markAllRewarded','conversionByMonth'].every(k => typeof L[k] === 'function'));

// 3i. Referral CSV export
const csvRefs = [
  L.createReferral('B-AA2A', 'Alice', 'Bob', 'bob@example.com'),
  L.createReferral('B-BB2B', 'Alice', 'Carol "CJ"', '')
];
csvRefs[0].status = 'completed';
const csv = L.referralsToCSV(csvRefs);
const csvLines = csv.split('\n');
ok('referralsToCSV header + 2 rows', csvLines.length === 3 && /^Code,Referrer,Friend/.test(csvLines[0]));
ok('referralsToCSV escapes quotes', csvLines[2].indexOf('"Carol ""CJ"""') !== -1);
ok('referralsToCSV carries status', csvLines[1].indexOf(',completed,') !== -1);
ok('referralsToCSV empty list = header only', L.referralsToCSV([]).split('\n').length === 1);

// 3j. Search + status filter
const fre = L.filterReferrals(csvRefs, 'alice', '');
ok('filterReferrals matches referrer', fre.length === 2);
ok('filterReferrals narrows by friend', L.filterReferrals(csvRefs, 'carol', '').length === 1);
ok('filterReferrals case-insensitive', L.filterReferrals(csvRefs, 'BOB', '').length === 1);
ok('filterReferrals status filter', L.filterReferrals(csvRefs, '', 'completed').length === 1);
ok('filterReferrals query+status combine', L.filterReferrals(csvRefs, 'alice', 'sent').length === 1);
ok('filterReferrals no match', L.filterReferrals(csvRefs, 'zzz', '').length === 0);

// 3k. Duplicate detection
const dup1 = L.findDuplicate(csvRefs, 'Bob', '');
ok('findDuplicate by friend name', dup1 && dup1.code === 'B-AA2A');
const dup2 = L.findDuplicate(csvRefs, 'Nobody', 'bob@example.com');
ok('findDuplicate by contact', dup2 && dup2.code === 'B-AA2A');
ok('findDuplicate no match', L.findDuplicate(csvRefs, 'Zed', 'zed@x.com') === null);
ok('findDuplicate empty input', L.findDuplicate(csvRefs, '', '') === null);

// 3l. Bulk reward + monthly trend
const bulk = [
  L.createReferral('B-CC3C', 'Amy', 'F1', ''), L.createReferral('B-DD4D', 'Amy', 'F2', ''),
  L.createReferral('B-EE5E', 'Amy', 'F3', '')
];
L.advanceStatus(bulk[0]); L.advanceStatus(bulk[1]); // 2 completed, 1 sent
bulk[0].createdAt = '2026-09-05T00:00:00.000Z';
bulk[1].createdAt = '2026-10-05T00:00:00.000Z';
bulk[2].createdAt = '2026-10-06T00:00:00.000Z';
const rewarded = L.markAllRewarded(bulk);
ok('markAllRewarded counts', rewarded === 2);
ok('markAllRewarded advances all', bulk.every(r => r.status !== 'completed'));
const trend = L.conversionByMonth(bulk);
ok('conversionByMonth buckets', trend.length === 2 && trend[0].month === '2026-09' && trend[1].month === '2026-10');
ok('conversionByMonth math', trend[0].sent === 1 && trend[0].converted === 1 && trend[0].conversionRate === 100);
ok('conversionByMonth partial', trend[1].sent === 2 && trend[1].converted === 1 && trend[1].conversionRate === 50);
ok('markAllRewarded empty is 0', L.markAllRewarded([]) === 0);

process.exit(fail ? 1 : 0);
EOF
NODE_RC=$?

if [ "$NODE_RC" -ne 0 ]; then
  FAIL=$((FAIL + 1))
  echo "FAIL: embedded node logic checks (see above)"
else
  PASS=$((PASS + 1))
  echo "PASS: embedded node logic checks"
fi

# --- 4. New UI wiring ---
for id in ref-search ref-status-filter export-referrals reward-all trend-rows; do
  if grep -q "id=\"$id\"" index.html; then pass "wired: #$id in HTML"; else fail "missing #$id in HTML"; fi
done
for fn in filterReferrals findDuplicate markAllRewarded conversionByMonth referralsToCSV; do
  if grep -q "$fn" js/app.js; then pass "wired: $fn in app.js"; else fail "missing $fn in app.js"; fi
done
grep -q "tracker-tools" css/style.css && pass "tracker-tools styles" || fail "tracker-tools styles missing"

echo "RESULT: $PASS passed, $FAIL failed"
exit "$FAIL"
