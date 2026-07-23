/**
 * 公共工具（自助端 / 后台 / 确认单共用）
 * 目的：把多处重复实现收敛到一处，避免「改一处漏一处」与逻辑漂移。
 */

// 报名状态展示元数据（两页面共用同一份，改一处即全局生效）
const STATUS_META = {
  '待审核': { cls: 'badge-pending', label: '⏳ 待审核' },
  '已确认': { cls: 'badge-confirmed', label: '✅ 已确认' },
  '已拒绝': { cls: 'badge-rejected', label: '❌ 已拒绝' },
  '已排课': { cls: 'badge-scheduled', label: '📅 已排课' },
  '已交付': { cls: 'badge-delivered', label: '🚚 已交付' },
  '已完成': { cls: 'badge-completed', label: '🎉 已完成' },
};

// HTML 转义（防止 XSS 与换行破坏结构）—— 全局唯一实现
function htmlEscape(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// 课程时长解析为分钟（统一算法：自助端预览与确认单 docx 共用，避免两份解析不一致）
// 修复点：原 app.js 对 "1-1.5h" 只取首个数字 -> 1 分钟；这里与确认单保持一致（取区间上限 * 60）。
function parseDurationMin(str) {
  if (!str) return 60;
  let m = str.match(/(\d+)\s*-\s*(\d+)\s*分钟/);
  if (m) return parseInt(m[2] || m[1], 10);
  m = str.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*(?:h|小时)/i);
  if (m) return Math.round(parseFloat(m[2] || m[1]) * 60);
  m = str.match(/(\d+)\s*分钟/);
  if (m) return parseInt(m[1], 10);
  m = str.match(/(\d+(?:\.\d+)?)\s*(?:h|小时)/i);
  if (m) return Math.round(parseFloat(m[1]) * 60);
  if (/半天|半日/.test(str)) return 180;
  if (/全天|一日|一天|全日/.test(str)) return 360;
  m = str.match(/(\d+)/);
  if (m) return parseInt(m[1], 10);
  return 60;
}

// 行程时间轴核心算法（自助端预览 + 确认单 docx 共用，唯一实现，消除两份漂移）
function buildFlow(s) {
  const slot = (s && s.timeSlot) || '上午';
  let mins = (slot === '下午') ? 13 * 60 + 30 : 9 * 60;
  const nodes = [];
  const fmt = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  const add = (dur, title, place, type) => {
    const from = mins;
    const to = mins + dur;
    const time = dur > 0 ? (fmt(from) + ' - ' + fmt(to)) : fmt(from);
    if (dur > 0) mins = to;
    nodes.push({ time, title, place: place || '时空中心', type });
  };
  add(20, '到达华大时空中心，集合签到', '盐田大梅沙', 'arrive');
  add(40, '参观华大时空中心（一楼 / 中庭 / 五楼）', '时空中心', 'visit');
  const ids = (s && s.courses) || [];
  const courses = (typeof getCourseById === 'function')
    ? ids.map((id) => getCourseById(id)).filter(Boolean)
    : [];
  let lunchDone = false;
  courses.forEach((c) => {
    // 午餐安排在 11:30-13:30 窗口内的合适时间（随课程自然落入，不固定）
    if (s.lunch && !lunchDone && mins >= 11 * 60 + 30) {
      add(60, '午餐 · 休息', '时空中心餐厅', 'lunch');
      lunchDone = true;
    }
    let verb = '活动';
    if (c.category === 'experiment') verb = '实验';
    else if (c.category === 'visit') verb = '参观';
    else if (c.category === 'lecture') verb = '讲座';
    add(parseDurationMin(c.duration), verb + '：' + c.title, '时空中心', 'course');
  });
  if (s.lunch && !lunchDone) {
    // 课程都在 11:30 前结束，午餐安排在窗口起点 11:30（兜底，保证落在范围内）
    nodes.push({ time: '11:30 - 12:30', title: '午餐 · 休息', place: '时空中心餐厅', type: 'lunch' });
    mins = 12 * 60 + 30;
  }
  add(0, '活动结束，安全返程', '时空中心', 'end');
  return nodes;
}
