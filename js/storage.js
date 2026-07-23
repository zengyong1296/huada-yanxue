/**
 * 数据存储层 - Supabase 云端版本（已迁移到 Supabase Auth：手机号 + 密码，免短信）
 *
 * 安全模型：
 *  - 管理员登录仍输「手机号 + 密码」，前端内部把手机号映射成邮箱
 *    （形如 13800000000@huada-edu.cn）走 Supabase Auth 邮箱密码登录。
 *  - 登录后浏览器携带由 Supabase 签名的 JWT；数据库 RLS 凭 JWT 中的
 *    email 声明区分「已登录管理员」与「匿名访客」。
 *  - 不再使用任何前端硬编码令牌（ADMIN_API_TOKEN 已移除）。
 *  - 管理员读写改走 RLS 直连（JWT 自动随请求发送，RLS 校验身份）。
 *  - 公开写操作（机构确认报价 / 提交满意度）走 SECURITY DEFINER 函数并做归属校验。
 *  - 过渡期仍保留「纯密码直连」兜底（legacyLogin），详见 supabase-auth-migration.sql。
 */

const SESSION_KEY = 'bgi_admin_session';

// 报名列表需要的列。
// 排除 payment_proof（含 base64 凭证的大 JSONB，仅详情页用），但保留 history —— 因为后台的
// 确认/拒绝/排期/交付/完成等操作都基于内存里的 s.history 追加，缺了会清空历史。
const LIST_COLUMNS = [
  'id', 'city', 'org', 'name', 'phone', 'date', 'time_slot', 'people', 'days', 'lunch',
  'courses', 'course_names', 'course_total', 'lunch_total', 'total', 'created_at', 'status',
  'reject_reason', 'assigned_delivery', 'scheduled_date', 'scheduled_time', 'confirmed_at',
  'confirmed_by', 'ops_note', 'tracking_code', 'quote_amount', 'quote_lines', 'quote_generated_at',
  'quote_generated_by', 'quote_note', 'quote_confirmed', 'venue', 'assigned_teacher', 'actual_people',
  'exec_note', 'satisfaction_rating', 'satisfaction_comment', 'group_name', 'history',
].join(', ');

// 管理员 Auth 邮箱虚拟域名（手机号 → 手机号@域名，仅用于 Supabase Auth 登录标识）
const ADMIN_EMAIL_DOMAIN = 'huada-edu.cn';
function phoneToEmail(phone) {
  return String(phone).replace(/[^0-9]/g, '') + '@' + ADMIN_EMAIL_DOMAIN;
}

// 简单哈希（旧版，仅用于密码登录兜底）
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return 'h' + Math.abs(hash).toString(36);
}

// 安全哈希（v2）：带系统 pepper
function cryptoHash(str) {
  const PEPPER = 'bgi-edu-2026-!@#KX7mNq2pR9wY';
  const combined = str + ':' + PEPPER;
  let h1 = 0, h2 = 0;
  for (let i = 0; i < combined.length; i++) {
    const c = combined.charCodeAt(i);
    h1 = ((h1 << 5) - h1 + c) | 0;
    h2 = ((h2 << 7) - h2 + c) ^ ((h2 >>> 3) | 0);
  }
  const hi = (h1 >>> 0).toString(16).padStart(8, '0');
  const lo = (h2 >>> 0).toString(16).padStart(8, '0');
  return 'v2:' + hi + lo;
}

