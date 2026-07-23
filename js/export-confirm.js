/*
 * export-confirm.js — 一键导出「研学活动确认单」(Word .docx)
 * 参考模板：研学活动确认单模板.docx
 * 依赖：本地 vendor 的 docx (window.docx) 与 file-saver (window.saveAs)
 * 仅销售(sales)角色使用，按钮在 admin.js 中按 isSales() 控制显隐
 */
(function () {
  'use strict';

  const FONT = '宋体';

  // ---------- 工具函数 ----------

  // 2026-07-15 -> 2026 年 7 月 15 日
  function cnDate(dateStr) {
    if (dateStr && /^\d{4}-\d{1,2}-\d{1,2}/.test(dateStr)) {
      const parts = dateStr.split('-');
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      const d = parseInt(parts[2], 10);
      if (y && m && d) return `${y} 年 ${m} 月 ${d} 日`;
    }
    const t = new Date();
    return `${t.getFullYear()} 年 ${t.getMonth() + 1} 月 ${t.getDate()} 日`;
  }

  // 时段 -> 时间区间
  function timeRange(slot) {
    if (slot === '上午') return '09:00 - 12:00';
    if (slot === '下午') return '13:30 - 18:00';
    return slot || '—';
  }
  function startTime(slot) {
    if (slot === '上午') return '09:00';
    if (slot === '下午') return '13:30';
    return '09:00';
  }

  // HH:MM + 分钟 -> HH:MM
  function addMinutes(hhmm, mins) {
    const parts = (hhmm || '09:00').split(':');
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    let total = h * 60 + m + mins;
    total = ((total % 1440) + 1440) % 1440;
    const nh = Math.floor(total / 60), nm = total % 60;
    return String(nh).padStart(2, '0') + ':' + String(nm).padStart(2, '0');
  }

  // "1-1.5h" / "全日（6h）" / "90-120分钟" / "2h" -> 分钟（取上限）
  function parseDurationMin(str) {
    if (!str) return 60;
    let m = str.match(/(\d+)\s*(?:-\s*(\d+))?\s*分钟/);
    if (m) return parseInt(m[2] || m[1], 10);
    m = str.match(/(\d+(?:\.\d+)?)\s*(?:-\s*(\d+(?:\.\d+)?))?\s*(?:h|小时)/i);
    if (m) return Math.round(parseFloat(m[2] || m[1]) * 60);
    return 60;
  }

  // 文件名清洗
  function safeName(str) {
    return (str || '机构').replace(/[\\/:*?"<>|]/g, '_').slice(0, 30);
  }

  // ---------- docx 构造辅助 ----------
  function para(text, opts) {
    opts = opts || {};
    const D = window.docx;
    return new D.Paragraph({
      alignment: opts.align || D.AlignmentType.LEFT,
      spacing: opts.spacing || { before: 0, after: 120, line: 320 },
      indent: opts.indent ? { firstLine: 420 } : undefined,
      children: [new D.TextRun({
        text: text || '',
        bold: !!opts.bold,
        size: opts.size || 24,
        font: FONT,
      })],
    });
  }

  function heading(text, size) {
    const D = window.docx;
    return new D.Paragraph({
      spacing: { before: 200, after: 100, line: 320 },
      children: [new D.TextRun({ text: text, bold: true, size: size || 24, font: FONT })],
    });
  }

  function title(text) {
    const D = window.docx;
    return new D.Paragraph({
      alignment: D.AlignmentType.CENTER,
      spacing: { before: 0, after: 240, line: 320 },
      children: [new D.TextRun({ text: text, bold: true, size: 36, font: '黑体' })],
    });
  }

  function cellBorder(D) {
    return {
      style: D.BorderStyle.SINGLE,
      size: 4,
      color: '999999',
    };
  }

  function cell(text, opts) {
    opts = opts || {};
    const D = window.docx;
    return new D.TableCell({
      borders: {
        top: cellBorder(D), bottom: cellBorder(D),
        left: cellBorder(D), right: cellBorder(D),
        insideHorizontal: cellBorder(D), insideVertical: cellBorder(D),
      },
      width: opts.width ? { size: opts.width, type: D.WidthType.PERCENTAGE } : undefined,
      shading: opts.shading ? { fill: opts.shading } : undefined,
      margins: { top: 60, bottom: 60, left: 80, right: 80 },
      children: [new D.Paragraph({
        alignment: opts.align || D.AlignmentType.LEFT,
        spacing: { before: 0, after: 0, line: 260 },
        children: [new D.TextRun({
          text: text == null ? '' : String(text),
          bold: !!opts.bold,
          size: opts.size || 21,
          font: FONT,
        })],
      })],
    });
  }

  function headerCell(text, width) {
    return cell(text, { bold: true, width: width, size: 21, align: window.docx.AlignmentType.CENTER, shading: 'E8EEF7' });
  }

  // 生成流程表数据（与 docx / HTML 预览共用；复用公共 buildFlow，保证与自助端一致）
  function computeFlowRowsData(s) {
    const nodes = (typeof buildFlow === 'function') ? buildFlow(s) : [];
    const rows = [['时间', '行程内容', '地点']];
    nodes.forEach(function (n) {
      rows.push([n.time, n.title, n.place || '时空中心']);
    });
    return rows;
  }

  // 生成流程表行（docx 版，消费 computeFlowRowsData）
  function buildFlowRows(s, D) {
    const data = computeFlowRowsData(s);
    return data.map(function (r, i) {
      if (i === 0) {
        return new D.TableRow({
          children: [headerCell('时间', 22), headerCell('行程内容', 50), headerCell('地点', 28)],
        });
      }
      return new D.TableRow({
        children: [
          cell(r[0], { align: D.AlignmentType.CENTER }),
          cell(r[1]),
          cell(r[2] || '时空中心', { align: D.AlignmentType.CENTER }),
        ],
      });
    });
  }

  // 类别中文名
  function catName(cat) {
    if (cat === 'experiment') return '实验';
    if (cat === 'visit') return '参观';
    if (cat === 'lecture') return '讲座';
    return '活动';
  }

  // 生成费用表数据（与 docx / HTML 预览共用，保证一致）
  function computeCostRowsData(s) {
    const rows = [];
    const people = parseInt(s.people, 10) || 0;
    const city = s.city || '深圳';
    let sum = 0;
    let idx = 0;

    // 各课程分项
    (s.courses || []).forEach(function (id) {
      const c = (typeof getCourseById === 'function') ? getCourseById(id) : null;
      if (!c) return;
      idx++;
      let unit = 0, unitLabel = '—', sub = 0, subLabel = '—';
      if (typeof c.price === 'number') {
        unit = (typeof getEffectivePrice === 'function') ? getEffectivePrice(c, city) : c.price;
        sub = unit * people;
        unitLabel = String(unit);
        subLabel = sub.toLocaleString();
        sum += sub;
      } else {
        unitLabel = String(c.price || '待定');
        subLabel = '待定';
      }
      rows.push({ idx: String(idx), title: c.title || '—', cat: catName(c.category), unit: unitLabel, people: String(people), sub: subLabel });
    });

    // 午餐分项
    if (s.lunch) {
      idx++;
      const lunchUnit = (typeof LUNCH !== 'undefined' && typeof LUNCH.price === 'number') ? LUNCH.price : 30;
      const lunchSub = (Number(s.lunchTotal) || (lunchUnit * people));
      sum += lunchSub;
      rows.push({ idx: String(idx), title: '午餐服务（两荤两素 + 饮料）', cat: '餐饮', unit: String(lunchUnit), people: String(people), sub: lunchSub.toLocaleString() });
    }

    const total = Number(s.total) || sum;
    return { rows: rows, total: total };
  }

  // 生成费用表行（docx 版，消费 computeCostRowsData）
  function buildCostRows(s, D) {
    const C = D.AlignmentType.CENTER;
    const data = computeCostRowsData(s);
    const rows = [];
    rows.push(new D.TableRow({
      children: [
        headerCell('序号', 8), headerCell('项目', 40), headerCell('类别', 12),
        headerCell('单价(元/人)', 15), headerCell('人数', 10), headerCell('小计(元)', 15),
      ],
    }));
    data.rows.forEach(function (r) {
      rows.push(new D.TableRow({
        children: [
          cell(r.idx, { align: C }),
          cell(r.title),
          cell(r.cat, { align: C }),
          cell(r.unit, { align: C }),
          cell(r.people, { align: C }),
          cell(r.sub, { align: C }),
        ],
      }));
    });
    // 合计行（前5列合并为一格标签 + 金额）
    rows.push(new D.TableRow({
      children: [
        new D.TableCell({
          columnSpan: 5,
          borders: { top: cellBorder(D), bottom: cellBorder(D), left: cellBorder(D), right: cellBorder(D) },
          margins: { top: 60, bottom: 60, left: 80, right: 80 },
          shading: { fill: 'F5F7FA' },
          children: [new D.Paragraph({
            alignment: D.AlignmentType.RIGHT,
            spacing: { before: 0, after: 0, line: 260 },
            children: [new D.TextRun({ text: '合计', bold: true, size: 21, font: FONT })],
          })],
        }),
        cell('¥ ' + data.total.toLocaleString(), { align: C, bold: true, shading: 'F5F7FA' }),
      ],
    }));
    return rows;
  }

  // ---------- 组装文档 ----------
  function buildDocument(s, exporter) {
    const D = window.docx;
    const children = [];
    exporter = exporter || {};

    children.push(title('深圳市华大教育中心活动确认单'));
    children.push(para('深圳市华大教育中心为 ' + (s.org || '【学校全称】') + ' 组织学生及家长订制科普活动一事，现双方达成如下共识：', { indent: true }));

    children.push(heading('一、活动单位：' + (s.org || '—')));
    children.push(heading('二、活动人数：' + (parseInt(s.people, 10) || 0) + ' 人'));
    children.push(heading('三、活动时间：' + cnDate(s.date) + '    ' + timeRange(s.timeSlot)));
    children.push(heading('四、活动地点：'));
    children.push(para('1、华大时空中心：广东省深圳市盐田区梅沙街道云华路9号', { indent: true }));
    let otherVenue = '其他活动地点（如有）：详细地址';
    if (s.venue) {
      otherVenue = getVenueName(s.venue) + (s.venueAddr ? '：' + s.venueAddr : '：详细地址');
    }
    children.push(para('2、' + otherVenue, { indent: true }));

    children.push(heading('五、活动具体流程：'));
    children.push(new D.Table({ width: { size: 100, type: D.WidthType.PERCENTAGE }, rows: buildFlowRows(s, D) }));
    children.push(para('注：以上活动流程仅供参考，具体安排请以当日老师安排为准！！！', { size: 21 }));

    children.push(heading('六、活动费用：'));
    children.push(new D.Table({ width: { size: 100, type: D.WidthType.PERCENTAGE }, rows: buildCostRows(s, D) }));

    children.push(heading('七、付款方式：'));
    children.push(para('请通过银行转账方式（信息如下）付清活动费用：', { indent: true }));
    children.push(para('名称：深圳市华大教育中心', { indent: true }));
    children.push(para('银行账号：4000025509200144415', { indent: true }));
    children.push(para('开户银行：中国工商银行深圳保税区支行', { indent: true }));

    children.push(heading('八、付款说明'));
    children.push(para('1. 请至少于活动开始前15个工作日，根据实际参与人数，支付全部活动款。', { indent: true }));
    children.push(para('2. 本活动如出现人数上的变动，请至少提前30个工作日通知我们。未按时通知的变动（含取消），活动费用正常收取不予退还。未按期支付活动费用的，视为取消。', { indent: true }));
    children.push(para('3. 为保证活动的顺利进行，希望以上内容能得到您的认可，并签字回传给我们以便确认。', { indent: true }));

    // 落款（署名为导出该确认单的销售本人）
    children.push(para(''));
    children.push(para('深圳市华大教育中心', { align: D.AlignmentType.LEFT, bold: true }));
    children.push(para('联系人：' + (exporter.name || s.name || '【联系人】')));
    children.push(para('电话：' + (exporter.phone || '19320582026')));
    children.push(para('日期：' + cnDate(new Date().toLocaleDateString('sv-SE'))));

    return new D.Document({
      creator: '华大教育研学管理系统',
      title: '研学活动确认单',
      sections: [{
        properties: {
          page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } },
        },
        children: children,
      }],
    });
  }

  // ---------- 预览 HTML（与 docx 共用数据，保证一致） ----------
  function esc(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function tableHtml(headers, rows, totalCells) {
    const h = '<tr>' + headers.map(function (x) { return '<th>' + esc(x) + '</th>'; }).join('') + '</tr>';
    let b = '';
    rows.forEach(function (r) {
      b += '<tr>' + r.map(function (c) { return '<td>' + esc(c) + '</td>'; }).join('') + '</tr>';
    });
    if (totalCells) {
      b += '<tr class="cf-total-row"><td colspan="' + totalCells[0] + '" class="cf-total-label">' + esc(totalCells[1]) + '</td><td>' + esc(totalCells[2]) + '</td></tr>';
    }
    return '<table class="cf-table"><thead>' + h + '</thead><tbody>' + b + '</tbody></table>';
  }

  // 生成确认单预览 HTML（供后台弹窗预览）
  function previewHtml(s, exporter) {
    exporter = exporter || {};
    const flow = computeFlowRowsData(s);
    const flowHeaders = flow[0];
    const flowRows = flow.slice(1);
    const cost = computeCostRowsData(s);
    const costHeaders = ['序号', '项目', '类别', '单价(元/人)', '人数', '小计(元)'];
    const costRows = cost.rows.map(function (r) { return [r.idx, r.title, r.cat, r.unit, r.people, r.sub]; });

    let otherVenue = '其他活动地点（如有）：详细地址';
    if (s.venue) {
      otherVenue = getVenueName(s.venue) + (s.venueAddr ? '：' + s.venueAddr : '：详细地址');
    }

    return [
      '<div class="confirm-preview">',
      '<h2 class="cf-title">深圳市华大教育中心活动确认单</h2>',
      '<p class="cf-intro">深圳市华大教育中心为 <strong>' + esc(s.org || '【学校全称】') + '</strong> 组织学生及家长订制科普活动一事，现双方达成如下共识：</p>',
      '<h3>一、活动单位：' + esc(s.org || '—') + '</h3>',
      '<h3>二、活动人数：' + (parseInt(s.people, 10) || 0) + ' 人</h3>',
      '<h3>三、活动时间：' + cnDate(s.date) + '　' + timeRange(s.timeSlot) + '</h3>',
      '<h3>四、活动地点：</h3>',
      '<p>1、华大时空中心：广东省深圳市盐田区梅沙街道云华路9号</p>',
      '<p>2、' + esc(otherVenue) + '</p>',
      '<h3>五、活动具体流程：</h3>',
      tableHtml(flowHeaders, flowRows),
      '<p class="cf-note">注：以上活动流程仅供参考，具体安排请以当日老师安排为准！！！</p>',
      '<h3>六、活动费用：</h3>',
      tableHtml(costHeaders, costRows, [5, '合计', '¥ ' + cost.total.toLocaleString()]),
      '<h3>七、付款方式：</h3>',
      '<p>请通过银行转账方式（信息如下）付清活动费用：</p>',
      '<p>名称：深圳市华大教育中心</p>',
      '<p>银行账号：4000025509200144415</p>',
      '<p>开户银行：中国工商银行深圳保税区支行</p>',
      '<h3>八、付款说明</h3>',
      '<p>1. 请至少于活动开始前15个工作日，根据实际参与人数，支付全部活动款。</p>',
      '<p>2. 本活动如出现人数上的变动，请至少提前30个工作日通知我们。未按时通知的变动（含取消），活动费用正常收取不予退还。未按期支付活动费用的，视为取消。</p>',
      '<p>3. 为保证活动的顺利进行，希望以上内容能得到您的认可，并签字回传给我们以便确认。</p>',
      '<div class="cf-sign">',
      '<p>深圳市华大教育中心</p>',
      '<p>联系人：' + esc(exporter.name || s.name || '【联系人】') + '</p>',
      '<p>电话：' + esc(exporter.phone || '19320582026') + '</p>',
      '<p>日期：' + cnDate(new Date().toLocaleDateString('sv-SE')) + '</p>',
      '</div>',
      '</div>',
    ].join('');
  }

  // ---------- 对外导出 ----------
  async function download(submission, exporter) {
    if (typeof window.docx === 'undefined') {
      throw new Error('Word 生成库未加载（docx.umd.js）');
    }
    if (!submission) throw new Error('未找到报名记录');

    const doc = buildDocument(submission, exporter);
    const blob = await window.docx.Packer.toBlob(doc);
    const filename = '研学活动确认单_' + safeName(submission.org) + '_' + (submission.date || '') + '.docx';
    if (typeof window.saveAs === 'function') {
      window.saveAs(blob, filename);
    } else {
      // 兜底下载
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
    return filename;
  }

  window.ExportConfirm = { download: download, previewHtml: previewHtml, cnDate: cnDate };
})();
