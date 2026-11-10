/**
 * Admin portal assets.
 *
 * The page is served under Helmet's default Content-Security-Policy:
 *   script-src 'self'; script-src-attr 'none'; connect-src (default-src) 'self'
 * so it must not contain inline <script> blocks or onclick="" attributes, and it may only
 * fetch same-origin URLs. All behaviour lives in /admin/app.js and uses event delegation.
 *
 * The HTML itself contains no rider data; every data call requires an admin bearer token.
 */

export const ADMIN_PAGE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GhanaDash Admin</title>
  <style>
    :root {
      --bg: #0B0F14;
      --card: #151C24;
      --border: #232E3C;
      --green: #00C853;
      --green-light: #69F0AE;
      --amber: #FF9800;
      --amber-light: #FFD54F;
      --red: #FF3B30;
      --red-light: #FF857F;
      --text: #F1F5F9;
      --text-muted: #94A3B8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      padding: 24px;
    }
    [hidden] { display: none !important; }
    .header {
      display: flex; justify-content: space-between; align-items: center; gap: 12px;
      padding-bottom: 20px; border-bottom: 1px solid var(--border); margin-bottom: 24px;
    }
    .brand { display: flex; align-items: center; gap: 12px; }
    .brand-title { font-size: 22px; font-weight: 700; letter-spacing: -0.5px; }
    .brand-sub { font-size: 12px; color: var(--text-muted); }
    .brand-badge {
      background: rgba(0, 200, 83, 0.15); color: var(--green);
      padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 700; letter-spacing: 0.5px;
    }
    .header-actions { display: flex; align-items: center; gap: 10px; }
    .who { font-size: 12px; color: var(--text-muted); }
    .stats-grid {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px; margin-bottom: 28px;
    }
    .stat-card, .table-container, .login-card {
      background: var(--card); border: 1px solid var(--border); border-radius: 12px;
    }
    .stat-card { padding: 18px; }
    .stat-label {
      font-size: 12px; color: var(--text-muted); text-transform: uppercase;
      letter-spacing: 0.5px; margin-bottom: 8px;
    }
    .stat-value { font-size: 28px; font-weight: 800; }
    .stat-value.green { color: var(--green-light); }
    .stat-value.amber { color: var(--amber-light); }
    .stat-value.blue { color: #60A5FA; }
    .table-container { overflow-x: auto; }
    .table-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 16px 20px; border-bottom: 1px solid var(--border);
    }
    .table-title { font-size: 16px; font-weight: 700; }
    .muted { font-size: 12px; color: var(--text-muted); }
    .ghost-btn {
      background: var(--border); color: var(--text); border: none; padding: 8px 14px;
      border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; transition: background 0.2s;
    }
    .ghost-btn:hover { background: #334155; }
    table { width: 100%; border-collapse: collapse; text-align: left; }
    th {
      background: rgba(255,255,255,0.02); color: var(--text-muted); font-size: 11px;
      text-transform: uppercase; letter-spacing: 0.5px; padding: 12px 20px; border-bottom: 1px solid var(--border);
    }
    td { padding: 16px 20px; border-bottom: 1px solid var(--border); font-size: 13px; }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: rgba(255, 255, 255, 0.015); }
    .badge { display: inline-block; padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: 700; }
    .badge-amber { background: rgba(255,152,0,0.15); color: var(--amber-light); border: 1px solid rgba(255,152,0,0.3); }
    .badge-green { background: rgba(0,200,83,0.15); color: var(--green-light); border: 1px solid rgba(0,200,83,0.3); }
    .badge-red { background: rgba(255,59,48,0.15); color: var(--red-light); border: 1px solid rgba(255,59,48,0.3); }
    .badge-gray { background: rgba(148,163,184,0.1); color: var(--text-muted); }
    .btn-group { display: flex; gap: 8px; }
    .btn {
      padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 600;
      border: none; cursor: pointer; transition: opacity 0.15s;
    }
    .btn:hover { opacity: 0.85; }
    .btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .btn-approve { background: var(--green); color: #000; }
    .btn-reject { background: var(--red); color: #fff; }
    .btn-grant { background: var(--amber); color: #000; }
    .empty-state { padding: 40px; text-align: center; color: var(--text-muted); }
    .login-wrap { display: flex; justify-content: center; padding-top: 8vh; }
    .login-card { width: 100%; max-width: 380px; padding: 28px; }
    .login-card h1 { font-size: 20px; margin-bottom: 6px; }
    .login-card p { margin-bottom: 20px; }
    .field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
    .field label { font-size: 12px; color: var(--text-muted); }
    .field input {
      background: var(--bg); color: var(--text); border: 1px solid var(--border);
      border-radius: 8px; padding: 10px 12px; font-size: 14px;
    }
    .field input:focus { outline: 2px solid var(--green); outline-offset: 1px; }
    .primary-btn {
      width: 100%; background: var(--green); color: #000; border: none; border-radius: 8px;
      padding: 11px; font-size: 14px; font-weight: 700; cursor: pointer;
    }
    .primary-btn:disabled { opacity: 0.5; cursor: wait; }
    .error { color: var(--red-light); font-size: 13px; margin-top: 12px; min-height: 18px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="brand">
      <div style="font-size: 28px;">🇬🇭</div>
      <div>
        <div class="brand-title">GhanaDash Dispatch</div>
        <div class="brand-sub">Nationwide rider administration</div>
      </div>
      <span class="brand-badge">GHANA</span>
    </div>
    <div class="header-actions" id="session-actions" hidden>
      <span class="who" id="who"></span>
      <button class="ghost-btn" data-action="refresh">🔄 Refresh</button>
      <button class="ghost-btn" data-action="logout">Sign out</button>
    </div>
  </div>

  <section id="login-view" class="login-wrap" hidden>
    <form class="login-card" id="login-form" autocomplete="on">
      <h1>Admin sign-in</h1>
      <p class="muted">Only accounts with the admin role can access rider data.</p>
      <div class="field">
        <label for="login-email">Email</label>
        <input id="login-email" name="email" type="email" required autocomplete="username">
      </div>
      <div class="field">
        <label for="login-password">Password</label>
        <input id="login-password" name="password" type="password" required autocomplete="current-password">
      </div>
      <button class="primary-btn" type="submit" id="login-submit">Sign in</button>
      <div class="error" id="login-error" role="alert"></div>
    </form>
  </section>

  <section id="dashboard-view" hidden>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-label">Total Riders</div><div class="stat-value blue" id="stat-total">0</div></div>
      <div class="stat-card"><div class="stat-label">Pending Verification</div><div class="stat-value amber" id="stat-pending">0</div></div>
      <div class="stat-card"><div class="stat-label">Active Approved Riders</div><div class="stat-value green" id="stat-active">0</div></div>
      <div class="stat-card"><div class="stat-label">Paid Subscriptions</div><div class="stat-value green" id="stat-subs">0</div></div>
    </div>

    <div class="table-container">
      <div class="table-header">
        <div class="table-title">Rider Roster &amp; Verification Queue</div>
        <div class="muted" id="last-updated">Updating...</div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Rider Name</th><th>Phone Number</th><th>Verification</th><th>Subscription</th>
            <th>Paid Until</th><th>Registered</th><th>Actions</th>
          </tr>
        </thead>
        <tbody id="riders-tbody">
          <tr><td colspan="7" class="empty-state">Loading registered riders...</td></tr>
        </tbody>
      </table>
    </div>
  </section>

  <script src="/admin/app.js" defer></script>
</body>
</html>`;

export const ADMIN_PAGE_JS = `(function () {
  'use strict';

  var TOKEN_KEY = 'ghanadash_admin_session';
  var POLL_MS = 8000;
  var pollTimer = null;

  function $(id) { return document.getElementById(id); }

  function loadSession() {
    try {
      var raw = sessionStorage.getItem(TOKEN_KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (!s.accessToken || !s.expiresAt || s.expiresAt * 1000 <= Date.now() + 30000) return null;
      return s;
    } catch (e) { return null; }
  }

  function saveSession(s) {
    try { sessionStorage.setItem(TOKEN_KEY, JSON.stringify(s)); } catch (e) { /* private mode */ }
  }

  function clearSession() {
    try { sessionStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignore */ }
  }

  function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function showLogin(message) {
    stopPolling();
    $('dashboard-view').hidden = true;
    $('session-actions').hidden = true;
    $('login-view').hidden = false;
    $('login-error').textContent = message || '';
    $('login-email').focus();
  }

  function showDashboard(session) {
    $('login-view').hidden = true;
    $('dashboard-view').hidden = false;
    $('session-actions').hidden = false;
    $('who').textContent = session.email || '';
    fetchData();
    stopPolling();
    pollTimer = setInterval(fetchData, POLL_MS);
  }

  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  async function api(path, options) {
    var session = loadSession();
    if (!session) { clearSession(); showLogin('Your session has expired. Please sign in again.'); throw new Error('no session'); }
    var opts = options || {};
    opts.headers = Object.assign({ Authorization: 'Bearer ' + session.accessToken }, opts.headers || {});
    var res = await fetch(path, opts);
    if (res.status === 401 || res.status === 403) {
      clearSession();
      showLogin(res.status === 403 ? 'This account does not have admin access.' : 'Please sign in again.');
      throw new Error('unauthorized');
    }
    if (!res.ok) {
      var body = await res.json().catch(function () { return {}; });
      throw new Error(body.message || ('Request failed (' + res.status + ')'));
    }
    return res.json();
  }

  async function fetchData() {
    try {
      var data = await api('/admin/api/riders');
      $('stat-total').textContent = data.stats.totalRiders;
      $('stat-pending').textContent = data.stats.pendingVerification;
      $('stat-active').textContent = data.stats.activeRiders;
      $('stat-subs').textContent = data.stats.activeSubscriptions;
      $('last-updated').textContent = 'Last synced: ' + new Date().toLocaleTimeString();

      var tbody = $('riders-tbody');
      if (!data.riders || data.riders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No riders registered yet.</td></tr>';
        return;
      }

      tbody.innerHTML = data.riders.map(function (r) {
        var isPending = r.onboardingStatus === 'PENDING_VERIFICATION';
        var isActive = r.onboardingStatus === 'ACTIVE';
        var isSubActive = r.subscriptionStatus === 'ACTIVE' || r.subscriptionStatus === 'TRIAL';
        var id = escapeHtml(r.id);

        var verificationBadge = isPending
          ? '<span class="badge badge-amber">PENDING VERIFICATION</span>'
          : isActive
            ? '<span class="badge badge-green">ACTIVE (APPROVED)</span>'
            : '<span class="badge badge-red">REJECTED</span>';
        var subBadge = '<span class="badge ' + (isSubActive ? 'badge-green' : 'badge-gray') + '">' +
          escapeHtml(r.subscriptionStatus) + '</span>';
        var paidUntilStr = r.paidUntil ? new Date(r.paidUntil).toLocaleDateString() : '—';
        var createdStr = new Date(r.createdAt).toLocaleDateString();

        return '<tr>' +
          '<td><strong>' + escapeHtml(r.fullName) + '</strong></td>' +
          '<td>' + escapeHtml(r.phoneNumber) + '</td>' +
          '<td>' + verificationBadge + '</td>' +
          '<td>' + subBadge + '</td>' +
          '<td>' + paidUntilStr + '</td>' +
          '<td>' + createdStr + '</td>' +
          '<td><div class="btn-group">' +
            (isPending ? '<button class="btn btn-approve" data-action="approve" data-id="' + id + '">Approve</button>' : '') +
            (isPending ? '<button class="btn btn-reject" data-action="reject" data-id="' + id + '">Reject</button>' : '') +
            '<button class="btn btn-grant" data-action="grant-access" data-id="' + id + '">+7 Days Free</button>' +
          '</div></td>' +
        '</tr>';
      }).join('');
    } catch (err) {
      if (err.message !== 'unauthorized' && err.message !== 'no session') {
        $('last-updated').textContent = 'Sync failed: ' + err.message;
      }
    }
  }

  var CONFIRM_TEXT = {
    'approve': 'Approve this rider for dispatch anywhere in Ghana?',
    'reject': 'Reject this rider?',
    'grant-access': 'Grant 7 days prepaid dispatch access to this rider?'
  };

  async function riderAction(action, id, button) {
    if (!confirm(CONFIRM_TEXT[action])) return;
    button.disabled = true;
    try {
      await api('/admin/api/riders/' + encodeURIComponent(id) + '/' + action, { method: 'POST' });
    } catch (err) {
      if (err.message !== 'unauthorized' && err.message !== 'no session') alert(err.message);
    } finally {
      button.disabled = false;
      fetchData();
    }
  }

  document.addEventListener('click', function (event) {
    var el = event.target.closest('[data-action]');
    if (!el) return;
    var action = el.getAttribute('data-action');
    if (action === 'refresh') { fetchData(); return; }
    if (action === 'logout') { clearSession(); showLogin(''); return; }
    var id = el.getAttribute('data-id');
    if (id && CONFIRM_TEXT[action]) riderAction(action, id, el);
  });

  $('login-form').addEventListener('submit', async function (event) {
    event.preventDefault();
    var submit = $('login-submit');
    submit.disabled = true;
    $('login-error').textContent = '';
    try {
      var res = await fetch('/admin/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: $('login-email').value, password: $('login-password').value })
      });
      var body = await res.json().catch(function () { return {}; });
      if (!res.ok) throw new Error(body.message || 'Sign-in failed');
      saveSession(body);
      $('login-password').value = '';
      showDashboard(body);
    } catch (err) {
      $('login-error').textContent = err.message;
    } finally {
      submit.disabled = false;
    }
  });

  var existing = loadSession();
  if (existing) showDashboard(existing); else showLogin('');
})();
`;
