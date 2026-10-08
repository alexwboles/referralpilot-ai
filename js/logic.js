/* ReferralPilot AI — pure logic module.
 * Browser + Node compatible. No DOM, no network, no API keys.
 * The only non-deterministic part is the random segment of referral codes.
 */

'use strict';

var CODE_SUFFIX_LEN = 4;
var CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no lookalikes (0/O, 1/I/L)

var STATUS = {
  SENT: 'sent',
  COMPLETED: 'completed',
  REWARDED: 'rewarded'
};

// Allowed one-step transitions; no skipping.
var ALLOWED_TRANSITIONS = {
  sent: ['completed'],
  completed: ['rewarded'],
  rewarded: []
};

function normalizePrefix(prefix) {
  return String(prefix === null || prefix === undefined ? '' : prefix)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 16) || 'REF';
}

function randomSegment(len, rand) {
  rand = rand || Math.random;
  var out = '';
  for (var i = 0; i < len; i++) {
    out += CODE_ALPHABET.charAt(Math.floor(rand() * CODE_ALPHABET.length));
  }
  return out;
}

// Single referral code, e.g. "MAIN-ST-7K2Q".
function generateCode(prefix, rand) {
  return normalizePrefix(prefix) + '-' + randomSegment(CODE_SUFFIX_LEN, rand);
}

// Batch of n unique codes. Throws on invalid n.
function generateBatch(prefix, n, rand) {
  n = Math.floor(Number(n));
  if (!isFinite(n) || n < 1 || n > 1000) {
    throw new Error('Batch size must be an integer between 1 and 1000.');
  }
  var codes = [];
  var seen = {};
  var guard = 0;
  while (codes.length < n && guard < n * 50) {
    guard++;
    var code = generateCode(prefix, rand);
    if (!seen[code]) {
      seen[code] = true;
      codes.push(code);
    }
  }
  if (codes.length < n) {
    throw new Error('Could not generate ' + n + ' unique codes.');
  }
  return codes;
}

// Code format check: PREFIX-XXXX where XXXX is 4 chars from the alphabet.
function isValidCodeFormat(code) {
  return /^[A-Z0-9-]{1,17}-[A-Z0-9]{4}$/.test(String(code)) &&
    new RegExp('^[' + CODE_ALPHABET.replace(/\]/g, '') + ']{4}$').test(String(code).slice(-4));
}

var REWARD_TYPES = {
  dollars: { label: '$ off', kind: 'money' },
  percent: { label: '% off', kind: 'percent' },
  freebie: { label: 'freebie', kind: 'item' }
};

function money(n) {
  var v = Number(n);
  return '$' + (Math.floor(v) === v ? String(v) : v.toFixed(2));
}

// Build a reward rule: {give, get, type, minPurchase} -> {summary, costPerReferral, ...}
function buildRule(opts) {
  opts = opts || {};
  var give = Math.max(0, Number(opts.give) || 0);
  var get = Math.max(0, Number(opts.get) || 0);
  var type = REWARD_TYPES[opts.type] ? opts.type : 'dollars';
  var minPurchase = Math.max(0, Number(opts.minPurchase) || 0);

  var giveText, getText, costPerReferral;
  if (type === 'percent') {
    giveText = give + '% off';
    getText = get + '% off';
    // Percent cost depends on average order value; estimate assumes AOV = 2x min purchase
    // or $50 fallback, expressed as a range note in the summary.
    var aov = minPurchase > 0 ? minPurchase * 2 : 50;
    costPerReferral = (get / 100) * aov;
  } else if (type === 'freebie') {
    giveText = 'a free item (worth up to ' + money(give) + ')';
    getText = 'a free item (worth up to ' + money(get) + ')';
    costPerReferral = get; // cost ≈ item value
  } else {
    giveText = money(give) + ' off';
    getText = money(get) + ' off';
    costPerReferral = get;
  }

  var summary = 'Give ' + giveText + ', get ' + getText;
  if (minPurchase > 0) {
    summary += ', min purchase ' + money(minPurchase);
  }

  return {
    give: give,
    get: get,
    type: type,
    typeLabel: REWARD_TYPES[type].label,
    minPurchase: minPurchase,
    summary: summary,
    costPerReferral: Math.round(costPerReferral * 100) / 100
  };
}

// ---- Referral tracker ----

