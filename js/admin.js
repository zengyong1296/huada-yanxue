/**
 * 华大教育研学管理系统
 * 管理后台逻辑（Supabase 云端版本 + 角色权限 + 报名流程）
 */

// 角色标签
const ROLE_LABELS = {
  dev: '开发 · 超级管理员',
  ops: '运营',
  delivery: '交付',
  sales: '销售',
  teacher: '讲师',
};

// 时间段（与选课页一致）
const TIME_SLOTS = [
  { start: '09:00', end: '10:30' },
  { start: '10:30', end: '12:00' },
  { start: '13:30', end: '15:00' },
  { start: '15:00', end: '16:30' },
  { start: '16:30', end: '18:00' },
];

// 每个交付人员每天可承接的团数上限
const DELIVERY_DAILY_CAPACITY = 2;

// 时间段重叠工具：scheduledTime 统一存为 "HH:MM-HH:MM"
function timeToMin(t) {
  const [h, m] = (t || '').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}
function parseSlot(slot) {
  if (!slot || !String(slot).includes('-')) return null;
  const parts = String(slot).split('-');
  return [timeToMin(parts[0]), timeToMin(parts[1])];
}
// 两个时间段是否重叠（半开区间，端点相接不算冲突）
function slotsOverlap(slotA, slotB) {
  const a = parseSlot(slotA), b = parseSlot(slotB);
  if (!a || !b) return false;
  return a[0] < b[1] && b[0] < a[1];
}

// 状态样式映射（与自助端共用 STATUS_META，避免两份定义漂移）
const STATUS_MAP = Object.assign({}, STATUS_META, {
  '待确认': STATUS_META['待审核'],
  '已排期': STATUS_META['已排课'],
});