const Storage = {
  // 初始化：恢复可能存在的 Auth 会话镜像
  async init() {
    await this.restoreSession();
  },

  // 若 Supabase 已存在会话（页面刷新后），据 JWT 重建本地会话镜像
  async restoreSession() {
    const sb = getSupabase();
    if (!sb) return;
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (session && session.user) {
        const { data, error } = await sb.rpc('get_my_admin');
        if (!error && data && data.length) {
          const a = data[0];
          this._saveSession({ username: a.username, role: a.role, displayName: a.display_name });
        }
      }
    } catch (e) { /* 迁移 SQL 未执行时静默失败，沿用旧 localStorage 会话 */ }
  },

  _saveSession(s) {
    const session = { ...s, loginAt: new Date().toISOString() };
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch (e) {}
    return session;
  },

  // ---------- 手机号 + 密码登录（Supabase Auth 邮箱密码；手机号映射为邮箱） ----------
  async login(phone, password) {
    const sb = getSupabase();
    if (!sb) return { success: false, message: '数据库未连接' };
    if (!/^1\d{10}$/.test(phone)) return { success: false, message: '请输入正确的11位手机号' };
    if (!password) return { success: false, message: '请输入密码' };

    // 主路径：Supabase Auth 邮箱密码登录（email = 手机号@虚拟域名）
    try {
      const { data, error } = await sb.auth.signInWithPassword({
        email: phoneToEmail(phone),
        password,
      });
      if (!error && data && data.session) {
        // 登录成功 → 取后台角色（get_my_admin 按 JWT email 关联 admins.username）
        try {
          const { data: ad, error: e2 } = await sb.rpc('get_my_admin');
          if (!e2 && ad && ad.length) {
            const a = ad[0];
            const session = this._saveSession({
              username: a.username,
              role: a.role || 'dev',
              displayName: a.display_name || a.username,
            });
            return { success: true, session };
          }
        } catch (e) { /* get_my_admin 不存在（迁移 SQL 未执行）→ 用手机号兜底建会话 */ }
        // Auth 登录成功但拿不到后台资料：用手机号作最小会话（迁移 SQL 执行前）
        const session = this._saveSession({ username: phone, role: 'dev', displayName: phone });
        return { success: true, session };
      }
    } catch (e) { /* Auth 未配置或网络异常 → 降级 */ }

    // 降级路径：迁移前用密码直连 admins 表（初始密码 a123456）
    return await this.legacyLogin(phone, password);
  },

  // 过渡兜底：密码直连（Supabase Auth 尚未配置时使用）
  async legacyLogin(username, password) {
    const sb = getSupabase();
    if (!sb) return { success: false, message: '数据库未连接' };
    const newHash = cryptoHash(password);
    const oldHash = simpleHash(password);
    try {
      const res = await sb.rpc('admin_login', { p_username: username, p_new_hash: newHash, p_legacy_hash: oldHash });
      if (!res.error && res.data && res.data.length) {
        const a = res.data[0];
        const session = this._saveSession({
          username: a.username, role: a.role || 'dev', displayName: a.display_name || a.username,
        });
        return { success: true, session };
      }
    } catch (e) { /* 函数不存在 → 降级 */ }
    // 降级：anon 直连（仅执行迁移 SQL 前、未启用 RLS 时可用）
    let { data, error } = await sb.from('admins').select('*').eq('username', username).eq('password', newHash).single();
    if (error && !data) {
      ({ data, error } = await sb.from('admins').select('*').eq('username', username).eq('password', oldHash).single());
    }
    if (error || !data) return { success: false, message: '用户名或密码错误' };
    const session = this._saveSession({
      username: data.username, role: data.role || 'dev', displayName: data.display_name || data.username,
    });
    return { success: true, session };
  },

  // ---------- 报名数据（管理员，已登录 → RLS 直连） ----------
  // 优先只取必要列（排除会增长的 payment_proof），若数据库尚未执行某些迁移导致
  // 部分列不存在，Supabase 会直接报错并返回空 —— 故加 try，失败则降级回 select('*')，
  // 保证「数据一个都没了」这类问题不会发生（详情仍走 getSubmissionById 的 select('*')）。
  async getSubmissions() {
    const sb = getSupabase();
    if (!sb) return [];
    try {
      const { data, error } = await sb
        .from('submissions')
        .select(LIST_COLUMNS)
        .order('created_at', { ascending: false });
      if (!error) return (data || []).map((row) => this._mapRow(row));
    } catch (e) { /* 列缺失 → 降级 */ }
    const { data, error } = await sb
      .from('submissions')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) { console.error('[Storage] 获取报名数据失败:', error.message); return []; }
    return (data || []).map((row) => this._mapRow(row));
  },

  async getSubmissionById(id) {
    const sb = getSupabase();
    if (!sb) return null;
    const { data, error } = await sb
      .from('submissions')
      .select('*')
      .eq('id', parseInt(id))
      .single();
    if (error) { console.error('[Storage] 获取详情失败:', error.message); return null; }
    return this._mapRow(data);
  },

  async addSubmission(data) {
    const sb = getSupabase();
    if (!sb) return null;
    const row = {
      city: data.city,
      org: data.org,
      name: data.name,
      phone: data.phone,
      date: data.date,
      time_slot: data.timeSlot || '',
      people: data.people,
      days: data.days,
      lunch: data.lunch,
      courses: JSON.stringify(data.courses || []),
      course_names: JSON.stringify(data.courseNames || []),
      course_total: data.courseTotal || 0,
      lunch_total: data.lunchTotal || 0,
      total: data.total || 0,
      status: '待审核',
      tracking_code: data.trackingCode || this.generateTrackingCode(),
      venue: data.venue || '',
    };
    const { data: result, error } = await sb
      .from('submissions')
      .insert(row)
      .select()
      .single();
    if (error) { console.error('[Storage] 提交失败:', error.message); return null; }
    return this._mapRow(result);
  },

  generateTrackingCode() {
    const d = new Date();
    const ym = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}`;
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `BGI-${ym}-${rand}`;
  },

  async updateSubmission(id, patch) {
    const sb = getSupabase();
    if (!sb) return false;
    try {
      const { error } = await sb.from('submissions').update(patch).eq('id', parseInt(id));
      if (error) throw error;
      return true;
    } catch (e) {
      // 容错：若新增列（如 venue_addr）尚未执行迁移、数据库无该列，自动去掉该列后重试，
      // 保证其余字段仍能保存，避免整条更新失败（等用户执行迁移后即可正常写入）。
      const msg = (e && e.message) || '';
      if (patch.venue_addr !== undefined && /venue_addr/i.test(msg)) {
        const { venue_addr, ...rest } = patch;
        try {
          const { error } = await sb.from('submissions').update(rest).eq('id', parseInt(id));
          if (error) { console.error('[Storage] 更新失败:', error.message); return false; }
          return true;
        } catch (e2) { console.error('[Storage] 更新失败:', (e2 && e2.message) || e2); return false; }
      }
      console.error('[Storage] 更新失败:', msg);
      return false;
    }
  },

  // 保存付款凭证数组（jsonb）到 submissions.payment_proof
  async setPaymentProofs(id, arr) {
    return await this.updateSubmission(id, { payment_proof: arr });
  },

  // 取公开存储对象的访问 URL
  getProofPublicUrl(path) {
    const sb = getSupabase();
    if (!sb) return '';
    return sb.storage.from('payment-proofs').getPublicUrl(path).data.publicUrl;
  },

  async deleteSubmission(id) {
    const sb = getSupabase();
    if (!sb) return false;
    const { error } = await sb
      .from('submissions')
      .delete()
      .eq('id', parseInt(id));
    if (error) { console.error('[Storage] 删除失败:', error.message); return false; }
    return true;
  },

  // 将数据库行映射为前端格式
  _mapRow(row) {
    if (!row) return null;
    let courses = row.courses;
    let courseNames = row.course_names;
    if (typeof courses === 'string') { try { courses = JSON.parse(courses); } catch (e) { courses = []; } }
    if (typeof courseNames === 'string') { try { courseNames = JSON.parse(courseNames); } catch (e) { courseNames = []; } }
    let history = row.history;
    if (typeof history === 'string') { try { history = JSON.parse(history); } catch (e) { history = []; } }

    return {
      id: String(row.id),
      city: row.city,
      org: row.org,
      name: row.name,
      phone: row.phone,
      date: row.date,
      people: row.people,
      days: row.days,
      lunch: row.lunch,
      courses: courses || [],
      courseNames: courseNames || [],
      courseTotal: row.course_total || 0,
      lunchTotal: row.lunch_total || 0,
      total: row.total || 0,
      createdAt: row.created_at,
      status: row.status || '待确认',
      rejectReason: row.reject_reason || '',
      assignedDelivery: row.assigned_delivery || '',
      scheduledDate: row.scheduled_date || '',
      scheduledTime: row.scheduled_time || '',
      confirmedAt: row.confirmed_at || '',
      confirmedBy: row.confirmed_by || '',
      opsNote: row.ops_note || '',
      trackingCode: row.tracking_code || '',
      history: history || [],
      timeSlot: row.time_slot || '',
      quoteAmount: (row.quote_amount === null || row.quote_amount === undefined) ? null : Number(row.quote_amount),
      quoteLines: row.quote_lines || null,
      quoteGeneratedAt: row.quote_generated_at || '',
      quoteGeneratedBy: row.quote_generated_by || '',
      quoteNote: row.quote_note || '',
      quoteConfirmed: !!row.quote_confirmed,
      venue: row.venue || '',
      venueAddr: row.venue_addr || '',
      assignedTeacher: row.assigned_teacher || '',
      actualPeople: row.actual_people || 0,
      execNote: row.exec_note || '',
      satisfactionRating: (row.satisfaction_rating === null || row.satisfaction_rating === undefined) ? null : Number(row.satisfaction_rating),
      satisfactionComment: row.satisfaction_comment || '',
      groupName: row.group_name || '',
      paymentProof: (() => {
        const v = row.payment_proof;
        if (Array.isArray(v)) return v;
        if (typeof v === 'string') { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch (e) { return []; } }
        return [];
      })(),
    };
  },

  // ---------- 管理员管理（已登录 → RLS 直连，SELECT 不返回密码） ----------
  async getAdmins() {
    const sb = getSupabase();
    if (!sb) return [];
    const { data, error } = await sb
      .from('admins')
      .select('username, role, display_name, created_at')
      .order('created_at', { ascending: true });
    if (error) { console.error('[Storage] 获取管理员失败:', error.message); return []; }
    return (data || []).map((a) => ({
      username: a.username,
      password: '',
      role: a.role || 'dev',
      displayName: a.display_name || '',
      createdAt: a.created_at,
    }));
  },

  async getDeliveryStaff() {
    const admins = await this.getAdmins();
    return admins.filter((a) => a.role === 'delivery');
  },

  async getTeachers() {
    const admins = await this.getAdmins();
    return admins.filter((a) => a.role === 'teacher');
  },

  // 添加管理员：优先经 Edge Function 在云端用 service_role 自动创建 Auth 账号
  //   （手机号@huada-edu.cn，自动确认），并写入 admins 表。这样无需每次去 Supabase 网站。
  // 未部署 Edge Function 时降级为直接写 admins 表（仅记录，仍需手动建 Auth 账号）。
  async addAdmin(phone, name, role = 'sales', password = '') {
    const sb = getSupabase();
    if (!sb) return { success: false, message: '数据库未连接' };
    if (!/^1\d{10}$/.test(phone)) return { success: false, message: '请输入正确的11位手机号' };
    if (password && password.length < 6) return { success: false, message: '初始密码至少 6 位' };

    // 主路径：调用 Edge Function（带当前登录会话的 JWT 鉴权）
    try {
      const { data: { session } } = await sb.auth.getSession();
      const token = session && session.access_token;
      if (token) {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/add-admin`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token,
            'apikey': SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ phone, name, role, password }),
        });
        const json = await res.json().catch(() => ({}));
        if (res.ok && json.success) {
          return { success: true, email: json.email };
        }
        // 函数未部署（404）→ 降级；其余错误（重复/无权限/参数）→ 透出
        if (res.status !== 404) {
          return { success: false, message: json.message || ('添加失败(' + res.status + ')') };
        }
      }
    } catch (e) { /* 网络异常或函数未部署 → 降级 */ }

    // 降级路径：直接写 admins 表（仅记录；仍需手动建 Auth 账号才能登录）
    try {
      const { error } = await sb.from('admins').insert({
        username: phone,
        role,
        display_name: name || phone,
      });
      if (error) return { success: false, message: '添加失败: ' + error.message };
      return { success: true, legacy: true };
    } catch (e) {
      return { success: false, message: '添加失败：网络错误' };
    }
  },

  async updateUsername(oldUsername, newUsername) {
    const sb = getSupabase();
    if (!sb) return { success: false, message: '数据库未连接' };
    if (!/^1\d{10}$/.test(newUsername)) return { success: false, message: '请输入正确的11位手机号' };
    const { error } = await sb.from('admins').update({ username: newUsername }).eq('username', oldUsername);
    if (error) return { success: false, message: '修改失败: ' + error.message };
    return { success: true };
  },

  async updateAdmin(username, patch) {
    const sb = getSupabase();
    if (!sb) return { success: false, message: '数据库未连接' };
    const row = {};
    if (patch.role !== undefined) row.role = patch.role;
    if (patch.displayName !== undefined) row.display_name = patch.displayName;
    const { error } = await sb.from('admins').update(row).eq('username', username);
    if (error) return { success: false, message: '更新失败: ' + error.message };
    return { success: true };
  },

  async deleteAdmin(username) {
    const sb = getSupabase();
    if (!sb) return { success: false, message: '数据库未连接' };
    const { data: all } = await sb.from('admins').select('username');
    if (all && all.length <= 1) return { success: false, message: '至少需要保留一个管理员账户' };
    const { error } = await sb.from('admins').delete().eq('username', username);
    if (error) return { success: false, message: '删除失败: ' + error.message };
    return { success: true };
  },

  // 修改密码：已登录 Auth 会话 → 直接设置 Supabase 密码；否则降级直连（校验原密码）
  async updatePassword(username, oldPassword, newPassword) {
    const sb = getSupabase();
    if (!sb) return { success: false, message: '数据库未连接' };
    if (!newPassword || newPassword.length < 6) return { success: false, message: '新密码至少6位' };

    // 主路径：当前有 Auth 会话 → Supabase 改密（无需原密码）
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (session) {
        const { error } = await sb.auth.updateUser({ password: newPassword });
        if (!error) return { success: true };
        return { success: false, message: error.message || '修改失败' };
      }
    } catch (e) { /* 无会话 → 降级 */ }

    // 降级路径：迁移前直连 admins（需校验原密码）
    const { data, error } = await sb.from('admins').select('*').eq('username', username).single();
    if (error || !data) return { success: false, message: '用户不存在' };
    if (data.password !== cryptoHash(oldPassword) && data.password !== simpleHash(oldPassword)) {
      return { success: false, message: '原密码错误' };
    }
    const { error: e2 } = await sb.from('admins').update({ password: cryptoHash(newPassword) }).eq('username', username);
    if (e2) return { success: false, message: '更新失败' };
    return { success: true };
  },

  // 销售生成/更新报价单
  async generateQuote(id, { amount, lines, note }) {
    const sb = getSupabase();
    if (!sb) return { success: false, message: '数据库未连接' };
    const cur = await this.getSubmissionById(id);
    if (!cur) return { success: false, message: '记录不存在' };
    const session = this.getSession();
    const by = session ? session.username : '';
    const history = (cur.history || []).concat([{
      action: '生成报价单',
      by,
      at: new Date().toISOString(),
      note: amount != null ? '¥' + Number(amount).toLocaleString() : '',
    }]);
    const { error } = await sb.from('submissions').update({
      quote_amount: amount != null ? Number(amount) : null,
      quote_lines: lines || null,
      quote_note: note || '',
      quote_generated_at: new Date().toISOString(),
      quote_generated_by: by,
      history,
    }).eq('id', parseInt(id));
    if (error) return { success: false, message: '生成失败: ' + error.message };
    return { success: true };
  },

  // 机构端确认报价（带归属校验：必须是该手机号 + 机构名的记录）
  async confirmQuote(id, phone, org) {
    const sb = getSupabase();
    if (!sb) return false;
    try {
      const { error } = await sb.rpc('public_confirm_quote', {
        p_id: parseInt(id), p_phone: phone, p_org: org,
      });
      if (!error) return true;
    } catch (e) { /* 迁移 SQL 未执行 → 降级 */ }
    // 降级：迁移前（未启用 RLS）anon 可直接更新
    const { error } = await sb.from('submissions').update({ quote_confirmed: true }).eq('id', parseInt(id));
    if (error) { console.error('[Storage] 确认报价失败:', error.message); return false; }
    return true;
  },

  // 讲师签到（实到人数）
  async saveCheckin(id, actualPeople) {
    const sb = getSupabase();
    if (!sb) return false;
    const { error } = await sb.from('submissions').update({ actual_people: parseInt(actualPeople) || 0 }).eq('id', parseInt(id));
    if (error) { console.error('[Storage] 签到失败:', error.message); return false; }
    return true;
  },

  // 讲师提交执行小结
  async saveExecNote(id, note) {
    const sb = getSupabase();
    if (!sb) return false;
    const { error } = await sb.from('submissions').update({ exec_note: note || '' }).eq('id', parseInt(id));
    if (error) { console.error('[Storage] 执行小结保存失败:', error.message); return false; }
    return true;
  },

  // 机构端提交课后满意度（带归属校验）
  async submitSatisfaction(id, rating, comment, phone, org) {
    const sb = getSupabase();
    if (!sb) return false;
    try {
      const { error } = await sb.rpc('public_submit_satisfaction', {
        p_id: parseInt(id), p_phone: phone, p_org: org,
        p_rating: parseInt(rating) || 0, p_comment: comment || '',
      });
      if (!error) return true;
    } catch (e) { /* 降级 */ }
    const { error } = await sb.from('submissions').update({
      satisfaction_rating: parseInt(rating) || 0,
      satisfaction_comment: comment || '',
    }).eq('id', parseInt(id));
    if (error) { console.error('[Storage] 满意度提交失败:', error.message); return false; }
    return true;
  },

  // 机构匿名查询报名状态（无需登录；携带请求头使 RLS 的「仅本人机构」生效）
  // 简化为单次查询：成功即返回；失败/异常直接降级为空数组，不再发第二次冗余往返。
  async queryByInstitute(phone, org) {
    const sb = getSupabase();
    if (!sb) return [];
    try {
      const { data, error } = await sb
        .from('submissions')
        .select('*')
        .eq('phone', phone)
        .eq('org', org)
        .order('created_at', { ascending: false })
        .headers({ 'x-phone': phone, 'x-org': org });
      if (error) { console.error('[Storage] 查询失败:', error.message); return []; }
      return (data || []).map((row) => this._mapRow(row));
    } catch (e) {
      console.error('[Storage] 查询异常:', e);
      return [];
    }
  },

  // ---------- 会话 ----------
  logout() {
    const sb = getSupabase();
    if (sb) { sb.auth.signOut().catch(() => {}); }
    localStorage.removeItem(SESSION_KEY);
  },

  getSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  },

  isLoggedIn() {
    return !!this.getSession();
  },

  // 修改登录手机号后，同步更新本地会话中的用户名（避免刷新前显示旧号）
  setSessionUsername(phone) {
    const s = this.getSession();
    if (s) { s.username = phone; this._saveSession(s); }
  },

  // ---------- 数据导出 ----------
  exportCSV(submissions, includeContact = true, teacherMap = {}) {
    const headers = [
      '编号', '状态', '城市', '机构名称',
      ...(includeContact ? ['联系人', '手机号'] : []),
      '日期', '时段', '人数', '实到人数', '天数', '午餐', '已选课程', '场地', '讲师',
      '课程费用', '总费用', '交付人员', '排期日期', '排期时间', '满意度', '提交时间',
    ];
    const rows = submissions.map((s) => {
      const courseNames = (s.courseNames || []).join(' / ');
      const teacherName = (s.assignedTeacher && teacherMap[s.assignedTeacher]) || s.assignedTeacher || '';
      return [
        s.id, s.status || '待审核', s.city || '', s.org || '',
        ...(includeContact ? [s.name || '', s.phone || ''] : []),
        s.date || '', s.timeSlot || '', s.people || '', s.actualPeople || 0, s.days || '',
        s.lunch ? '是' : '否', courseNames, s.venue || '', teacherName,
        s.courseTotal || 0, s.total || 0,
        s.assignedDelivery || '', s.scheduledDate || '', s.scheduledTime || '',
        (s.satisfactionRating ? s.satisfactionRating + '星' : ''),
        s.createdAt ? new Date(s.createdAt).toLocaleString('zh-CN') : '',
      ];
    });
    return '﻿' + [headers, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
  },
};