// Referral shape: {code, referrerName, friendName, friendContact, status}
function createReferral(code, referrerName, friendName, friendContact) {
  code = String(code || '').trim().toUpperCase();
  if (!code) throw new Error('A referral code is required.');
  if (!isValidCodeFormat(code)) throw new Error('Invalid referral code format: ' + code);
  var ref = String(referrerName || '').trim();
  var friend = String(friendName || '').trim();
  if (!ref) throw new Error('Referrer name is required.');
  if (!friend) throw new Error('Friend name is required.');
  return {
    code: code,
    referrerName: ref,
    friendName: friend,
    friendContact: String(friendContact || '').trim(),
    status: STATUS.SENT,
    createdAt: new Date().toISOString(),
    history: [{ status: STATUS.SENT, at: new Date().toISOString() }]
  };
}

function canAdvance(referral) {
  return (ALLOWED_TRANSITIONS[referral.status] || []).length > 0;
}

function nextStatus(referral) {
  var allowed = ALLOWED_TRANSITIONS[referral.status] || [];
  return allowed.length ? allowed[0] : null;
}

// Advance one step in the pipeline: sent -> completed -> rewarded.
// Throws if the transition is illegal (e.g. sent -> rewarded skips a step).
function advanceStatus(referral, target) {
  var from = referral.status;
  var allowed = ALLOWED_TRANSITIONS[from] || [];
  target = target || nextStatus(referral);
  if (!target || allowed.indexOf(target) === -1) {
    throw new Error(
      'Illegal status transition: "' + from + '" -> "' + target + '". ' +
      'Referrals must move one step at a time (sent -> completed -> rewarded).'
    );
  }
  referral.status = target;
  referral.history.push({ status: target, at: new Date().toISOString() });
  return referral;
}

function countByStatus(referrals) {
  var counts = { sent: 0, completed: 0, rewarded: 0 };
  referrals.forEach(function (r) {
    if (counts[r.status] !== undefined) counts[r.status]++;
  });
  return counts;
}

// ---- Leaderboard ----
// Ranked by completed referrals, tiebreak = rewarded count, then name A-Z.
function leaderboard(referrals, rule) {
  var map = {};
  referrals.forEach(function (r) {
    var key = r.referrerName;
    if (!map[key]) {
      map[key] = { name: key, sent: 0, completed: 0, rewarded: 0 };
    }
    map[key].sent++;
    if (r.status === STATUS.COMPLETED || r.status === STATUS.REWARDED) map[key].completed++;
    if (r.status === STATUS.REWARDED) map[key].rewarded++;
  });
  var rows = Object.keys(map).map(function (k) { return map[k]; });
  var getAmount = rule && isFinite(Number(rule.get)) ? Number(rule.get) : 0;
  rows.forEach(function (row) {
    row.rewardsPaid = Math.round(row.rewarded * getAmount * 100) / 100;
  });
  rows.sort(function (a, b) {
    if (b.completed !== a.completed) return b.completed - a.completed;
    if (b.rewarded !== a.rewarded) return b.rewarded - a.rewarded;
    return a.name.localeCompare(b.name);
  });
  return rows;
}

// ---- Share-message templates ----
var DEFAULT_TEMPLATES = {
  sms: 'Hey! {business} has a referral deal: your friend gets {give}, and you get {get} when they join. Use code {code} — let\'s both win!',
  email: 'Subject: You\'ve been invited to {business}\n\nHi there,\n\nYour friend thinks you\'ll love {business}. Sign up with referral code {code} and you\'ll get {give}. They\'ll get {get} as a thank-you.\n\nSee you soon,\nThe {business} team'
};

// Fill {business}, {code}, {give}, {get} placeholders. Unknown placeholders left as-is.
function fillTemplate(template, vars) {
  vars = vars || {};
  return String(template).replace(/\{(business|code|give|get)\}/g, function (match, key) {
    var v = vars[key];
    return v === undefined || v === null ? match : String(v);
  });
}

// Build template vars from a rule + current selections.
function templateVarsFromRule(rule, business, code) {
  var r = rule || buildRule({});
  var giveVal = r.type === 'percent' ? r.give + '% off' :
    r.type === 'freebie' ? 'a free item (up to ' + money(r.give) + ')' : money(r.give) + ' off';
  var getVal = r.type === 'percent' ? r.get + '% off' :
    r.type === 'freebie' ? 'a free item (up to ' + money(r.get) + ')' : money(r.get) + ' off';
  return {
    business: business || 'our business',
    code: code || 'YOURCODE',
    give: giveVal,
    get: getVal
  };
}

