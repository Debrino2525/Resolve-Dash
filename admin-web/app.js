/*
 * GhanaDash Admin portal (no build step).
 * Runs under Helmet's CSP: script-src 'self', no inline handlers, connect-src 'self',
 * img-src 'self' data:. All behaviour is attached here via event delegation; document photos
 * are shown as data: URLs; every value rendered into HTML goes through esc().
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------- icons
  var ICONS = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z"/><path d="M9 12l2 2 4-4"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
    box: '<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
    map: '<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14"/><path d="M15 6v14"/>',
    menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
    close: '<path d="M18 6L6 18M6 6l12 12"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    alert: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>',
    cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/>',
    back: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
    gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v9H5v-9"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z"/>',
    external: '<path d="M15 3h6v6M10 14L21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 6l-10 7L2 6"/>',
    trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/>'
  };

  function icon(name) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
  }
  function ico(name, extra) {
    return '<span class="ico ' + (extra || '') + '">' + icon(name) + '</span>';
  }
  function hydrateIcons(root) {
    (root || document).querySelectorAll('[data-icon]').forEach(function (el) {
      el.innerHTML = icon(el.getAttribute('data-icon'));
    });
  }

  // ---------------------------------------------------------------- helpers
  function $(id) { return document.getElementById(id); }
  function esc(v) {
    if (v === null || v === undefined) return '';
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function money(pesewas) {
    return 'GH₵' + (Number(pesewas || 0) / 100).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function fmtDateTime(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
  function ago(iso) {
    if (!iso) return '';
    var s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
    var future = s < 0; s = Math.abs(s);
    var out = s < 60 ? 'just now' : s < 3600 ? Math.floor(s / 60) + 'm' : s < 86400 ? Math.floor(s / 3600) + 'h' : Math.floor(s / 86400) + 'd';
    if (out === 'just now') return out;
    return future ? 'in ' + out : out + ' ago';
  }
  function initials(name) {
    return (name || '?').split(/\s+/).filter(Boolean).map(function (p) { return p[0]; }).join('').slice(0, 2).toUpperCase();
  }
  function badge(tone, text) { return '<span class="badge badge-' + tone + '">' + esc(text) + '</span>'; }

  var ONBOARDING = {
    PENDING_VERIFICATION: ['amber', 'Pending'],
    ACTIVE: ['green', 'Approved'],
    REJECTED: ['red', 'Rejected']
  };
  var PLAN = {
    TRIAL: ['blue', 'Free trial'],
    ACTIVE: ['green', 'Active'],
    GRACE_PERIOD: ['amber', 'Grace period'],
    SUSPENDED: ['red', 'Inactive'],
    NONE: ['gray', 'No plan']
  };
  var DOC = {
    MISSING: ['gray', 'Not submitted'],
    SUBMITTED: ['amber', 'Awaiting review'],
    APPROVED: ['green', 'Approved'],
    REJECTED: ['red', 'Sent back']
  };
  var PAY = {
    SUCCESS: ['green', 'Paid'],
    PENDING: ['amber', 'Pending'],
    FAILED: ['red', 'Failed'],
    FLAGGED_FOR_REVIEW: ['red', 'Flagged']
  };
  function mapBadge(map, key) { var m = map[key] || ['gray', key || '—']; return badge(m[0], m[1]); }

  // ---------------------------------------------------------------- session & API
  var TOKEN_KEY = 'ghanadash_admin_session';
  function loadSession() {
    try {
      var s = JSON.parse(sessionStorage.getItem(TOKEN_KEY) || 'null');
      if (!s || !s.accessToken || !s.expiresAt || s.expiresAt * 1000 <= Date.now() + 30000) return null;
      return s;
    } catch (e) { return null; }
  }
  function saveSession(s) { try { sessionStorage.setItem(TOKEN_KEY, JSON.stringify(s)); } catch (e) { /* ignore */ } }
  function clearSession() { try { sessionStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignore */ } }

  function AuthError(msg) { this.message = msg; this.auth = true; }

  async function request(path, opts) {
    var session = loadSession();
    if (!session) { showLogin('Your session has expired. Please sign in again.'); throw new AuthError('no session'); }
    opts = opts || {};
    opts.headers = Object.assign({ Authorization: 'Bearer ' + session.accessToken }, opts.headers || {});
    var res = await fetch(path, opts);
    if (res.status === 401 || res.status === 403) {
      clearSession();
      showLogin(res.status === 403 ? 'This account does not have admin access.' : 'Please sign in again.');
      throw new AuthError('unauthorized');
    }
    return res;
  }
  async function api(path, opts) {
    var res = await request(path, opts);
    var body = await res.json().catch(function () { return {}; });
    if (!res.ok) {
      var m = Array.isArray(body.message) ? body.message[0] : body.message;
      throw new Error(m || 'Request failed (' + res.status + ')');
    }
    return body;
  }
  function post(path, data) {
    return api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data || {}) });
  }
  async function fileBlob(riderId, docId) {
    var res = await request('/admin/api/riders/' + encodeURIComponent(riderId) + '/documents/' + encodeURIComponent(docId) + '/file');
    if (!res.ok) throw new Error('Could not load file (' + res.status + ')');
    return res.blob();
  }
  function blobToDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }

  // ---------------------------------------------------------------- UI primitives
  function toast(message, kind) {
    var el = document.createElement('div');
    el.className = 'toast ' + (kind === 'err' ? 'err' : 'ok');
    el.setAttribute('role', kind === 'err' ? 'alert' : 'status');
    el.innerHTML = ico(kind === 'err' ? 'alert' : 'check') + '<span>' + esc(message) + '</span>';
    $('toasts').appendChild(el);
    setTimeout(function () { el.remove(); }, kind === 'err' ? 6000 : 3500);
  }
  function fail(err) {
    if (err && err.auth) return;
    toast((err && err.message) || 'Something went wrong', 'err');
  }

  /** Promise-based confirm dialog with an optional reason box. */
  function confirmDialog(o) {
    return new Promise(function (resolve) {
      var dlg = $('confirm-dialog');
      $('confirm-title').textContent = o.title;
      $('confirm-body').textContent = o.body || '';
      var ok = $('confirm-ok');
      ok.textContent = o.okLabel || 'Confirm';
      ok.className = 'btn ' + (o.danger ? 'btn-danger' : 'btn-primary');
      var wrap = $('confirm-reason-wrap');
      var box = $('confirm-reason');
      wrap.hidden = !o.reason;
      box.value = '';
      if (o.reason) {
        $('confirm-reason-label').textContent = o.reason.label;
        box.placeholder = o.reason.placeholder || '';
        box.required = !!o.reason.required;
      } else {
        box.required = false;
      }
      dlg.onclose = function () {
        resolve({ ok: dlg.returnValue === 'ok', reason: box.value.trim() });
      };
      dlg.returnValue = '';
      dlg.showModal();
      if (o.reason) box.focus();
    });
  }

  function emptyState(iconName, text) {
    return '<div class="empty">' + ico(iconName) + '<div>' + esc(text) + '</div></div>';
  }
  function skeletonRows(n) {
    var out = '';
    for (var i = 0; i < n; i++) out += '<li><div class="grow"><div class="skeleton" style="width:' + (40 + (i * 13) % 45) + '%"></div></div></li>';
    return '<ul class="list">' + out + '</ul>';
  }

  // ---------------------------------------------------------------- theme
  function getTheme() {
    try { return localStorage.getItem('gd_admin_theme') || 'dark'; } catch (e) { return 'dark'; }
  }
  function setTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    $('theme-icon').innerHTML = icon(t === 'dark' ? 'sun' : 'moon');
    try { localStorage.setItem('gd_admin_theme', t); } catch (e) { /* ignore */ }
  }

  // ---------------------------------------------------------------- state
  var state = {
    riders: null,          // AdminRiderOverview[]
    search: '',
    riderTab: 'ALL',
    planFilter: 'ALL',
    sort: { key: 'createdAt', dir: -1 },
    chart: 'signups',
    payTab: '',
    dashboard: null
  };

  async function loadRiders(force) {
    if (!state.riders || force) {
      var data = await api('/admin/api/riders');
      state.riders = data.riders || [];
      updateQueueCount();
    }
    return state.riders;
  }
  function updateQueueCount() {
    if (!state.riders) return;
    var n = state.riders.filter(function (r) { return r.onboardingStatus === 'PENDING_VERIFICATION'; }).length;
    var el = $('nav-queue-count');
    el.textContent = n;
    el.hidden = n === 0;
  }

  // ---------------------------------------------------------------- router
  var content = function () { return $('content'); };

  function route() {
    var hash = (location.hash || '#/overview').replace(/^#\/?/, '');
    var parts = hash.split('/');
    var page = parts[0] || 'overview';
    document.querySelectorAll('.nav a').forEach(function (a) {
      a.classList.toggle('active', a.getAttribute('data-route') === (page === 'riders' && parts[1] ? 'riders' : page));
    });
    $('sidebar').classList.remove('open');
    window.scrollTo(0, 0);

    if (page === 'riders' && parts[1]) {
      if (!UUID.test(parts[1])) { location.hash = '#/riders'; return; }
      return pageRider(parts[1]);
    }
    if (page === 'riders') return pageRiders();
    if (page === 'queue') return pageQueue();
    if (page === 'payments') return pagePayments();
    return pageOverview();
  }

  function render(html) {
    var c = content();
    c.innerHTML = html;
    hydrateIcons(c);
  }

  // ---------------------------------------------------------------- page: overview
  function greeting() {
    var h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  }

  function kpi(o) {
    var tag = o.href ? 'a' : 'div';
    return '<' + tag + (o.href ? ' href="' + o.href + '"' : '') + ' class="card kpi">' +
      '<span class="kpi-label"><span class="kpi-icon" style="background:var(--' + o.tone + '-soft);color:var(--' + (o.tone === 'brand' ? 'brand-text' : o.tone) + ')">' + ico(o.icon) + '</span>' + esc(o.label) + '</span>' +
      '<span class="kpi-value">' + esc(o.value) + '</span>' +
      '<span class="kpi-sub">' + esc(o.sub || '') + '</span></' + tag + '>';
  }

  /** Rounds the chart ceiling up so the three gridlines land on whole, readable values. */
  function niceMax(raw, isMoney) {
    var unit = isMoney ? 100 : 1; // money in pesewas, labelled in whole cedis
    var perStep = Math.max(1, raw / unit / 3);
    var mag = Math.pow(10, Math.floor(Math.log10(perStep)));
    var step = [1, 2, 5, 10].map(function (m) { return m * mag; }).find(function (s) { return s >= perStep; });
    return step * 3 * unit;
  }

  function barChart(points, opts) {
    var W = 640, H = 200, padL = 44, padB = 22, padT = 10;
    var max = niceMax(Math.max.apply(null, points.map(function (p) { return p.value; })), opts.money);
    var innerW = W - padL - 8, innerH = H - padB - padT;
    var bw = innerW / points.length;
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(opts.label) + '">';
    for (var g = 0; g <= 3; g++) {
      var y = padT + innerH - (innerH * g) / 3;
      var v = (max * g) / 3;
      svg += '<line class="grid-line" x1="' + padL + '" x2="' + (W - 8) + '" y1="' + y + '" y2="' + y + '"/>';
      svg += '<text class="axis" x="' + (padL - 6) + '" y="' + (y + 3) + '" text-anchor="end">' + esc(opts.money ? '₵' + Math.round(v / 100) : Math.round(v)) + '</text>';
    }
    points.forEach(function (p, i) {
      var h = max ? (p.value / max) * innerH : 0;
      var x = padL + i * bw + bw * 0.18;
      var label = new Date(p.day + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
      svg += '<rect class="bar ' + (opts.blue ? 'blue' : '') + '" x="' + x + '" y="' + (padT + innerH - h) + '" width="' + (bw * 0.64) + '" height="' + Math.max(h, p.value ? 2 : 0) + '" rx="3"><title>' + esc(label + ': ' + (opts.money ? money(p.value) : p.value)) + '</title></rect>';
      if (i % 2 === 0) svg += '<text class="axis" x="' + (x + bw * 0.32) + '" y="' + (H - 6) + '" text-anchor="middle">' + esc(label.split(' ')[0]) + '</text>';
    });
    return svg + '</svg>';
  }

  var ACT_STYLE = {
    APPROVAL: ['shield', 'brand'],
    SUBSCRIPTION: ['gift', 'blue'],
    PAYMENT: ['cash', 'brand']
  };
  function activityList(items, withRider) {
    if (!items.length) return emptyState('inbox', 'No activity yet.');
    return '<ul class="timeline">' + items.map(function (a) {
      var tone = a.kind === 'APPROVAL' && /reject/i.test(a.title) ? 'red'
        : a.kind === 'PAYMENT' && /fail|flag/i.test(a.title) ? 'red'
        : a.kind === 'PAYMENT' && /checkout/i.test(a.title) ? 'amber'
        : ACT_STYLE[a.kind][1];
      var color = tone === 'brand' ? 'var(--brand)' : 'var(--' + tone + ')';
      return '<li><span class="pip" style="background:' + color + '"></span>' +
        '<div class="t">' + esc(a.title) + (withRider ? ' · <a href="#/riders/' + esc(a.riderId) + '">' + esc(a.riderName) + '</a>' : '') + '</div>' +
        (a.detail ? '<div class="d">' + esc(a.detail) + '</div>' : '') +
        '<div class="w">' + esc(fmtDateTime(a.at)) + ' · ' + esc(ago(a.at)) + (a.actor ? ' · ' + esc(a.actor.replace(/^admin:(.{8}).*/, 'admin $1…')) : '') + '</div></li>';
    }).join('') + '</ul>';
  }

  var ATT = {
    DOCUMENTS_AWAITING_REVIEW: ['file', 'amber'],
    DOCUMENT_EXPIRING: ['clock', 'red'],
    GRACE_PERIOD: ['card', 'amber']
  };

  async function pageOverview() {
    render('<div class="page-head"><div><h1>' + esc(greeting()) + '</h1><p class="muted">' +
      esc(new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })) +
      '</p></div></div><div class="grid kpis">' + [1, 2, 3, 4].map(function () {
        return '<div class="card kpi"><div class="skeleton" style="width:50%"></div><div class="skeleton" style="width:30%;height:26px"></div></div>';
      }).join('') + '</div>');
    try {
      var d = await api('/admin/api/dashboard');
      state.dashboard = d;
      loadRiders(true).catch(function () { /* nav count only */ });
      var s = d.stats;
      var pts = state.chart === 'revenue' ? d.revenuePerDay : d.signupsPerDay;
      var total = pts.reduce(function (a, p) { return a + p.value; }, 0);

      render(
        '<div class="page-head"><div><h1>' + esc(greeting()) + '</h1><p class="muted">' +
        esc(new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })) +
        '</p></div>' +
        (s.pendingVerification ? '<a class="btn btn-primary" href="#/queue">' + ico('shield') + 'Review queue (' + s.pendingVerification + ')</a>' : '') +
        '</div>' +
        '<div class="grid kpis">' +
          kpi({ href: '#/queue', tone: 'amber', icon: 'shield', label: 'Pending verification', value: s.pendingVerification, sub: s.documentsAwaitingReview + ' documents awaiting review' }) +
          kpi({ href: '#/riders', tone: 'brand', icon: 'users', label: 'Approved riders', value: s.activeRiders, sub: s.totalRiders + ' total · ' + s.rejectedRiders + ' rejected' }) +
          kpi({ tone: 'blue', icon: 'gift', label: 'On a plan', value: s.paidActive + s.onTrial, sub: s.paidActive + ' paid · ' + s.onTrial + ' on trial · ' + s.inGrace + ' in grace' }) +
          kpi({ href: '#/payments', tone: 'brand', icon: 'trend', label: 'Revenue (7 days)', value: money(s.revenue7dPesewas), sub: money(s.revenue30dPesewas) + ' in 30 days · ' + s.payments30d + ' payments' }) +
        '</div>' +
        '<div class="grid two-col">' +
          '<section class="card"><div class="card-head"><h2>Last 14 days</h2>' +
            '<div class="tabs" role="tablist">' +
              '<button class="tab ' + (state.chart === 'signups' ? 'active' : '') + '" data-action="chart" data-chart="signups" role="tab">Sign-ups</button>' +
              '<button class="tab ' + (state.chart === 'revenue' ? 'active' : '') + '" data-action="chart" data-chart="revenue" role="tab">Revenue</button>' +
            '</div></div>' +
            '<div class="chart"><div class="chart-total">' + esc(state.chart === 'revenue' ? money(total) : total + ' new riders') + '</div>' +
            barChart(pts, { money: state.chart === 'revenue', blue: state.chart === 'signups', label: state.chart === 'revenue' ? 'Revenue per day' : 'Sign-ups per day' }) + '</div></section>' +
          '<section class="card"><div class="card-head"><h2>Needs attention</h2>' + (d.attention.length ? badge('amber', d.attention.length + ' items') : '') + '</div>' +
            (d.attention.length ? '<ul class="list">' + d.attention.map(function (a) {
              var st = ATT[a.kind];
              return '<li><a class="row-link" href="#/riders/' + esc(a.riderId) + '">' +
                '<span class="dot-icon" style="background:var(--' + st[1] + '-soft);color:var(--' + (st[1] === 'amber' ? 'amber-text' : st[1]) + ')">' + ico(st[0]) + '</span>' +
                '<span class="grow"><div class="title">' + esc(a.riderName) + '</div><div class="sub">' + esc(a.detail) + (a.since ? ' · ' + esc(ago(a.since)) : '') + '</div></span>' +
                ico('back', 'flip') + '</a></li>';
            }).join('') + '</ul>' : emptyState('check', 'All clear. Nothing needs your attention.')) +
          '</section>' +
        '</div>' +
        '<section class="card" style="margin-top:16px"><div class="card-head"><h2>Recent activity</h2></div>' + activityList(d.activity, true) + '</section>'
      );
      document.querySelectorAll('.flip svg').forEach(function (s2) { s2.style.transform = 'scaleX(-1)'; });
    } catch (err) {
      fail(err);
      if (!err.auth) render('<div class="card">' + emptyState('alert', 'Could not load the dashboard. ' + err.message) + '</div>');
    }
  }

  // ---------------------------------------------------------------- page: verification queue
  async function pageQueue() {
    render('<div class="page-head"><div><h1>Verification queue</h1><p class="muted">Riders waiting for approval, oldest first.</p></div></div><section class="card">' + skeletonRows(5) + '</section>');
    try {
      var riders = (await loadRiders(true)).filter(function (r) { return r.onboardingStatus === 'PENDING_VERIFICATION'; });
      riders.sort(function (a, b) {
        var ra = a.documentsSubmitted >= a.documentsRequired ? 0 : 1;
        var rb = b.documentsSubmitted >= b.documentsRequired ? 0 : 1;
        return ra - rb || new Date(a.createdAt) - new Date(b.createdAt);
      });
      var ready = riders.filter(function (r) { return r.documentsSubmitted >= r.documentsRequired; }).length;
      render(
        '<div class="page-head"><div><h1>Verification queue</h1><p class="muted">' +
        esc(riders.length + ' waiting · ' + ready + ' with all documents uploaded') + '</p></div></div>' +
        '<section class="card">' + (riders.length ? '<div class="table-wrap"><table><thead><tr>' +
          '<th>Rider</th><th>Documents</th><th>Ready</th><th>Waiting</th><th></th></tr></thead><tbody>' +
          riders.map(function (r) {
            var complete = r.documentsSubmitted >= r.documentsRequired;
            return '<tr data-href="#/riders/' + esc(r.id) + '">' +
              '<td>' + personCell(r) + '</td>' +
              '<td>' + docProgress(r) + '</td>' +
              '<td>' + (complete ? badge('green', 'All uploaded') : badge('gray', (r.documentsRequired - r.documentsSubmitted) + ' missing')) + '</td>' +
              '<td class="muted">' + esc(ago(r.createdAt)) + '</td>' +
              '<td style="text-align:right"><a class="btn btn-sm ' + (complete ? 'btn-primary' : '') + '" href="#/riders/' + esc(r.id) + '">Review</a></td></tr>';
          }).join('') + '</tbody></table></div>' : emptyState('check', 'The queue is empty. Every rider has been reviewed.')) +
        '</section>'
      );
    } catch (err) { fail(err); }
  }

  function personCell(r) {
    return '<div class="cell-person"><span class="avatar">' + esc(initials(r.fullName)) + '</span><div><div class="name">' +
      esc(r.fullName) + '</div><div class="sub">' + esc(r.phoneNumber) + (r.email ? ' · ' + esc(r.email) : '') + '</div></div></div>';
  }
  function docProgress(r) {
    var pct = r.documentsRequired ? Math.round((r.documentsApproved / r.documentsRequired) * 100) : 0;
    return '<div class="progress"><div class="progress-track"><div class="progress-fill" style="width:' + pct + '%"></div></div>' +
      '<span class="small muted">' + r.documentsApproved + '/' + r.documentsRequired + ' approved</span></div>';
  }

  // ---------------------------------------------------------------- page: riders
  function filteredRiders() {
    var q = state.search.trim().toLowerCase();
    var list = (state.riders || []).filter(function (r) {
      if (state.riderTab !== 'ALL' && r.onboardingStatus !== state.riderTab) return false;
      if (state.planFilter !== 'ALL' && r.subscriptionStatus !== state.planFilter) return false;
      if (!q) return true;
      return (r.fullName + ' ' + r.phoneNumber + ' ' + (r.email || '')).toLowerCase().indexOf(q) !== -1;
    });
    var k = state.sort.key, dir = state.sort.dir;
    list.sort(function (a, b) {
      var va = a[k], vb = b[k];
      if (k === 'documentsApproved') { va = a.documentsApproved * 10 + a.documentsSubmitted; vb = b.documentsApproved * 10 + b.documentsSubmitted; }
      if (va === null || va === undefined) va = '';
      if (vb === null || vb === undefined) vb = '';
      return (va > vb ? 1 : va < vb ? -1 : 0) * dir;
    });
    return list;
  }

  function sortHead(key, label) {
    var arrow = state.sort.key === key ? (state.sort.dir === 1 ? ' ↑' : ' ↓') : '';
    return '<th class="sortable" data-action="sort" data-key="' + key + '" aria-sort="' +
      (state.sort.key === key ? (state.sort.dir === 1 ? 'ascending' : 'descending') : 'none') + '">' + esc(label + arrow) + '</th>';
  }

  function ridersTable() {
    var list = filteredRiders();
    if (!list.length) return emptyState('users', state.search ? 'No riders match "' + state.search + '".' : 'No riders in this view.');
    return '<div class="table-wrap"><table><thead><tr>' +
      sortHead('fullName', 'Rider') + sortHead('onboardingStatus', 'Verification') + sortHead('documentsApproved', 'Documents') +
      sortHead('subscriptionStatus', 'Plan') + sortHead('paidUntil', 'Paid until') + sortHead('createdAt', 'Joined') +
      '</tr></thead><tbody>' + list.map(function (r) {
        return '<tr data-href="#/riders/' + esc(r.id) + '">' +
          '<td>' + personCell(r) + '</td>' +
          '<td>' + mapBadge(ONBOARDING, r.onboardingStatus) + '</td>' +
          '<td>' + docProgress(r) + '</td>' +
          '<td>' + mapBadge(PLAN, r.subscriptionStatus) + '</td>' +
          '<td class="muted">' + esc(fmtDate(r.paidUntil)) + '</td>' +
          '<td class="muted">' + esc(fmtDate(r.createdAt)) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  async function pageRiders() {
    render('<div class="page-head"><div><h1>Riders</h1></div></div><section class="card">' + skeletonRows(8) + '</section>');
    try {
      var riders = await loadRiders(true);
      var count = function (s) { return riders.filter(function (r) { return s === 'ALL' || r.onboardingStatus === s; }).length; };
      var tab = function (key, label) {
        return '<button class="tab ' + (state.riderTab === key ? 'active' : '') + '" data-action="rider-tab" data-tab="' + key + '">' + esc(label) + '<span class="n">' + count(key) + '</span></button>';
      };
      render(
        '<div class="page-head"><div><h1>Riders</h1><p class="muted">' + esc(riders.length + ' registered riders') + '</p></div></div>' +
        '<section class="card"><div class="toolbar">' +
          '<div class="tabs" role="tablist">' + tab('ALL', 'All') + tab('PENDING_VERIFICATION', 'Pending') + tab('ACTIVE', 'Approved') + tab('REJECTED', 'Rejected') + '</div>' +
          '<label class="field" style="margin-left:auto;grid-auto-flow:column;align-items:center;gap:8px"><span class="muted">Plan</span>' +
            '<select id="plan-filter" style="height:34px">' +
            [['ALL', 'All plans'], ['TRIAL', 'Free trial'], ['ACTIVE', 'Active'], ['GRACE_PERIOD', 'Grace period'], ['SUSPENDED', 'Inactive'], ['NONE', 'No plan']].map(function (o) {
              return '<option value="' + o[0] + '"' + (state.planFilter === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
            }).join('') + '</select></label>' +
        '</div><div id="riders-table">' + ridersTable() + '</div></section>'
      );
    } catch (err) { fail(err); }
  }

  function refreshRidersTable() {
    var el = $('riders-table');
    if (el) { el.innerHTML = ridersTable(); hydrateIcons(el); }
  }

  // ---------------------------------------------------------------- page: rider review
  var current = null; // { id, detail, docs }

  async function pageRider(id) {
    render('<a class="crumb" href="#/riders">' + ico('back') + 'Riders</a><div class="review"><section class="card profile">' +
      '<div class="skeleton" style="width:60%;height:20px"></div><div class="skeleton"></div><div class="skeleton" style="width:70%"></div></section>' +
      '<section class="card">' + skeletonRows(4) + '</section></div>');
    try {
      var results = await Promise.all([
        api('/admin/api/riders/' + id),
        api('/admin/api/riders/' + id + '/documents')
      ]);
      current = { id: id, detail: results[0], docs: results[1] };
      renderRider();
    } catch (err) {
      fail(err);
      if (!err.auth) render('<a class="crumb" href="#/riders">' + ico('back') + 'Riders</a><div class="card">' + emptyState('alert', err.message) + '</div>');
    }
  }

  function renderRider() {
    var d = current.detail, docs = current.docs;
    var sub = d.subscription;
    var pending = d.onboardingStatus === 'PENDING_VERIFICATION';
    var allApproved = docs.approvedCount >= docs.requiredCount;
    var planKey = sub ? sub.status : 'NONE';

    var facts = [
      ['Phone', '<a href="tel:' + esc(d.phoneNumber) + '">' + esc(d.phoneNumber) + '</a>'],
      ['Email', d.email ? '<a href="mailto:' + esc(d.email) + '">' + esc(d.email) + '</a>' : '—'],
      ['Joined', esc(fmtDate(d.createdAt)) + ' <span class="muted small">(' + esc(ago(d.createdAt)) + ')</span>'],
      ['Plan', mapBadge(PLAN, planKey)]
    ];
    if (sub && sub.trialEndsAt) facts.push(['Trial ends', esc(fmtDateTime(sub.trialEndsAt))]);
    if (sub && sub.paidUntil) facts.push(['Paid until', esc(fmtDateTime(sub.paidUntil))]);
    if (sub && sub.graceEndsAt) facts.push(['Grace ends', esc(fmtDateTime(sub.graceEndsAt))]);
    facts.push(['Rider ID', '<span class="mono">' + esc(d.id) + '</span>']);

    var actions = '';
    if (pending) {
      actions += '<button class="btn btn-primary" data-action="approve-rider"' + (allApproved ? '' : ' disabled title="Approve all four documents first"') + '>' + ico('check') + 'Approve rider</button>';
      if (!allApproved) actions += '<p class="small muted" style="margin:0">Approve all ' + docs.requiredCount + ' documents to enable rider approval (' + docs.approvedCount + '/' + docs.requiredCount + ').</p>';
    }
    actions += '<button class="btn" data-action="grant-access">' + ico('gift') + 'Grant 7 days free</button>';
    if (d.onboardingStatus !== 'REJECTED') actions += '<button class="btn btn-danger" data-action="reject-rider">' + ico('close') + 'Reject application</button>';

    render(
      '<a class="crumb" href="#/riders">' + ico('back') + 'Riders</a>' +
      '<div class="review">' +
        '<aside class="grid" style="gap:16px">' +
          '<section class="card profile">' +
            '<div class="profile-top"><span class="avatar">' + esc(initials(d.fullName)) + '</span><div><h2>' + esc(d.fullName) + '</h2>' + mapBadge(ONBOARDING, d.onboardingStatus) + '</div></div>' +
            '<dl class="facts">' + facts.map(function (f) { return '<div><dt>' + esc(f[0]) + '</dt><dd>' + f[1] + '</dd></div>'; }).join('') + '</dl>' +
            '<div class="actions-col">' + actions + '</div>' +
          '</section>' +
          '<section class="card"><div class="card-head"><h2>Timeline</h2></div>' + activityList(d.timeline, false) + '</section>' +
        '</aside>' +
        '<section class="card"><div class="card-head"><h2>Documents</h2>' +
          badge(allApproved ? 'green' : docs.submittedCount < docs.requiredCount ? 'gray' : 'amber', docs.approvedCount + '/' + docs.requiredCount + ' approved') + '</div>' +
          '<div class="docs">' + docs.items.map(docCard).join('') + '</div>' +
          (pending ? '<div class="sticky-foot"><span class="muted">' + esc(allApproved ? 'All documents approved. You can approve this rider.' : (docs.requiredCount - docs.approvedCount) + ' document(s) still need approval.') + '</span>' +
            '<button class="btn btn-primary" data-action="approve-rider"' + (allApproved ? '' : ' disabled') + '>' + ico('check') + 'Approve rider</button></div>' : '') +
        '</section>' +
      '</div>'
    );
    loadPreviews();
  }

  function docCard(doc) {
    var has = doc.status !== 'MISSING';
    var pdf = doc.contentType === 'application/pdf';
    var preview = !has
      ? '<div class="doc-preview empty-doc">' + ico('file') + '</div>'
      : pdf
        ? '<div class="doc-preview" data-action="open-file" data-doc="' + esc(doc.id) + '">' + ico('file') + '&nbsp;Open PDF ' + ico('external') + '</div>'
        : '<div class="doc-preview" data-action="view-image" data-doc="' + esc(doc.id) + '" data-preview="' + esc(doc.id) + '"><div class="skeleton" style="width:60%"></div></div>';
    var meta = has
      ? '<div class="doc-meta"><span>Number <b>' + esc(doc.documentNumber) + '</b></span>' +
        '<span>Expires <b>' + esc(doc.expiryDate ? fmtDate(doc.expiryDate + 'T00:00:00') : '—') + '</b></span>' +
        '<span>Submitted ' + esc(fmtDateTime(doc.submittedAt)) + '</span></div>'
      : '<div class="doc-meta">Not uploaded yet.</div>';
    var note = doc.status === 'REJECTED' && doc.reviewNote ? '<div class="doc-note">Sent back: ' + esc(doc.reviewNote) + '</div>' : '';
    var actions = has ? '<div class="doc-actions">' +
      (doc.status !== 'APPROVED' ? '<button class="btn btn-sm btn-primary" data-action="doc-approve" data-doc="' + esc(doc.id) + '">' + ico('check') + 'Approve</button>' : '') +
      (doc.status !== 'REJECTED' ? '<button class="btn btn-sm btn-danger" data-action="doc-reject" data-doc="' + esc(doc.id) + '" data-label="' + esc(doc.label) + '">Send back</button>' : '') +
      '</div>' : '';
    return '<article class="doc">' + preview + '<div class="doc-body"><div class="doc-title"><h3>' + esc(doc.label) + '</h3>' +
      mapBadge(DOC, doc.status) + '</div>' + meta + note + actions + '</div></article>';
  }

  function loadPreviews() {
    if (!current) return;
    var riderId = current.id;
    current.docs.items.forEach(function (doc) {
      if (doc.status === 'MISSING' || doc.contentType === 'application/pdf') return;
      var box = document.querySelector('[data-preview="' + doc.id + '"]');
      fileBlob(riderId, doc.id).then(blobToDataUrl).then(function (src) {
        if (!box || !current || current.id !== riderId) return;
        box.innerHTML = '';
        var img = document.createElement('img');
        img.src = src;
        img.alt = doc.label + ' photo';
        box.appendChild(img);
      }).catch(function (err) { if (box) box.textContent = err.message; });
    });
  }

  async function reloadRider(message) {
    if (!current) return;
    var id = current.id;
    var results = await Promise.all([api('/admin/api/riders/' + id), api('/admin/api/riders/' + id + '/documents')]);
    current = { id: id, detail: results[0], docs: results[1] };
    state.riders = null;
    renderRider();
    if (message) toast(message);
    loadRiders(true).catch(function () { /* nav count only */ });
  }

  async function riderAction(action, button) {
    if (!current) return;
    var base = '/admin/api/riders/' + current.id;
    var name = current.detail.fullName;
    try {
      if (action === 'approve-rider') {
        var c1 = await confirmDialog({ title: 'Approve ' + name + '?', body: 'They will be activated with a free trial and can go on duty anywhere in Ghana.', okLabel: 'Approve rider' });
        if (!c1.ok) return;
        button.disabled = true;
        await post(base + '/approve');
        await reloadRider(name + ' approved');
      } else if (action === 'reject-rider') {
        var c2 = await confirmDialog({ title: 'Reject ' + name + '?', body: 'They will not be able to go on duty. They will see a "not approved" screen with support contacts.', okLabel: 'Reject application', danger: true, reason: { label: 'Reason (kept in the audit log)', placeholder: 'e.g. Ghana Card could not be verified', required: true } });
        if (!c2.ok) return;
        button.disabled = true;
        await post(base + '/reject', { reason: c2.reason });
        await reloadRider(name + ' rejected');
      } else if (action === 'grant-access') {
        var c3 = await confirmDialog({ title: 'Grant 7 days free?', body: name + ' gets 7 days of dispatch access added at no charge. This is recorded with your account.', okLabel: 'Grant 7 days', reason: { label: 'Note (optional)', placeholder: 'e.g. Compensation for app outage' } });
        if (!c3.ok) return;
        button.disabled = true;
        await post(base + '/grant-access', { reason: c3.reason || undefined });
        await reloadRider('7 free days granted to ' + name);
      }
    } catch (err) {
      fail(err);
      if (button) button.disabled = false;
    }
  }

  async function reviewDoc(action, button) {
    if (!current) return;
    var docId = button.getAttribute('data-doc');
    var body = { decision: action === 'doc-approve' ? 'APPROVED' : 'REJECTED' };
    if (body.decision === 'REJECTED') {
      var c = await confirmDialog({ title: 'Send back ' + (button.getAttribute('data-label') || 'document') + '?', body: 'The rider will see your reason in the app and can upload a new one.', okLabel: 'Send back', danger: true, reason: { label: 'What should the rider fix?', placeholder: 'e.g. Photo is blurry, retake in good light', required: true } });
      if (!c.ok) return;
      body.note = c.reason;
    }
    button.disabled = true;
    try {
      current.docs = await post('/admin/api/riders/' + current.id + '/documents/' + docId + '/review', body);
      current.detail = await api('/admin/api/riders/' + current.id);
      renderRider();
      toast(body.decision === 'APPROVED' ? 'Document approved' : 'Document sent back to the rider');
      loadRiders(true).catch(function () { /* nav count only */ });
    } catch (err) {
      fail(err);
      button.disabled = false;
    }
  }

  async function viewImage(docId) {
    try {
      var src = await fileBlob(current.id, docId).then(blobToDataUrl);
      $('viewer-img').src = src;
      $('viewer').showModal();
    } catch (err) { fail(err); }
  }
  async function openFile(docId) {
    try {
      var blob = await fileBlob(current.id, docId);
      var url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    } catch (err) { fail(err); }
  }

  // ---------------------------------------------------------------- page: payments
  async function pagePayments() {
    render('<div class="page-head"><div><h1>Payments</h1></div></div><section class="card">' + skeletonRows(6) + '</section>');
    try {
      var list = await api('/admin/api/payments' + (state.payTab ? '?status=' + state.payTab : ''));
      var paid = list.filter(function (p) { return p.status === 'SUCCESS'; });
      var sum = paid.reduce(function (a, p) { return a + p.amountPesewas; }, 0);
      var failed = list.filter(function (p) { return p.status === 'FAILED'; }).length;
      var tab = function (key, label) {
        return '<button class="tab ' + (state.payTab === key ? 'active' : '') + '" data-action="pay-tab" data-tab="' + key + '">' + esc(label) + '</button>';
      };
      render(
        '<div class="page-head"><div><h1>Payments</h1><p class="muted">Weekly plan payments through Paystack (latest 200).</p></div></div>' +
        '<div class="grid kpis">' +
          kpi({ tone: 'brand', icon: 'cash', label: 'Collected (shown)', value: money(sum), sub: paid.length + ' successful payment' + (paid.length === 1 ? '' : 's') }) +
          kpi({ tone: 'amber', icon: 'clock', label: 'Pending checkouts', value: list.filter(function (p) { return p.status === 'PENDING'; }).length, sub: 'Started but not completed' }) +
          kpi({ tone: 'red', icon: 'alert', label: 'Failed', value: failed, sub: 'Expired or declined' }) +
        '</div>' +
        '<section class="card"><div class="toolbar"><div class="tabs" role="tablist">' +
          tab('', 'All') + tab('SUCCESS', 'Paid') + tab('PENDING', 'Pending') + tab('FAILED', 'Failed') + tab('FLAGGED_FOR_REVIEW', 'Flagged') +
        '</div></div>' +
        (list.length ? '<div class="table-wrap"><table><thead><tr><th>Date</th><th>Rider</th><th>Amount</th><th>Channel</th><th>Status</th><th>Covers until</th><th>Reference</th></tr></thead><tbody>' +
          list.map(function (p) {
            return '<tr data-href="#/riders/' + esc(p.riderId) + '">' +
              '<td class="muted">' + esc(fmtDateTime(p.paidAt || p.createdAt)) + '</td>' +
              '<td><strong>' + esc(p.riderName) + '</strong></td>' +
              '<td><strong>' + esc(money(p.amountPesewas)) + '</strong></td>' +
              '<td class="muted">' + esc(p.channel ? p.channel.replace(/_/g, ' ') : '—') + '</td>' +
              '<td>' + mapBadge(PAY, p.status) + (p.failureReason ? ' <span class="small muted">' + esc(p.failureReason.replace(/_/g, ' ').toLowerCase()) + '</span>' : '') + '</td>' +
              '<td class="muted">' + esc(fmtDate(p.periodEnd)) + '</td>' +
              '<td class="mono muted">' + esc(p.reference) + '</td></tr>';
          }).join('') + '</tbody></table></div>' : emptyState('card', 'No payments in this view yet.')) +
        '</section>'
      );
    } catch (err) { fail(err); }
  }

  // ---------------------------------------------------------------- auth views
  function showLogin(message) {
    $('app').hidden = true;
    $('login-view').hidden = false;
    $('login-error').textContent = message || '';
    setTimeout(function () { $('login-email').focus(); }, 0);
  }
  function showApp(session) {
    $('login-view').hidden = true;
    $('app').hidden = false;
    $('admin-email').textContent = session.email || '';
    $('admin-initials').textContent = initials((session.email || 'A').split('@')[0].replace(/[._-]+/g, ' '));
    route();
  }

  $('login-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    var btn = $('login-submit');
    btn.disabled = true;
    btn.textContent = 'Signing in…';
    $('login-error').textContent = '';
    try {
      var res = await fetch('/admin/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: $('login-email').value, password: $('login-password').value })
      });
      var body = await res.json().catch(function () { return {}; });
      if (res.status === 429) throw new Error('Too many attempts. Wait a minute and try again.');
      if (!res.ok) throw new Error(body.message || 'Sign-in failed');
      saveSession(body);
      $('login-password').value = '';
      showApp(body);
    } catch (err) {
      $('login-error').textContent = err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Sign in';
    }
  });

  // ---------------------------------------------------------------- global events
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (el) {
      var action = el.getAttribute('data-action');
      switch (action) {
        case 'toggle-theme': setTheme(getTheme() === 'dark' ? 'light' : 'dark'); return;
        case 'toggle-sidebar': $('sidebar').classList.toggle('open'); return;
        case 'toggle-menu': {
          var menu = $('admin-menu');
          menu.hidden = !menu.hidden;
          $('avatar-btn').setAttribute('aria-expanded', String(!menu.hidden));
          return;
        }
        case 'logout': clearSession(); state.riders = null; $('admin-menu').hidden = true; showLogin('Signed out.'); return;
        case 'refresh': state.riders = null; route(); return;
        case 'chart': state.chart = el.getAttribute('data-chart'); pageOverview(); return;
        case 'rider-tab': state.riderTab = el.getAttribute('data-tab'); pageRiders(); return;
        case 'pay-tab': state.payTab = el.getAttribute('data-tab'); pagePayments(); return;
        case 'sort': {
          var key = el.getAttribute('data-key');
          state.sort = { key: key, dir: state.sort.key === key ? -state.sort.dir : 1 };
          refreshRidersTable();
          return;
        }
        case 'approve-rider': case 'reject-rider': case 'grant-access': riderAction(action, el); return;
        case 'doc-approve': case 'doc-reject': reviewDoc(action, el); return;
        case 'view-image': if (el.querySelector('img')) viewImage(el.getAttribute('data-doc')); return;
        case 'open-file': openFile(el.getAttribute('data-doc')); return;
        case 'close-viewer': $('viewer').close(); return;
      }
    }
    // Close the account menu on outside click.
    if (!e.target.closest('.menu-wrap')) $('admin-menu').hidden = true;
    // Whole-row links in tables (ignore clicks on real links/buttons inside).
    var row = e.target.closest('tr[data-href]');
    if (row && !e.target.closest('a, button')) location.hash = row.getAttribute('data-href');
  });

  document.addEventListener('change', function (e) {
    if (e.target.id === 'plan-filter') { state.planFilter = e.target.value; refreshRidersTable(); }
  });

  var searchTimer = null;
  $('global-search').addEventListener('input', function (e) {
    state.search = e.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      if (!/^#\/riders\/?$/.test(location.hash)) { state.riderTab = 'ALL'; location.hash = '#/riders'; }
      else refreshRidersTable();
    }, 150);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA' && !$('app').hidden) {
      e.preventDefault();
      $('global-search').focus();
    }
    if (e.key === 'Escape') { $('admin-menu').hidden = true; $('sidebar').classList.remove('open'); }
  });

  $('viewer').addEventListener('click', function (e) { if (e.target.id === 'viewer') $('viewer').close(); });
  window.addEventListener('hashchange', function () { if (loadSession()) route(); });

  // Keep the queue badge fresh while the portal is open.
  setInterval(function () {
    if (!document.hidden && loadSession() && !$('app').hidden) loadRiders(true).catch(function () { /* ignore */ });
  }, 60000);

  // ---------------------------------------------------------------- boot
  hydrateIcons(document);
  setTheme(getTheme());
  var existing = loadSession();
  if (existing) showApp(existing); else showLogin('');
})();
