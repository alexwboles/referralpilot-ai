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
ok('exports all public functions', ['generateCode','generateBatch','buildRule','advanceStatus','leaderboard','fillTemplate','computeStats','createReferral','isValidCodeFormat'].every(k => typeof L[k] === 'function'));

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

echo "RESULT: $PASS passed, $FAIL failed"
exit "$FAIL"
