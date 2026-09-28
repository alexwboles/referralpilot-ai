/* ReferralPilot AI — UI wiring.
 * No business logic here: everything flows through the pure functions in logic.js.
 * Persistence: localStorage (rp_codes, rp_rule, rp_referrals, rp_business, rp_templates).
 */

(function () {
  'use strict';

  var LS = {
    codes: 'rp_codes',
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
    return state.rule || buildRule({ give: 10, get: 10, type: 'dollars', minPurchase: 25 });
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
    if (!state.codes.length) {
      list.innerHTML = '<li class="empty">No codes yet — generate a batch above.</li>';
      return;
    }
    state.codes.forEach(function (code) {
      var li = document.createElement('li');
      li.className = 'code-row';
      var span = document.createElement('span');
      span.className = 'code';
      span.textContent = code;
      var btn = document.createElement('button');
      btn.className = 'btn small';
      btn.textContent = 'Copy';
      btn.addEventListener('click', function () { copyText(code, btn); });
      li.appendChild(span);
      li.appendChild(btn);
      list.appendChild(li);
    });
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
    renderTemplatePreviews();
  }

  // ---------- Referrals ----------
  function statusLabel(s) {
    return s === 'sent' ? 'Sent' : s === 'completed' ? 'Completed' : 'Rewarded';
  }
  function renderReferrals() {
    var tbody = $('referral-rows');
    tbody.innerHTML = '';
    if (!state.referrals.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty">No referrals yet — add one above.</td></tr>';
      return;
    }
    state.referrals.forEach(function (ref, i) {
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
          advanceStatus(ref);
          save(LS.referrals, state.referrals);
          renderReferrals(); renderLeaderboard(); renderStats();
        } catch (e) { showToast(e.message); }
      });
    });
  }

  // ---------- Leaderboard ----------
  function renderLeaderboard() {
    var rows = leaderboard(state.referrals, state.rule);
    var tbody = $('leaderboard-rows');
    tbody.innerHTML = '';
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty">No referrers yet.</td></tr>';
      return;
    }
    rows.forEach(function (row, i) {
      var medal = i === 0 ? '🥇 ' : i === 1 ? '🥈 ' : i === 2 ? '🥉 ' : '';
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + medal + esc(row.name) + '</td>' +
        '<td>' + row.sent + '</td>' +
        '<td>' + row.completed + '</td>' +
        '<td>' + row.rewarded + '</td>' +
        '<td>' + money(row.rewardsPaid) + '</td>';
      tbody.appendChild(tr);
    });
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

    // Code generator
    $('gen-btn').addEventListener('click', function () {
      var prefix = $('code-prefix').value;
      var n = Number($('batch-size').value);
      try {
        var batch = generateBatch(prefix, n);
        batch.forEach(function (c) { if (state.codes.indexOf(c) === -1) state.codes.push(c); });
        save(LS.codes, state.codes);
        renderCodes(); renderTemplatePreviews();
        showToast(batch.length + ' codes generated.');
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
      try {
        var ref = createReferral(
          $('ref-code').value,
          $('ref-referrer').value,
          $('ref-friend').value,
          $('ref-contact').value
        );
        state.referrals.push(ref);
        save(LS.referrals, state.referrals);
        e.target.reset();
        renderReferrals(); renderLeaderboard(); renderStats();
        showToast('Referral added.');
      } catch (err) { showToast(err.message); }
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
    renderTemplatePreviews();
  }

  document.addEventListener('DOMContentLoaded', function () {
    bindEvents();
    renderAll();
    showTab('codes');
  });
})();
