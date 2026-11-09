import {
  Controller,
  Get,
  Header,
  Param,
  Post,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminRiderOverview, AdminStats } from './admin.types';

@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('api/riders')
  async getRiders(): Promise<{ stats: AdminStats; riders: AdminRiderOverview[] }> {
    const stats = await this.adminService.getStats();
    const riders = await this.adminService.listRiders();
    return { stats, riders };
  }

  @Post('api/riders/:id/approve')
  async approveRider(@Param('id') id: string): Promise<AdminRiderOverview> {
    return this.adminService.approveRider(id);
  }

  @Post('api/riders/:id/reject')
  async rejectRider(@Param('id') id: string): Promise<AdminRiderOverview> {
    return this.adminService.rejectRider(id);
  }

  @Post('api/riders/:id/grant-access')
  async grantAccess(@Param('id') id: string): Promise<AdminRiderOverview> {
    return this.adminService.grantSubscriptionAccess(id, 7);
  }

  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  getAdminDashboardHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GhanaDash Hub Command — Takoradi Admin</title>
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
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 20px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 24px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .brand-title {
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.5px;
    }
    .brand-badge {
      background: rgba(0, 200, 83, 0.15);
      color: var(--green);
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.5px;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 28px;
    }
    .stat-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 18px;
    }
    .stat-label {
      font-size: 12px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }
    .stat-value {
      font-size: 28px;
      font-weight: 800;
    }
    .stat-value.green { color: var(--green-light); }
    .stat-value.amber { color: var(--amber-light); }
    .stat-value.blue { color: #60A5FA; }

    .table-container {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
    }
    .table-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 20px;
      border-bottom: 1px solid var(--border);
    }
    .table-title {
      font-size: 16px;
      font-weight: 700;
    }
    .refresh-btn {
      background: var(--border);
      color: var(--text);
      border: none;
      padding: 8px 14px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
    }
    .refresh-btn:hover { background: #334155; }

    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
    }
    th {
      background: rgba(255,255,255,0.02);
      color: var(--text-muted);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 12px 20px;
      border-bottom: 1px solid var(--border);
    }
    td {
      padding: 16px 20px;
      border-bottom: 1px solid var(--border);
      font-size: 13px;
    }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: rgba(255, 255, 255, 0.015); }

    .badge {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 700;
    }
    .badge-amber {
      background: rgba(255, 152, 0, 0.15);
      color: var(--amber-light);
      border: 1px solid rgba(255, 152, 0, 0.3);
    }
    .badge-green {
      background: rgba(0, 200, 83, 0.15);
      color: var(--green-light);
      border: 1px solid rgba(0, 200, 83, 0.3);
    }
    .badge-red {
      background: rgba(255, 59, 48, 0.15);
      color: var(--red-light);
      border: 1px solid rgba(255, 59, 48, 0.3);
    }
    .badge-gray {
      background: rgba(148, 163, 184, 0.1);
      color: var(--text-muted);
    }

    .btn-group {
      display: flex;
      gap: 8px;
    }
    .btn {
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      border: none;
      cursor: pointer;
      transition: opacity 0.15s;
    }
    .btn:hover { opacity: 0.85; }
    .btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .btn-approve { background: var(--green); color: #000; }
    .btn-reject { background: var(--red); color: #fff; }
    .btn-grant { background: var(--amber); color: #000; }

    .empty-state {
      padding: 40px;
      text-align: center;
      color: var(--text-muted);
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="brand">
      <div style="font-size: 28px;">🇬🇭</div>
      <div>
        <div class="brand-title">GhanaDash Dispatch Hub Command</div>
        <div style="font-size: 12px; color: var(--text-muted);">Takoradi Regional Administration</div>
      </div>
      <span class="brand-badge">TAKORADI HUB 01</span>
    </div>
    <button class="refresh-btn" onclick="fetchData()">🔄 Refresh</button>
  </div>

  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-label">Total Riders</div>
      <div class="stat-value blue" id="stat-total">0</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Pending Verification</div>
      <div class="stat-value amber" id="stat-pending">0</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Active Approved Riders</div>
      <div class="stat-value green" id="stat-active">0</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Paid Subscriptions</div>
      <div class="stat-value green" id="stat-subs">0</div>
    </div>
  </div>

  <div class="table-container">
    <div class="table-header">
      <div class="table-title">Rider Roster & Verification Queue</div>
      <div style="font-size: 12px; color: var(--text-muted);" id="last-updated">Updating...</div>
    </div>
    <table>
      <thead>
        <tr>
          <th>Rider Name</th>
          <th>Phone Number</th>
          <th>Verification</th>
          <th>Subscription</th>
          <th>Paid Until</th>
          <th>Registered</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody id="riders-tbody">
        <tr><td colspan="7" class="empty-state">Loading registered riders...</td></tr>
      </tbody>
    </table>
  </div>

  <script>
    async function fetchData() {
      try {
        const res = await fetch('/admin/api/riders');
        const data = await res.json();
        
        document.getElementById('stat-total').textContent = data.stats.totalRiders;
        document.getElementById('stat-pending').textContent = data.stats.pendingVerification;
        document.getElementById('stat-active').textContent = data.stats.activeRiders;
        document.getElementById('stat-subs').textContent = data.stats.activeSubscriptions;
        document.getElementById('last-updated').textContent = 'Last synced: ' + new Date().toLocaleTimeString();

        const tbody = document.getElementById('riders-tbody');
        if (!data.riders || data.riders.length === 0) {
          tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No riders registered yet. Riders will appear here immediately upon phone OTP verification.</td></tr>';
          return;
        }

        tbody.innerHTML = data.riders.map(r => {
          const isPending = r.onboardingStatus === 'PENDING_VERIFICATION';
          const isActive = r.onboardingStatus === 'ACTIVE';
          const isSubActive = r.subscriptionStatus === 'ACTIVE' || r.subscriptionStatus === 'TRIAL';
          
          const verificationBadge = isPending 
            ? '<span class="badge badge-amber">PENDING VERIFICATION</span>'
            : isActive 
              ? '<span class="badge badge-green">ACTIVE (APPROVED)</span>'
              : '<span class="badge badge-red">REJECTED</span>';

          const subBadge = isSubActive
            ? '<span class="badge badge-green">' + r.subscriptionStatus + '</span>'
            : '<span class="badge badge-gray">' + r.subscriptionStatus + '</span>';

          const paidUntilStr = r.paidUntil ? new Date(r.paidUntil).toLocaleDateString() : '—';
          const createdStr = new Date(r.createdAt).toLocaleDateString();

          return '<tr>' +
            '<td><strong>' + escapeHtml(r.fullName) + '</strong></td>' +
            '<td>' + escapeHtml(r.phoneNumber) + '</td>' +
            '<td>' + verificationBadge + '</td>' +
            '<td>' + subBadge + '</td>' +
            '<td>' + paidUntilStr + '</td>' +
            '<td>' + createdStr + '</td>' +
            '<td>' +
              '<div class="btn-group">' +
                (isPending ? '<button class="btn btn-approve" onclick="approveRider(\\'' + r.id + '\\')">Approve</button>' : '') +
                (isPending ? '<button class="btn btn-reject" onclick="rejectRider(\\'' + r.id + '\\')">Reject</button>' : '') +
                '<button class="btn btn-grant" onclick="grantAccess(\\'' + r.id + '\\')">+7 Days Free</button>' +
              '</div>' +
            '</td>' +
          '</tr>';
        }).join('');
      } catch (err) {
        console.error(err);
      }
    }

    async function approveRider(id) {
      if (!confirm('Approve this rider for Takoradi dispatch service?')) return;
      await fetch('/admin/api/riders/' + id + '/approve', { method: 'POST' });
      fetchData();
    }

    async function rejectRider(id) {
      if (!confirm('Reject this rider?')) return;
      await fetch('/admin/api/riders/' + id + '/reject', { method: 'POST' });
      fetchData();
    }

    async function grantAccess(id) {
      if (!confirm('Grant 7 days prepaid dispatch access to this rider?')) return;
      await fetch('/admin/api/riders/' + id + '/grant-access', { method: 'POST' });
      fetchData();
    }

    function escapeHtml(text) {
      if (!text) return '';
      return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    fetchData();
    setInterval(fetchData, 8000);
  </script>
</body>
</html>`;
  }
}
