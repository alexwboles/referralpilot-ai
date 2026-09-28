#!/usr/bin/env bash
# ReferralPilot AI — end-to-end flows against js/logic.js (no browser needed).
set -u
cd "$(dirname "$0")/.."

node <<'EOF'
const L = require('./js/logic.js');
let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log('PASS: ' + name); } else { fail++; console.log('FAIL: ' + name); } }
function throws(fn) { try { fn(); return false; } catch (e) { return true; } }

// Flow 1: full flow — build rule -> generate codes -> add referrals -> advance -> leaderboard top referrer
const rule = L.buildRule({ give: 10, get: 10, type: 'dollars', minPurchase: 25 });
ok('flow1: rule summary', rule.summary === 'Give $10 off, get $10 off, min purchase $25');
const codes = L.generateBatch('MAIN-ST', 10);
ok('flow1: 10 unique codes', codes.length === 10 && new Set(codes).size === 10 && codes.every(c => c.startsWith('MAIN-ST-')));
const r1 = L.createReferral(codes[0], 'Alice', 'Bob', 'bob@example.com');
const r2 = L.createReferral(codes[1], 'Alice', 'Carol', '');
const r3 = L.createReferral(codes[2], 'Dave', 'Erin', '');
L.advanceStatus(r1); L.advanceStatus(r1, 'rewarded');   // Alice: rewarded
L.advanceStatus(r2);                                     // Alice: completed
L.advanceStatus(r3);                                     // Dave: completed
const lb = L.leaderboard([r1, r2, r3], rule);
ok('flow1: leaderboard top referrer is Alice', lb[0].name === 'Alice' && lb[0].completed === 2 && lb[0].rewardsPaid === 10);
ok('flow1: leaderboard counts', lb[0].sent === 2 && lb[1].name === 'Dave');

// Flow 2: illegal transition sent->rewarded rejected
const bad = L.createReferral(codes[3], 'Eve', 'Frank', '');
ok('flow2: sent->rewarded rejected', throws(() => L.advanceStatus(bad, 'rewarded')));
ok('flow2: status unchanged after rejection', bad.status === 'sent');

// Flow 3: template preview fills every placeholder
const vars = L.templateVarsFromRule(rule, 'Main St Bakery', codes[4]);
ok('flow3: vars carry rule values', vars.give === '$10 off' && vars.get === '$10 off');
const sms = L.fillTemplate(L.DEFAULT_TEMPLATES.sms, vars);
ok('flow3: sms preview fills all placeholders', ['Main St Bakery', codes[4], '$10 off'].every(s => sms.includes(s)) && !/\{business\}|\{code\}|\{give\}|\{get\}/.test(sms));
const email = L.fillTemplate(L.DEFAULT_TEMPLATES.email, vars);
ok('flow3: email preview fills all placeholders', !/\{business\}|\{code\}|\{give\}|\{get\}/.test(email));

// Flow 4: stats conversion math across pipeline
const stats = L.computeStats([r1, r2, r3, bad], rule);
ok('flow4: conversion rate 75%', stats.conversionRate === 75);
ok('flow4: rewards owed = 2 x $10', stats.rewardsOwedCount === 2 && stats.rewardsOwedValue === 20);
ok('flow4: totals', stats.totalSent === 4 && stats.rewarded === 1);

// Flow 5: batch uniqueness at scale + fresh uniqueness per call
const big = L.generateBatch('PILOT', 200);
ok('flow5: 200-code batch all unique', new Set(big).size === 200);
const again = L.generateBatch('PILOT', 5);
ok('flow5: separate batches differ', again.some(c => big.indexOf(c) === -1));

// Flow 6: full business simulation — second rule type, freebie
const freeRule = L.buildRule({ give: 5, get: 5, type: 'freebie', minPurchase: 0 });
ok('flow6: freebie summary', freeRule.summary === 'Give a free item (worth up to $5), get a free item (worth up to $5)');
ok('flow6: freebie cost = get value', freeRule.costPerReferral === 5);
const fr = L.createReferral(codes[5], 'Gina', 'Hank', '');
L.advanceStatus(fr); L.advanceStatus(fr);
const fstats = L.computeStats([fr], freeRule);
ok('flow6: rewarded counts, no conversion drop', fstats.rewarded === 1 && fstats.conversionRate === 100 && fstats.rewardsOwedCount === 0);
const flb = L.leaderboard([fr], freeRule);
ok('flow6: freebie rewards paid', flb[0].rewardsPaid === 5);

// Flow 7: validation edges — bad codes, empty names, bad batch sizes
ok('flow7: empty code rejected', throws(() => L.createReferral('', 'A', 'B', '')));
ok('flow7: malformed code rejected', throws(() => L.createReferral('not-a-code', 'A', 'B', '')));
ok('flow7: empty referrer rejected', throws(() => L.createReferral(codes[6], '', 'B', '')));
ok('flow7: batch size 0 rejected', throws(() => L.generateBatch('X', 0)));
ok('flow7: terminal state cannot advance', throws(() => L.advanceStatus(fr)));

process.exit(fail ? 1 : 0);
EOF
RC=$?
if [ "$RC" -ne 0 ]; then echo "E2E RESULT: failures (see above)"; exit 1; fi
echo "E2E RESULT: all flows passed"
exit 0