// ---- Stats bar ----
function computeStats(referrals, rule) {
  var counts = countByStatus(referrals);
  var total = referrals.length;
  var converted = counts.completed + counts.rewarded;
  var conversion = total > 0 ? converted / total : 0;
  // Completed but not yet rewarded = owed.
  var owedCount = referrals.filter(function (r) { return r.status === STATUS.COMPLETED; }).length;
  var getAmount = rule && isFinite(Number(rule.get)) ? Number(rule.get) : 0;
  return {
    totalSent: total,
    completed: counts.completed,
    rewarded: counts.rewarded,
    conversionRate: Math.round(conversion * 1000) / 10, // percent, 1 decimal
    rewardsOwedCount: owedCount,
    rewardsOwedValue: Math.round(owedCount * getAmount * 100) / 100
  };
}

// ---- CSV export ----
function csvCell(v) {
  var s = String(v === undefined || v === null ? '' : v);
  return (/[",\n]/.test(s)) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function referralsToCSV(referrals) {
  var lines = [[
    'Code', 'Referrer', 'Friend', 'Friend contact', 'Status', 'Created at'
  ].map(csvCell).join(',')];
  (referrals || []).forEach(function (r) {
    lines.push([r.code, r.referrerName, r.friendName, r.friendContact, r.status, r.createdAt].map(csvCell).join(','));
  });
  return lines.join('\n');
}

// ---- Search + status filter ----
function filterReferrals(referrals, query, status) {
  var q = String(query === undefined || query === null ? '' : query).trim().toLowerCase();
  return (referrals || []).filter(function (r) {
    if (status && r.status !== status) return false;
    if (!q) return true;
    var hay = [r.code, r.referrerName, r.friendName, r.friendContact].join(' ').toLowerCase();
    return q.split(/\s+/).every(function (w) { return hay.indexOf(w) !== -1; });
  });
}

// ---- Duplicate detection ----
// Same friend contact (email/phone) or same friend name => likely a duplicate referral.
function findDuplicate(referrals, friendName, friendContact) {
  var fn = String(friendName || '').trim().toLowerCase();
  var fc = String(friendContact || '').trim().toLowerCase();
  if (!fn && !fc) return null;
  var hit = null;
  (referrals || []).forEach(function (r) {
    if (hit) return;
    var sameContact = fc && String(r.friendContact || '').trim().toLowerCase() === fc;
    var sameName = fn && String(r.friendName || '').trim().toLowerCase() === fn;
    if (sameContact || sameName) hit = r;
  });
  return hit;
}

// ---- Bulk reward ----
// Advance every completed referral one step to rewarded. Returns count rewarded.
function markAllRewarded(referrals) {
  var count = 0;
  (referrals || []).forEach(function (r) {
    if (r.status === STATUS.COMPLETED) { advanceStatus(r, STATUS.REWARDED); count++; }
  });
  return count;
}

// ---- Monthly conversion trend ----
function monthKey(iso) {
  var d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2);
}

function conversionByMonth(referrals) {
  var buckets = {};
  (referrals || []).forEach(function (r) {
    var k = monthKey(r.createdAt) || 'unknown';
    if (!buckets[k]) buckets[k] = { month: k, sent: 0, converted: 0 };
    buckets[k].sent++;
    if (r.status === STATUS.COMPLETED || r.status === STATUS.REWARDED) buckets[k].converted++;
  });
  return Object.keys(buckets).sort().map(function (k) {
    var b = buckets[k];
    b.conversionRate = b.sent ? Math.round(b.converted / b.sent * 1000) / 10 : 0;
    return b;
  });
}

if (typeof module !== 'undefined' && module.exports) { module.exports = { generateCode: generateCode, generateBatch: generateBatch, isValidCodeFormat: isValidCodeFormat, normalizePrefix: normalizePrefix, buildRule: buildRule, REWARD_TYPES: REWARD_TYPES, STATUS: STATUS, createReferral: createReferral, canAdvance: canAdvance, nextStatus: nextStatus, advanceStatus: advanceStatus, countByStatus: countByStatus, leaderboard: leaderboard, DEFAULT_TEMPLATES: DEFAULT_TEMPLATES, fillTemplate: fillTemplate, templateVarsFromRule: templateVarsFromRule, computeStats: computeStats, money: money, referralsToCSV: referralsToCSV, filterReferrals: filterReferrals, findDuplicate: findDuplicate, markAllRewarded: markAllRewarded, conversionByMonth: conversionByMonth }; }
