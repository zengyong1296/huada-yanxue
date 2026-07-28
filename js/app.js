/**
 * 华大教育研学管理系统
 * 主应用逻辑
 */

// 报名状态标签（与后台共用 STATUS_META，避免两份定义漂移）
const STATUS_LABELS = Object.assign({}, STATUS_META, {
  '待确认': STATUS_META['待审核'],
  '已排期': STATUS_META['已排课'],
});

const App = {
  // 应用状态
  state: {
    city: '深圳',
    selectedCourses: [],  // 课程ID数组（按选择顺序）
    lunch: false,
    activeSeries: 'all',  // 当前选中的大类（'all' = 全部）
    queryResults: [],     // 自助端查询到的全部团
    selfQuery: null,      // 当前查询的 {org, phone}
    activeGroupId: null,  // 当前下钻进入的单团 id（null=总览）
  },

  // 时间段定义
  TIME_SLOTS: [
    { start: '09:00', end: '10:30' },
    { start: '10:30', end: '12:00' },
    { start: '13:30', end: '15:00' },
    { start: '15:00', end: '16:30' },
    { start: '16:30', end: '18:00' },
  ],
  LUNCH_SLOT: { start: '11:30', end: '13:30' },

  init() {
    this._admins = [];
    this.renderCityTabs();
    this.selectCity('深圳');
    this.bindEvents();
    // 预加载管理员信息（用于机构查询页显示讲师姓名）
    this._loadAdmins();
    // 参访日期不允许选过去（避免误填历史日期）
    const di = document.getElementById('dateInput');
    if (di) di.min = todayLocal();
    // 自助服务路由（URL 带 org/phone/#self 时自动进入）
    this.initSelfRoute();
  },

  async _loadAdmins() {
    try {
      this._admins = await Storage.getAdmins();
    } catch (e) { /* 非关键，静默跳过 */ }
  },

  teacherName(username) {
    if (!username) return '—';
    const a = this._admins.find(x => x.username === username);
    return a ? (a.displayName || a.username) : username;
  },

  bindEvents() {
    // 点击模态框外部关闭
    document.getElementById('modalOverlay').addEventListener('click', (e) => {
      if (e.target.id === 'modalOverlay') this.hideModal();
    });
    // ESC 关闭
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.hideModal();
    });
  },

  // ---------- 城市选择 ----------
  renderCityTabs() {
    const container = document.getElementById('cityTabs');
    container.innerHTML = '';
    Object.entries(CITIES).forEach(([city, config]) => {
      const courses = getCoursesForCity(city);
      const discount = getCityDiscount(city);
      const hint = courses.length === COURSES.length
        ? '全部课程'
        : `${courses.length}门课程${discount < 1 ? ' · ' + Math.round(discount * 10) + '折' : ''}`;
      const btn = document.createElement('button');
      btn.className = 'city-tab' + (city === this.state.city ? ' active' : '');
      btn.innerHTML = `
        <span class="city-icon">${this.getCityIcon(city)}</span>
        <span>${city}<span class="city-hint">${hint}</span></span>
      `;
      btn.onclick = () => this.selectCity(city);
      container.appendChild(btn);
    });
  },

  getCityIcon(city) {
    const icons = { '深圳': '🏢', '武汉': '🌉', '杭州': '🏞' };
    return icons[city] || '📍';
  },

  selectCity(city) {
    this.state.city = city;
    this.state.selectedCourses = [];  // 切换城市清空已选
    this.state.activeSeries = 'all';  // 切换城市重置大类
    this.renderCityTabs();
    this.renderSeriesFilter();
    this.renderCourses();
    this.updateSchedule();
  },

  // ---------- 大类筛选 ----------
  renderSeriesFilter() {
    const container = document.getElementById('seriesFilter');
    if (!container) return;
    const seriesList = getSeriesForCity(this.state.city);
    const totalCourses = getCoursesForCity(this.state.city).length;
    // 课程数 ≥ 8 且大类 ≥ 2 时才显示筛选栏（仅深圳等大课量城市生效）
    if (totalCourses < 8 || seriesList.length < 2) {
      container.style.display = 'none';
      container.innerHTML = '';
      return;
    }
    container.style.display = '';
    let html = `<button class="series-chip ${this.state.activeSeries === 'all' ? 'active' : ''}" onclick="App.selectSeries('all')">📚 全部课程</button>`;
    seriesList.forEach((s) => {
      const info = getSeriesInfo(s);
      html += `<button class="series-chip ${this.state.activeSeries === s ? 'active' : ''}" onclick="App.selectSeries('${s}')">${info.icon} ${info.name}</button>`;
    });
    container.innerHTML = html;
  },

  selectSeries(series) {
    this.state.activeSeries = series;
    this.renderSeriesFilter();
    this.renderCourses();
  },

  // ---------- 课程列表 ----------
  renderCourses() {
    const container = document.getElementById('courseGrid');
    let courses = getCoursesForCity(this.state.city);

    // 按大类筛选
    if (this.state.activeSeries !== 'all') {
      courses = courses.filter((c) => c.series === this.state.activeSeries);
    }

    const hint = document.getElementById('courseCountHint');
    const seriesName = this.state.activeSeries === 'all'
      ? ''
      : ' · ' + getSeriesInfo(this.state.activeSeries).name;
    hint.textContent = `共 ${courses.length} 门可选${seriesName}`;

    container.innerHTML = '';
    courses.forEach((course, idx) => {
      const cat = getCategoryInfo(course.category);
      const isSelected = this.state.selectedCourses.includes(course.id);
      const imgUrl = getCourseImage(course.id);
      const card = document.createElement('div');
      card.className = 'course-card fade-in-up' + (isSelected ? ' selected' : '');
      card.setAttribute('data-course-id', course.id);
      card.style.animationDelay = `${idx * 0.05}s`;
      card.innerHTML = `
        ${imgUrl ? `<div class="course-img-banner cat-bg-${course.category}">
          <img class="course-img" src="${imgUrl}" alt="${cat.name}" loading="lazy" decoding="async" onerror="this.classList.add('img-error')">
          <span class="course-cat-tag cat-${course.category}">${cat.name}</span>
        </div>` : ''}
        <div class="course-card-header">
          <span class="course-no">No.${course.no}</span>
          <div class="course-title">${course.title}</div>
          <div class="course-subtitle">${cityVenueText(course.subtitle, this.state.city)}</div>
          <div class="course-meta">
            <span>⏱ ${course.duration}</span>
            <span>👥 ${course.groupSize}</span>
            <span>🎓 ${course.grade}</span>
          </div>
          <div class="course-intro">${cityVenueText(course.goal, this.state.city)}</div>
        </div>
        <div class="course-detail-wrap" id="detail-${course.id}">
          <div class="course-card-body">
            <div class="course-goal"><strong>课程目标：</strong>${cityVenueText(course.goal, this.state.city)}</div>
            <div class="course-content">
              ${course.content.map(c => `<div class="course-content-item">${cityVenueText(c, this.state.city)}</div>`).join('')}
            </div>
          </div>
        </div>
        <div class="course-card-footer">
          <button class="btn-detail" onclick="App.toggleDetail(event, ${course.id})">
            详情 <span class="arrow">▾</span>
          </button>
          <div class="course-footer-right">
            ${renderPriceHTML(course, this.state.city)}
            <button class="btn-add-course ${isSelected ? 'added' : ''}" onclick="App.toggleCourse(${course.id})">
              ${isSelected ? '✓ 已添加' : '+ 添加'}
            </button>
          </div>
        </div>
      `;
      container.appendChild(card);
    });
  },

  toggleDetail(event, courseId) {
    event.stopPropagation();
    const wrap = document.getElementById('detail-' + courseId);
    const btn = event.currentTarget;
    if (wrap) {
      wrap.classList.toggle('expanded');
      btn.classList.toggle('expanded');
    }
  },

  toggleCourse(courseId) {
    const idx = this.state.selectedCourses.indexOf(courseId);
    if (idx > -1) {
      this.state.selectedCourses.splice(idx, 1);
    } else {
      this.state.selectedCourses.push(courseId);
    }
    // 仅更新当前卡片，避免整页课程列表重渲染导致“闪烁/刷新”观感
    const card = document.querySelector(`.course-card[data-course-id="${courseId}"]`);
    if (card) {
      const selected = this.state.selectedCourses.includes(courseId);
      card.classList.toggle('selected', selected);
      const btn = card.querySelector('.btn-add-course');
      if (btn) {
        btn.classList.toggle('added', selected);
        btn.innerHTML = selected ? '✓ 已添加' : '+ 添加';
      }
    }
    this.updateSchedule();
  },

  // ---------- 午餐 ----------
  toggleLunch() {
    this.state.lunch = !this.state.lunch;
    const el = document.getElementById('lunchOption');
    el.classList.toggle('checked', this.state.lunch);
    this.updateSchedule();
  },

  // ---------- 行程安排 ----------
  buildSchedule() {
    const items = [];
    const courses = this.state.selectedCourses.map(id => getCourseById(id)).filter(Boolean);
    let slotIdx = 0;
    let morningCount = 0;

    courses.forEach((course, i) => {
      // 上午最多排2节课，之后插入午餐
      if (morningCount === 2 && this.state.lunch) {
        items.push({
          type: 'lunch',
          time: this.LUNCH_SLOT,
          name: '🍱 午餐休息',
          meta: `¥${LUNCH.price}/人`,
        });
        morningCount = -999; // 标记已插入午餐
      }
      if (slotIdx >= this.TIME_SLOTS.length) slotIdx = 0;
      const slot = this.TIME_SLOTS[slotIdx];
      items.push({
        type: 'course',
        id: course.id,
        time: slot,
        name: course.title,
        meta: `${getCategoryInfo(course.category).name} · ${course.duration} · ${typeof course.price === 'number' ? '¥' + getEffectivePrice(course, this.state.city) + '/人' : course.price}`,
        price: getEffectivePrice(course, this.state.city),
      });
      slotIdx++;
      morningCount++;
    });

    // 如果还有午餐没插入且选了午餐
    if (this.state.lunch && !items.some(i => i.type === 'lunch')) {
      // 插入到上午和下午之间
      const insertIdx = Math.min(2, items.length);
      items.splice(insertIdx, 0, {
        type: 'lunch',
        time: this.LUNCH_SLOT,
        name: '🍱 午餐休息',
        meta: `¥${LUNCH.price}/人`,
      });
    }

    return items;
  },

  updateSchedule() {
    const container = document.getElementById('scheduleItems');
    const hint = document.getElementById('scheduleHint');
    const items = this.buildSchedule();

    if (items.length === 0) {
      container.innerHTML = '<div class="schedule-empty">尚未选择课程，请从上方课程列表中添加</div>';
      hint.textContent = '请选择课程';
    } else {
      hint.textContent = `共 ${items.length} 项安排`;
      const totalCourses = this.state.selectedCourses.length;
      container.innerHTML = items.map((item) => {
        if (item.type === 'lunch') {
          return `<div class="schedule-item lunch-item" style="position:relative;">
            <div class="time">${item.time.start} - ${item.time.end}</div>
            <div class="name">${item.name}</div>
            <div class="meta">${item.meta || ''}</div>
          </div>`;
        }
        const pos = this.state.selectedCourses.indexOf(item.id);
        const isFirst = pos === 0;
        const isLast = pos === totalCourses - 1;
        return `<div class="schedule-item" style="position:relative;">
          <div class="move-btns">
            <button onclick="App.moveCourse(${item.id},-1)" ${isFirst ? 'disabled' : ''} title="上移">▲</button>
            <button onclick="App.moveCourse(${item.id},1)" ${isLast ? 'disabled' : ''} title="下移">▼</button>
          </div>
          <button class="remove-btn" onclick="App.removeCourse(${item.id})" title="删除">×</button>
          <div class="time">${item.time.start} - ${item.time.end}</div>
          <div class="name">${item.name}</div>
          <div class="meta">${item.meta || ''}</div>
        </div>`;
      }).join('');
    }

    this.updateTotal();
  },

  removeCourse(courseId) {
    const idx = this.state.selectedCourses.indexOf(courseId);
    if (idx > -1) {
      this.state.selectedCourses.splice(idx, 1);
      const card = document.querySelector(`.course-card[data-course-id="${courseId}"]`);
      if (card) {
        card.classList.remove('selected');
        const btn = card.querySelector('.btn-add-course');
        if (btn) {
          btn.classList.remove('added');
          btn.innerHTML = '+ 添加';
        }
      }
      this.updateSchedule();
    }
  },

  moveCourse(courseId, dir) {
    const arr = this.state.selectedCourses;
    const idx = arr.indexOf(courseId);
    if (idx < 0) return;
    const target = idx + dir;
    if (target < 0 || target >= arr.length) return;
    [arr[idx], arr[target]] = [arr[target], arr[idx]];
    this.updateSchedule();
  },

  // ---------- 费用计算 ----------
  updateTotal() {
    const people = parseInt(document.getElementById('peopleInput').value) || 0;
    const courses = this.state.selectedCourses.map(id => getCourseById(id)).filter(Boolean);
    const courseTotal = courses.reduce((sum, c) => sum + (typeof c.price === 'number' ? getEffectivePrice(c, this.state.city) : 0), 0) * people;
    const lunchTotal = this.state.lunch ? LUNCH.price * people : 0;
    const total = courseTotal + lunchTotal;

    document.getElementById('totalAmount').textContent = '¥' + total.toLocaleString();
  },

  // ---------- 表单验证 & 提交 ----------
  // 蜜罐拦截：正常用户看不到该字段，自动化脚本填了即判定为机器人
  isHoneypotFilled() {
    const hp = document.getElementById('hpField');
    return !!(hp && hp.value && hp.value.trim() !== '');
  },

  // 浏览器端限流：同一浏览器 10 分钟内最多提交 5 次，防止脚本刷单
  checkRateLimit() {
    const KEY = 'bgi_submit_times';
    const WINDOW = 10 * 60 * 1000; // 10 分钟
    const MAX = 5;
    let times = [];
    try { times = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { times = []; }
    const now = Date.now();
    times = times.filter((t) => now - t < WINDOW);
    if (times.length >= MAX) {
      const waitMin = Math.ceil((WINDOW - (now - times[0])) / 60000);
      return { ok: false, waitMin };
    }
    times.push(now);
    try { localStorage.setItem(KEY, JSON.stringify(times)); } catch (e) {}
    return { ok: true };
  },

  // 清洗用户输入：去除控制字符，截断超长，去除首尾空白
  sanitizeInput(val, maxLen) {
    if (typeof val !== 'string') return val;
    let s = val.replace(/[\u0000-\u001F\u007F]/g, '').trim();
    if (maxLen && s.length > maxLen) s = s.slice(0, maxLen);
    return s;
  },

  validateForm() {
    if (this.isHoneypotFilled()) {
      // 不暴露是蜜罐，给一个通用错误，且不真正提交
      return { valid: false, msg: '提交失败，请稍后重试', spam: true };
    }
    const rate = this.checkRateLimit();
    if (!rate.ok) {
      return { valid: false, msg: `操作过于频繁，请 ${rate.waitMin} 分钟后再试` };
    }

    const org = this.sanitizeInput(document.getElementById('orgInput').value, 60);
    const name = this.sanitizeInput(document.getElementById('nameInput').value, 30);
    const phone = this.sanitizeInput(document.getElementById('phoneInput').value, 11);
    const date = document.getElementById('dateInput').value;
    const timeSlot = document.getElementById('timeSlotInput').value;
    const people = parseInt(document.getElementById('peopleInput').value) || 0;
    const days = parseInt(document.getElementById('daysInput').value) || 1;

    if (!org) return { valid: false, msg: '请填写机构名称' };
    if (!name) return { valid: false, msg: '请填写联系人姓名' };
    if (!phone || !/^1\d{10}$/.test(phone)) return { valid: false, msg: '请填写正确的11位手机号' };
    if (!date) return { valid: false, msg: '请选择参访日期' };
    if (!timeSlot) return { valid: false, msg: '请选择参访时段（上午/下午）' };
    if (people < 1) return { valid: false, msg: '参访人数至少为1' };
    if (this.state.selectedCourses.length === 0) return { valid: false, msg: '请至少选择一门课程' };

    return { valid: true, data: { org, name, phone, date, timeSlot, people, days } };
  },

  async submit() {
    const result = this.validateForm();
    if (!result.valid) {
      this.showToast(result.msg, 'error');
      return;
    }

    // 检查 Supabase 是否配置
    if (!isSupabaseConfigured()) {
      this.showToast('系统尚未连接云端数据库，请联系管理员配置', 'error');
      return;
    }

    // 显示提交中状态
    const btn = document.getElementById('submitBtn');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '提交中...';

    const { org, name, phone, date, timeSlot, people, days } = result.data;
    const courses = this.state.selectedCourses.map(id => getCourseById(id)).filter(Boolean);
    const courseTotal = courses.reduce((sum, c) => sum + (typeof c.price === 'number' ? getEffectivePrice(c, this.state.city) : 0), 0) * people;
    const lunchTotal = this.state.lunch ? LUNCH.price * people : 0;
    const total = courseTotal + lunchTotal;

    const submissionData = {
      city: this.state.city,
      org,
      name,
      phone,
      date,
      timeSlot,
      people,
      days,
      lunch: this.state.lunch,
      courses: this.state.selectedCourses,
      courseNames: courses.map(c => c.title),
      courseTotal,
      lunchTotal,
      total,
    };

    try {
      const record = await Storage.addSubmission(submissionData);
      btn.disabled = false;
      btn.textContent = originalText;
      if (record) {
        this.enterSelfView(org, phone, { justSubmitted: true });
      } else {
        this.showToast('提交失败，请检查网络后重试', 'error');
      }
    } catch (e) {
      btn.disabled = false;
      btn.textContent = originalText;
      this.showToast('提交失败：' + (e.message || '网络错误'), 'error');
    }
  },

  showSuccessModal(record) {
    const courses = record.courses.map(id => getCourseById(id)).filter(Boolean);
    const modalBody = `
      <div style="text-align:center;margin-bottom:20px;">
        <div style="width:64px;height:64px;border-radius:50%;background:#D1FAE5;display:flex;align-items:center;justify-content:center;font-size:32px;margin:0 auto 12px;">✓</div>
        <div style="font-size:18px;font-weight:700;color:var(--text);">报名提交成功！</div>
        <div style="font-size:13px;color:var(--text-muted);margin-top:4px;">编号：${record.id} ｜ 查询码：${record.trackingCode || '—'}</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:6px;">请保存查询码，机构可在页面底部「报名状态查询」中凭机构名称+手机号查看审核进度。</div>
      </div>
      <div class="detail-grid">
        <div class="detail-item"><div class="label">城市</div><div class="value">${this.escapeHtml(record.city)}</div></div>
        <div class="detail-item"><div class="label">机构名称</div><div class="value">${this.escapeHtml(record.org)}</div></div>
        <div class="detail-item"><div class="label">联系人</div><div class="value">${this.escapeHtml(record.name)}</div></div>
        <div class="detail-item"><div class="label">手机号</div><div class="value">${this.escapeHtml(record.phone)}</div></div>
        <div class="detail-item"><div class="label">参访日期</div><div class="value">${this.escapeHtml(record.date)}</div></div>
        <div class="detail-item"><div class="label">参访时段</div><div class="value">${this.escapeHtml(record.timeSlot || '—')}</div></div>
        <div class="detail-item"><div class="label">参访人数</div><div class="value">${this.escapeHtml(record.people)} 人</div></div>
        <div class="detail-item full"><div class="label">已选课程</div><div class="value">${this.escapeHtml(courses.map(c => c.title).join(' / '))}</div></div>
        <div class="detail-item"><div class="label">午餐服务</div><div class="value">${record.lunch ? '已选' : '未选'}</div></div>
        <div class="detail-item"><div class="label">总费用</div><div class="value" style="color:#DC2626;font-size:20px;font-weight:700;">¥${record.total.toLocaleString()}</div></div>
      </div>
    `;
    this.showModal('', modalBody, [
      { text: '继续选课', class: 'btn-cancel', action: () => { this.resetForm(); this.hideModal(); } },
      { text: '查看管理后台', class: 'btn-confirm', action: () => { window.location.href = 'admin.html'; } },
    ], true);
  },

  resetForm() {
    document.getElementById('orgInput').value = '';
    document.getElementById('nameInput').value = '';
    document.getElementById('phoneInput').value = '';
    document.getElementById('dateInput').value = '';
    document.getElementById('peopleInput').value = '1';
    document.getElementById('daysInput').value = '1';
    this.state.selectedCourses = [];
    this.state.lunch = false;
    document.getElementById('lunchOption').classList.remove('checked');
    this.renderCourses();
    this.updateSchedule();
  },

  // ---------- 报名状态查询（机构匿名查询） ----------
  async queryStatus() {
    const org = document.getElementById('qOrg').value.trim();
    const phone = document.getElementById('qPhone').value.trim();
    const codeEl = document.getElementById('qCode');
    const code = codeEl ? codeEl.value.trim() : '';
    const resultEl = document.getElementById('queryResult');

    if (!org || !phone) {
      this.showToast('请填写机构名称和手机号', 'error');
      return;
    }
    if (!/^1\d{10}$/.test(phone)) {
      this.showToast('请输入正确的11位手机号', 'error');
      return;
    }
    if (!isSupabaseConfigured()) {
      this.showToast('系统未连接云端数据库，暂无法查询', 'error');
      return;
    }

    const btn = document.querySelector('.btn-query');
    if (btn) { btn.disabled = true; btn.textContent = '查询中...'; }

    try {
      let list = await Storage.queryByInstitute(phone, org);
      if (btn) { btn.disabled = false; btn.textContent = '查询状态'; }

      if (!list || list.length === 0) {
        resultEl.innerHTML = '<div class="query-empty">未查询到该机构的报名记录，请核对机构名称与手机号是否填写正确。</div>';
        return;
      }
      // 查询码作为查看钥匙：若用户填写，必须命中某条记录的查询码
      if (code) {
        const matched = list.filter(s => String(s.trackingCode || '') === code);
        if (matched.length === 0) {
          resultEl.innerHTML = '<div class="query-empty">查询码与「' + this.escapeHtml(org) + '」的报名记录不匹配，请核对查询码是否正确。</div>';
          return;
        }
        list = matched;
      } else if (list.length > 1) {
        resultEl.innerHTML = '<div class="query-empty">该机构有多条报名记录，请输入提交成功后返回的「查询码」以精确定位。</div>';
        return;
      }
      this.enterSelfView(org, phone, { list });
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = '查询状态'; }
      this.showToast('查询失败：' + (e.message || '网络错误'), 'error');
    }
  },

  // ---------- 付款凭证上传（拖拽 / 点击 / 粘贴截图） ----------
  renderProofUploader(s, role) {
    const list = Array.isArray(s.paymentProof) ? s.paymentProof : [];
    const hint = role === 'self' ? '（您可上传转账 / 回款截图）' : '（销售可上传机构回款截图）';
    return `
      <div class="proof-box">
        <div class="proof-title">📎 付款凭证 <span class="proof-hint">${hint}</span></div>
        <div class="drop-zone" id="dz-${s.id}" tabindex="0"
          onclick="document.getElementById('pf-${s.id}').click()"
          ondragover="App.dzOver(event,'${s.id}')"
          ondragleave="App.dzLeave(event,'${s.id}')"
          ondrop="App.dzDrop(event,'${s.id}','${role}')"
          onpaste="App.dzPaste(event,'${s.id}','${role}')">
          <div class="dz-icon">⬆️</div>
          <div class="dz-text">拖拽图片到此处，或 <strong>点击选择</strong>，也可直接 <strong>Ctrl+V 粘贴</strong> 截图</div>
          <input type="file" id="pf-${s.id}" accept="image/*" multiple style="display:none" onchange="App.pfPick(event,'${s.id}','${role}')">
        </div>
        <div class="proof-list" id="pl-${s.id}">${this.proofThumbs(list, s.id, role)}</div>
        <div class="proof-err" id="pe-${s.id}"></div>
      </div>`;
  },

  proofThumbs(list, id, role) {
    if (!list || !list.length) return '<div class="proof-empty">暂无凭证，上传后在此显示</div>';
    return list.map((p, i) => `
      <div class="proof-thumb">
        <a href="${p.url}" target="_blank" rel="noopener"><img src="${p.url}" alt="${this.escapeHtml(p.name || '凭证')}" loading="lazy"></a>
        <div class="proof-meta">${this.escapeHtml(p.by || '')} · ${p.at ? p.at.slice(0, 10) : ''}</div>
        <button class="proof-del" title="删除" onclick="App.deleteProof('${id}','${role}',${i}, this)">×</button>
      </div>`).join('');
  },

  pfPick(e, id, role) { this.uploadProof(id, role, e.target.files); },
  dzOver(e, id) { e.preventDefault(); const z = document.getElementById('dz-' + id); if (z) z.classList.add('drag'); },
  dzLeave(e, id) { const z = document.getElementById('dz-' + id); if (z) z.classList.remove('drag'); },
  dzDrop(e, id, role) {
    e.preventDefault();
    const z = document.getElementById('dz-' + id); if (z) z.classList.remove('drag');
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) this.uploadProof(id, role, e.dataTransfer.files);
  },
  dzPaste(e, id, role) {
    const items = (e.clipboardData && e.clipboardData.items) || [];
    const files = [];
    for (const it of items) { if (it.type && it.type.indexOf('image/') === 0) { const f = it.getAsFile(); if (f) files.push(f); } }
    if (files.length) { e.preventDefault(); this.uploadProof(id, role, files); }
  },
  _proofErr(id, msg) { const el = document.getElementById('pe-' + id); if (el) el.textContent = msg; },

  getProofSubmission(id, role) {
    return role === 'sales'
      ? ((window.Admin && Admin.allSubmissions) || []).find(x => x.id === id)
      : (this.state.queryResults || []).find(x => x.id === id);
  },

  async uploadProof(id, role, files) {
    const sb = getSupabase();
    if (!sb) { this._proofErr(id, 'Supabase 未连接，请刷新页面'); return; }
    const list = files && files.length ? Array.from(files) : [];
    if (!list.length) return;
    const MAX = 10 * 1024 * 1024;
    const ok = list.filter(f => {
      if (!f.type || f.type.indexOf('image/') !== 0) { this._proofErr(id, '仅支持图片文件：' + (f.name || '')); return false; }
      if (f.size > MAX) { this._proofErr(id, '图片超过 10MB：' + (f.name || '')); return false; }
      return true;
    });
    if (!ok.length) return;
    const dz = document.getElementById('dz-' + id);
    if (dz) dz.classList.add('uploading');
    try {
      const session = (typeof Storage.getSession === 'function') ? Storage.getSession() : {};
      const by = role === 'sales' ? (session.displayName || session.username || '销售') : '机构';
      const uploaded = [];
      for (const f of ok) {
        let ext = (f.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) ext = 'png';
        const path = id + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;
        const { error } = await sb.storage.from('payment-proofs').upload(path, f, { contentType: f.type, upsert: false, cacheControl: '3600' });
        if (error) throw new Error(error.message || '上传失败');
        const url = sb.storage.from('payment-proofs').getPublicUrl(path).data.publicUrl;
        uploaded.push({ url, path, name: f.name || '凭证', at: new Date().toISOString(), by });
      }
      const s = this.getProofSubmission(id, role);
      const arr = (s && Array.isArray(s.paymentProof)) ? s.paymentProof.slice() : [];
      const merged = arr.concat(uploaded);
      const okUpdate = await Storage.setPaymentProofs(id, merged);
      if (!okUpdate) throw new Error('保存到数据库失败');
      if (s) s.paymentProof = merged;
      this.refreshProofList(id, role, merged);
    } catch (e) {
      this._proofErr(id, '上传失败：' + (e.message || '未知错误'));
    } finally {
      if (dz) dz.classList.remove('uploading');
      const inp = document.getElementById('pf-' + id); if (inp) inp.value = '';
    }
  },

  async deleteProof(id, role, idx, btn) {
    const s = this.getProofSubmission(id, role);
    if (!s || !Array.isArray(s.paymentProof)) return;
    const arr = s.paymentProof.slice();
    const item = arr[idx];
    if (!item) return;
    if (btn) { btn.disabled = true; btn.textContent = '…'; }
    try {
      if (item.path) { await getSupabase().storage.from('payment-proofs').remove([item.path]); }
      arr.splice(idx, 1);
      const ok = await Storage.setPaymentProofs(id, arr);
      if (!ok) throw new Error('删除失败');
      s.paymentProof = arr;
      this.refreshProofList(id, role, arr);
    } catch (e) {
      this._proofErr(id, '删除失败：' + (e.message || '未知错误'));
      if (btn) { btn.disabled = false; btn.textContent = '×'; }
    }
  },

  refreshProofList(id, role, arr) {
    const pl = document.getElementById('pl-' + id);
    if (!pl) return;
    const s = this.getProofSubmission(id, role);
    const list = arr || (s && s.paymentProof) || [];
    pl.innerHTML = this.proofThumbs(list, id, role);
  },

  renderStatusCard(s) {
    const m = STATUS_LABELS[s.status || '待审核'] || STATUS_LABELS['待审核'];
    const rejectBlock = (s.status === '已拒绝' && s.rejectReason)
      ? `<div class="query-reject">拒绝理由：${this.escapeHtml(s.rejectReason)}</div>` : '';

    const timelineHtml = this.buildTimeline(s);
    const notifications = this.computeNotifications(s);
    this.state.notifMap = this.state.notifMap || {};
    this.state.notifMap[s.id] = notifications;
    const unreadNtf = notifications.filter((n) => !n.read).length;

    // 费用与缴费 pane
    let payBlock = '';
    if (s.quoteAmount != null || s.total) {
      const finalAmt = s.quoteAmount != null ? Number(s.quoteAmount) : (Number(s.total) || 0);
      const originAmt = Number(s.total) || finalAmt;
      const bd = this.quoteBreakdownHtml(s);
      const confirmBtn = (s.quoteAmount != null && !s.quoteConfirmed)
        ? `<button class="btn-query-confirm" onclick="App.queryConfirmQuote('${s.id}', this)">确认报价</button>` : '';
      payBlock = `
        <div class="pay-amount">
          <span class="pay-amount-label">应缴金额</span>
          <span class="pay-amount-value">¥${finalAmt.toLocaleString()}</span>
          ${finalAmt !== originAmt ? `<span class="pay-amount-origin">原价 ¥${originAmt.toLocaleString()}</span>` : ''}
        </div>
        ${bd}
        ${confirmBtn}
        <div class="pay-guide">
          <div class="pay-guide-title">💳 缴费方式</div>
          <p>请选择以下任一方式完成支付，<strong>转账备注请填写：研学机构 + 研学日期</strong>（如：深圳实验小学 2026-07-25），以便财务快速核对。</p>
          <div class="pay-qrcodes">
            <div class="pay-qr-item">
              <img src="images/qrcode-alipay.jpg" alt="支付宝收款码" class="pay-qr-img" onerror="if(window.HD_ASSETS&&window.HD_ASSETS.qr_alipay)this.src=window.HD_ASSETS.qr_alipay" />
              <span class="pay-qr-label">支付宝扫码付款</span>
            </div>
            <div class="pay-qr-item">
              <img src="images/qrcode-wechat.jpg" alt="微信收款码" class="pay-qr-img" onerror="if(window.HD_ASSETS&&window.HD_ASSETS.qr_wechat)this.src=window.HD_ASSETS.qr_wechat" />
              <span class="pay-qr-label">微信扫码付款</span>
            </div>
          </div>
          <div class="pay-bank">
            <div class="pay-bank-title">🏦 银行转账</div>
            <div class="pay-bank-row"><span class="pay-bank-lbl">开户名</span><span class="pay-bank-val">深圳市华大教育中心</span></div>
            <div class="pay-bank-row"><span class="pay-bank-lbl">银行账号</span><span class="pay-bank-val user-select-all">4000025509200144415</span></div>
            <div class="pay-bank-row"><span class="pay-bank-lbl">开户银行</span><span class="pay-bank-val">中国工商银行深圳保税区支行</span></div>
          </div>
          <p class="pay-guide-tip">⚠️ 转账后请截屏保存凭证，并发送给您的对接人确认到账。</p>
        </div>`;
    } else {
      payBlock = `<div class="query-empty" style="padding:18px;">报价生成后此处显示应缴金额与缴费方式。</div>`;
    }
    // 已交付 / 已完成：开放付款凭证上传（机构自助上传 + 销售上传）
    if (s.status === '已交付' || s.status === '已完成') {
      payBlock += this.renderProofUploader(s, 'self');
    }

    // 满意度评价 pane
    let satBlock;
    if (s.status === '已交付') {
      if (s.satisfactionRating) {
        satBlock = `<div class="query-sat done">
          <div class="q-head">📝 课后满意度评价（已提交）</div>
          <div class="sat-stars">${'★'.repeat(s.satisfactionRating)}<span class="dim">${'☆'.repeat(5 - s.satisfactionRating)}</span></div>
          ${s.satisfactionComment ? `<div class="sat-comment">${this.escapeHtml(s.satisfactionComment)}</div>` : ''}
        </div>`;
      } else {
        satBlock = `<div class="query-sat">
          <div class="q-head">📝 课后满意度评价</div>
          <p class="sat-tip">本次研学已交付，欢迎为体验评分～</p>
          <div class="star-row" id="starRow-${s.id}">
            ${[1,2,3,4,5].map(n => `<span class="star" data-v="${n}" onclick="App.setStar('${s.id}',${n})">★</span>`).join('')}
          </div>
          <textarea class="form-control sat-text" id="satComment-${s.id}" rows="2" placeholder="想对我们说的话（选填）"></textarea>
          <button class="btn-query-confirm" onclick="App.submitSatisfaction('${s.id}', this)">提交评价</button>
        </div>`;
      }
    } else {
      satBlock = `<div class="query-empty" style="padding:18px;">研学交付完成后可在此提交满意度评价。</div>`;
    }

    // 确认单 pane
    let docPane;
    if (typeof window.ExportConfirm !== 'undefined' && window.ExportConfirm.previewHtml) {
      let docHtml = '';
      try { docHtml = window.ExportConfirm.previewHtml(s); } catch (e) { docHtml = ''; }
      docPane = docHtml
        ? `<div class="confirm-preview">${docHtml}</div>
           <button class="btn-doc-download" onclick="App.downloadConfirm('${s.id}', this)">⬇️ 下载确认单（Word）</button>
           <p class="doc-tip">可下载 Word 版确认单自行打印或签字回传。</p>`
        : `<div class="query-empty" style="padding:18px;">确认单暂未生成，请等待对接人发送。</div>`;
    } else {
      docPane = `<div class="query-empty" style="padding:18px;">确认单组件加载中，请刷新页面后重试。</div>`;
    }

    // 行程说明
    let scheduleNote;
    if (s.status === '已排课' && s.assignedDelivery) {
      scheduleNote = `<div class="timeline-note">📌 已排期：${this.escapeHtml(s.scheduledDate || '—')} ${this.escapeHtml(s.scheduledTime || '')}${s.venue ? ' ｜ 场地：' + this.escapeHtml(getVenueName(s.venue)) : ''}${s.assignedTeacher ? ' ｜ 讲师：' + this.escapeHtml(this.teacherName(s.assignedTeacher)) : ''}</div>`;
    } else {
      scheduleNote = `<div class="timeline-note muted">以下为预计行程，最终以排课通知为准。</div>`;
    }

    return `
      <div class="portal" data-id="${s.id}">
        <div class="portal-head">
          <div>
            <div class="portal-title">${this.escapeHtml(s.org || '报名机构')} · 研学服务</div>
            <div class="portal-sub">报名编号 #${s.id} ｜ 查询码 ${this.escapeHtml(s.trackingCode || '—')}${s.city ? ' ｜ ' + this.escapeHtml(s.city) : ''}</div>
          </div>
          <span class="status-badge ${m.cls}">${m.label}</span>
        </div>
        <div class="portal-tabs">
          <button class="ptab active" data-tab="schedule" onclick="App.switchPortalTab('${s.id}','schedule')">📋 行程安排</button>
          <button class="ptab" data-tab="pay" onclick="App.switchPortalTab('${s.id}','pay')">💰 费用与缴费</button>
          <button class="ptab" data-tab="sat" onclick="App.switchPortalTab('${s.id}','sat')">📝 评价</button>
          <button class="ptab" data-tab="doc" onclick="App.switchPortalTab('${s.id}','doc')">📄 确认单</button>
          <button class="ptab${unreadNtf ? ' has-badge' : ''}" data-tab="notify" onclick="App.switchPortalTab('${s.id}','notify')">🔔 消息${unreadNtf ? `<span class="ntf-badge">${unreadNtf}</span>` : ''}</button>
        </div>
        <div class="portal-pane active" data-pane="schedule">${scheduleNote}${timelineHtml}</div>
        <div class="portal-pane" data-pane="pay">${payBlock}</div>
        <div class="portal-pane" data-pane="sat">${satBlock}</div>
        <div class="portal-pane" data-pane="doc">${docPane}</div>
        <div class="portal-pane" data-pane="notify">${this.renderNotifyPane(s, notifications)}</div>
        ${rejectBlock}
      </div>`;
  },

  // 生成行程时间轴（复用公共 buildFlow，与确认单 docx 共用同一算法）
  buildTimeline(s) {
    const nodes = (typeof buildFlow === 'function') ? buildFlow(s) : [];

    if (!nodes.length) return '<div class="query-empty" style="padding:18px;">排课完成后将显示当天行程安排。</div>';
    return `<div class="timeline">${nodes.map((n) => `
      <div class="tl-node tl-${n.type}">
        <div class="tl-dot"></div>
        <div class="tl-body">
          <div class="tl-time">${n.time}</div>
          <div class="tl-title">${this.escapeHtml(n.title)}</div>
          <div class="tl-place">📍 ${this.escapeHtml(n.place || '')}</div>
        </div>
      </div>`).join('')}</div>`;
  },

  // 自助门户：消息通知（基于报名状态派生，无需后端改动）
  // 优化：本地缓存读取只解析一次；同一团结果缓存，避免每屏被 3 处重复计算（约 18×N 次解析）
  computeNotifications(s) {
    const cache = (this._ntfCache = this._ntfCache || {});
    if (cache[s.id]) return cache[s.id];
    let readMap = {};
    try { readMap = JSON.parse(localStorage.getItem('hd_notify_read') || '{}'); } catch (e) {}
    const out = [];
    const push = (type, icon, title, body, stage) => {
      const id = 'ntf-' + s.id + '-' + type;
      const read = !!readMap[id];
      out.push({ id, type, icon, title, body, stage, read });
    };
    push('submit', '📝', '报名已提交', '我们已收到您（' + (s.org || '贵机构') + '）的研学报名申请，报名编号 #' + s.id + '。我们将在 1-2 个工作日内完成审核，请留意本页消息更新。', '待审核');
    if (s.status && !['待审核', '已拒绝'].includes(s.status)) {
      const lbl = (typeof STATUS_LABELS !== 'undefined' && STATUS_LABELS[s.status]) ? STATUS_LABELS[s.status].label : s.status;
      push('review', '✅', '报名审核通过', '您的报名 #' + s.id + ' 已通过审核，当前进度：' + lbl + '。', '已审核');
      // 审核通过但报价尚未生成 → 待报价
      if (s.quoteAmount == null) {
        push('waitquote', '⏳', '等待报价生成', '报名已审核通过，我们正在为您核算本次研学报价，请稍候。', '待报价');
      }
    }
    if (s.quoteAmount != null) {
      const amt = Number(s.quoteAmount).toLocaleString();
      push('quote', '💰', '报价已生成', '本次研学报价已生成，应缴金额 ¥' + amt + '。请确认报价并安排缴费。', '已报价');
      if (!s.quoteConfirmed) {
        push('payremind', '⏰', '请确认并缴费', '报价尚未确认，请尽快确认 ¥' + amt + ' 的报价并通过转账方式缴费。', '缴费');
      }
    }
    if (s.status === '已排课') {
      const parts = [];
      if (s.scheduledDate) parts.push(s.scheduledDate);
      if (s.scheduledTime) parts.push(s.scheduledTime);
      if (s.venue) parts.push('场地：' + (typeof getVenueName === 'function' ? getVenueName(s.venue) : s.venue));
      if (s.assignedTeacher) parts.push('讲师：' + this.teacherName(s.assignedTeacher));
      push('schedule', '🚌', '研学行前通知', parts.length ? ('您的研学已排期：' + parts.join(' ｜ ') + '。请提醒学员按时到达盐田大梅沙时空中心集合签到。') : '您的研学已排期，请留意对接人发送的详细行前通知。', '行前');
    }
    if (s.status === '已交付') {
      push('deliver', '📣', '欢迎评价本次研学', '本次研学已圆满交付，期待您为体验评分，帮助我们持续优化课程（可在「评价」页提交）。', '售后');
    }
    return out.reverse();
  },

  renderNotifyPane(s, notifications) {
    if (!notifications || !notifications.length) {
      return '<div class="query-empty" style="padding:18px;">暂无消息通知。</div>';
    }
    return `<div class="ntf-list">${notifications.map((n) => `
      <div class="ntf-item ${n.read ? 'read' : 'unread'}">
        <div class="ntf-icon">${n.icon}</div>
        <div class="ntf-body">
          <div class="ntf-top"><span class="ntf-title">${this.escapeHtml(n.title)}</span><span class="ntf-stage">${this.escapeHtml(n.stage)}</span></div>
          <div class="ntf-text">${this.escapeHtml(n.body)}</div>
        </div>
      </div>`).join('')}</div>`;
  },

  // 自助门户：切换标签页
  switchPortalTab(id, tab) {
    const portal = document.querySelector('.portal[data-id="' + id + '"]');
    if (!portal) return;
    portal.querySelectorAll('.ptab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    portal.querySelectorAll('.portal-pane').forEach((p) => p.classList.toggle('active', p.dataset.pane === tab));
    if (tab === 'notify') this.markNotificationsRead(id);
  },

  markNotificationsRead(id) {
    const list = (this.state.notifMap && this.state.notifMap[id]) || [];
    if (!list.length) return;
    let readMap = {};
    try { readMap = JSON.parse(localStorage.getItem('hd_notify_read') || '{}'); } catch (e) {}
    let changed = false;
    list.forEach((n) => { if (!n.read) { n.read = true; changed = true; } readMap[n.id] = true; });
    if (!changed) return;
    try { localStorage.setItem('hd_notify_read', JSON.stringify(readMap)); } catch (e) {}
    const portal = document.querySelector('.portal[data-id="' + id + '"]');
    if (!portal) return;
    const tabBtn = portal.querySelector('.ptab[data-tab="notify"]');
    const badge = tabBtn ? tabBtn.querySelector('.ntf-badge') : null;
    if (badge) badge.remove();
    if (tabBtn) tabBtn.classList.remove('has-badge');
  },

  // 自助端下载确认单（Word）— 复用 ExportConfirm.download
  async downloadConfirm(id, btn) {
    const list = this.state.queryResults || [];
    const s = list.find((x) => x.id === id);
    if (!s) { alert('未找到该报名记录'); return; }
    const origText = btn ? btn.innerText : '';
    if (btn) { btn.disabled = true; btn.innerText = '⏳ 生成中…'; }
    try {
      if (typeof window.ExportConfirm === 'undefined' || !window.ExportConfirm.download) {
        throw new Error('确认单生成组件未加载，请刷新页面后重试');
      }
      await window.ExportConfirm.download(s, { name: s.name, phone: s.phone });
    } catch (e) {
      alert('下载失败：' + (e.message || '请稍后重试'));
    } finally {
      if (btn) { btn.disabled = false; btn.innerText = origText; }
    }
  },

  // 查询码记忆：渲染快捷入口
  initPortalShortcut() {
    const box = document.getElementById('myPortalShortcut');
    if (!box) return;
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem('hd_self_query') || 'null'); } catch (e) {}
    if (saved && saved.org && saved.phone) {
      box.innerHTML = `
        <div class="portal-shortcut">
          <span>👋 欢迎回来，<strong>${this.escapeHtml(saved.org)}</strong></span>
          <span class="ps-actions">
            <button class="btn-query" onclick="App.openMyPortal()">查看我的研学</button>
            <button class="link-btn" onclick="App.clearMyPortal()">退出</button>
          </span>
        </div>`;
    } else {
      box.innerHTML = '';
    }
  },

  // 一键进入我的研学
  openMyPortal() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem('hd_self_query') || 'null'); } catch (e) {}
    if (!saved) return;
    this.enterSelfView(saved.org, saved.phone);
  },

  clearMyPortal() {
    try { localStorage.removeItem('hd_self_query'); } catch (e) {}
    this.initPortalShortcut();
  },

  // 自助服务全屏视图：查询后跳转，记忆 org/phone，刷新保持
  async enterSelfView(org, phone, opts = {}) {
    this.state.selfQuery = { org, phone };
    this.state.activeGroupId = null;
    try { localStorage.setItem('hd_self_query', JSON.stringify({ org, phone })); } catch (e) {}
    const sv = document.getElementById('selfView');
    const body = document.getElementById('selfViewBody');
    if (body) body.innerHTML = '<div class="self-loading">加载中…</div>';
    if (sv) sv.classList.add('active');
    document.body.classList.add('self-open');
    this._syncSelfUrl(org, phone);
    try {
      const list = (opts && opts.list && opts.list.length) ? opts.list : await Storage.queryByInstitute(phone, org);
      this.renderSelfView(list, org, opts);
    } catch (e) {
      if (body) body.innerHTML = '<div class="query-empty">查询失败：' + this.escapeHtml(e.message || '网络错误') + '</div>';
    }
  },

  renderSelfView(list, org, opts = {}) {
    const body = document.getElementById('selfViewBody');
    if (!body) return;
    if (opts.justSubmitted) {
      this.state.queryResults = list || [];
      this.state.activeGroupId = null;
      const sc = document.getElementById('myPortalShortcut'); if (sc) sc.innerHTML = '';
      body.innerHTML = '<div class="self-success">✅ 报名提交成功！以下是您的研学服务，请保存「查询码」，下次可凭「机构名称 + 手机号 + 查询码」重新查询。</div>' +
        this.renderGroupView(org);
      return;
    }
    if (!list || !list.length) {
      body.innerHTML = '<div class="query-empty">未查询到机构「' + this.escapeHtml(org) + '」的报名记录，请核对机构名称与手机号是否填写正确。</div>';
      return;
    }
    this.state.queryResults = list;
    const sc = document.getElementById('myPortalShortcut'); if (sc) sc.innerHTML = '';
    body.innerHTML = this.renderGroupView(org);
  },

  // 两级视图：有选中团 → 单团详情；否则 → 总览列表
  renderGroupView(org) {
    const list = this.state.queryResults || [];
    if (this.state.activeGroupId) {
      const s = list.find((x) => x.id === this.state.activeGroupId);
      if (s) {
        return '<button class="group-back" onclick="App.backToGroups()">← 返回团列表</button>' + this.renderStatusCard(s);
      }
      this.state.activeGroupId = null;
    }
    return this.renderGroupOverview(list, org);
  },

  // 进入单个团详情
  openGroup(id) {
    this.state.activeGroupId = id;
    const body = document.getElementById('selfViewBody');
    if (body) body.innerHTML = this.renderGroupView((this.state.selfQuery && this.state.selfQuery.org) || '');
    if (body) body.scrollTop = 0;
  },

  // 返回团总览
  backToGroups() {
    this.state.activeGroupId = null;
    const body = document.getElementById('selfViewBody');
    if (body) body.innerHTML = this.renderGroupView((this.state.selfQuery && this.state.selfQuery.org) || '');
    if (body) body.scrollTop = 0;
  },

  // 团总览：统计卡 + 团列表
  renderGroupOverview(list, org) {
    const sorted = (list || []).slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const ov = this.computeOverview(sorted);
    const header = `
      <div class="group-overview-head">
        <div class="gov-title">${this.escapeHtml(org || '报名机构')} · 研学服务</div>
        <div class="gov-sub">欢迎回来，您名下共有 ${sorted.length} 个研学团</div>
      </div>`;
    const stats = `
      <div class="ov-stats">
        ${this.ovStat('研学团数', String(sorted.length), '')}
        ${this.ovStat('总人数', ov.totalPeople + ' 人', '')}
        ${this.ovStat('待缴金额', '¥' + ov.dueAmount.toLocaleString(), 'info')}
        ${this.ovStat('待办提醒', ov.todoCount + ' 项', 'warn')}
      </div>`;
    const rows = sorted.map((s) => this.renderGroupRow(s)).join('');
    return header + stats + '<div class="gov-list-title">我的研学团</div>' +
      (rows || '<div class="query-empty">暂无研学团。</div>') +
      '<div class="query-tip">点击任一研学团，查看其行程 / 缴费 / 确认单 / 评价 / 消息。</div>';
  },

  ovStat(label, value, kind) {
    const cls = kind === 'info' ? ' ov-info' : (kind === 'warn' ? ' ov-warn' : '');
    return `<div class="ov-stat${cls}"><div class="ov-stat-label">${label}</div><div class="ov-stat-value">${value}</div></div>`;
  },

  // 总览聚合统计
  computeOverview(list) {
    let totalPeople = 0, dueAmount = 0, todoCount = 0;
    (list || []).forEach((s) => {
      totalPeople += parseInt(s.people, 10) || 0;
      const amt = s.quoteAmount != null ? Number(s.quoteAmount) : (Number(s.total) || 0);
      if (s.status !== '已交付' && s.status !== '已完成') dueAmount += amt;
      let todo = 0;
      const ntf = this.computeNotifications(s);
      todo += ntf.filter((n) => !n.read).length;
      if (s.quoteAmount != null && !s.quoteConfirmed && s.status !== '已交付') todo += 1;
      todoCount += todo;
    });
    return { totalPeople, dueAmount, todoCount };
  },

  // 单个团列表行
  renderGroupRow(s) {
    const m = STATUS_LABELS[s.status || '待审核'] || STATUS_LABELS['待审核'];
    const notifications = this.computeNotifications(s);
    this.state.notifMap = this.state.notifMap || {};
    this.state.notifMap[s.id] = notifications;
    const unread = notifications.filter((n) => !n.read).length;
    const needConfirm = (s.quoteAmount != null && !s.quoteConfirmed && s.status !== '已交付');
    const hasDot = unread > 0 || needConfirm;
    const amt = s.quoteAmount != null ? Number(s.quoteAmount) : (Number(s.total) || 0);
    const amtText = (s.quoteAmount != null || s.total) ? '¥' + amt.toLocaleString() : '待报价';
    return `
      <div class="group-row" onclick="App.openGroup('${s.id}')">
        <div class="group-row-main">
          <div class="group-row-top">
            <span class="group-row-name">${this.escapeHtml(this.groupLabel(s))}</span>
            <span class="status-badge ${m.cls}">${m.label}</span>
          </div>
          <div class="group-row-sub">${this.escapeHtml(s.date || '—')} ｜ ${parseInt(s.people, 10) || 0} 人 ｜ ${amtText}</div>
        </div>
        <span class="group-dot ${hasDot ? 'on' : ''}"></span>
      </div>`;
  },

  // 团的展示名称：优先 group_name，否则 日期+查询码后4位
  groupLabel(s) {
    if (s.groupName) return s.groupName;
    const code = s.trackingCode ? String(s.trackingCode).slice(-4) : '';
    return (s.date ? s.date + ' ' : '') + '研学团' + (code ? '（' + code + '）' : '');
  },

  closeSelfView() {
    const sv = document.getElementById('selfView');
    if (sv) sv.classList.remove('active');
    document.body.classList.remove('self-open');
    this.state.selfQuery = null;
    try {
      const url = new URL(location.href);
      url.searchParams.delete('org'); url.searchParams.delete('phone'); url.hash = '';
      history.replaceState(null, '', url);
    } catch (e) {}
  },

  _syncSelfUrl(org, phone) {
    try {
      const url = new URL(location.href);
      url.searchParams.set('org', org);
      url.searchParams.set('phone', phone);
      url.hash = 'self';
      history.replaceState(null, '', url);
    } catch (e) {}
  },

  refreshSelfIfOpen() {
    const sv = document.getElementById('selfView');
    if (sv && sv.classList.contains('active') && this.state.selfQuery) {
      const q = this.state.selfQuery;
      this.enterSelfView(q.org, q.phone);
      return true;
    }
    return false;
  },

  initSelfRoute() {
    const params = new URLSearchParams(location.search);
    const org = params.get('org');
    const phone = params.get('phone');
    if (org && phone && (location.hash === '#self' || params.has('self'))) {
      this.enterSelfView(org, phone);
    } else {
      this.initPortalShortcut();
    }
  },

  setStar(id, n) {
    const row = document.getElementById('starRow-' + id);
    if (!row) return;
    const stars = row.querySelectorAll('.star');
    stars.forEach((st, i) => st.classList.toggle('active', i < n));
  },

  async submitSatisfaction(id, btn) {
    const row = document.getElementById('starRow-' + id);
    const rating = row ? row.querySelectorAll('.star.active').length : 0;
    if (!rating) {
      this.showToast('请先选择星级评分', 'error');
      return;
    }
    const commentEl = document.getElementById('satComment-' + id);
    const comment = commentEl ? commentEl.value.trim() : '';
    const card = btn ? btn.closest('.query-card') : (row ? row.closest('.query-card') : null);
    const realBtn = card ? card.querySelector('.query-sat .btn-query-confirm') : null;
    if (realBtn) { realBtn.disabled = true; realBtn.textContent = '提交中...'; }
    const rec = (this.state.queryResults || []).find(r => String(r.id) === String(id));
    try {
      const ok = await Storage.submitSatisfaction(id, rating, comment, rec ? rec.phone : '', rec ? rec.org : '');
      if (ok) {
        this.showToast('感谢您的评价！', 'success');
        if (!this.refreshSelfIfOpen()) { await this.queryStatus(); }
      } else {
        this.showToast('提交失败，请稍后重试', 'error');
        if (realBtn) { realBtn.disabled = false; realBtn.textContent = '提交评价'; }
      }
    } catch (e) {
      this.showToast('提交失败：' + (e.message || '网络错误'), 'error');
      if (realBtn) { realBtn.disabled = false; realBtn.textContent = '提交评价'; }
    }
  },

  async queryConfirmQuote(id, btn) {
    const card = btn ? btn.closest('.query-card') : null;
    const realBtn = card ? card.querySelector('.query-quote .btn-query-confirm') : null;
    if (realBtn) { realBtn.disabled = true; realBtn.textContent = '确认中...'; }
    const rec = (this.state.queryResults || []).find(r => String(r.id) === String(id));
    const ok = await Storage.confirmQuote(id, rec ? rec.phone : '', rec ? rec.org : '');
    if (ok) {
      this.showToast('报价已确认，感谢配合！', 'success');
      if (!this.refreshSelfIfOpen()) { await this.queryStatus(); }
    } else {
      this.showToast('确认失败，请稍后重试', 'error');
      if (realBtn) { realBtn.disabled = false; realBtn.textContent = '确认报价'; }
    }
  },

  escapeHtml(str) {
    return htmlEscape(str);
  },

  // 报价折扣明细（详情/查询页展示）
  quoteBreakdownHtml(s) {
    const ql = s.quoteLines;
    if (!ql || typeof ql !== 'object' || Array.isArray(ql)) return '';
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

  // ---------- 通用 UI 组件 ----------
  showToast(message, type = '') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast show ' + type;
    setTimeout(() => {
      toast.className = 'toast ' + type;
    }, 3000);
  },

  showModal(title, bodyHTML, actions, hideClose = false) {
    const overlay = document.getElementById('modalOverlay');
    const box = document.getElementById('modalBox');
    let html = '';
    if (title) html += `<h3>${title}</h3>`;
    html += `<div class="modal-body">${bodyHTML}</div>`;
    html += '<div class="modal-actions">';
    actions.forEach((a, i) => {
      html += `<button class="btn-modal ${a.class}" data-action="${i}">${a.text}</button>`;
    });
    html += '</div>';
    box.innerHTML = html;

    // 绑定按钮事件
    actions.forEach((a, i) => {
      const btn = box.querySelector(`[data-action="${i}"]`);
      if (btn) btn.onclick = a.action;
    });

    overlay.classList.add('show');
  },

  hideModal() {
    document.getElementById('modalOverlay').classList.remove('show');
  },
};

// 监听人数变化更新总价
document.addEventListener('DOMContentLoaded', () => {
  App.init();
  document.getElementById('peopleInput').addEventListener('input', () => App.updateTotal());

  // 状态查询输入框回车触发
  const qOrg = document.getElementById('qOrg');
  const qPhone = document.getElementById('qPhone');
  if (qOrg) qOrg.addEventListener('keydown', (e) => { if (e.key === 'Enter') App.queryStatus(); });
  if (qPhone) qPhone.addEventListener('keydown', (e) => { if (e.key === 'Enter') App.queryStatus(); });
});
