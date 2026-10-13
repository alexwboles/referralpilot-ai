/* ReferralPilot AI — UI wiring.
 * No business logic here: everything flows through the pure functions in logic.js.
 * Persistence: localStorage (rp_codes, rp_rule, rp_referrals, rp_business, rp_templates).
 */

(function () {
  'use strict';

  var LS = {
    codes: 'rp_codes',
    batches: 'rp_batches',
    ledger: 'rp_ledger',
    avgValue: 'rp_avgvalue',
    rule: 'rp_rule',
    referrals: 'rp_referrals',
    business: 'rp_business',
    templates: 'rp_templates'
  };

  function load(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (e) { return fallback; }
  }
  function save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ---------- State ----------
  var state = {
    codes: load(LS.codes, []),
    batches: load(LS.batches, []),
    ledger: load(LS.ledger, []),
    rule: load(LS.rule, null),
    referrals: load(LS.referrals, []),
    business: load(LS.business, ''),
    templates: load(LS.templates, null)
  };
  if (!state.templates) {
    state.templates = { sms: DEFAULT_TEMPLATES.sms, email: DEFAULT_TEMPLATES.email };
    save(LS.templates, state.templates);
  }

  function currentRule() {
    var r = state.rule || buildRule({ give: 10, get: 10, type: 'dollars', minPurchase: 25 });
    // Rebuild if storage holds raw/partial rule options (no summary) — corrupt or legacy data.
    if (!r.summary) {
      r = buildRule({ give: r.give, get: r.get, type: r.type, minPurchase: r.minPurchase });
    }
    return r;
  }

  function persistAll() {
    save(LS.codes, state.codes);
    save(LS.rule, state.rule);
    save(LS.referrals, state.referrals);
    save(LS.business, state.business);
    save(LS.templates, state.templates);
  }

  function copyText(text, btn) {
    function done() {
      var old = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(function () { btn.textContent = old; }, 1200);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text, done); });
    } else { fallbackCopy(text, done); }
  }
  function fallbackCopy(text, done) {
    var ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
    done();
  }

  // ---------- Tabs ----------
  function showTab(name) {
    document.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
    document.querySelectorAll('.panel').forEach(function (p) { p.classList.remove('active'); });
    var tab = document.querySelector('.tab[data-tab="' + name + '"]');
    var panel = $('panel-' + name);
    if (tab) tab.classList.add('active');
    if (panel) panel.classList.add('active');
  }

  // ---------- Stats bar ----------
  function renderStats() {
    var s = computeStats(state.referrals, state.rule);
    $('stat-sent').textContent = s.totalSent;
    $('stat-completed').textContent = s.completed;
    $('stat-rewarded').textContent = s.rewarded;
    $('stat-conversion').textContent = s.conversionRate + '%';
    $('stat-owed').textContent = s.rewardsOwedCount + ' (' + money(s.rewardsOwedValue) + ')';
  }

  // ---------- Codes ----------
  function renderCodes() {
    var list = $('code-list');
    list.innerHTML = '';
    var today = new Date().toISOString().slice(0, 10);
    function codeRow(code, exp) {
      var li = document.createElement('li');
      li.className = 'code-row';
      var span = document.createElement('span');
      span.className = 'code';
      span.textContent = code;
      li.appendChild(span);
      if (exp) {
        var flag = document.createElement('span');
        var dead = exp < today;
        flag.className = 'badge ' + (dead ? 'badge-expired' : 'badge-exp');
        flag.textContent = dead ? 'expired ' + exp : 'expires ' + exp;
        li.appendChild(flag);
      }
      var btn = document.createElement('button');
      btn.className = 'btn small';
      btn.textContent = 'Copy';
      btn.addEventListener('click', function () { copyText(code, btn); });
      li.appendChild(btn);
      return li;
    }
    // batched codes first (newest batch first), then legacy unbatched codes
    var batched = {};
    state.batches.forEach(function (b) {
      var head = document.createElement('li');
      head.className = 'batch-head';
      var dead = b.expiresAt && b.expiresAt < today;
      head.innerHTML = '<strong>' + esc(b.prefix) + '</strong> · ' + b.codes.length + ' codes' +
        (b.expiresAt ? ' · <span class="' + (dead ? 'exp-dead' : 'exp-ok') + '">' +
          (dead ? 'expired ' : 'expires ') + esc(b.expiresAt) + '</span>' : ' · no expiry');
      list.appendChild(head);
      b.codes.forEach(function (c) { batched[c] = true; list.appendChild(codeRow(c, b.expiresAt)); });
    });
    var legacy = state.codes.filter(function (c) { return !batched[c]; });
    legacy.forEach(function (c) { list.appendChild(codeRow(c, null)); });
    if (!state.batches.length && !legacy.length) {
      list.innerHTML = '<li class="empty">No codes yet — generate a batch above.</li>';
    }
    refreshCodeDatalist();
  }

  function refreshCodeDatalist() {
    var dl = $('code-datalist');
    if (!dl) return;
    dl.innerHTML = '';
    state.codes.forEach(function (code) {
      var o = document.createElement('option');
      o.value = code;
      dl.appendChild(o);
    });
  }

  // ---------- Rule ----------
  function readRuleForm() {
    var typeEl = document.querySelector('input[name="reward-type"]:checked');
    return buildRule({
      give: $('rule-give').value,
      get: $('rule-get').value,
      type: typeEl ? typeEl.value : 'dollars',
      minPurchase: $('rule-min').value
    });
  }
  function renderRule() {
    var r = currentRule();
    $('rule-summary').textContent = r.summary;
    $('rule-cost').textContent = money(r.costPerReferral);
    renderOfferPreview(r);
    renderTemplatePreviews();
  }

  // Friend-offer preview (ReferralCandy-style): the offer as a customer sees it,
  // rebuilt live from the rule inputs.
  function renderOfferPreview(r) {
    var box = $('offer-preview');
    if (!box) return;
    r = r || currentRule();
    var biz = ((state.business || '').trim() || 'Your business');
    function amt(v) {
      if (r.type === 'percent') return v + '% off';
      if (r.type === 'freebie') return 'a free gift';
      return money(v) + ' off';
    }
    box.innerHTML = '<div class="offer-card">' +
      '<div class="offer-eyebrow">' + esc(biz) + ' · friends with benefits</div>' +
      '<div class="offer-give">Give friends <strong>' + esc(amt(r.give)) + '</strong></div>' +
      '<div class="offer-get">You get <strong>' + esc(amt(r.get)) + '</strong> for every friend who buys</div>' +
      (r.minPurchase > 0 ? '<div class="offer-fine">Minimum purchase of ' + money(r.minPurchase) + ' applies.</div>' : '') +
      '<div class="offer-cta">Claim your code</div></div>';
  }

  // ---------- Referrals ----------
  function statusLabel(s) {
    return s === 'sent' ? 'Sent' : s === 'completed' ? 'Completed' : 'Rewarded';
  }
  function refSearch() { return $('ref-search') ? $('ref-search').value : ''; }
  function refStatusFilter() { return $('ref-status-filter') ? $('ref-status-filter').value : ''; }
  function owedCount() {
    return state.referrals.filter(function (r) { return r.status === 'completed'; }).length;
  }
  function updateRewardAllBtn() {
    var btn = $('reward-all');
    if (!btn) return;
    var n = owedCount();
    btn.textContent = n ? 'Reward all owed (' + n + ')' : 'Reward all owed';
    btn.disabled = !n;
  }
  function renderReferrals() {
    var tbody = $('referral-rows');
    tbody.innerHTML = '';
    var list = filterReferrals(state.referrals, refSearch(), refStatusFilter());
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty">' +
        (state.referrals.length ? 'No referrals match your search.' : 'No referrals yet — add one above.') +
        '</td></tr>';
      updateRewardAllBtn();
      return;
    }
    list.forEach(function (ref) {
      var i = state.referrals.indexOf(ref);
      var tr = document.createElement('tr');
      var next = nextStatus(ref);
      var action = '';
      if (next) {
        action = '<button class="btn small" data-advance="' + i + '">Mark ' + statusLabel(next) + '</button>';
      } else {
        action = '<span class="done-mark">Done</span>';
      }
      tr.innerHTML =
        '<td><span class="code">' + esc(ref.code) + '</span></td>' +
        '<td>' + esc(ref.referrerName) + '</td>' +
        '<td>' + esc(ref.friendName) + (ref.friendContact ? '<br><small>' + esc(ref.friendContact) + '</small>' : '') + '</td>' +
        '<td><span class="badge badge-' + ref.status + '">' + statusLabel(ref.status) + '</span></td>' +
        '<td>' + action + '</td>';
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll('[data-advance]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var ref = state.referrals[Number(btn.getAttribute('data-advance'))];
        try {
          var was = ref.status;
          advanceStatus(ref);
          if (ref.status === 'rewarded' && was !== 'rewarded') logRewarded(ref);
          save(LS.referrals, state.referrals);
          renderReferrals(); renderLeaderboard(); renderStats(); renderTrend(); renderChannels(); renderStale();
        } catch (e) { showToast(e.message); }
      });
    });
    updateRewardAllBtn();
  }

  // Second sweep: record the reward spend in the ledger whenever a referral is rewarded.
  function logRewarded(ref) {
    state.ledger = logReward(state.ledger, {
      referralId: ref.id, referrer: ref.referrerName, friend: ref.friendName,
      code: ref.code, amount: currentRule().costPerReferral
    });
    save(LS.ledger, state.ledger);
  }

  // ---------- Monthly trend ----------
  function renderTrend() {
    var rows = conversionByMonth(state.referrals);
    var tbody = $('trend-rows');
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="empty">No referrals yet — trends appear once you log some.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(function (r) {
      return '<tr><td><strong>' + esc(r.month) + '</strong></td><td>' + r.sent + '</td><td>' +
        r.converted + '</td><td>' + r.conversionRate + '%</td></tr>';
    }).join('');
  }

  // ---------- By-channel conversion ----------
  function channelLabel(ch) {
    return (CHANNEL_LABELS && CHANNEL_LABELS[ch]) || ch || 'Not recorded';
  }
  function renderChannels() {
    var rows = conversionByChannel(state.referrals);
    var tbody = $('channel-rows');
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="empty">No referrals yet — channel stats appear once you log some.</td></tr>';
      return;
    }
    var best = rows[0].conversionRate;
    tbody.innerHTML = rows.map(function (r) {
      var star = (rows.length > 1 && r.conversionRate === best) ? ' ★ best' : '';
      return '<tr><td><strong>' + esc(channelLabel(r.channel)) + '</strong>' + star + '</td><td>' + r.sent +
        '</td><td>' + r.converted + '</td><td>' + r.conversionRate + '%</td></tr>';
    }).join('');
  }

  // ---------- Stale-referral follow-up ----------
  function renderStale() {
    var rows = staleReferrals(state.referrals, 21);
    var wrap = $('stale-wrap');
    var tbody = $('stale-rows');
    var count = $('stale-count');
    if (count) count.textContent = rows.length ? '(' + rows.length + ')' : '';
    if (!rows.length) {
      wrap.style.display = '';
      tbody.innerHTML = '<tr><td colspan="5" class="empty">Nothing stale — every referral is fresh or already converted.</td></tr>';
      return;
    }
    tbody.innerHTML = '';
    rows.forEach(function (ref) {
      var i = state.referrals.indexOf(ref);
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + esc(ref.friendName) + (ref.friendContact ? '<br><small>' + esc(ref.friendContact) + '</small>' : '') + '</td>' +
        '<td>' + esc(ref.referrerName) + '</td>' +
        '<td><span class="code">' + esc(ref.code) + '</span></td>' +
        '<td>' + esc((ref.createdAt || '').slice(0, 10)) + '</td>' +
        '<td><button class="btn small" data-nudge="' + i + '">Copy nudge</button></td>';
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll('[data-nudge]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var ref = state.referrals[Number(btn.getAttribute('data-nudge'))];
        copyText(followUpText(ref, state.business || 'our business'), btn);
      });
    });
  }

  function downloadCSV(filename, text) {
    var blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
  }

  // ---------- Leaderboard ----------
  function renderPodium(rows) {
    var box = $('podium');
    if (!box) return;
    if (!rows.length) { box.innerHTML = ''; return; }
    var medals = ['1st', '2nd', '3rd'];
    box.innerHTML = '<div class="podium-steps">' + rows.slice(0, 3).map(function (row, i) {
      var tier = tierFor(row.completed);
      return '<div class="pstep p' + (i + 1) + '">' +
        '<div class="pmedal">' + medals[i] + '</div>' +
        '<div class="pname">' + esc(row.name) + '</div>' +
        '<div class="pscore">' + row.completed + ' converted</div>' +
        '<div class="pbadge tier-' + tier.name.toLowerCase() + '">' + esc(tier.name) + '</div></div>';
    }).join('') + '</div>';
  }

  function renderLeaderboard() {
    var rows = leaderboard(state.referrals, state.rule);
    renderPodium(rows);
    var tbody = $('leaderboard-rows');
    tbody.innerHTML = '';
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty">No referrers yet.</td></tr>';
    } else {
      rows.forEach(function (row, i) {
      var tier = tierFor(row.completed);
      var tierSub = tier.nextTier ? ' · ' + tier.needed + ' to ' + esc(tier.nextTier) : ' · top';
      var tierBar = '';
      if (tier.nextTier) {
        var pct = Math.min(100, Math.round(tier.completed / (tier.completed + tier.needed) * 100));
        tierBar = '<span class="tierbar" title="' + tier.needed + ' to ' + esc(tier.nextTier) + '"><i style="width:' + pct + '%"></i></span>';
      }
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td><span class="rank rank-' + (i + 1) + '">' + (i + 1) + '</span></td>' +
        '<td>' + esc(row.name) + '</td>' +
        '<td><span class="badge tier-' + tier.name.toLowerCase() + '">' + esc(tier.name) + '</span><br><small>' + tierSub + '</small>' + tierBar + '</td>' +
        '<td>' + row.sent + '</td>' +
        '<td>' + row.completed + '</td>' +
        '<td>' + row.rewarded + '</td>' +
        '<td>' + money(row.rewardsPaid) + '</td>';
      tbody.appendChild(tr);
    });
    }
    renderSpotlight();
    renderROI();
  }

  // ---------- Second sweep: referrer-of-the-month spotlight ----------
  function renderSpotlight() {
    var box = $('spotlight-box');
    if (!box) return;
    var spot = referrerOfMonth(state.referrals);
    if (!spot) {
      box.innerHTML = '<p class="hint">No completed referrals this month yet — the spotlight appears once someone converts.</p>';
      return;
    }
    var text = spotlightText(spot, state.business);
    box.innerHTML = '<div class="spot">' +
      '<div class="spot-name">' + esc(spot.name) + '</div>' +
      '<div class="spot-sub">Top referrer · ' + esc(spot.month) + ' · ' + spot.completed + ' completed referral' + (spot.completed === 1 ? '' : 's') + '</div>' +
      '<p class="spot-text">' + esc(text) + '</p>' +
      '<button class="btn small" id="spot-copy">Copy shout-out</button></div>';
    $('spot-copy').addEventListener('click', function () { copyText(text, $('spot-copy')); });
  }

  // ---------- Second sweep: program ROI ----------
  function renderROI() {
    var box = $('roi-box');
    if (!box) return;
    var avgInput = $('avg-value');
    var avg = Number(avgInput.value) || 0;
    var r = programROI(state.referrals, state.ledger, avg);
    var lt = ledgerTotals(state.ledger);
    var netCls = r.net >= 0 ? 'pos' : 'neg';
    var netTxt = (r.net >= 0 ? '+' : '−') + money(Math.abs(r.net));
    box.innerHTML =
      '<div class="roi-grid">' +
      '<div class="roi-stat"><div class="roi-num">' + r.rewardedCount + '</div><div class="roi-lab">rewarded referrals</div></div>' +
      '<div class="roi-stat"><div class="roi-num">' + money(r.estRevenue) + '</div><div class="roi-lab">est. new-customer revenue</div></div>' +
      '<div class="roi-stat"><div class="roi-num">' + money(r.rewardCost) + '</div><div class="roi-lab">reward cost paid (' + lt.count + ' logged)</div></div>' +
      '<div class="roi-stat ' + netCls + '"><div class="roi-num">' + netTxt + '</div><div class="roi-lab">program net</div></div>' +
      '</div>' +
      (avg > 0 ? '' : '<p class="hint">Enter your average new-customer value above to see the program\u2019s estimated return.</p>');
  }

  // ---------- Templates ----------
  function renderTemplatePreviews() {
    var vars = templateVarsFromRule(currentRule(), state.business || 'our business', state.codes[0]);
    $('preview-sms').textContent = fillTemplate(state.templates.sms, vars);
    $('preview-email').textContent = fillTemplate(state.templates.email, vars);
  }

  // ---------- Toast ----------
  function showToast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(function () { t.classList.remove('show'); }, 3200);
  }

  // ---------- Events ----------
  function bindEvents() {
    document.querySelectorAll('.tab').forEach(function (t) {
      t.addEventListener('click', function () { showTab(t.getAttribute('data-tab')); });
    });

    $('business-name').value = state.business;
    $('business-name').addEventListener('input', function () {
      state.business = $('business-name').value;
      save(LS.business, state.business);
      renderTemplatePreviews();
    });

    // Second sweep: program ROI average-customer-value input
    $('avg-value').value = load(LS.avgValue, '');
    $('avg-value').addEventListener('input', function () {
      save(LS.avgValue, $('avg-value').value);
      renderROI();
    });

    // Code generator
    $('gen-btn').addEventListener('click', function () {
      var prefix = $('code-prefix').value;
      var n = Number($('batch-size').value);
      var exp = $('batch-expiry').value || '';
      try {
        var batch = makeBatch(prefix, n, exp);
        state.batches.unshift(batch);
        batch.codes.forEach(function (c) { if (state.codes.indexOf(c) === -1) state.codes.push(c); });
        save(LS.batches, state.batches);
        save(LS.codes, state.codes);
        $('batch-expiry').value = '';
        renderCodes(); renderTemplatePreviews();
        showToast(batch.codes.length + ' codes generated' + (exp ? ', expiring ' + exp : ' (no expiry)') + '.');
      } catch (e) { showToast(e.message); }
    });

    // Rule builder
    ['rule-give', 'rule-get', 'rule-min'].forEach(function (id) {
      $(id).addEventListener('input', function () {
        state.rule = readRuleForm();
        save(LS.rule, state.rule);
        renderRule(); renderLeaderboard(); renderStats();
      });
    });
    document.querySelectorAll('input[name="reward-type"]').forEach(function (el) {
      el.addEventListener('change', function () {
        state.rule = readRuleForm();
        save(LS.rule, state.rule);
        renderRule();
      });
    });
    if (state.rule) {
      $('rule-give').value = state.rule.give;
      $('rule-get').value = state.rule.get;
      $('rule-min').value = state.rule.minPurchase;
      var typeEl = document.querySelector('input[name="reward-type"][value="' + state.rule.type + '"]');
      if (typeEl) typeEl.checked = true;
    }

    // Add referral
    $('referral-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var dup = findDuplicate(state.referrals, $('ref-friend').value, $('ref-contact').value);
      if (dup) {
        showToast('Already referred: ' + dup.friendName + ' (' + dup.code + ', ' + statusLabel(dup.status) + '). Not added again.');
        return;
      }
      var code = $('ref-code').value;
      if (code && isCodeExpired(state.batches, code)) {
        var exp = codeExpiry(state.batches, code);
        if (!confirm('This code expired on ' + exp + '. Add the referral anyway?')) return;
      }
      try {
        var ref = createReferral(
          code,
          $('ref-referrer').value,
          $('ref-friend').value,
          $('ref-contact').value,
          $('ref-channel').value
        );
        state.referrals.push(ref);
        save(LS.referrals, state.referrals);
        e.target.reset();
        renderReferrals(); renderLeaderboard(); renderStats(); renderTrend(); renderChannels(); renderStale();
        showToast('Referral added.');
      } catch (err) { showToast(err.message); }
    });

    // Tracker tools: search + status filter + export + bulk reward
    $('ref-search').addEventListener('input', renderReferrals);
    $('ref-status-filter').addEventListener('change', renderReferrals);
    $('export-referrals').addEventListener('click', function () {
      if (!state.referrals.length) { showToast('No referrals to export yet.'); return; }
      downloadCSV('referralpilot-referrals.csv', referralsToCSV(state.referrals));
      showToast('Exported ' + state.referrals.length + ' referral(s) to CSV.');
    });
    $('reward-all').addEventListener('click', function () {
      var owed = state.referrals.filter(function (r) { return r.status === 'completed'; });
      var n = markAllRewarded(state.referrals);
      if (!n) { showToast('Nothing owed — no completed referrals waiting.'); return; }
      owed.forEach(logRewarded);
      save(LS.referrals, state.referrals);
      renderReferrals(); renderLeaderboard(); renderStats(); renderTrend(); renderChannels(); renderStale();
      showToast('Rewarded ' + n + ' referral' + (n === 1 ? '' : 's') + '.');
    });

    // Templates
    $('tpl-sms').value = state.templates.sms;
    $('tpl-email').value = state.templates.email;
    $('tpl-sms').addEventListener('input', function () {
      state.templates.sms = $('tpl-sms').value;
      save(LS.templates, state.templates);
      renderTemplatePreviews();
    });
    $('tpl-email').addEventListener('input', function () {
      state.templates.email = $('tpl-email').value;
      save(LS.templates, state.templates);
      renderTemplatePreviews();
    });
    $('copy-sms').addEventListener('click', function () {
      copyText($('preview-sms').textContent, $('copy-sms'));
    });
    $('copy-email').addEventListener('click', function () {
      copyText($('preview-email').textContent, $('copy-email'));
    });
    $('reset-tpl').addEventListener('click', function () {
      state.templates = { sms: DEFAULT_TEMPLATES.sms, email: DEFAULT_TEMPLATES.email };
      $('tpl-sms').value = state.templates.sms;
      $('tpl-email').value = state.templates.email;
      save(LS.templates, state.templates);
      renderTemplatePreviews();
      showToast('Templates reset to defaults.');
    });

    $('clear-data').addEventListener('click', function () {
      if (!confirm('Delete all ReferralPilot data from this browser?')) return;
      Object.keys(LS).forEach(function (k) { localStorage.removeItem(LS[k]); });
      state.codes = []; state.rule = null; state.referrals = [];
      state.templates = { sms: DEFAULT_TEMPLATES.sms, email: DEFAULT_TEMPLATES.email };
      renderAll();
      showToast('All local data cleared.');
    });
  }

  function renderAll() {
    renderStats();
    renderCodes();
    renderRule();
    renderReferrals();
    renderLeaderboard();
    renderTrend();
    renderChannels();
    renderStale();
    renderTemplatePreviews();
  }

  document.addEventListener('DOMContentLoaded', function () {
    bindEvents();
    renderAll();
    showTab('codes');
  });
})();