const Admin = {
  currentPage: 'dashboard',
  allSubmissions: [],  // 数据缓存
  allAdmins: [],       // 管理员缓存（用于角色解析）
  loading: false,

  // ---------- 权限 ----------
  isSales() {
    return (Storage.getSession()?.role || 'dev') === 'sales';
  },
  can(action) {
    const role = Storage.getSession()?.role || 'dev';
    const matrix = {
      dev: ['viewAll', 'manageAdmins', 'schedule', 'viewBoard', 'viewCalendar', 'viewAnalytics', 'confirmReject', 'delete', 'export', 'edit', 'quote', 'markDelivered', 'markCompleted', 'teacherView'],
      ops: ['viewAll', 'schedule', 'viewBoard', 'viewCalendar', 'viewAnalytics', 'delete', 'export', 'edit', 'markDelivered'],
      delivery: ['confirmReject'],
      sales: ['viewAll', 'export', 'edit', 'quote', 'markCompleted', 'viewAnalytics'],
      teacher: ['teacherView'],
    };
    return (matrix[role] || []).includes(action);
  },

  async init() {
    if (isSupabaseConfigured()) {
      await Storage.init();
    }

    if (Storage.isLoggedIn()) {
      await this.showAdmin();
    } else {
      this.showLogin();
    }

    const lp = document.getElementById('loginPhone');
    const lw = document.getElementById('loginPassword');
    if (lp) lp.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.login(); });
    if (lw) lw.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.login(); });
  },

  // ---------- 登录/登出 ----------
  showLogin() {
    document.getElementById('loginPage').style.display = 'flex';
    document.getElementById('adminLayout').style.display = 'none';
    const lb = document.getElementById('loginBg');
    if (lb) lb.style.display = 'block';
  },

  async showAdmin() {
    document.getElementById('loginPage').style.display = 'none';
    document.getElementById('adminLayout').style.display = 'flex';
    const lb = document.getElementById('loginBg');
    if (lb) lb.style.display = 'none';
    const session = Storage.getSession();
    document.getElementById('adminName').textContent = session.displayName || session.username;
    document.getElementById('adminAvatar').textContent = (session.displayName || session.username).charAt(0).toUpperCase();
    const roleEl = document.querySelector('.sidebar-user .role');
    if (roleEl) roleEl.textContent = ROLE_LABELS[session.role] || session.role;
    document.getElementById('changePwdUsername').value = session.username;

    // 讲师默认进入「讲师端」页面
    if (session.role === 'teacher') {
      this.switchPage('teacher');
    }

    // 侧边栏按角色显隐
    const navAdmins = document.getElementById('nav-admins');
    const navBoard = document.getElementById('nav-board');
    const navAnalytics = document.getElementById('nav-analytics');
    const navCalendar = document.getElementById('nav-calendar');
    const navTeacher = document.getElementById('nav-teacher');
    if (navAdmins) navAdmins.style.display = this.can('manageAdmins') ? '' : 'none';
    if (navBoard) navBoard.style.display = this.can('viewBoard') ? '' : 'none';
    if (navAnalytics) navAnalytics.style.display = this.can('viewAnalytics') ? '' : 'none';
    if (navCalendar) navCalendar.style.display = this.can('viewCalendar') ? '' : 'none';
    if (navTeacher) navTeacher.style.display = this.can('teacherView') ? '' : 'none';

    await this.renderAll();
  },

  // 手机号 + 密码登录（内部映射邮箱走 Supabase Auth，未配置时自动降级直连）
  async login() {
    const phone = (document.getElementById('loginPhone').value || '').trim();
    const password = (document.getElementById('loginPassword').value || '').trim();
    if (!/^1\d{10}$/.test(phone)) {
      this.showToast('请输入正确的11位手机号', 'error');
      return;
    }
    if (!password) {
      this.showToast('请输入密码', 'error');
      return;
    }
    const btn = document.querySelector('#pwdForm .btn-login');
    if (btn) { btn.disabled = true; btn.textContent = '登录中...'; }
    const r = await Storage.login(phone, password);
    if (btn) { btn.disabled = false; btn.textContent = '登 录'; }
    if (r.success) {
      this.showToast('登录成功', 'success');
      await this.showAdmin();
    } else {
      this.showToast(r.message, 'error');
    }
  },

  logout() {
    Storage.logout();
    this.showToast('已退出登录', '');
    this.showLogin();
  },

  // ---------- 页面切换 ----------
  switchPage(page) {
    this.currentPage = page;
    document.querySelectorAll('.sidebar-nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.page === page);
    });
    const pages = ['dashboard', 'board', 'admins', 'analytics', 'calendar', 'teacher'];
    pages.forEach(p => {
      const el = document.getElementById('page-' + p);
      if (el) el.style.display = (p === page) ? 'block' : 'none';
    });
    if (page === 'admins') this.renderAdmins();
    if (page === 'board') this.renderBoard();
    if (page === 'analytics') this.renderDashboard();
    if (page === 'calendar') this.renderCalendar();
    if (page === 'teacher') this.renderTeacherPortal();
  },

  // 点击状态柱状图 → 跳转到「数据总览」并按该状态筛选
  gotoStatus(status) {
    const sel = document.getElementById('filterStatus');
    if (sel) sel.value = status;
    this.switchPage('dashboard');
    this.renderStats();   // 刷新统计卡片 + 状态管道高亮
    this.renderTable();   // 按所选状态过滤表格
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  // ---------- 数据渲染 ----------
  async renderAll() {
    this.allSubmissions = await Storage.getSubmissions();
    this.allAdmins = await Storage.getAdmins();
    this.populateFilters();
    this.renderStats();
    this.renderTable();
  },

  // 填充后台筛选下拉：课程（静态，来自 COURSES）+ 机构（动态，来自已加载数据）
  populateFilters() {
    const fc = document.getElementById('filterCourse');
    if (fc && fc.options.length <= 1) {
      (typeof COURSES !== 'undefined' ? COURSES : []).forEach(c => {
        const o = document.createElement('option');
        o.value = c.id;
        o.textContent = c.title;
        fc.appendChild(o);
      });
    }
    const fo = document.getElementById('filterOrg');
    if (fo) {
      const orgs = [...new Set((this.allSubmissions || []).map(s => s.org).filter(Boolean))].sort();
      const cur = fo.value;
      fo.innerHTML = '<option value="">全部机构</option>' +
        orgs.map(o => `<option value="${this.escapeHtml(o)}">${this.escapeHtml(o)}</option>`).join('');
      if (orgs.includes(cur)) fo.value = cur;
    }
  },

  // 局部更新：操作成功后直接改本地数组并仅重渲染表格/统计，免全量重拉与整页闪烁
  applyLocalUpdate(id, patch) {
    const s = this.allSubmissions.find(x => String(x.id) === String(id));
    if (s) Object.assign(s, patch);
    this.renderTable();
    this.renderStats();
  },

  // 本地删除：从内存数组移除后仅重渲染，免全量重拉
  removeLocalSubmission(id) {
    this.allSubmissions = (this.allSubmissions || []).filter(x => String(x.id) !== String(id));
    this.renderTable();
    this.renderStats();
  },

  renderStats() {
    const submissions = this.getVisibleSubmissions();
    const today = todayLocal();

    document.getElementById('statTotal').textContent = submissions.length;
    const totalPeople = submissions.reduce((sum, s) => sum + (parseInt(s.people) || 0), 0);
    document.getElementById('statPeople').textContent = totalPeople;
    const totalRevenue = submissions.reduce((sum, s) => sum + (parseInt(s.total) || 0), 0);
    document.getElementById('statRevenue').textContent = '¥' + totalRevenue.toLocaleString();
    const todayCount = submissions.filter(s => s.createdAt && isoToLocalDate(s.createdAt) === today).length;
    document.getElementById('statToday').textContent = todayCount;

    // 状态流程管道（交互式：点击筛选）
    this.renderStatusPipeline();
  },

  // 状态流程管道：把 6 个状态渲染成可点击的流程卡
  renderStatusPipeline() {
    const submissions = this.getVisibleSubmissions();
    const flow = [
      { key: '待审核', icon: '⏳', color: '#F59E0B' },
      { key: '已确认', icon: '✅', color: '#3B82F6' },
      { key: '已排课', icon: '📅', color: '#8B5CF6' },
      { key: '已交付', icon: '🚚', color: '#06B6D4' },
      { key: '已完成', icon: '🎉', color: '#10B981' },
    ];
    const rejected = { key: '已拒绝', icon: '❌', color: '#EF4444' };
    const active = (document.getElementById('filterStatus') || {}).value || '';
    const count = (k) => submissions.filter(s => (s.status || '待审核') === k).length;

    const stepHtml = (st) => {
      const isActive = active === st.key;
      return `
        <div class="status-step${isActive ? ' active' : ''}" data-status="${st.key}" style="--accent:${st.color}">
          <div class="ss-icon">${st.icon}</div>
          <div class="ss-body">
            <div class="ss-num">${count(st.key)}</div>
            <div class="ss-label">${st.key}</div>
          </div>
        </div>`;
    };

    let html = '';
    flow.forEach((st, i) => {
      html += stepHtml(st);
      if (i < flow.length - 1) html += '<div class="status-arrow">›</div>';
    });
    html += '<div class="status-arrow branch" title="拒绝（分支）">⤷</div>';
    html += stepHtml(rejected);

    const el = document.getElementById('statusPipeline');
    if (!el) return;
    el.innerHTML = html;

    el.querySelectorAll('.status-step').forEach(node => {
      node.addEventListener('click', () => {
        const sel = document.getElementById('filterStatus');
        const target = node.getAttribute('data-status');
        sel.value = (sel.value === target) ? '' : target;
        this.renderTable();
        this.renderStatusPipeline();
      });
    });
  },

  // 当前角色可见的数据范围
  getVisibleSubmissions() {
    let list = this.allSubmissions;
    const session = Storage.getSession();
    if (session && session.role === 'delivery') {
      list = list.filter(s => s.status === '待审核' || s.assignedDelivery === session.username);
    } else if (session && session.role === 'teacher') {
      list = list.filter(s => s.assignedTeacher === session.username && (s.status === '已排课' || s.status === '已交付'));
    }
    return list;
  },

  getFilteredSubmissions() {
    let submissions = this.getVisibleSubmissions();
    const city = document.getElementById('filterCity').value;
    const status = document.getElementById('filterStatus').value;
    const course = document.getElementById('filterCourse').value;
    const org = document.getElementById('filterOrg').value;
    const search = document.getElementById('filterSearch').value.trim().toLowerCase();

    if (city) submissions = submissions.filter(s => s.city === city);
    if (status) submissions = submissions.filter(s => (s.status || '待审核') === status);
    if (course) submissions = submissions.filter(s => (s.courses || []).some(c => String(c) === String(course)));
    if (org) submissions = submissions.filter(s => s.org === org);
    if (search) {
      const isSales = this.isSales();
      submissions = submissions.filter(s =>
        (s.org || '').toLowerCase().includes(search) ||
        (isSales && (s.name || '').toLowerCase().includes(search)) ||
        (isSales && (s.phone || '').toLowerCase().includes(search))
      );
    }
    // 排序：按「处理优先级」排列——越需要处理的越靠前，已交付/已完成沉底；
    // 同状态下按等待时长升序（越早提交/参访、等待越久的越紧急）。
    const SOP_PRIORITY = { '待审核': 0, '已确认': 1, '已排课': 2, '已交付': 3, '已完成': 4, '已拒绝': 5 };
    submissions.sort((a, b) => {
      const pa = SOP_PRIORITY[a.status] != null ? SOP_PRIORITY[a.status] : 2;
      const pb = SOP_PRIORITY[b.status] != null ? SOP_PRIORITY[b.status] : 2;
      if (pa !== pb) return pa - pb;
      const da = a.createdAt || a.date || '', db = b.createdAt || b.date || '';
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return da.localeCompare(db);
    });
    return submissions;
  },

  deliveryName(username) {
    if (!username) return '—';
    const a = this.allAdmins.find(x => x.username === username);
    return a ? (a.displayName || a.username) : username;
  },

  statusBadge(status) {
    const m = STATUS_MAP[status] || STATUS_MAP['待审核'];
    return `<span class="status-badge ${m.cls}">${m.label}</span>`;
  },


  renderTable() {
    const submissions = this.getFilteredSubmissions();
    const tbody = document.getElementById('dataTableBody');
    const isSales = this.isSales();

    // 按角色显隐表头列
    const thContact = document.getElementById('thContact');
    const thPhone = document.getElementById('thPhone');
    if (thContact) thContact.style.display = isSales ? '' : 'none';
    if (thPhone) thPhone.style.display = isSales ? '' : 'none';

    // 更新搜索框 placeholder
    const searchInput = document.getElementById('filterSearch');
    if (searchInput) {
      searchInput.placeholder = isSales ? '搜索机构/联系人/手机号...' : '搜索机构名称...';
    }

    if (submissions.length === 0) {
      const colCount = document.querySelectorAll('#dataTable thead th').length || 13;
      tbody.innerHTML = `<tr class="empty-row"><td colspan="${colCount}">暂无报名数据</td></tr>`;
      return;
    }

    tbody.innerHTML = submissions.map((s) => {
      const courseNames = (s.courseNames || []).join('、') || '—';
      const courseCount = (s.courses || []).length;
      const canConfirm = this.can('confirmReject') && s.status === '待审核';
      const canSchedule = this.can('schedule') && s.status === '已确认';
      const canCancel = this.can('schedule') && s.status === '已排课';
      const canDeliver = this.can('markDelivered') && s.status === '已排课';
      const canComplete = this.can('markCompleted') && s.status === '已交付';
      const canQuote = this.can('quote') && s.status !== '已拒绝' && s.status !== '已完成';
      const canDelete = this.can('delete');

      let actions = `<button class="action-btn view" onclick="Admin.showDetail('${s.id}')">详情</button>`;
      // 一键导出确认单：仅销售角色
      if (this.isSales()) actions += `<button class="action-btn confirm-doc" onclick="Admin.exportConfirm('${s.id}')">确认单</button>`;
      if (canConfirm) actions += `<button class="action-btn confirm" onclick="Admin.confirmSubmission('${s.id}')">确认</button>`;
      if (canSchedule) actions += `<button class="action-btn schedule" onclick="Admin.openSchedule('${s.id}')">排期</button>`;
      if (canCancel) actions += `<button class="action-btn cancel" onclick="Admin.cancelSchedule('${s.id}')">取消排期</button>`;
      if (canDeliver) actions += `<button class="action-btn delivert" onclick="Admin.markDelivered('${s.id}')">标记交付</button>`;
      if (canComplete) actions += `<button class="action-btn complete" onclick="Admin.markCompleted('${s.id}')">标记完成</button>`;
      if (canQuote) {
        const hasQuote = s.quoteAmount != null || (s.quoteLines && typeof s.quoteLines === 'object' && !Array.isArray(s.quoteLines));
        actions += `<button class="action-btn quote ${hasQuote ? 'done' : ''}" onclick="Admin.openQuote('${s.id}')">${hasQuote ? '已报价' : '报价'}</button>`;
      }
      if (canDelete) actions += `<button class="action-btn delete" onclick="Admin.confirmDelete('${s.id}')">删除</button>`;

      // 日期不显示年份
      const dateShort = this.formatDateShort(s.date);

      return `
        <tr>
          <td style="font-size:12px;color:var(--text-muted);">${s.id}</td>
          <td><span class="status-tag status-${(s.city || '').toLowerCase()}">${s.city || '—'}</span></td>
          <td>${this.statusBadge(s.status)}</td>
          <td>${this.escapeHtml(s.org || '—')}</td>
          ${isSales ? `<td>${this.escapeHtml(s.name || '—')}</td>` : ''}
          ${isSales ? `<td style="font-family:monospace;">${s.phone || '—'}</td>` : ''}
          <td class="date-cell">${dateShort}</td>
          <td style="text-align:center;font-weight:600;">${s.people || 0}</td>
          <td>
            <span style="font-size:13px;">${courseNames}</span>
            <span style="font-size:11px;color:var(--text-muted);margin-left:4px;">(${courseCount}门)</span>
          </td>
          <td style="text-align:center;">${s.lunch ? '🍱 是' : '—'}</td>
          <td style="font-weight:700;color:#DC2626;">¥${((s.quoteAmount != null ? Number(s.quoteAmount) : (s.total || 0))).toLocaleString()}${s.quoteAmount != null && Number(s.quoteAmount) !== Number(s.total || 0) ? `<div style="font-size:11px;font-weight:400;color:var(--text-muted);text-decoration:line-through;">原价 ¥${(s.total || 0).toLocaleString()}</div>` : ''}</td>
          <td style="font-size:12px;color:var(--text-muted);">${s.createdAt ? this.formatDate(s.createdAt) : '—'}</td>
          <td style="white-space:nowrap;">${actions}</td>
        </tr>
      `;
    }).join('');
  },

  // ---------- 详情 + 流程操作 ----------
  showDetail(id) {
    const s = this.allSubmissions.find(sub => sub.id === id);
    if (!s) return;

    const courses = (s.courses || []).map(cid => {
      const c = getCourseById(cid);
      return c ? c.title : `课程${cid}`;
    });

    // 流程操作按钮
    const canConfirm = this.can('confirmReject') && s.status === '待审核';
    const canReject = this.can('confirmReject') && s.status === '待审核';
    const canSchedule = this.can('schedule') && s.status === '已确认';
    const canCancel = this.can('schedule') && s.status === '已排课';
    const canDeliver = this.can('markDelivered') && s.status === '已排课';
    const canComplete = this.can('markCompleted') && s.status === '已交付';
    const canQuote = this.can('quote') && s.status !== '已拒绝' && s.status !== '已完成';

    let flowActions = '';
    if (canConfirm) flowActions += `<button class="btn-modal btn-confirm" onclick="Admin.confirmSubmission('${s.id}')">✅ 确认收到</button>`;
    if (canReject) flowActions += `<button class="btn-modal btn-danger" onclick="Admin.openReject('${s.id}')">❌ 拒绝申请</button>`;
    if (canSchedule) flowActions += `<button class="btn-modal btn-schedule" onclick="Admin.openSchedule('${s.id}')">📅 排期 / 分配</button>`;
    if (canCancel) flowActions += `<button class="btn-modal btn-cancel" onclick="Admin.cancelSchedule('${s.id}')">↩ 取消排期</button>`;
    if (canDeliver) flowActions += `<button class="btn-modal btn-deliver" onclick="Admin.markDelivered('${s.id}')">🚚 标记已交付</button>`;
    if (canComplete) flowActions += `<button class="btn-modal btn-complete" onclick="Admin.markCompleted('${s.id}')">🎉 标记已完成</button>`;
    if (canQuote) {
      const hasQuote = s.quoteAmount != null || (s.quoteLines && typeof s.quoteLines === 'object' && !Array.isArray(s.quoteLines));
      flowActions += `<button class="btn-modal btn-quote ${hasQuote ? 'done' : ''}" onclick="Admin.openQuote('${s.id}')">${hasQuote ? '📄 已报价（可修改）' : '📄 生成报价单'}</button>`;
    }

    const rejectBlock = s.status === '已拒绝' && s.rejectReason
      ? `<div class="reject-block">拒绝理由：${this.escapeHtml(s.rejectReason)}</div>` : '';

    const scheduleBlock = (s.status === '已排课' && s.assignedDelivery)
      ? `<div class="detail-item full"><div class="label">排期信息</div><div class="value">
          交付人员：<strong>${this.deliveryName(s.assignedDelivery)}</strong>
          ${s.assignedTeacher ? ' ｜ 讲师：<strong>' + this.teacherName(s.assignedTeacher) + '</strong>' : ''}
          ${s.venue ? ' ｜ 场地：<strong>' + this.escapeHtml(getVenueName(s.venue)) + '</strong>' : ''}
          ｜ 日期：${s.scheduledDate || '—'} ｜ 时间：${s.scheduledTime || '—'}
        </div></div>`
      : '';

    const execBlock = (s.status === '已排课' || s.status === '已交付')
      ? `<div class="detail-item full"><div class="label">执行 / 签到</div><div class="value">
          实到人数：<strong>${s.actualPeople || 0}</strong> ／ 报名 ${s.people} 人
          ${s.execNote ? ' ｜ 执行小结：' + this.escapeHtml(s.execNote) : ''}
          ${s.satisfactionRating ? ' ｜ 满意度：' + '★'.repeat(s.satisfactionRating) + ' (' + s.satisfactionRating + '星)' : ''}
        </div></div>`
      : '';

    // 付款凭证（已交付 / 已完成时开放上传）
    const proofBlock = (s.status === '已交付' || s.status === '已完成')
      ? `<div class="detail-item full">${App.renderProofUploader(s, 'sales')}</div>` : '';

    // 报价单展示
    let quoteBlock = '';
    if (s.quoteAmount != null || s.quoteNote) {
      quoteBlock = `<div class="detail-item full"><div class="label">报价单${s.quoteConfirmed ? '（机构已确认）' : ''}</div><div class="value">
        <strong style="color:#DC2626;font-size:16px;">¥${(s.quoteAmount != null ? Number(s.quoteAmount).toLocaleString() : '待定')}</strong>
        ${s.quoteGeneratedBy ? `<span style="font-size:12px;color:var(--text-muted);margin-left:8px;">由 ${this.deliveryName(s.quoteGeneratedBy)} 生成</span>` : ''}
        ${this.quoteBreakdownHtml(s)}
        ${s.quoteNote ? `<div style="margin-top:4px;font-size:13px;color:var(--text-secondary);">备注：${this.escapeHtml(s.quoteNote)}</div>` : ''}
      </div></div>`;
    }

    // 时间线
    const timeline = (s.history || []).slice().reverse().map(h => `
      <div class="timeline-item">
        <div class="timeline-dot"></div>
        <div class="timeline-content">
          <div class="timeline-action">${this.escapeHtml(h.action)}</div>
          <div class="timeline-meta">${this.escapeHtml(h.by || '')} · ${h.at ? this.formatDate(h.at) : ''}${h.note ? ' · ' + this.escapeHtml(h.note) : ''}</div>
        </div>
      </div>
    `).join('') || '<div style="font-size:13px;color:var(--text-muted);">暂无操作记录</div>';

    const body = `
      <div style="margin-bottom:12px;">${this.statusBadge(s.status)} ${s.trackingCode ? `<span style="font-size:12px;color:var(--text-muted);margin-left:8px;">查询码：${s.trackingCode}</span>` : ''}</div>
      <div class="detail-grid">
        <div class="detail-item"><div class="label">编号</div><div class="value" style="font-size:12px;">${s.id}</div></div>
        <div class="detail-item"><div class="label">城市</div><div class="value">${s.city}</div></div>
        <div class="detail-item"><div class="label">机构名称</div><div class="value">${this.escapeHtml(s.org)}</div></div>
        ${this.isSales() ? `<div class="detail-item"><div class="label">联系人</div><div class="value">${this.escapeHtml(s.name)}</div></div>` : ''}
        ${this.isSales() ? `<div class="detail-item"><div class="label">手机号</div><div class="value" style="font-family:monospace;">${s.phone}</div></div>` : ''}
        <div class="detail-item"><div class="label">参访日期</div><div class="value">${this.formatDateShort(s.date)}</div></div>
        <div class="detail-item"><div class="label">参访时段</div><div class="value">${s.timeSlot || '—'}</div></div>
        <div class="detail-item"><div class="label">参访人数</div><div class="value">${s.people} 人</div></div>
        <div class="detail-item"><div class="label">天数</div><div class="value">${s.days || 1} 天</div></div>
        <div class="detail-item"><div class="label">午餐服务</div><div class="value">${s.lunch ? '已选 🍱' : '未选'}</div></div>
        <div class="detail-item"><div class="label">提交时间</div><div class="value" style="font-size:13px;">${this.formatDate(s.createdAt)}</div></div>
        ${scheduleBlock}
        ${execBlock}
        ${proofBlock}
      </div>
        <div class="detail-courses">
          <div style="font-size:13px;font-weight:600;color:var(--text-secondary);margin-bottom:8px;">已选课程</div>
          ${(s.courses || []).map((cid, i) => {
            const c = getCourseById(cid);
            const cityDiscount = getCityDiscount(s.city);
            const eff = (c && typeof c.price === 'number') ? Math.round(c.price * cityDiscount) : (c ? c.price : '¥0');
            return `<div class="detail-course-item">
              <span><strong>No.${c ? c.no : '?'}</strong> ${c ? c.title : '未知课程'}</span>
              <span style="color:#DC2626;font-weight:600;">${typeof eff === 'number' ? '¥' + eff + '/人' : eff}</span>
            </div>`;
          }).join('')}
        </div>
        ${quoteBlock}
      <div style="margin-top:16px;padding:16px;background:var(--bg-hover);border-radius:8px;display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div style="font-size:13px;color:var(--text-muted);">课程费用</div>
          <div style="font-weight:600;">¥${(s.courseTotal || 0).toLocaleString()}</div>
        </div>
        ${s.lunch ? `<div><div style="font-size:13px;color:var(--text-muted);">午餐费用</div><div style="font-weight:600;">¥${(s.lunchTotal || 0).toLocaleString()}</div></div>` : ''}
        <div>
          <div style="font-size:13px;color:var(--text-muted);">${s.quoteAmount != null ? '报价合计（折后）' : '合计'}</div>
          <div style="font-size:22px;font-weight:700;color:#DC2626;">¥${((s.quoteAmount != null ? Number(s.quoteAmount) : (s.total || 0))).toLocaleString()}${s.quoteAmount != null && Number(s.quoteAmount) !== Number(s.total || 0) ? `<span style="font-size:13px;font-weight:400;color:var(--text-muted);text-decoration:line-through;margin-left:6px;">原价¥${(s.total || 0).toLocaleString()}</span>` : ''}</div>
        </div>
      </div>
      ${rejectBlock}
      ${flowActions ? `<div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap;">${flowActions}</div>` : ''}
      <div class="timeline-wrap" style="margin-top:20px;">
        <div style="font-size:13px;font-weight:600;color:var(--text-secondary);margin-bottom:10px;">操作记录</div>
        <div class="timeline">${timeline}</div>
      </div>
    `;
    this.showModal('报名详情', body, [
      ...(this.isSales() ? [{ text: '📄 预览确认单', class: 'btn-confirm', action: () => this.exportConfirm(s.id) }] : []),
      { text: '关闭', class: 'btn-cancel', action: () => this.hideModal() },
    ]);
  },

  // 一键「研学活动确认单」—— 先预览，再提供下载 Word（仅销售角色）
  async exportConfirm(id) {
    const s = this.allSubmissions.find(x => x.id === id);
    if (!s) { this.showToast('未找到该报名记录', 'error'); return; }
    if (typeof window.ExportConfirm === 'undefined') {
      this.showToast('组件未加载，请刷新页面后重试', 'error');
      return;
    }
    const session = Storage.getSession() || {};
    const exporter = {
      name: session.displayName || session.username || '',
      phone: session.username || '',  // 登录账号即手机号
    };
    const html = window.ExportConfirm.previewHtml(s, exporter);
    this.showModal('📄 研学活动确认单预览', `<div class="confirm-preview-wrap">${html}</div>`, [
      { text: '关闭', class: 'btn-cancel', action: () => this.hideModal() },
      { text: '⬇ 下载 Word', class: 'btn-confirm', action: () => this.downloadConfirm(s, exporter) },
    ], 'modal-lg');
  },

  // 从预览弹窗下载 Word
  async downloadConfirm(s, exporter) {
    if (typeof window.docx === 'undefined') {
      this.showToast('Word 生成库未加载，请刷新页面后重试', 'error');
      return;
    }
    this.showToast('正在生成确认单...', 'success');
    try {
      const filename = await window.ExportConfirm.download(s, exporter);
      this.showToast('已导出：' + filename, 'success');
    } catch (e) {
      console.error('[Admin] 导出确认单失败:', e);
      this.showToast('导出失败：' + (e && e.message ? e.message : '未知错误'), 'error');
    }
  },

  async confirmSubmission(id) {
    const s = this.allSubmissions.find(x => x.id === id);
    if (!s) return;
    const session = Storage.getSession();
    const history = (s.history || []).concat([{ action: '确认收到', by: session.username, at: new Date().toISOString() }]);
    const ok = await Storage.updateSubmission(id, {
      status: '已确认',
      confirmed_at: new Date().toISOString(),
      confirmed_by: session.username,
      history,
    });

    this.hideModal();
    if (ok) {
      this.showToast('已确认收到该团', 'success');
      this.applyLocalUpdate(id, { status: '已确认', confirmedAt: new Date().toISOString(), confirmedBy: session.username, history });
    } else {
      this.showToast('操作失败，请重试', 'error');
    }
  },

  openReject(id) {
    const body = `
      <p>请填写拒绝理由（将同步展示给机构）：</p>
      <div class="form-group" style="margin-top:12px;">
        <textarea class="form-control" id="rejectReasonInput" rows="3" placeholder="如：该日期排期已满 / 人数超出承接上限 / 课程暂不开放..."></textarea>
      </div>
      <div style="margin-top:8px;font-size:12px;color:var(--text-muted);">常用理由：
        <span class="quick-reason" onclick="document.getElementById('rejectReasonInput').value='该日期排期已满'">排期已满</span>
        <span class="quick-reason" onclick="document.getElementById('rejectReasonInput').value='人数超出承接上限'">人数超限</span>
        <span class="quick-reason" onclick="document.getElementById('rejectReasonInput').value='该课程暂不开放'">课程暂不开放</span>
      </div>
    `;
    this.showModal('❌ 拒绝申请', body, [
      { text: '取消', class: 'btn-cancel', action: () => this.hideModal() },
      { text: '确认拒绝', class: 'btn-danger', action: () => this.rejectSubmission(id) },
    ]);
  },

  async rejectSubmission(id) {
    const s = this.allSubmissions.find(x => x.id === id);
    if (!s) return;
    const reason = document.getElementById('rejectReasonInput').value.trim();
    if (!reason) { this.showToast('请填写拒绝理由', 'error'); return; }
    const session = Storage.getSession();
    const history = (s.history || []).concat([{ action: '拒绝申请', by: session.username, at: new Date().toISOString(), note: reason }]);
    const ok = await Storage.updateSubmission(id, {
      status: '已拒绝',
      reject_reason: reason,
      confirmed_by: session.username,
      history,
    });
    this.hideModal();
    if (ok) {
      this.showToast('已拒绝该团申请', 'success');
      this.applyLocalUpdate(id, { status: '已拒绝', rejectReason: reason, confirmedBy: session.username, history });
    } else {
      this.showToast('操作失败，请重试', 'error');
    }
  },

  async openSchedule(id) {
    const s = this.allSubmissions.find(x => x.id === id);
    if (!s) return;
    const staff = (this.allAdmins || []).filter(a => a.role === 'delivery');
    if (staff.length === 0) {
      this.showToast('暂无交付人员，请先在「管理员管理」添加 role=交付 的账号', 'error');
      return;
    }
    const staffOptions = staff.map(a => `<option value="${a.username}">${this.escapeHtml(a.displayName || a.username)}</option>`).join('');
    const slotOptions = TIME_SLOTS.map(t => `<option value="${t.start}-${t.end}">${t.start} - ${t.end}</option>`).join('') + '<option value="custom">✎ 自定义开始/结束时间</option>';
    const defTimes = parseSlot(s.scheduledTime) ? s.scheduledTime.split('-') : [TIME_SLOTS[0].start, TIME_SLOTS[0].end];
    const defStart = defTimes[0] || TIME_SLOTS[0].start;
    const defEnd = defTimes[1] || TIME_SLOTS[0].end;
    const venueOptions = getVenuesForCity(s.city).map(v => `<option value="${v.id}">${this.escapeHtml(v.name)}（容量${v.capacity}人${v.stagger ? ' · 可错位' : ''}）</option>`).join('');
    const teachers = (this.allAdmins || []).filter(a => a.role === 'teacher');
    const teacherOptions = teachers.length
      ? teachers.map(a => `<option value="${a.username}">${this.escapeHtml(a.displayName || a.username)}</option>`).join('')
      : '<option value="">（暂无讲师，可在管理员管理添加）</option>';

    const body = `
      <p style="font-size:13px;color:var(--text-secondary);">为 <strong>${this.escapeHtml(s.org)}</strong>（${s.date}，${s.people}人）安排交付人员与排期：</p>
      <div class="form-group" style="margin-top:12px;">
        <label style="font-size:13px;font-weight:600;display:block;margin-bottom:6px;">交付人员</label>
        <select class="form-control" id="scheduleStaff">${staffOptions}</select>
      </div>
      <div class="form-group" style="margin-top:12px;">
        <label style="font-size:13px;font-weight:600;display:block;margin-bottom:6px;">授课讲师（可选）</label>
        <select class="form-control" id="scheduleTeacher">${teacherOptions}</select>
      </div>
      <div class="form-group" style="margin-top:12px;">
        <label style="font-size:13px;font-weight:600;display:block;margin-bottom:6px;">场地</label>
        <select class="form-control" id="scheduleVenue">${venueOptions}</select>
      </div>
      <div class="form-group" style="margin-top:12px;">
        <label style="font-size:13px;font-weight:600;display:block;margin-bottom:6px;">场地详细地址（可选，用于确认单）</label>
        <input type="text" class="form-control" id="scheduleVenueAddr" placeholder="如：盐田区大梅沙华大时空中心 X 楼" value="${this.escapeHtml(s.venueAddr || '')}">
      </div>
      <div class="form-group" style="margin-top:12px;">
        <label style="font-size:13px;font-weight:600;display:block;margin-bottom:6px;">排期日期</label>
        <input type="date" class="form-control" id="scheduleDate" value="${s.date || ''}">
      </div>
      <div class="form-group" style="margin-top:12px;">
        <label style="font-size:13px;font-weight:600;display:block;margin-bottom:6px;">快捷时间段（选中后可手动调整为任意时长）</label>
        <select class="form-control" id="scheduleQuick">${slotOptions}</select>
      </div>
      <div style="display:flex;gap:12px;margin-top:12px;">
        <div class="form-group" style="flex:1;margin:0;">
          <label style="font-size:13px;font-weight:600;display:block;margin-bottom:6px;">开始时间</label>
          <input type="time" class="form-control" id="scheduleStart" value="${defStart}">
        </div>
        <div class="form-group" style="flex:1;margin:0;">
          <label style="font-size:13px;font-weight:600;display:block;margin-bottom:6px;">结束时间</label>
          <input type="time" class="form-control" id="scheduleEnd" value="${defEnd}">
        </div>
      </div>
      <div id="scheduleWarn" style="margin-top:10px;"></div>
    `;
    this.showModal('📅 排期 / 分配交付人员', body, [
      { text: '取消', class: 'btn-cancel', action: () => this.hideModal() },
      { text: '确认排期', class: 'btn-confirm', action: () => this.doSchedule(id) },
    ]);

    // 实时冲突检测
    const check = () => this.checkScheduleConflict(id);
    // 选快捷段时回填开始/结束时间
    const quick = document.getElementById('scheduleQuick');
    if (quick) {
      quick.addEventListener('change', () => {
        if (quick.value && quick.value !== 'custom') {
          const [a, b] = quick.value.split('-');
          const st = document.getElementById('scheduleStart');
          const en = document.getElementById('scheduleEnd');
          if (st) st.value = a;
          if (en) en.value = b;
        }
        check();
      });
    }
    document.getElementById('scheduleStaff').addEventListener('change', check);
    document.getElementById('scheduleTeacher').addEventListener('change', check);
    document.getElementById('scheduleVenue').addEventListener('change', check);
    document.getElementById('scheduleDate').addEventListener('change', check);
    document.getElementById('scheduleStart').addEventListener('change', check);
    document.getElementById('scheduleEnd').addEventListener('change', check);
    this.checkScheduleConflict(id);
  },

  checkScheduleConflict(id) {
    const s = this.allSubmissions.find(x => x.id === id);
    const staff = document.getElementById('scheduleStaff').value;
    const date = document.getElementById('scheduleDate').value;
    const start = document.getElementById('scheduleStart').value;
    const end = document.getElementById('scheduleEnd').value;
    const venue = document.getElementById('scheduleVenue').value;
    const warn = document.getElementById('scheduleWarn');
    const slot = (start && end) ? `${start}-${end}` : '';
    if (!staff || !date || !slot) { warn.innerHTML = ''; return; }
    if (timeToMin(end) <= timeToMin(start)) {
      warn.innerHTML = `<div class="warn-box warn-error">⚠️ 结束时间必须晚于开始时间。</div>`;
      return;
    }

    // 同人同日时间重叠冲突
    const conflict = this.allSubmissions.filter(x =>
      x.id !== id && x.status === '已排课' &&
      x.assignedDelivery === staff && x.scheduledDate === date && slotsOverlap(x.scheduledTime, slot)
    );
    // 同人当天已排团数
    const dayCount = this.allSubmissions.filter(x =>
      x.id !== id && x.status === '已排课' &&
      x.assignedDelivery === staff && x.scheduledDate === date
    ).length;
    // 同场地时间重叠冲突（主展厅可错位交付，不参与场地冲突）
    const venueObj = VENUES.find(v => v.id === venue);
    const venueConflict = (venueObj && venueObj.stagger) ? [] : this.allSubmissions.filter(x =>
      x.id !== id && x.status === '已排课' &&
      x.venue === venue && x.scheduledDate === date && slotsOverlap(x.scheduledTime, slot)
    );
    // 容量超限软提示
    let capHtml = '';
    if (venueObj && s.people && Number(s.people) > venueObj.capacity) {
      capHtml = `<div class="warn-box warn-error">⚠️ 容量超限：${this.escapeHtml(getVenueName(venue))} 最大容纳 ${venueObj.capacity} 人，本团报名 ${s.people} 人，请换场地。</div>`;
    }

    let html = capHtml;
    if (conflict.length > 0) {
      html += `<div class="warn-box warn-error">⚠️ 时间冲突：${this.deliveryName(staff)} 在 ${date} ${slot} 已排有「${this.escapeHtml(conflict[0].org)}」，请换时间或人员。</div>`;
    } else if (venueConflict.length > 0) {
      html += `<div class="warn-box warn-error">⚠️ 场地冲突：${this.escapeHtml(getVenueName(venue))} 在 ${date} ${slot} 已被「${this.escapeHtml(venueConflict[0].org)}」占用，请换场地或时段。</div>`;
    } else if (dayCount >= DELIVERY_DAILY_CAPACITY) {
      html += `<div class="warn-box warn-error">🚫 排期已满：${this.deliveryName(staff)} 在 ${date} 当天已排 ${dayCount}/${DELIVERY_DAILY_CAPACITY} 团，无法再承接。</div>`;
    } else if (dayCount > 0) {
      html += `<div class="warn-box warn-info">ℹ️ ${this.deliveryName(staff)} 在 ${date} 当天已排 ${dayCount}/${DELIVERY_DAILY_CAPACITY} 团，可继续安排。</div>`;
    } else {
      html += `<div class="warn-box warn-ok">✓ ${this.deliveryName(staff)} 在 ${date} 当天暂无排期，可安排。</div>`;
    }
    warn.innerHTML = html;
  },

  async doSchedule(id) {
    const s = this.allSubmissions.find(x => x.id === id);
    if (!s) return;
    const staff = document.getElementById('scheduleStaff').value;
    const teacher = document.getElementById('scheduleTeacher').value;
    const venue = document.getElementById('scheduleVenue').value;
    const venueAddr = (document.getElementById('scheduleVenueAddr') || {}).value || '';
    const date = document.getElementById('scheduleDate').value;
    const start = document.getElementById('scheduleStart').value;
    const end = document.getElementById('scheduleEnd').value;
    const slot = (start && end) ? `${start}-${end}` : '';
    if (!staff || !date || !slot || !venue) { this.showToast('请填写完整排期信息', 'error'); return; }
    if (timeToMin(end) <= timeToMin(start)) { this.showToast('结束时间必须晚于开始时间', 'error'); return; }

    // 二次校验（与实时检测一致，按时间段重叠判断）
    const conflict = this.allSubmissions.filter(x =>
      x.id !== id && x.status === '已排课' &&
      x.assignedDelivery === staff && x.scheduledDate === date && slotsOverlap(x.scheduledTime, slot)
    );
    const venueObj = VENUES.find(v => v.id === venue);
    const venueConflict = (venueObj && venueObj.stagger) ? [] : this.allSubmissions.filter(x =>
      x.id !== id && x.status === '已排课' &&
      x.venue === venue && x.scheduledDate === date && slotsOverlap(x.scheduledTime, slot)
    );
    const dayCount = this.allSubmissions.filter(x =>
      x.id !== id && x.status === '已排课' &&
      x.assignedDelivery === staff && x.scheduledDate === date
    ).length;
    if (conflict.length > 0) { this.showToast('时间冲突，无法排期', 'error'); return; }
    if (venueObj && s.people && Number(s.people) > venueObj.capacity) { this.showToast('容量超限：' + getVenueName(venue) + ' 最大 ' + venueObj.capacity + ' 人，本团 ' + s.people + ' 人', 'error'); return; }
    if (venueConflict.length > 0) { this.showToast('场地冲突，该场地时段已被占用', 'error'); return; }
    if (dayCount >= DELIVERY_DAILY_CAPACITY) { this.showToast('该交付人员当天排期已满', 'error'); return; }

    const session = Storage.getSession();
    const history = (s.history || []).concat([{
      action: '排期分配', by: session.username, at: new Date().toISOString(),
      note: `${this.deliveryName(staff)} · ${this.teacherName(teacher)} · ${getVenueName(venue)} · ${date} · ${slot}`,
    }]);
    const ok = await Storage.updateSubmission(id, {
      status: '已排课',
      assigned_delivery: staff,
      assigned_teacher: teacher || '',
      venue,
      venue_addr: venueAddr,
      scheduled_date: date,
      scheduled_time: slot,
      history,
    });
    this.hideModal();
    if (ok) {
      this.showToast('排期成功', 'success');
      this.applyLocalUpdate(id, { status: '已排课', assignedDelivery: staff, assignedTeacher: teacher || '', venue, venueAddr, scheduledDate: date, scheduledTime: slot, history });
    } else {
      this.showToast('排期失败，请重试', 'error');
    }
  },

  teacherName(username) {
    if (!username) return '—';
    const a = this.allAdmins.find(x => x.username === username);
    return a ? (a.displayName || a.username) : username;
  },

  async cancelSchedule(id) {
    const s = this.allSubmissions.find(x => x.id === id);
    if (!s) return;
    const session = Storage.getSession();
    const history = (s.history || []).concat([{ action: '取消排期', by: session.username, at: new Date().toISOString() }]);
    const ok = await Storage.updateSubmission(id, {
      status: '已确认',
      assigned_delivery: null,
      scheduled_date: null,
      scheduled_time: null,
      venue: null,
      assigned_teacher: null,
      history,
    });
    this.hideModal();
    if (ok) {
      this.showToast('已取消排期，退回「已确认」', 'success');
      this.applyLocalUpdate(id, { status: '已确认', assignedDelivery: null, scheduledDate: null, scheduledTime: null, venue: null, assignedTeacher: null, history });
    } else {
      this.showToast('操作失败', 'error');
    }
  },

  // 运营：标记已交付（研学团到访执行完毕）
  async markDelivered(id) {
    const s = this.allSubmissions.find(x => x.id === id);
    if (!s) return;
    const session = Storage.getSession();
    const history = (s.history || []).concat([{ action: '标记已交付', by: session.username, at: new Date().toISOString() }]);
    const ok = await Storage.updateSubmission(id, { status: '已交付', history });
    if (ok) {
      this.showToast('已标记为「已交付」', 'success');
      this.applyLocalUpdate(id, { status: '已交付', history });
    } else {
      this.showToast('操作失败，请重试', 'error');
    }
  },

  // 销售：标记已完成（机构确认报价 / 收款完成）
  async markCompleted(id) {
    const s = this.allSubmissions.find(x => x.id === id);
    if (!s) return;
    const session = Storage.getSession();
    const history = (s.history || []).concat([{ action: '标记已完成', by: session.username, at: new Date().toISOString() }]);
    const ok = await Storage.updateSubmission(id, { status: '已完成', history });
    if (ok) {
      this.showToast('已标记为「已完成」', 'success');
      this.applyLocalUpdate(id, { status: '已完成', history });
    } else {
      this.showToast('操作失败，请重试', 'error');
    }
  },

  // 销售：生成 / 编辑报价单
  openQuote(id) {
    const s = this.allSubmissions.find(x => x.id === id);
    if (!s) return;
    const people = parseInt(s.people) || 0;
    const prev = (s.quoteLines && !Array.isArray(s.quoteLines)) ? s.quoteLines : null;
    const prevLines = (prev && Array.isArray(prev.lines)) ? prev.lines : [];
    const prevMode = (prev && prev.mode === 'order') ? 'order' : (prev && prev.mode === 'line' ? 'line' : null);
    const mode = prevMode || ((prev && typeof prev.orderDiscount === 'number' && prev.orderDiscount > 0) ? 'order' : 'line');
    this._quoteMode = mode;
    this._quoteManualTotal = false;

    const courses = (s.courses || []).map(cid => {
      const c = getCourseById(cid);
      if (!c) return null;
      const eff = (typeof c.price === 'number') ? Math.round(c.price * getCityDiscount(s.city)) : null;
      return { title: c.title, price: eff, isTBD: eff === null };
    }).filter(Boolean);

    const lineDisabled = mode === 'order' ? 'disabled' : '';
    const linePresetCls = mode === 'order' ? ' disc-presets-locked' : '';

    const linesHtml = courses.map((c, i) => {
      const pd = (prevLines[i] && typeof prevLines[i].discount === 'number') ? prevLines[i].discount : 0;
      return `
        <div class="q-line" data-i="${i}" data-price="${c.price == null ? '' : c.price}" data-title="${this.escapeHtml(c.title)}">
          <div class="q-line-main">
            <span class="q-line-name">${this.escapeHtml(c.title)}</span>
            <span class="q-line-meta">${c.isTBD ? '单价待定' : '¥' + c.price + '/人'} · ${people}人</span>
          </div>
          <div class="q-line-disc">
            <div class="disc-presets${linePresetCls}" data-target="lineDisc-${i}">
              <button type="button" class="disc-chip" data-d="0">原价</button>
              <button type="button" class="disc-chip" data-d="10">九折</button>
              <button type="button" class="disc-chip" data-d="15">八五折</button>
              <button type="button" class="disc-chip" data-d="20">八折</button>
              <button type="button" class="disc-chip" data-d="30">七折</button>
            </div>
            <span class="q-disc-wrap"><input type="number" class="form-control q-disc-input" id="lineDisc-${i}" value="${pd}" min="0" max="100" step="1" ${lineDisabled}><span class="q-pct">off %</span></span>
          </div>
          <div class="q-line-sub" id="lineSub-${i}">¥0</div>
        </div>`;
    }).join('') || '<div style="color:var(--text-muted);padding:8px 0;">未选课程</div>';

    // 午餐行（餐费不参与打折，固定原价）
    let lunchHtml = '';
    if (s.lunch) {
      const lp = LUNCH.price;
      lunchHtml = `
        <div class="q-line q-line-lunch" data-i="lunch" data-lunch="1" data-price="${lp}" data-title="午餐服务">
          <div class="q-line-main">
            <span class="q-line-name">${this.escapeHtml(LUNCH.name)} <span class="q-nodisc-tag">餐费不参与打折</span></span>
            <span class="q-line-meta">¥${lp}/人 · ${people}人</span>
          </div>
          <div class="q-line-disc"><span class="q-nodisc-label">不打折</span></div>
          <div class="q-line-sub" id="lineSub-lunch">¥${(lp * people).toLocaleString()}</div>
        </div>`;
    }

    const orderDisabled = mode === 'line' ? 'disabled' : '';
    const orderPresetCls = mode === 'line' ? ' disc-presets-locked' : '';
    const orderD = (prev && typeof prev.orderDiscount === 'number') ? prev.orderDiscount : 0;

    const body = `
      <p style="font-size:13px;color:var(--text-secondary);">为 <strong>${this.escapeHtml(s.org)}</strong> 生成报价单：</p>
      <div class="q-lines" id="quoteLines">${linesHtml}${lunchHtml}</div>
      <div class="q-mode-row">
        <span class="q-mode-label">折扣方式</span>
        <label class="q-mode-opt"><input type="radio" name="qmode" value="order" ${mode === 'order' ? 'checked' : ''}> 按整单折扣</label>
        <label class="q-mode-opt"><input type="radio" name="qmode" value="line" ${mode === 'line' ? 'checked' : ''}> 按单品折扣</label>
        <span class="q-mode-hint" id="qModeHint"></span>
      </div>
      <div class="q-summary">
        <div class="q-sum-row"><span>课程原价合计</span><span id="qBase" style="font-weight:700;">¥0</span></div>
        <div class="q-order-block">
          <span class="q-order-label">整单折扣</span>
          <div class="disc-presets${orderPresetCls}" id="orderPresets" data-target="orderDisc">
            <button type="button" class="disc-chip" data-d="0">原价</button>
            <button type="button" class="disc-chip" data-d="10">九折</button>
            <button type="button" class="disc-chip" data-d="15">八五折</button>
            <button type="button" class="disc-chip" data-d="20">八折</button>
            <button type="button" class="disc-chip" data-d="30">七折</button>
          </div>
          <span class="q-disc-wrap"><input type="number" class="form-control q-disc-input" id="orderDisc" value="${orderD}" min="0" max="100" step="1" ${orderDisabled}><span class="q-pct">off %</span></span>
        </div>
        <div class="q-sum-row q-discount"><span>课程优惠金额</span><span id="qDiscount">¥0</span></div>
        ${s.lunch ? `<div class="q-sum-row q-lunch-row"><span>午餐费用（不参与折扣）</span><span id="qLunch">¥0</span></div>` : ''}
        <div class="q-total-block">
          <label style="font-size:13px;font-weight:600;">报价总额（¥，可手动修改）</label>
          <div class="q-total-input">
            <input type="number" class="form-control" id="quoteAmount" placeholder="如：4800" value="${s.quoteAmount != null ? Number(s.quoteAmount) : ''}">
            <button type="button" class="btn-mini" id="recalcBtn">↺ 按折扣重算</button>
          </div>
        </div>
        <div class="form-group" style="margin-top:10px;">
          <label style="font-size:13px;font-weight:600;display:block;margin-bottom:6px;">备注（如协议价说明、优惠等）</label>
          <textarea class="form-control" id="quoteNote" rows="2" placeholder="如：按机构协议价9折 / 含午餐">${this.escapeHtml(s.quoteNote || '')}</textarea>
        </div>
      </div>
    `;
    this.showModal('📄 生成报价单', body, [
      { text: '取消', class: 'btn-cancel', action: () => this.hideModal() },
      { text: '保存报价单', class: 'btn-confirm', action: () => this.doGenerateQuote(id) },
    ]);

    // 交互绑定
    const recalc = () => this.recalcQuotePreview(id);
    document.querySelectorAll('#modalBox .disc-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const presets = chip.closest('.disc-presets');
        if (!presets || presets.classList.contains('disc-presets-locked')) return;
        const target = presets.getAttribute('data-target');
        const d = chip.getAttribute('data-d');
        const inp = target ? document.getElementById(target) : null;
        if (inp && !inp.disabled) inp.value = d;
        presets.querySelectorAll('.disc-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        // 整单模式下，同步所有单品折扣
        if (this._quoteMode === 'order' && target === 'orderDisc') {
          document.querySelectorAll('#quoteLines .q-line:not(.q-line-lunch) .q-disc-input').forEach(li => { li.value = d; });
          document.querySelectorAll('#quoteLines .q-line:not(.q-line-lunch) .disc-presets').forEach(ps => {
            ps.querySelectorAll('.disc-chip').forEach(c => c.classList.toggle('active', c.getAttribute('data-d') === d));
          });
        }
        recalc();
      });
    });
    document.querySelectorAll('#quoteLines .q-line:not(.q-line-lunch) .q-disc-input').forEach(inp => {
      inp.addEventListener('input', () => {
        const block = inp.closest('.q-line-disc');
        if (block) block.querySelectorAll('.disc-chip').forEach(c => c.classList.remove('active'));
        recalc();
      });
    });
    const odInp = document.getElementById('orderDisc');
    if (odInp) odInp.addEventListener('input', () => {
      if (this._quoteMode === 'order' && !odInp.disabled) {
        const d = parseFloat(odInp.value) || 0;
        document.querySelectorAll('#quoteLines .q-line:not(.q-line-lunch) .q-disc-input').forEach(li => { li.value = d; });
      }
      const block = odInp.closest('.q-order-block');
      if (block) block.querySelectorAll('.disc-chip').forEach(c => c.classList.remove('active'));
      recalc();
    });
    document.querySelectorAll('#modalBox input[name="qmode"]').forEach(r => {
      r.addEventListener('change', () => {
        this._quoteMode = r.value;
        this.applyQuoteMode();
        recalc();
      });
    });
    const qa = document.getElementById('quoteAmount');
    if (qa) qa.addEventListener('input', () => { this._quoteManualTotal = true; });
    const rb = document.getElementById('recalcBtn');
    if (rb) rb.addEventListener('click', () => { this._quoteManualTotal = false; recalc(); });
    this.applyQuoteMode();
    recalc();
    // 根据当前输入值高亮对应的预设按钮
    document.querySelectorAll('#modalBox .disc-presets').forEach(presets => {
      if (presets.classList.contains('disc-presets-locked')) return;
      const inp = document.getElementById(presets.getAttribute('data-target'));
      if (!inp) return;
      presets.querySelectorAll('.disc-chip').forEach(c => {
        c.classList.toggle('active', c.getAttribute('data-d') === inp.value);
      });
    });
  },

  // 切换折扣方式时，锁定/解锁对应输入
  applyQuoteMode() {
    const mode = this._quoteMode;
    const orderInp = document.getElementById('orderDisc');
    const orderPresets = document.getElementById('orderPresets');
    const lineInputs = document.querySelectorAll('#quoteLines .q-line:not(.q-line-lunch) .q-disc-input');
    const linePresets = document.querySelectorAll('#quoteLines .q-line:not(.q-line-lunch) .disc-presets');
    const hint = document.getElementById('qModeHint');
    if (mode === 'order') {
      if (orderInp) orderInp.disabled = false;
      if (orderPresets) orderPresets.classList.remove('disc-presets-locked');
      const d = orderInp ? (parseFloat(orderInp.value) || 0) : 0;
      lineInputs.forEach(inp => { inp.disabled = true; inp.value = d; });
      linePresets.forEach(p => p.classList.add('disc-presets-locked'));
      if (hint) hint.textContent = '（单品折扣已锁定为整单折扣）';
    } else {
      if (orderInp) orderInp.disabled = true;
      if (orderPresets) orderPresets.classList.add('disc-presets-locked');
      lineInputs.forEach(inp => { inp.disabled = false; });
      linePresets.forEach(p => p.classList.remove('disc-presets-locked'));
      if (hint) hint.textContent = '（整单折扣按各单品自动折算）';
    }
  },

  // 实时计算报价预览（两种折扣方式互斥；餐费不参与折扣）
  recalcQuotePreview(id) {
    const s = this.allSubmissions.find(x => x.id === id);
    if (!s) return;
    const people = parseInt(s.people) || 0;
    const mode = this._quoteMode || 'line';
    let courseBase = 0, courseDiscounted = 0, lunchTotal = 0;
    document.querySelectorAll('#quoteLines .q-line').forEach(node => {
      const price = parseFloat(node.dataset.price);
      const isLunch = node.dataset.lunch === '1';
      let disc = 0;
      if (!isLunch) {
        const inp = document.getElementById('lineDisc-' + node.dataset.i);
        disc = inp ? (parseFloat(inp.value) || 0) : 0;
      }
      if (!isNaN(price)) {
        const sub = Math.round(price * people * (1 - disc / 100));
        if (isLunch) lunchTotal += sub;
        else { courseBase += price * people; courseDiscounted += sub; }
        const subEl = document.getElementById('lineSub-' + node.dataset.i);
        if (subEl) subEl.textContent = '¥' + sub.toLocaleString();
      }
    });
    // 整单折扣：单品模式时反算等效折扣（只读显示）
    let orderDisc = parseFloat(document.getElementById('orderDisc').value) || 0;
    if (mode === 'line') {
      orderDisc = courseBase > 0 ? Math.round((1 - courseDiscounted / courseBase) * 100) : 0;
      const odInp = document.getElementById('orderDisc');
      if (odInp && odInp.disabled) odInp.value = orderDisc;
    }
    const finalTotal = courseDiscounted + lunchTotal;
    const discountAmount = Math.max(0, courseBase - courseDiscounted);
    const qb = document.getElementById('qBase'); if (qb) qb.textContent = '¥' + Math.round(courseBase).toLocaleString();
    const qd = document.getElementById('qDiscount'); if (qd) qd.textContent = '¥' + discountAmount.toLocaleString();
    const ql = document.getElementById('qLunch'); if (ql) ql.textContent = '¥' + Math.round(lunchTotal).toLocaleString();
    if (!this._quoteManualTotal) {
      const qa2 = document.getElementById('quoteAmount');
      if (qa2) qa2.value = (courseBase + lunchTotal === 0) ? '' : finalTotal;
    }
  },

  async doGenerateQuote(id) {
    const s = this.allSubmissions.find(x => x.id === id);
    if (!s) return;
    const people = parseInt(s.people) || 0;
    const mode = this._quoteMode || 'line';
    const lines = [];
    let courseBase = 0;
    document.querySelectorAll('#quoteLines .q-line').forEach(node => {
      const i = node.dataset.i;
      const price = parseFloat(node.dataset.price);
      const isLunch = node.dataset.lunch === '1';
      const disc = isLunch ? 0 : (parseFloat(document.getElementById('lineDisc-' + i).value) || 0);
      const title = node.dataset.title;
      const subtotal = isNaN(price) ? null : Math.round(price * people * (1 - disc / 100));
      if (isLunch) {
        lines.push({ title, price: isNaN(price) ? null : price, people, discount: 0, subtotal, isLunch: true });
      } else {
        if (!isNaN(price)) courseBase += price * people;
        lines.push({ title, price: isNaN(price) ? null : price, people, discount: disc, subtotal });
      }
    });
    const lunchTotal = lines.filter(l => l.isLunch).reduce((a, l) => a + (l.subtotal || 0), 0);
    const courseDiscounted = lines.filter(l => !l.isLunch).reduce((a, l) => a + (l.subtotal || 0), 0);
    let orderDiscount;
    if (mode === 'order') orderDiscount = parseFloat(document.getElementById('orderDisc').value) || 0;
    else orderDiscount = courseBase > 0 ? Math.round((1 - courseDiscounted / courseBase) * 100) : 0;
    const finalTotal = courseDiscounted + lunchTotal;
    const discountAmount = Math.max(0, Math.round(courseBase) - courseDiscounted);

    const amountRaw = document.getElementById('quoteAmount').value.trim();
    const amount = amountRaw === '' ? null : (parseFloat(amountRaw) || 0);
    const note = document.getElementById('quoteNote').value.trim();
    const quoteLines = {
      mode,
      lines,
      courseBase: Math.round(courseBase),
      lunchTotal: Math.round(lunchTotal),
      orderDiscount,
      discountAmount: Math.round(discountAmount),
      finalTotal: Math.round(finalTotal),
    };
    const result = await Storage.generateQuote(id, { amount, lines: quoteLines, note });
    this.hideModal();
    if (result.success) {
      this.showToast('报价单已生成，机构可在状态查询页查看', 'success');
      const se = Storage.getSession();
      this.applyLocalUpdate(id, {
        quoteAmount: amount != null ? Number(amount) : null,
        quoteConfirmed: false,
        quoteLines,
        quoteNote: note,
        quoteGeneratedAt: new Date().toISOString(),
        quoteGeneratedBy: se ? se.username : '',
      });
    } else {
      this.showToast(result.message, 'error');
    }
  },

  // 报价折扣明细（用于详情/查询页展示）
  quoteBreakdownHtml(s) {
    const ql = s.quoteLines;
    // 有报价金额但缺明细（如种子数据）：至少展示折后实付
    if (!ql || typeof ql !== 'object' || Array.isArray(ql)) {
      if (s.quoteAmount != null && Number(s.quoteAmount) > 0) {
        return `<div class="quote-breakdown"><span class="qb-final">实付 ¥${Number(s.quoteAmount).toLocaleString()}</span></div>`;
      }
      return '';
    }
    const base = ql.courseBase || 0;
    const disc = ql.discountAmount || 0;
    const lunch = ql.lunchTotal || 0;
    const final = ql.finalTotal || 0;
    if (base <= 0 && lunch <= 0) return '';
    const parts = [];
    if (base > 0) {
      if (disc > 0) {
        parts.push(`<span class="qb-base">课程原价 <s>¥${base.toLocaleString()}</s></span>`);
        parts.push(`<span class="qb-disc">课程优惠 ¥${disc.toLocaleString()}</span>`);
      } else {
        parts.push(`<span class="qb-base">课程 ¥${base.toLocaleString()}</span>`);
      }
    }
    if (lunch > 0) parts.push(`<span class="qb-lunch">午餐 ¥${lunch.toLocaleString()}</span>`);
    parts.push(`<span class="qb-final">实付 ¥${final.toLocaleString()}</span>`);
    return `<div class="quote-breakdown">${parts.join('')}</div>`;
  },

  // ---------- 排期看板 ----------
  renderBoard() {
    if (!this._boardExpanded) this._boardExpanded = {};
    const staff = this.allAdmins.filter(a => a.role === 'delivery');
    const container = document.getElementById('boardContent');
    if (staff.length === 0) {
      container.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-muted);">暂无交付人员，请先在「管理员管理」中添加 role=交付 的账号。</div>`;
      return;
    }

    // 收集已排课
    const scheduled = this.allSubmissions.filter(s => s.status === '已排课' && s.assignedDelivery);
    // 按交付人分组
    const byStaff = {};
    staff.forEach(a => byStaff[a.username] = []);
    scheduled.forEach(s => {
      if (byStaff[s.assignedDelivery]) byStaff[s.assignedDelivery].push(s);
    });

    container.innerHTML = staff.map(a => {
      const list = (byStaff[a.username] || []).slice().sort((x, y) => (x.scheduledDate || '').localeCompare(y.scheduledDate || ''));
      // 按日期分组
      const byDate = {};
      list.forEach(s => { (byDate[s.scheduledDate] = byDate[s.scheduledDate] || []).push(s); });
      const dateKeys = Object.keys(byDate).sort();

      // 每位交付老师默认只展示最近两天（最近的排期日），其余折叠
      const expanded = !!this._boardExpanded[a.username];
      const visibleKeys = expanded ? dateKeys : dateKeys.slice(0, 2);
      const hiddenCount = dateKeys.length - visibleKeys.length;

      const cards = visibleKeys.map(date => {
        const items = byDate[date];
        const conflict = this.detectDateConflict(items);
        const full = items.length >= DELIVERY_DAILY_CAPACITY;
        const tag = conflict ? '<span class="board-tag tag-conflict">⚠️ 时间冲突</span>'
          : (full ? '<span class="board-tag tag-full">🔴 排期已满</span>'
          : `<span class="board-tag tag-ok">🟢 ${items.length}/${DELIVERY_DAILY_CAPACITY}</span>`);
        const rows = items.map(s => `<div class="board-row">
            <span class="board-time">${s.scheduledTime}</span>
            <span class="board-org">${this.escapeHtml(s.org)}（${s.people}人）</span>
            <span class="board-id">#${s.id}</span>
          </div>`).join('');
        return `<div class="board-date-card">
          <div class="board-date-head">${date} ${tag}</div>
          ${rows}
        </div>`;
      }).join('');

      const summary = list.length === 0
        ? '<div style="font-size:13px;color:var(--text-muted);padding:12px;">暂无排期</div>'
        : `<div style="font-size:13px;color:var(--text-muted);padding:0 12px 12px;">共 ${list.length} 个团 · ${dateKeys.length} 天排期${!expanded && hiddenCount > 0 ? `（仅显示最近 2 天，还有 ${hiddenCount} 天）` : ''}</div>`;

      const toggle = (dateKeys.length > 2) ? `<button class="board-toggle" onclick="Admin.toggleBoardStaff('${a.username}')">
        ${expanded ? '收起 ▴' : `查看全部 ${dateKeys.length} 天排期 ▾`}
      </button>` : '';

      return `<div class="board-staff-col">
        <div class="board-staff-head">${this.escapeHtml(a.displayName || a.username)}</div>
        ${summary}
        ${cards || '<div style="font-size:13px;color:var(--text-muted);padding:12px;">暂无排期</div>'}
        ${toggle}
      </div>`;
    }).join('');
  },

  // 展开/收起单个交付老师的全部排期
  toggleBoardStaff(username) {
    if (!this._boardExpanded) this._boardExpanded = {};
    this._boardExpanded[username] = !this._boardExpanded[username];
    this.renderBoard();
  },

  detectDateConflict(items) {
    // 同人同一天，任意两个排期时间段重叠即视为冲突
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        if (slotsOverlap(items[i].scheduledTime, items[j].scheduledTime)) return true;
      }
    }
    return false;
  },

  // ---------- 数据看板（环形图 / 柱状图） ----------
  renderDashboard() {
    const all = this.allSubmissions;
    const container = document.getElementById('analyticsContent');
    if (!container) return;

    const moneyOf = s => (s.quoteAmount != null) ? Number(s.quoteAmount) : (Number(s.total) || 0);

    // 经营 KPI（原价 / 折后 / 优惠 / 成单率）—— 由「数据总览」经营看板整合而来
    let kpiOrigin = 0, kpiFinal = 0;
    all.forEach((s) => {
      const t = Number(s.total) || 0;
      const f = (s.quoteAmount != null) ? Number(s.quoteAmount) : t;
      kpiOrigin += t; kpiFinal += f;
    });
    const kpiDiscount = Math.max(0, kpiOrigin - kpiFinal);
    const kpiDone = all.filter((s) => ['已确认', '已排课', '已交付', '已完成'].includes(s.status || '待审核')).length;
    const kpiRate = all.length ? Math.round((kpiDone / all.length) * 100) : 0;

    // 营收：已拒绝不计
    const revenueSubs = all.filter(s => s.status !== '已拒绝');
    const totalRevenue = revenueSubs.reduce((sum, s) => sum + moneyOf(s), 0);
    const collected = all.filter(s => s.status === '已完成').reduce((sum, s) => sum + moneyOf(s), 0);

    // ---------- 状态分布（可点击柱状图） ----------
    const STATUS_ORDER = ['待审核', '已确认', '已排课', '已交付', '已完成', '已拒绝'];
    const STATUS_COLORS = { '待审核': '#F59E0B', '已确认': '#10B981', '已排课': '#2563EB', '已交付': '#8B5CF6', '已完成': '#14B8A6', '已拒绝': '#EF4444' };
    const statusEntries = STATUS_ORDER.map(st => ({ label: st, value: all.filter(s => (s.status || '待审核') === st).length, color: STATUS_COLORS[st] }));
    const statusBar = this.statusBarChart(statusEntries);

    // ---------- 城市营收占比（环形图） ----------
    const CITY_COLORS = { '深圳': '#2563EB', '武汉': '#10B981', '杭州': '#8B5CF6' };
    const cityMap = {};
    revenueSubs.forEach(s => { const k = s.city || '其他'; cityMap[k] = (cityMap[k] || 0) + moneyOf(s); });
    const cityPalette = ['#2563EB', '#10B981', '#8B5CF6', '#F59E0B', '#EC4899', '#14B8A6'];
    const cityEntries = Object.entries(cityMap)
      .sort((a, b) => b[1] - a[1])
      .map(([city, val], i) => ({ label: city, value: val, color: CITY_COLORS[city] || cityPalette[i % cityPalette.length] }));
    const cityDonut = this.donutChart(cityEntries, { centerNum: '¥' + this.fmtMoneyShort(totalRevenue), centerLabel: '营收总额' });
    const cityLegend = this.donutLegend(cityEntries, true);

    // ---------- 月度营收趋势（竖向柱状图） ----------
    const monthMap = {};
    revenueSubs.forEach(s => {
      const m = (s.scheduledDate || s.date || '').slice(0, 7);
      if (!m) return;
      monthMap[m] = (monthMap[m] || 0) + moneyOf(s);
    });
    const months = Object.keys(monthMap).sort().slice(-6);
    const monthVals = months.map(m => monthMap[m]);
    const monthChart = months.length
      ? this.vBarChart(months, monthVals, { colors: ['#2563EB', '#10B981', '#8B5CF6', '#F59E0B', '#EC4899', '#14B8A6'] })
      : '<div class="analytics-empty">暂无排期/日期数据</div>';

    // ---------- 热门课程 Top5（横向柱状图） ----------
    const courseCount = {};
    all.forEach(s => (s.courses || []).forEach(cid => { courseCount[cid] = (courseCount[cid] || 0) + 1; }));
    const topCourses = Object.entries(courseCount)
      .map(([cid, cnt]) => ({ course: getCourseById(Number(cid)), cnt }))
      .filter(x => x.course)
      .sort((a, b) => b.cnt - a.cnt)
      .slice(0, 5);
    const maxCnt = topCourses.length ? topCourses[0].cnt : 1;
    const courseBars = topCourses.length ? topCourses.map(x => `
      <div class="hbar-item">
        <div class="hbar-label">No.${x.course.no} ${this.escapeHtml(x.course.title)}</div>
        <div class="hbar-track"><div class="hbar-fill" style="width:${Math.round(x.cnt / maxCnt * 100)}%;"></div></div>
        <div class="hbar-val">${x.cnt} 团</div>
      </div>`).join('')
      : '<div class="analytics-empty">暂无数据</div>';

    // ---------- 机构贡献排行 Top5（横向柱状图） ----------
    const orgMap = {};
    revenueSubs.forEach(s => { const k = s.org || '未知机构'; orgMap[k] = (orgMap[k] || 0) + moneyOf(s); });
    const topOrgs = Object.entries(orgMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const maxOrg = topOrgs.length ? topOrgs[0][1] : 1;
    const orgBars = topOrgs.length ? topOrgs.map(([org, val]) => `
      <div class="hbar-item">
        <div class="hbar-label">${this.escapeHtml(org)}</div>
        <div class="hbar-track"><div class="hbar-fill green" style="width:${Math.round(val / maxOrg * 100)}%;"></div></div>
        <div class="hbar-val">¥${this.fmtMoneyShort(val)}</div>
      </div>`).join('')
      : '<div class="analytics-empty">暂无数据</div>';

    container.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon" style="background:var(--purple-light);">💰</div>
          <div class="stat-value">¥${this.fmtMoney(totalRevenue)}</div>
          <div class="stat-label">预计营收总额</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background:var(--green-light);">✅</div>
          <div class="stat-value">¥${this.fmtMoney(collected)}</div>
          <div class="stat-label">已回款（已完成）</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background:var(--primary-light);">📋</div>
          <div class="stat-value">${all.length}</div>
          <div class="stat-label">总报名数</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background:rgba(245,158,11,0.15);">⭐</div>
          <div class="stat-value">${this.avgSatisfaction(all)}</div>
          <div class="stat-label">平均满意度</div>
        </div>
      </div>

      <div class="kpi-row">
        <div class="kpi-card"><div class="kpi-val">¥${this.fmtMoney(kpiOrigin)}</div><div class="kpi-label">原价总额</div></div>
        <div class="kpi-card"><div class="kpi-val">¥${this.fmtMoney(kpiFinal)}</div><div class="kpi-label">折后实收</div></div>
        <div class="kpi-card"><div class="kpi-val">¥${this.fmtMoney(kpiDiscount)}</div><div class="kpi-label">累计优惠</div></div>
        <div class="kpi-card"><div class="kpi-val">${kpiRate}%</div><div class="kpi-label">成单率</div></div>
      </div>

      <div class="dash-grid">
        <div class="dash-card">
          <div class="dash-title"><span class="dt-ico">📊</span>报名状态分布<span class="dash-title-tag">点击柱状跳转</span></div>
          ${statusBar}
        </div>
        <div class="dash-card">
          <div class="dash-title"><span class="dt-ico" style="background:var(--green-light);">🏙️</span>城市营收占比</div>
          <div class="donut-wrap">${cityDonut}${cityLegend}</div>
        </div>

        <div class="dash-card span-2">
          <div class="dash-title"><span class="dt-ico" style="background:var(--purple-light);">📈</span>月度营收趋势（近 6 月）</div>
          ${monthChart}
        </div>

        <div class="dash-card">
          <div class="dash-title"><span class="dt-ico" style="background:var(--orange-light,#FEF3C7);">🔥</span>热门课程 Top 5</div>
          <div class="hbar-row">${courseBars}</div>
        </div>
        <div class="dash-card">
          <div class="dash-title"><span class="dt-ico" style="background:var(--green-light);">🏆</span>机构贡献排行 Top 5</div>
          <div class="hbar-row">${orgBars}</div>
        </div>
      </div>
    `;
  },

  // 环形图（SVG）
  donutChart(entries, opts = {}) {
    const size = opts.size || 184;
    const stroke = opts.stroke || 26;
    const r = size / 2 - stroke / 2 - 2;
    const cx = size / 2, cy = size / 2;
    const C = 2 * Math.PI * r;
    const total = entries.reduce((s, e) => s + (e.value || 0), 0);
    if (total === 0) {
      return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" class="donut-svg">
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--border)" stroke-width="${stroke}"/>
        <text x="${cx}" y="${cy + 5}" text-anchor="middle" class="donut-empty">暂无数据</text>
      </svg>`;
    }
    let acc = 0;
    const segs = entries.map(e => {
      const frac = (e.value || 0) / total;
      const dash = frac * C;
      const seg = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${e.color}" stroke-width="${stroke}" stroke-dasharray="${dash.toFixed(2)} ${(C - dash).toFixed(2)}" stroke-dashoffset="${(-acc).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"><title>${this.escapeHtml(e.label)}：${e.value}</title></circle>`;
      acc += dash;
      return seg;
    }).join('');
    const cNum = opts.centerNum != null ? opts.centerNum : total;
    const cLabel = opts.centerLabel || '';
    return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" class="donut-svg">
      ${segs}
      <text x="${cx}" y="${cy - 2}" text-anchor="middle" class="donut-cnum">${cNum}</text>
      <text x="${cx}" y="${cy + 16}" text-anchor="middle" class="donut-clabel">${cLabel}</text>
    </svg>`;
  },

  // 环形图图例
  donutLegend(entries, money = false) {
    return `<div class="donut-legend">` + entries.map(e => `
      <div class="legend-item">
        <span class="legend-dot" style="background:${e.color}"></span>
        <span class="legend-label">${this.escapeHtml(e.label)}</span>
        <span class="legend-val">${money ? '¥' + this.fmtMoneyShort(e.value) : e.value}</span>
      </div>`).join('') + `</div>`;
  },

  // 竖向柱状图（SVG）
  vBarChart(cats, vals, opts = {}) {
    const w = opts.width || 600, h = opts.height || 260;
    const padL = 56, padR = 16, padT = 20, padB = 42;
    const plotW = w - padL - padR, plotH = h - padT - padB;
    const maxRaw = Math.max(...vals, 1);
    const ticks = 4;
    const step = this.niceStep(maxRaw / ticks);
    const max = step * ticks;
    const gap = plotW / cats.length;
    const bw = Math.min(54, gap * 0.55);
    let grid = '';
    for (let i = 0; i <= ticks; i++) {
      const y = padT + plotH - (i * step / max) * plotH;
      const v = i * step;
      grid += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${w - padR}" y2="${y.toFixed(1)}" class="vbar-grid"/>`;
      grid += `<text x="${padL - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end" class="vbar-axis">${this.fmtMoneyShort(v)}</text>`;
    }
    const bars = cats.map((c, i) => {
      const v = vals[i] || 0;
      const bh = max ? (v / max) * plotH : 0;
      const x = padL + gap * i + (gap - bw) / 2;
      const y = padT + plotH - bh;
      const color = opts.colors ? opts.colors[i % opts.colors.length] : 'var(--primary)';
      const label = c.length > 7 ? c.slice(0, 7) : c;
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="5" fill="${color}" class="vbar-rect"><title>${this.escapeHtml(c)}：${this.fmtMoney(v)}</title></rect>`
        + (v ? `<text x="${(x + bw / 2).toFixed(1)}" y="${(y - 6).toFixed(1)}" text-anchor="middle" class="vbar-val">${this.fmtMoneyShort(v)}</text>` : '')
        + `<text x="${(x + bw / 2).toFixed(1)}" y="${(padT + plotH + 18).toFixed(1)}" text-anchor="middle" class="vbar-xlabel">${this.escapeHtml(label)}</text>`;
    }).join('');
    return `<svg viewBox="0 0 ${w} ${h}" width="100%" class="vbar-svg" preserveAspectRatio="xMidYMid meet">${grid}${bars}</svg>`;
  },

  // 状态分布柱状图（竖向、可点击跳转）
  statusBarChart(entries) {
    const w = 600, h = 300;
    const padL = 44, padR = 16, padT = 26, padB = 56;
    const plotW = w - padL - padR, plotH = h - padT - padB;
    const maxRaw = Math.max(...entries.map(e => e.value), 1);
    const ticks = 4;
    const step = this.niceStep(maxRaw / ticks);
    const max = step * ticks;
    const gap = plotW / entries.length;
    const bw = Math.min(58, gap * 0.52);
    let grid = '';
    for (let i = 0; i <= ticks; i++) {
      const y = padT + plotH - (i * step / max) * plotH;
      const v = i * step;
      grid += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${w - padR}" y2="${y.toFixed(1)}" class="vbar-grid"/>`;
      grid += `<text x="${padL - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end" class="vbar-axis">${v}</text>`;
    }
    const bars = entries.map((e, i) => {
      const v = e.value || 0;
      const bh = max ? (v / max) * plotH : 0;
      const x = padL + gap * i + (gap - bw) / 2;
      const y = padT + plotH - bh;
      const label = e.label;
      return `
        <g class="status-bar-g" onclick="Admin.gotoStatus('${this.escapeHtml(e.label)}')" tabindex="0" role="button" aria-label="${this.escapeHtml(e.label)}：${v} 条，点击查看">
          <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="7" fill="${e.color}" class="status-bar-rect"/>
          ${v ? `<text x="${(x + bw / 2).toFixed(1)}" y="${(y - 9).toFixed(1)}" text-anchor="middle" class="status-bar-val">${v}</text>` : ''}
          <text x="${(x + bw / 2).toFixed(1)}" y="${(padT + plotH + 24).toFixed(1)}" text-anchor="middle" class="status-bar-xlabel" fill="${e.color}">${this.escapeHtml(label)}</text>
        </g>`;
    }).join('');
    const total = entries.reduce((s, e) => s + (e.value || 0), 0);
    return `<svg viewBox="0 0 ${w} ${h}" width="100%" class="status-bar-svg" preserveAspectRatio="xMidYMid meet">${grid}${bars}</svg>
      <div class="chart-hint">共 ${total} 条报名 · 点击任一柱状跳转到对应状态的「数据总览」</div>`;
  },

  // 金额格式化
  fmtMoney(v) { return Number(v || 0).toLocaleString('zh-CN'); },
  fmtMoneyShort(v) {
    const n = Number(v || 0);
    if (n >= 10000) {
      const w = n / 10000;
      return (w % 1 === 0 ? w.toFixed(0) : w.toFixed(1)) + '万';
    }
    return n.toLocaleString('zh-CN');
  },
  niceStep(x) {
    if (x <= 0) return 1;
    const exp = Math.floor(Math.log10(x));
    const base = Math.pow(10, exp);
    const f = x / base;
    let nf;
    if (f <= 1) nf = 1; else if (f <= 2) nf = 2; else if (f <= 2.5) nf = 2.5; else if (f <= 5) nf = 5; else nf = 10;
    return nf * base;
  },

  avgSatisfaction(list) {
    const rated = list.filter(s => s.satisfactionRating);
    if (rated.length === 0) return '—';
    const avg = rated.reduce((sum, s) => sum + Number(s.satisfactionRating), 0) / rated.length;
    return avg.toFixed(1) + ' ★';
  },

  // ---------- 排期日历（月视图） ----------
  renderCalendar() {
    const container = document.getElementById('calendarContent');
    if (!container) return;
    // 记录当前查看的年月（默认本月）
    if (this._calY === undefined) { const n = new Date(); this._calY = n.getFullYear(); this._calM = n.getMonth(); }
    const year = this._calY, month = this._calM;
    const firstDay = new Date(year, month, 1).getDay(); // 0=周日
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const monthLabel = `${year}年${month + 1}月`;

    // 交付人员配色（按姓名稳定分配）
    const scheduled = this.allSubmissions.filter(s => s.status === '已排课' && s.scheduledDate);
    const staffs = [...new Set(scheduled.map(s => s.assignedDelivery).filter(Boolean))];
    const palette = ['#2563EB', '#16A34A', '#EA580C', '#9333EA', '#0891B2', '#DB2777', '#CA8A04', '#DC2626', '#475569', '#0D9488'];
    const staffColor = {};
    staffs.forEach((st, i) => { staffColor[st] = palette[i % palette.length]; });

    const byDate = {};
    scheduled.forEach(s => { (byDate[s.scheduledDate] = byDate[s.scheduledDate] || []).push(s); });

    let cells = '';
    const weekNames = ['日', '一', '二', '三', '四', '五', '六'];
    cells += weekNames.map(w => `<div class="cal-weekday">${w}</div>`).join('');
    for (let i = 0; i < firstDay; i++) cells += `<div class="cal-cell cal-empty"></div>`;
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const items = (byDate[dateStr] || []).slice().sort((a, b) => (a.scheduledTime || '').localeCompare(b.scheduledTime || ''));
      const isToday = dateStr === todayStr;
      const tags = items.map(s => {
        const hallBadge = s.venue === 'venue_hall' ? `<span class="cal-hall">主展厅·可错位</span>` : '';
        const col = staffColor[s.assignedDelivery] || '#64748B';
        return `<div class="cal-event" style="--ec:${col};" title="${this.escapeHtml(s.org)} ｜ ${this.deliveryName(s.assignedDelivery)}">
          <span class="cal-time">${(s.scheduledTime || '').slice(0, 5)}</span>
          <span class="cal-org">${this.escapeHtml(s.org)}</span>
          <span class="cal-staff" style="color:${col}">● ${this.deliveryName(s.assignedDelivery)}</span>
          ${hallBadge}
        </div>`;
      }).join('');
      cells += `<div class="cal-cell ${items.length ? 'cal-has' : ''} ${isToday ? 'cal-today' : ''}">
        <div class="cal-date">${d}${isToday ? '<span class="cal-today-dot">今天</span>' : ''}</div>
        <div class="cal-events">${tags}</div>
      </div>`;
    }

    // 图例
    const legend = staffs.map(st => `<span class="cal-lg"><span class="cal-lg-dot" style="background:${staffColor[st]}"></span>${this.deliveryName(st)}</span>`).join('')
      + `<span class="cal-lg"><span class="cal-lg-badge">主展厅·可错位</span>可并行交付</span>`;

    container.innerHTML = `
      <div class="calendar-head">
        <div class="cal-nav">
          <button class="cal-btn" onclick="Admin.calMove(-1)" title="上一月">‹</button>
          <span class="cal-month">${monthLabel}</span>
          <button class="cal-btn" onclick="Admin.calMove(1)" title="下一月">›</button>
          <button class="cal-today-btn" onclick="Admin.calToday()">今天</button>
        </div>
        <div class="cal-legend">${legend}</div>
      </div>
      <div class="calendar-grid">${cells}</div>
      <div class="cal-foot">共 ${scheduled.length} 个已排课团 · 主展厅可错位并行交付（不判定场地冲突）· 冲突/满载以排期看板为准</div>
    `;
  },

  calMove(delta) {
    let m = this._calM + delta, y = this._calY;
    if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; }
    this._calM = m; this._calY = y;
    this.renderCalendar();
  },

  calToday() {
    const n = new Date();
    this._calY = n.getFullYear(); this._calM = n.getMonth();
    this.renderCalendar();
  },

  // ---------- 讲师端 ----------
  renderTeacherPortal() {
    const container = document.getElementById('teacherContent');
    if (!container) return;
    const session = Storage.getSession();
    const mine = this.allSubmissions.filter(s => s.assignedTeacher === session.username && (s.status === '已排课' || s.status === '已交付'));
    if (mine.length === 0) {
      container.innerHTML = `<div class="analytics-empty">暂无分配给您的排课。运营排课时选择您为授课讲师后，这里会显示您的课程安排。</div>`;
      return;
    }
    container.innerHTML = mine.slice().sort((a, b) => (a.scheduledDate || '').localeCompare(b.scheduledDate || '')).map(s => {
      const canCheckin = s.status === '已排课' || s.status === '已交付';
      return `
        <div class="teacher-card">
          <div class="teacher-card-head">
            <div>
              <div class="teacher-org">${this.escapeHtml(s.org)}</div>
              <div class="teacher-meta">${s.scheduledDate} ${s.scheduledTime} ｜ ${s.people}人 ｜ ${this.escapeHtml(getVenueName(s.venue))}</div>
            </div>
            ${this.statusBadge(s.status)}
          </div>
          <div class="teacher-courses">${(s.courseNames || []).join('、') || '—'}</div>
          ${canCheckin ? `
          <div class="teacher-actions">
            <div class="form-group" style="margin:0;flex:1;">
              <label style="font-size:12px;color:var(--text-muted);">实到人数</label>
              <input type="number" class="form-control" id="checkin-${s.id}" value="${s.actualPeople || ''}" placeholder="报名${s.people}人" style="max-width:140px;">
            </div>
            <button class="btn-modal btn-confirm" onclick="Admin.saveCheckin('${s.id}')">签到</button>
          </div>
          <div class="form-group" style="margin-top:10px;">
            <label style="font-size:12px;color:var(--text-muted);">执行小结</label>
            <textarea class="form-control" id="exec-${s.id}" rows="2" placeholder="课堂执行情况、学生表现等">${this.escapeHtml(s.execNote || '')}</textarea>
          </div>
          <button class="btn-modal btn-schedule" style="margin-top:8px;" onclick="Admin.saveExecNote('${s.id}')">保存执行小结</button>
          ` : ''}
          ${s.satisfactionRating ? `<div class="teacher-sat">机构满意度：${'★'.repeat(s.satisfactionRating)} (${s.satisfactionRating}星) ${s.satisfactionComment ? '— ' + this.escapeHtml(s.satisfactionComment) : ''}</div>` : ''}
        </div>`;
    }).join('');
  },

  async saveCheckin(id) {
    const val = document.getElementById('checkin-' + id).value.trim();
    const s = this.allSubmissions.find(x => x.id === id);
    if (s && val && parseInt(val) > s.people) {
      this.showToast('实到人数超过报名人数，请核对', 'error');
      return;
    }
    const ok = await Storage.saveCheckin(id, val);
    if (ok) {
      this.showToast('签到已保存', 'success');
      this.applyLocalUpdate(id, { actualPeople: parseInt(val) || 0 });
    } else {
      this.showToast('保存失败', 'error');
    }
  },

  async saveExecNote(id) {
    const val = document.getElementById('exec-' + id).value.trim();
    const ok = await Storage.saveExecNote(id, val);
    if (ok) {
      this.showToast('执行小结已保存', 'success');
      this.applyLocalUpdate(id, { execNote: val });
    } else {
      this.showToast('保存失败', 'error');
    }
  },

  // ---------- 删除 ----------
  confirmDelete(id) {
    const s = this.allSubmissions.find(sub => sub.id === id);
    if (!s) return;
    const body = `
      <p>确定要删除以下报名记录吗？此操作不可撤销。</p>
      <div style="margin-top:12px;padding:12px;background:var(--bg-hover);border-radius:8px;font-size:13px;">
        <div><strong>编号：</strong>${s.id}</div>
        <div><strong>机构：</strong>${this.escapeHtml(s.org)}</div>
        ${this.isSales() ? `<div><strong>联系人：</strong>${this.escapeHtml(s.name)}</div>` : ''}
        <div><strong>日期：</strong>${this.formatDateShort(s.date)}</div>
      </div>
    `;
    this.showModal('⚠️ 确认删除', body, [
      { text: '取消', class: 'btn-cancel', action: () => this.hideModal() },
      { text: '确认删除', class: 'btn-danger', action: async () => {
        const ok = await Storage.deleteSubmission(id);
        this.hideModal();
        if (ok) {
          this.showToast('删除成功', 'success');
          this.removeLocalSubmission(id);
        } else {
          this.showToast('删除失败，请重试', 'error');
        }
      }},
    ]);
  },

  // ---------- 导出 ----------
  exportCSV() {
    const submissions = this.getFilteredSubmissions();
    if (submissions.length === 0) {
      this.showToast('暂无数据可导出', 'error');
      return;
    }
    const isSales = this.isSales();
    // 构建 导师手机号 → 姓名 映射，导出时把导师字段显示为姓名而非手机号
    const teacherMap = {};
    (this.allAdmins || []).forEach((a) => {
      if (a.username) teacherMap[a.username] = a.displayName || a.username;
    });
    const csv = Storage.exportCSV(submissions, isSales, teacherMap);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `报名数据_${todayLocal()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    this.showToast(`已导出 ${submissions.length} 条数据`, 'success');
  },

  // ---------- 管理员管理 ----------
  async renderAdmins() {
    const admins = await Storage.getAdmins();
    this.allAdmins = admins;
    const tbody = document.getElementById('adminTableBody');
    document.getElementById('adminCount').textContent = admins.length;

    const canManage = this.can('manageAdmins');
    const canEditRole = canManage;

    if (admins.length === 0) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="4">暂无管理员</td></tr>`;
      return;
    }

    tbody.innerHTML = admins.map(a => {
      const isCurrent = a.username === Storage.getSession()?.username;
      const roleOptions = ['dev', 'ops', 'delivery', 'teacher', 'sales'].map(r =>
        `<option value="${r}" ${a.role === r ? 'selected' : ''}>${ROLE_LABELS[r]}</option>`).join('');
      const roleCell = canEditRole
        ? `<select class="role-select" onchange="Admin.changeRole('${a.username}', this.value)">${roleOptions}</select>`
        : `<span class="role-pill role-${a.role}">${ROLE_LABELS[a.role] || a.role}</span>`;
      const delCell = (canManage && admins.length > 1)
        ? `<button class="action-btn delete" onclick="Admin.confirmDeleteAdmin('${a.username}')">删除</button>`
        : (isCurrent ? '<span style="font-size:12px;color:var(--text-muted);">（当前）</span>' : '<span style="font-size:12px;color:var(--text-muted);">—</span>');
      return `
        <tr>
          <td style="font-weight:600;">
            ${this.escapeHtml(a.displayName || a.username)}
            ${isCurrent ? '<span style="font-size:12px;color:var(--green);margin-left:8px;">（当前）</span>' : ''}
          </td>
          <td style="font-family:monospace;color:var(--text-secondary);">${this.escapeHtml(a.username)}</td>
          <td>${roleCell}</td>
          <td>${delCell}</td>
        </tr>
      `;
    }).join('');
  },

  async changeRole(username, role) {
    const result = await Storage.updateAdmin(username, { role });
    if (result.success) {
      this.showToast(`已更新 ${username} 的角色为 ${ROLE_LABELS[role]}`, 'success');
      await this.renderAdmins();
      // 若改的是自己，刷新侧边栏
      if (username === Storage.getSession()?.username) {
        const session = Storage.getSession();
        session.role = role;
        localStorage.setItem('bgi_admin_session', JSON.stringify(session));
        this.showAdmin();
      }
    } else {
      this.showToast(result.message, 'error');
    }
  },

  showAddAdminModal() {
    const roleOptions = ['sales', 'ops', 'delivery', 'teacher', 'dev'].map(r =>
      `<option value="${r}">${ROLE_LABELS[r]}</option>`).join('');
    const body = `
      <div class="form-group" style="margin-bottom:12px;">
        <label style="font-size:13px;font-weight:600;color:var(--text-secondary);margin-bottom:6px;display:block;">登录手机号 <span style="color:var(--red);">*</span></label>
        <input type="tel" class="form-control" id="newAdminPhone" placeholder="11位手机号，作为登录账号" maxlength="11">
      </div>
      <div class="form-group" style="margin-bottom:12px;">
        <label style="font-size:13px;font-weight:600;color:var(--text-secondary);margin-bottom:6px;display:block;">姓名 <span style="color:var(--red);">*</span></label>
        <input type="text" class="form-control" id="newAdminName" placeholder="如：张三">
      </div>
      <div class="form-group" style="margin-bottom:12px;">
        <label style="font-size:13px;font-weight:600;color:var(--text-secondary);margin-bottom:6px;display:block;">角色</label>
        <select class="form-control" id="newAdminRole">${roleOptions}</select>
      </div>
      <div class="form-group" style="margin-bottom:12px;">
        <label style="font-size:13px;font-weight:600;color:var(--text-secondary);margin-bottom:6px;display:block;">初始密码 <span style="color:var(--red);">*</span></label>
        <input type="text" class="form-control" id="newAdminPassword" placeholder="至少 6 位，创建后请提醒对方及时修改" value="a123456">
      </div>
      <div style="font-size:12px;color:var(--text-muted);background:var(--bg-hover);padding:10px 12px;border-radius:8px;">
        提交后云端会自动创建该管理员的登录账号（手机号@huada-edu.cn，已自动确认），无需再去 Supabase 网站。
      </div>
    `;
    this.showModal('添加管理员', body, [
      { text: '取消', class: 'btn-cancel', action: () => this.hideModal() },
      { text: '添加', class: 'btn-confirm', action: () => this.addAdmin() },
    ]);
  },

  async addAdmin() {
    const phone = document.getElementById('newAdminPhone').value.trim();
    const name = document.getElementById('newAdminName').value.trim();
    const role = document.getElementById('newAdminRole').value;
    const password = document.getElementById('newAdminPassword').value.trim();

    if (!/^1\d{10}$/.test(phone)) { this.showToast('请输入正确的11位手机号', 'error'); return; }
    if (!name) { this.showToast('请输入姓名', 'error'); return; }
    if (password.length < 6) { this.showToast('初始密码至少 6 位', 'error'); return; }

    const result = await Storage.addAdmin(phone, name, role, password);
    if (result.success) {
      this.hideModal();
      const tip = result.legacy ? '（已写入记录；若云端账号未自动建好，请到 Supabase 网站补建 Auth 账号）' : '';
      this.showToast('管理员添加成功' + tip, 'success');
      this.renderAdmins();
    } else {
      this.showToast(result.message, 'error');
    }
  },

  // ---------- 修改登录手机号（用户名） ----------
  showChangeUsernameModal() {
    const session = Storage.getSession();
    const body = `
      <p>修改当前账号的登录手机号（即登录账号）：</p>
      <div class="form-group" style="margin-top:12px;">
        <label style="font-size:13px;font-weight:600;color:var(--text-secondary);margin-bottom:6px;display:block;">当前手机号</label>
        <input type="text" class="form-control" id="changeUserOld" value="${session.username}" readonly>
      </div>
      <div class="form-group" style="margin-top:12px;">
        <label style="font-size:13px;font-weight:600;color:var(--text-secondary);margin-bottom:6px;display:block;">新手机号</label>
        <input type="tel" class="form-control" id="changeUserNew" placeholder="11位新手机号" maxlength="11">
      </div>
    `;
    this.showModal('修改登录手机号', body, [
      { text: '取消', class: 'btn-cancel', action: () => this.hideModal() },
      { text: '确认修改', class: 'btn-confirm', action: () => this.changeUsername() },
    ]);
  },

  async changeUsername() {
    const session = Storage.getSession();
    const newPhone = document.getElementById('changeUserNew').value.trim();
    if (!/^1\d{10}$/.test(newPhone)) { this.showToast('请输入正确的11位手机号', 'error'); return; }
    if (newPhone === session.username) { this.showToast('新手机号与当前一致', 'error'); return; }

    const result = await Storage.updateUsername(session.username, newPhone);
    if (result.success) {
      Storage.setSessionUsername(newPhone);
      document.getElementById('changePwdUsername').value = newPhone;
      this.hideModal();
      this.showToast('登录手机号已修改，请使用新手机号登录', 'success');
      this.showAdmin();
    } else {
      this.showToast(result.message, 'error');
    }
  },

  confirmDeleteAdmin(username) {
    const body = `<p>确定要删除管理员 <strong>${username}</strong> 吗？</p>`;
    this.showModal('⚠️ 确认删除管理员', body, [
      { text: '取消', class: 'btn-cancel', action: () => this.hideModal() },
      { text: '确认删除', class: 'btn-danger', action: async () => {
        const result = await Storage.deleteAdmin(username);
        if (result.success) {
          this.hideModal();
          this.showToast('管理员已删除', 'success');
          this.renderAdmins();
        } else {
          this.showToast(result.message, 'error');
        }
      }},
    ]);
  },

  async changePassword() {
    const username = document.getElementById('changePwdUsername').value;
    const oldPwd = document.getElementById('changePwdOld').value;
    const newPwd = document.getElementById('changePwdNew').value;

    if (!oldPwd || !newPwd) { this.showToast('请填写完整', 'error'); return; }
    if (newPwd.length < 6) { this.showToast('新密码长度至少6位', 'error'); return; }

    const result = await Storage.updatePassword(username, oldPwd, newPwd);
    if (result.success) {
      this.showToast('密码修改成功', 'success');
      document.getElementById('changePwdOld').value = '';
      document.getElementById('changePwdNew').value = '';
    } else {
      this.showToast(result.message, 'error');
    }
  },

  // ---------- 通用工具 ----------
  showModal(title, bodyHTML, actions, sizeClass) {
    const overlay = document.getElementById('modalOverlay');
    const box = document.getElementById('modalBox');
    box.className = 'modal' + (sizeClass ? ' ' + sizeClass : '');
    let html = '';
    if (title) html += `<h3>${title}</h3>`;
    html += `<div class="modal-body">${bodyHTML}</div>`;
    html += '<div class="modal-actions">';
    actions.forEach((a, i) => {
      html += `<button class="btn-modal ${a.class}" data-action="${i}">${a.text}</button>`;
    });
    html += '</div>';
    box.innerHTML = html;
    actions.forEach((a, i) => {
      const btn = box.querySelector(`[data-action="${i}"]`);
      if (btn) btn.onclick = a.action;
    });
    overlay.classList.add('show');
  },

  hideModal() {
    document.getElementById('modalOverlay').classList.remove('show');
  },

  showToast(message, type = '') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast show ' + type;
    setTimeout(() => { toast.className = 'toast ' + type; }, 3000);
  },

  formatDate(isoStr) {
    if (!isoStr) return '—';
    const d = new Date(isoStr);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  },

  // 日期短格式（不显示年份），用于数据总览表格
  formatDateShort(dateStr) {
    if (!dateStr) return '—';
    // 已经是 YYYY-MM-DD 格式的日期字符串
    const m = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return `${m[2]}-${m[3]}`;
    // 尝试解析其他格式
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr || '—';
    return `${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  },

  escapeHtml(str) {
    // 统一收敛到 common.js 的 htmlEscape（全局唯一转义实现）
    if (typeof htmlEscape === 'function') return htmlEscape(str);
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },
};

// ESC 关闭模态框
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') Admin.hideModal();
});
document.getElementById('modalOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'modalOverlay') Admin.hideModal();
});

// 初始化
document.addEventListener('DOMContentLoaded', () => Admin.init());
