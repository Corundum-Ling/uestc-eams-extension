/**
 * EAMS 优化版 v2 — Content Script
 *
 * 纯注入方案：拦截 EAMS 页面，用优化 UI 完全替换。
 * 数据通过 fetch EAMS HTML 端点 + DOM 解析获取。
 */
(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════
  //  配置常量
  // ═══════════════════════════════════════════════════════════

  const CONFIG = {
    semesterBase: 483,        // 2025-2026 第一学期 ID
    semesterStep: 20,         // 每学期偏移
    yearBase: 2025,
    maxScheduleWait: 20000,   // 课表最大等待时间(ms)，EAMS 解密可能需要较长时间
    pollInterval: 200,        // 轮询间隔(ms)
    days: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
    examTypes: { '1': '期末考试', '2': '期中考试', '3': '补缓考' },
  };

  // 周次显示标记
  const W = { CONTINUOUS: '连', ODD: '单', EVEN: '双' };

  // ═══════════════════════════════════════════════════════════
  //  暗色主题管理器（全局，所有页面通用）
  // ═══════════════════════════════════════════════════════════

  (function initTheme() {
    try {
      if (localStorage.getItem('eams-theme') === 'dark') {
        document.documentElement.setAttribute('data-eams-theme', 'dark');
      }
    } catch { /* localStorage 不可用 */ }
  })();

  // 暗色切换逻辑（供事件委托和逻辑调用）
  function toggleEAMSTheme() {
    const root = document.documentElement;
    const next = root.getAttribute('data-eams-theme') === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-eams-theme', next);
    try { localStorage.setItem('eams-theme', next); } catch {}
  }

  // 事件委托：监听 .eams-theme-btn 点击（不需要 onclick 属性）
  document.addEventListener('click', function (e) {
    const btn = e.target.closest('.eams-theme-btn');
    if (btn) toggleEAMSTheme();
  });

  // ═══════════════════════════════════════════════════════════
  //  调试日志
  // ═══════════════════════════════════════════════════════════

  const DBG = (tag, msg, data) => {
    console.log(`[EAMS-DBG][${tag}] ${msg}`, data !== undefined ? data : '');
  };


  // ═══════════════════════════════════════════════════════════
  //  学期工具
  // ═══════════════════════════════════════════════════════════

  const Semester = {
    /** 从 URL / Cookie / 日期推断当前学期 ID */
    getId() {
      const p = new URLSearchParams(window.location.search);
      const fromUrl = p.get('semesterId') || p.get('semester.id');
      if (fromUrl) return fromUrl;

      for (const c of document.cookie.split(';')) {
        const [k, v] = c.trim().split('=');
        if (k === 'semester.id' && v) return v;
      }

      const now = new Date(), m = now.getMonth() + 1, y = now.getFullYear();
      let ay, first;
      if (m >= 9) { ay = y; first = true; }
      else if (m >= 2) { ay = y - 1; first = false; }
      else { ay = y - 1; first = true; }
      return String(
        CONFIG.semesterBase +
        (ay - CONFIG.yearBase) * (CONFIG.semesterStep * 2) +
        (first ? 0 : CONFIG.semesterStep)
      );
    },

    /** 获取可选学期列表（前后各若干学期） */
    getList() {
      const cur = parseInt(Semester.getId());
      return Array.from({ length: 7 }, (_, i) => cur + (i - 4) * CONFIG.semesterStep)
        .filter(id => id >= CONFIG.semesterBase - 80)
        .map(id => ({ id: String(id), name: Semester.getLabel(id) }));
    },

    /** 学期 ID → 中文名 */
    getLabel(id) {
      const n = parseInt(id) - CONFIG.semesterBase;
      const y = CONFIG.yearBase + Math.floor(n / (CONFIG.semesterStep * 2));
      const first = (n % (CONFIG.semesterStep * 2)) < CONFIG.semesterStep;
      return first ? `${y}-${y + 1} 第一学期` : `${y}-${y + 1} 第二学期`;
    },

    /** 学期选项 HTML */
    optionsHTML(selectedId) {
      return Semester.getList()
        .map(s => `<option value="${s.id}"${s.id === selectedId ? ' selected' : ''}>${s.name}</option>`)
        .join('');
    },
  };


  // ═══════════════════════════════════════════════════════════
  //  课表 API — 工具 / 状态管理
  // ═══════════════════════════════════════════════════════════

  const ScheduleState = {
    STORAGE_KEY: 'eams_opt_schedule',
    IDS_KEY: 'eams_opt_ids',

    /** 按课表类型保存 ids */
    _idsKey(kind) { return `${this.IDS_KEY}_${kind}`; },

    /** 从 sessionStorage 读取持久化的选择器状态 */
    load() {
      try {
        const raw = sessionStorage.getItem(this.STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch { return null; }
    },

    /** 保存选择器状态到 sessionStorage */
    save(state) {
      try { sessionStorage.setItem(this.STORAGE_KEY, JSON.stringify(state)); } catch { /* noop */ }
    },

    /** 保存某种课表类型的 ids 到 localStorage（跨会话持久化） */
    saveIds(ids, kind) {
      if (!ids) return;
      const key = this._idsKey(kind || 'std');
      try { localStorage.setItem(key, ids); } catch { /* noop */ }
      DBG('STATE', `ids 已保存 ${key}=${ids}`);
    },

    /** 获取某种课表类型的 ids */
    getIds(kind) {
      const k = kind || 'std';
      const key = this._idsKey(k);
      try {
        const saved = localStorage.getItem(key);
        if (saved) return saved;
      } catch { /* noop */ }
      try {
        const saved = sessionStorage.getItem(key);
        if (saved) { this.saveIds(saved, k); return saved; }
      } catch { /* noop */ }
      return k === 'class' ? '10628' : '197375';
    },

    /** 从当前页面表单提取 ids 并按当前课表类型保存 */
    captureIdsFromForm(kind) {
      const ids = extractIdsFromForms();
      if (ids) { this.saveIds(ids, kind); return ids; }
      return null;
    },

    /** 多途径搜索 ids：表单 → cookie → 脚本变量 → link URL */
    extractIdsFromPage() {
      DBG('IDS', '===== 开始搜索 ids =====');

      // 1. form input
      for (const el of document.querySelectorAll('form input[name="ids"]')) {
        DBG('IDS', `表单 input[name="ids"]: "${el.value}"`);
        if (el.value) return el.value;
      }

      // 2. 所有 form 的所有 input name
      const forms = document.querySelectorAll('form');
      DBG('IDS', `页面中共 ${forms.length} 个 form`);
      for (const f of forms) {
        for (const inp of f.querySelectorAll('input')) {
          if (inp.name && inp.value) {
            DBG('IDS', `  form input: ${inp.name}=${inp.value.substring(0, 50)}`);
          }
        }
      }

      // 3. 所有 script 标签中搜 ids 或学生 ID 相关变量
      const scripts = document.querySelectorAll('script');
      DBG('IDS', `搜索 ${scripts.length} 个 script 标签中的 ids/student/userId...`);
      for (const s of scripts) {
        const t = (s.textContent || '').substring(0, 2000);
        if (/ids\s*[:=]\s*['"]?\d+['"]?/.test(t) || /studentId\s*[:=]/.test(t) || /userId\s*[:=]/.test(t) || /personId\s*[:=]/.test(t)) {
          DBG('IDS', `  找到疑似 ids 的脚本片段:`, t.substring(0, 200));
        }
      }

      // 4. cookie
      DBG('IDS', `Cookies: ${document.cookie}`);

      // 5. URL 参数
      DBG('IDS', `URL: ${window.location.href}`);

      // 6. 找页面中所有 numeric id 类的链接
      for (const a of document.querySelectorAll('a[href*="ids="]')) {
        DBG('IDS', `链接含 ids: ${a.href}`);
      }
      for (const a of document.querySelectorAll('a[href*="person"]')) {
        DBG('IDS', `链接含 person: ${a.href.substring(0, 150)}`);
      }

      DBG('IDS', '===== ids 搜索结束 =====');
      return null;
    },

    /** 从原页面隐藏表单读取当前选择器值，降级到 sessionStorage，再降级到默认 */
    detect() {
      // 1. 从原页面 form input 读取（页面刚加载时仍可用）
      const inputs = document.querySelectorAll('form input');
      let sid = '', kind = 'std', week = '', ids = '';
      DBG('STATE', `原页面 form input 数量: ${inputs.length}`);
      for (const el of inputs) {
        if (el.name === 'semester.id') sid = el.value;
        if (el.name === 'setting.kind') kind = el.value;
        if (el.name === 'startWeek') week = el.value;
        if (el.name === 'ids') ids = el.value;
      }
      DBG('STATE', `步骤1(表单): sid=${sid}, kind=${kind}, week=${week}, ids=${ids}`);

      // 捕获当前页面的 ids 并保存到对应课表类型
      if (ids) this.saveIds(ids, kind || 'std');

      // 2. 降级到 sessionStorage
      if (!sid) {
        const saved = this.load();
        DBG('STATE', `步骤2(sessionStorage): ${JSON.stringify(saved)}`);
        if (saved) { sid = saved.sid; kind = saved.kind; week = saved.week; }
      }

      // 3. 最终降级
      const result = {
        sid: sid || Semester.getId(),
        kind: kind || 'std',
        week: week || '',
      };
      DBG('STATE', `步骤3(最终): ${JSON.stringify(result)}`);
      return result;
    },
  };


  // ═══════════════════════════════════════════════════════════
  //  周数算法 —— 将 53 位二进制字符串转为中文描述
  //
  //  输入：'0111111111111...' 形式的周数字符串
  //    每连续两位为一组：(i, i+1) 的取值决定该位置的模式
  //      '01' = 单双周起始  '11' = 连续周
  //  输出：'连1-8,单9-17' 或 '双2-16' 等格式
  //  逻辑：原版 EAMS Java 算法的直译，保持输出完全兼容
  // ═══════════════════════════════════════════════════════════

  const WeekParser = {
    /** 主入口：将二进制周数字符串转为中文周数描述 */
    format(weeks) {
      if (!weeks || weeks.length < 2) return '';
      return this._marshal(weeks, 1, 1, 20);
    },

    _marshal(wo, from, startWeek, endWeek) {
      if (!wo || !wo.includes('1')) return '';

      const origLen = wo.length;

      // 偏移处理：如果 from>1 且前半段有 1，做 wrap
      if (from > 1) {
        const before = wo.substring(0, from - 1);
        if (before.includes('1')) wo += before;
      }

      // 截取 [startWeek, endWeek] 范围
      let tmp = '0'.repeat(from + startWeek - 2);
      tmp += wo.substring(from + startWeek - 2, from + endWeek - 1);
      tmp += '0'.repeat(Math.max(0, origLen - wo.length));
      wo = tmp;

      if (endWeek > wo.length) endWeek = wo.length;
      if (!wo.includes('1')) return '';

      // 末尾补 3 个 '0' 作为哨兵
      wo += '000';

      const parts = [];
      let pos = wo.indexOf('1');
      let safety = 0;

      while (pos < wo.length && safety < 200) {
        safety++;
        const next = wo.charAt(pos + 1);
        if (next === '0') {
          const r = this._scanOdd(wo, from, pos);
          parts.push(r.label);
          pos = r.next;
        } else if (next === '1') {
          const r = this._scanContinuous(wo, from, pos);
          parts.push(r.label);
          pos = r.next;
        } else {
          // 非二进制格式（如 "1-16周"），跳过
          break;
        }
        while (pos < wo.length && wo.charAt(pos) !== '1') pos++;
      }

      return parts.join(',');
    },

    /** 扫描单/双周模式（隔周有课） */
    _scanOdd(wo, from, start) {
      const isEvenStart = ((start - from + 2) % 2 === 0);
      let i = start + 2;
      for (; i < wo.length; i += 2) {
        if (wo.charAt(i) === '1') {
          if (wo.charAt(i + 1) === '1') {
            const b = start - from + 2;
            const e = i - 2 - from + 2;
            return { label: this._rangeLabel(isEvenStart ? W.ODD : W.EVEN, b, e), next: i };
          }
        } else {
          const b = start - from + 2;
          const e = i - 2 - from + 2;
          if (i - 2 === start) {
            return { label: this._rangeLabel(W.CONTINUOUS, b, e), next: i + 1 };
          }
          return { label: this._rangeLabel(isEvenStart ? W.ODD : W.EVEN, b, e), next: i + 1 };
        }
      }
      // 哨兵确保不会走到这里
      return { label: '', next: i };
    },

    /** 扫描连续周模式（每周有课） */
    _scanContinuous(wo, from, start) {
      let i = start + 2;
      for (; i < wo.length; i += 2) {
        if (wo.charAt(i) === '1') {
          if (wo.charAt(i + 1) !== '1') {
            const b = start - from + 2;
            const e = i - from + 2;
            return { label: this._rangeLabel(W.CONTINUOUS, b, e), next: i + 2 };
          }
        } else {
          const b = start - from + 2;
          const e = i - 1 - from + 2;
          return { label: this._rangeLabel(W.CONTINUOUS, b, e), next: i + 1 };
        }
      }
      // 哨兵确保不会走到这里
      return { label: '', next: i };
    },

    /** 生成单段周数标记（如 '连1-16', '单3-17'） */
    _rangeLabel(cycle, begin, end) {
      // 原版算法：begin/end 减 1 后才是正确的显示周数
      const b = begin - 1;
      const e = end - 1;
      if (b === e) return String(b);
      if (cycle === W.CONTINUOUS && b === e - 1) return `${b}-${e}`;  // 相邻连续周不显示"连"
      return cycle + b + '-' + e;
    },

    /** 合并两个周数字符串（OR 操作） */
    merge(a, b) {
      if (!a) return b || '';
      if (!b) return a;
      const len = Math.max(a.length, b.length);
      let r = '';
      for (let i = 0; i < len; i++) {
        r += ((i < a.length ? a.charAt(i) : '0') === '1' ||
              (i < b.length ? b.charAt(i) : '0') === '1') ? '1' : '0';
      }
      return r;
    },
  };


  // ═══════════════════════════════════════════════════════════
  //  GPA 计算
  // ═══════════════════════════════════════════════════════════

  const GPA = {
    calc(grades, exclude) {
      let totalCredits = 0, totalPoints = 0;
      for (let i = 0; i < grades.length; i++) {
        if (exclude && exclude.has(i)) continue;
        const c = parseFloat(grades[i].credits) || 0;
        const p = parseFloat(grades[i].gpa) || 0;
        totalCredits += c;
        totalPoints += c * p;
      }
      return {
        totalCredits,
        avgGPA: totalCredits > 0 ? (totalPoints / totalCredits).toFixed(2) : '-',
      };
    },

    weightedAvg(grades, exclude) {
      let totalCredits = 0, weightedSum = 0;
      for (let i = 0; i < grades.length; i++) {
        if (exclude && exclude.has(i)) continue;
        const s = parseFloat(grades[i].totalScore);
        if (isNaN(s)) continue;
        const c = parseFloat(grades[i].credits) || 0;
        totalCredits += c;
        weightedSum += c * s;
      }
      return totalCredits > 0 ? (weightedSum / totalCredits).toFixed(2) : '-';
    },
  };


  // ═══════════════════════════════════════════════════════════
  //  数据获取 —— 从 EAMS HTML 端点解析数据
  // ═══════════════════════════════════════════════════════════

  const DataFetcher = {
    /** 获取成绩列表（含平时成绩合并） */
    async grades(sid) {
      const [gradesHtml, usualHtml] = await Promise.all([
        fetch(`/eams/teach/grade/course/person!search.action?semesterId=${sid}&projectType=&_=${Date.now()}`, { headers: { 'X-Requested-With': 'XMLHttpRequest' } }).then(r => r.text()),
        fetch(`/eams/teach/grade/usual/usual-grade-std!search.action?semester.id=${sid}&_=${Date.now()}`, { headers: { 'X-Requested-With': 'XMLHttpRequest' } }).then(r => r.text()).catch(() => ''),
      ]);

      const doc = new DOMParser().parseFromString(gradesHtml, 'text/html');
      const grades = [];
      for (const row of doc.querySelectorAll('tbody tr')) {
        if (row.querySelector('th')) continue;
        const cols = row.querySelectorAll('td');
        if (cols.length < 11) continue;
        const name = (cols[3]?.textContent || '').trim().replace(/ /g, '');
        if (!name) continue;
        grades.push({
          courseCode: (cols[1]?.textContent || '').trim(),
          courseName: name,
          courseType: (cols[4]?.textContent || '').trim(),
          credits: (cols[5]?.textContent || '').trim(),
          finalExam: (cols[6]?.textContent || '').trim(),
          totalScore: (cols[7]?.textContent || '').trim(),
          gpa: (cols[10]?.textContent || '').trim(),
          usualScore: '',
          usualLessonId: '',
          usualCourseNumber: '',
        });
      }

      if (usualHtml) {
        const uDoc = new DOMParser().parseFromString(usualHtml, 'text/html');
        const uMap = {};
        for (const r of uDoc.querySelectorAll('table tr')) {
          const cols = r.querySelectorAll('td');
          if (cols.length < 8) continue;
          const code = (cols[1]?.textContent || '').trim();
          const courseNumber = (cols[2]?.textContent || '').trim();
          const courseName = (cols[3]?.textContent || '').trim().replace(/ /g, '');
          const courseType = (cols[4]?.textContent || '').trim();
          const credits = (cols[5]?.textContent || '').trim();
          const score = (cols[6]?.textContent || '').trim();
          if (!code || !score) continue;
          const link = cols[7]?.querySelector('a');
          const lessonId = link?.href?.match(/lessonId=(\d+)/)?.[1] || '';
          uMap[code] = { score, lessonId, courseNumber, courseName, courseType, credits };
        }
        const seenCodes = new Set();
        for (const g of grades) {
          if (g.courseCode && uMap[g.courseCode]) {
            g.usualScore = uMap[g.courseCode].score;
            g.usualLessonId = uMap[g.courseCode].lessonId;
            g.usualCourseNumber = uMap[g.courseCode].courseNumber;
          }
          if (g.courseCode) seenCodes.add(g.courseCode);
        }
        // 补充：只有平时成绩但期末还没出的课程
        for (const [code, info] of Object.entries(uMap)) {
          if (!seenCodes.has(code) && info.courseName) {
            grades.push({
              courseCode: code,
              courseName: info.courseName,
              courseType: info.courseType || '',
              credits: info.credits || '',
              finalExam: '',
              totalScore: '',
              gpa: '',
              usualScore: info.score,
              usualLessonId: info.lessonId,
              usualCourseNumber: info.courseNumber || '',
            });
          }
        }
      }

      return grades;
    },

    /** 获取考试列表 */
    async exams(sid, etype) {
      const url = `/eams/stdExamTable!examTable.action?semester.id=${sid}&examType.id=${etype}&_=${Date.now()}`;
      const html = await fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' } }).then(r => r.text());
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const exams = [];
      for (const row of doc.querySelectorAll('table tr')) {
        const cols = row.querySelectorAll('td');
        if (cols.length < 7) continue;
        if (row.getAttribute('bgcolor') === '#C7DBFF') continue;
        const cn = (cols[1]?.textContent || '').trim().replace(/ /g, '');
        if (!cn) continue;
        exams.push({
          courseName: cn,
          date: (cols[2]?.textContent || '').trim(),
          time: (cols[3]?.textContent || '').trim().replace(/\s+/g, ' '),
          classroom: (cols[4]?.textContent || '').trim(),
          seatNo: (cols[5]?.textContent || '').trim(),
          examType: (cols[7]?.textContent || '').trim(),
        });
      }
      return exams;
    },

    /** 从页面渲染后的 DOM 中读取课表数据 */
    scheduleFromPage() {
      const cells = {};
      DBG('SCHED', '===== 页面 DOM 结构诊断 =====');
      DBG('SCHED', `tables: ${document.querySelectorAll('table').length}`);
      DBG('SCHED', `divs: ${document.querySelectorAll('div').length}`);
      DBG('SCHED', `iframes: ${document.querySelectorAll('iframe').length}`);
      DBG('SCHED', `body子节点: ${document.body?.children?.length || 0}`);

      // 输出 body 的结构（前 1000 字符）
      const bodyHTML = (document.body?.innerHTML || '').substring(0, 1000);
      DBG('SCHED', `body.innerHTML 前 1000 字:`, bodyHTML);
      DBG('SCHED', '===== 诊断结束 =====');

      // 找课表表格：查找包含 TD{n}_0 格式 ID 的表格
      let table = null;
      const allTables = document.querySelectorAll('table');
      for (const tbl of allTables) {
        if (tbl.querySelector('td[id^="TD"]')) {
          const td = tbl.querySelector('td[id^="TD"]');
          if (/^TD\d+_\d+$/.test(td.id)) {
            table = tbl;
            DBG('SCHED', `找到课表表格: id="${tbl.id}", 含 TD 格式 ID 单元格`);
            break;
          }
        }
      }

      if (!table) {
        DBG('SCHED', `未找到课表表格，共 ${allTables.length} 个 table`);
        return cells;
      }

      DBG('SCHED', `找到课表表格，id="${table.id}"`);
      const tds = table.querySelectorAll('td');
      DBG('SCHED', `表格单元格数量: ${tds.length}`);

      // 遍历所有 td，从其 id 推断位置（格式：TD{index}_{tableIndex}）
      const tdPattern = /^TD(\d+)_(\d+)$/;
      let parsedCount = 0;
      const MAX_PER_CELL = 10;
      for (const td of tds) {
        const m = td.id.match(tdPattern);
        if (!m) continue;
        const idx = parseInt(m[1]);
        const day = Math.floor(idx / 12);
        const period = idx % 12;
        if (day < 0 || day > 6 || period < 0 || period > 11) continue;

        const html = td.innerHTML.trim();
        if (!html) continue;

        // HTML 格式: "teacherName courseName<br>(周数,教室)"，多门课重复此模式
        const rawParts = html.split('<br>').map(p => p.replace(/<[^>]+>/g, '').trim()).filter(Boolean);
        if (rawParts.length === 0) continue;

        // 按每 2 部分为一组解析（teacherCourse + info），info 格式 "(周数,教室)"
        const coursesInCell = [];
        for (let pi = 0; pi + 1 < rawParts.length; pi += 2) {
          const tc = rawParts[pi] || '';
          const info = rawParts[pi + 1] || '';
          // 解析 info: "(1-16周,A301)" → weeks="1-16周", room="A301"
          const cleanInfo = info.replace(/^\(|\)$/g, '');
          const infoParts = cleanInfo.split(',');
          const weeks = infoParts[0] || '';
          const room = infoParts.slice(1).join(',') || '';
          coursesInCell.push({ courseName: tc, weeks, room });
          if (coursesInCell.length >= MAX_PER_CELL) break;
        }

        // 如果每 2 部分一组没分出课程（比如只有 1 部分），fallback：全部作为一个课程
        if (coursesInCell.length === 0) {
          coursesInCell.push({ courseName: rawParts[0], weeks: '', room: '' });
        }

        // 处理 rowSpan：EAMS 用 rowSpan 合并连续的两节课（如 1-2节）
        const rowSpan = td.rowSpan || 1;
        if (rowSpan > 1 || parsedCount < 5) {
          const firstCourse = coursesInCell[0]?.courseName || '';
          DBG('SCHED', `  TD${idx}_${m[2]}: day=${day}, period=${period}, rowSpan=${rowSpan}, ×${coursesInCell.length}课, text="${firstCourse.substring(0, 30)}"`);
        }
        for (let offset = 0; offset < rowSpan; offset++) {
          const p = period + offset;
          if (p > 11) break;
          const key = `${day}_${p}`;
          if ((cells[key] || []).length >= MAX_PER_CELL) continue;

          if (!cells[key]) cells[key] = [];
          for (const c of coursesInCell) {
            cells[key].push({
              teacherName: '',
              courseName: c.courseName,
              roomName: c.room,
              validWeeks: c.weeks,
            });
            parsedCount++;
          }
        }

        // 全局保护：最多解析 300 个非空格子
        if (parsedCount > 300) {
          DBG('SCHED', `⚠️ 达到 300 个格子上限，停止解析`);
          break;
        }
      }

      DBG('SCHED', `DOM 解析: ${parsedCount} 个非空格子, ${Object.keys(cells).length} 个位置`);

      // 验证：如果表格有很多单元格但解析出很少，可能需要不同的 id 格式
      if (tds.length > 0 && parsedCount === 0) {
        DBG('SCHED', '⚠️ 未解析到任何格子，输出前 5 个 td id 和 innerHTML:');
        let sample = 0;
        for (const td of tds) {
          if (sample >= 5) break;
          DBG('SCHED', `  td id="${td.id}" innerHTML="${td.innerHTML.substring(0, 80)}"`);
          sample++;
        }
      }

      return cells;
    },

    /** 等待课表 DOM 渲染完成后读取数据 */
    async schedule() {
      DBG('SCHED', '开始轮询等待课表表格渲染...');
      return new Promise((resolve, reject) => {
        let attempts = 0;
        const poll = setInterval(() => {
          attempts++;
          // 检查是否有包含 TD{n}_0 格式 ID 的表格（EAMS 课表渲染完成标志）
          let hasTable = false;
          for (const tbl of document.querySelectorAll('table')) {
            const td = tbl.querySelector('td[id^="TD"]');
            if (td && /^TD\d+_\d+$/.test(td.id)) { hasTable = true; break; }
          }

          if (attempts % 5 === 1) {
            DBG('SCHED', `轮询 #${attempts}: foundTable=${hasTable}`);
          }

          if (hasTable) {
            DBG('SCHED', `✅ 第 ${attempts} 次轮询(${attempts * CONFIG.pollInterval}ms) 找到课表表格`);
            clearInterval(poll);
            clearTimeout(timer);
            resolve(DataFetcher.scheduleFromPage());
            return;
          }
        }, CONFIG.pollInterval);

        const timer = setTimeout(() => {
          clearInterval(poll);
          DBG('SCHED', `❌ 轮询超时，课表表格未渲染`);
          reject(new Error('课表表格未能在规定时间内渲染'));
        }, CONFIG.maxScheduleWait);
      });
    },

    /** 直接用 fetch POST 请求课表 HTML 并解析 TaskActivity */
    async fetchScheduleData(sid, kind, week) {
      const s = sid || Semester.getId();
      const k = kind || 'std';
      const w = week || '';

      // 先试不带 ids，再试带 ids（同时包含原页面的 restrictionProjectId）
      const attempts = [
        { label: '无 ids', params: { ignoreHead: '1', 'setting.kind': k, startWeek: w, 'project.id': '1', restrictionProjectId: '1', isEng: '0', 'semester.id': s } },
        { label: '带 ids', params: { ignoreHead: '1', 'setting.kind': k, startWeek: w, 'project.id': '1', restrictionProjectId: '1', isEng: '0', 'semester.id': s, ids: ScheduleState.getIds() } },
      ];

      for (const attempt of attempts) {
        const body = new URLSearchParams(attempt.params);
        DBG('SCHED', `fetch POST (${attempt.label}): ${body.toString()}`);

        try {
          const resp = await fetch('/eams/courseTableForStd!courseTable.action', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'X-Requested-With': 'XMLHttpRequest',
            },
            body: body.toString(),
          });
          const html = await resp.text();
          DBG('SCHED', `响应(${attempt.label}): status=${resp.status}, 长度=${html.length}`);
          DBG('SCHED', `响应前 500 字:`, html.substring(0, 500));

          // 200 或 202 都算成功
          if (resp.status !== 200 && resp.status !== 202) {
            DBG('SCHED', `  非 200/202 响应，继续尝试`);
            continue;
          }

          // 检查是否包含 TaskActivity
          if (!html.includes('TaskActivity')) {
            DBG('SCHED', `  HTML 不含 TaskActivity，前 300 字:`, html.substring(0, 300));
            continue;
          }

          DBG('SCHED', `  HTML 包含 TaskActivity，开始解析`);
          const cells = DataFetcher._parseTaskActivityFromHtml(html);
          if (Object.keys(cells).length > 0) {
            DBG('SCHED', `✅ ${attempt.label} 成功！${Object.keys(cells).length} 个格子`);
            return cells;
          }
        } catch (err) {
          DBG('SCHED', `❌ fetch(${attempt.label}) 异常: ${err.message}`);
        }
      }

      DBG('SCHED', '❌ 所有尝试均失败');
      throw new Error('无法获取课表数据：服务器未返回课表信息');
    },

    /** 从 HTML 字符串中解析 TaskActivity 数据 */
    _parseTaskActivityFromHtml(html) {
      const cells = {};
      // 匹配所有 activity=new TaskActivity(...)
      const actRegex = /activity\s*=\s*new\s*TaskActivity\(([^)]+)\)/g;
      let actMatch, idxRegex;
      const activities = [];

      while ((actMatch = actRegex.exec(html)) !== null) {
        const rawArgs = actMatch[1];
        // 简单按逗号分割（注意参数可能含引号内逗号，但 EAMS 的数据不复杂）
        const args = DataFetcher._splitArgs(rawArgs);
        if (args.length < 7) {
          DBG('SCHED', `  TaskActivity 参数不足: ${args.length}`, rawArgs.substring(0, 100));
          continue;
        }
        const act = {
          teacherName: (args[1] || '').trim().replace(/^"|"$/g, ''),
          courseName: (args[3] || '').trim().replace(/^"|"$/g, ''),
          roomName: (args[5] || '').trim().replace(/^["\s]+|["\s]+$/g, ''),
          validWeeks: (args[6] || '').trim().replace(/^"|"$/g, ''),
        };
        activities.push(act);
        DBG('SCHED', `  HTML解析 TaskActivity: teacher=${act.teacherName}, course=${act.courseName}`);
      }

      DBG('SCHED', `HTML中共找到 ${activities.length} 个 TaskActivity 声明`);

      // 解析 index 赋值
      const idxRegexLocal = /index\s*=\s*(\d+)\s*\*\s*unitCount\s*\+\s*(\d+)/g;
      let idxMatch;
      let idxCount = 0;

      // 按行处理，将 activity 声明和 index 匹配
      const lines = html.split('\n');
      let currentAct = null;
      for (const line of lines) {
        const aMatch = line.match(/activity\s*=\s*new\s*TaskActivity\(([^)]+)\)/);
        if (aMatch) {
          const rawArgs = aMatch[1];
          const args = DataFetcher._splitArgs(rawArgs);
          if (args.length >= 7) {
            currentAct = {
              teacherName: (args[1] || '').trim().replace(/^"|"$/g, ''),
              courseName: (args[3] || '').trim().replace(/^"|"$/g, ''),
              roomName: (args[5] || '').trim().replace(/^["\s]+|["\s]+$/g, ''),
              validWeeks: (args[6] || '').trim().replace(/^"|"$/g, ''),
            };
          }
          continue;
        }
        if (currentAct) {
          const iMatch = line.match(/index\s*=\s*(\d+)\s*\*\s*unitCount\s*\+\s*(\d+)/);
          if (iMatch) {
            idxCount++;
            const day = parseInt(iMatch[1]);
            const period = parseInt(iMatch[2]);
            const key = `${day}_${period}`;
            if (!cells[key]) cells[key] = [];
            cells[key].push({ ...currentAct });
          }
        }
      }

      DBG('SCHED', `HTML解析结果: ${idxCount} 个 index, ${Object.keys(cells).length} 个格子`);
      return cells;
    },

    /** 安全分割 TaskActivity 参数（引号保护） */
    _splitArgs(raw) {
      const args = [];
      let current = '';
      let inQuote = false;
      for (let i = 0; i < raw.length; i++) {
        const ch = raw[i];
        if (ch === '"') { inQuote = !inQuote; current += ch; }
        else if (ch === ',' && !inQuote) { args.push(current); current = ''; }
        else { current += ch; }
      }
      if (current) args.push(current);
      return args;
    },
  };


  // ═══════════════════════════════════════════════════════════
  //  运行时模板渲染器 —— 从 chrome.storage 加载自定义模板
  // ═══════════════════════════════════════════════════════════

  const RuntimeRenderer = {
    STORAGE_KEY: 'eams_opt_templates_v2',

    /** 尝试渲染自定义模板，返回 HTML 或 null */
    async render(pageType, data) {
      try {
        const result = await chrome.storage.local.get(this.STORAGE_KEY);
        const pages = result[this.STORAGE_KEY] || {};
        DBG('RENDER', `storage 读取结果: pages=${Object.keys(pages).join(',') || '(空)'}`);

        const pageData = pages[pageType];
        if (!pageData || !pageData.activeId || !pageData.items) {
          DBG('RENDER', '→ 无激活的模板'); return null;
        }
        const item = pageData.items[pageData.activeId];
        if (!item || !item.html) { DBG('RENDER', '→ 模板或 HTML 为空'); return null; }

        DBG('RENDER', `HTML ${item.html.length} 字节, CSS ${(item.css||'').length} 字节`);
        if (item.css) this._injectCSS(pageType, item.css);

        const html = this._render(item.html, data);
        DBG('RENDER', `→ 渲染完成: ${html.length} 字节`);
        return html;
      } catch (e) {
        DBG('RENDER', `渲染失败: ${e.message}\n${e.stack?.split('\n').slice(0,4).join('\n') || ''}`);
        return null;
      }
    },

    /** 主渲染入口 — 纯字符串处理，无 eval */
    _render(tpl, data, item) {
      // 1. {{#each array}}...{{/each}}
      tpl = tpl.replace(/\{\{#each (\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (_, arr, inner) => {
        const items = data[arr];
        if (!Array.isArray(items)) return '';
        return items.map(it => this._render(inner, data, it)).join('');
      });

      // 2. {{sListOptions}}
      if (tpl.includes('{{sListOptions}}')) {
        DBG('RENDER', '→ 模板包含 sListOptions');
        tpl = tpl.replace(/\{\{sListOptions\}\}/g,
          Templates._semesterOpts(data.sList || [], data.sid));
      }

      // 3. {{examTypeOptions}}
      tpl = tpl.replace(/\{\{examTypeOptions\}\}/g,
        Object.entries(CONFIG.examTypes).map(([k, v]) =>
          `<option value="${k}"${k === data.etype ? ' selected' : ''}>${v}</option>`
        ).join(''));

      // 4. {{=expr}} — 表达式求值（无 eval，模式匹配）
      tpl = tpl.replace(/\{\{=(.*?)\}\}/g, (_, expr) => this._evalExpr(expr.trim(), data, item));

      // 5. {{field}} — 简单字段（优先 item，回退 data）
      tpl = tpl.replace(/\{\{(\w+)\}\}/g, (_, field) => {
        const ctx = item || data;
        const val = ctx[field];
        return val !== undefined && val !== null ? String(val) : '';
      });

      return tpl;
    },

    /** 表达式求值（无 eval，模式匹配常见模式） */
    _evalExpr(expr, data, item) {
      const _r = (path, ctx) => {
        const parts = path.split('.');
        let v = ctx;
        for (const p of parts) {
          if (v == null) return undefined;
          v = v[p];
        }
        return v;
      };

      // — 工具：替换 data.field / item.field 为实际值
      const resolveRefs = (s) => {
        return s.replace(/\b(data|item)\.([\w.]+)/g, (_, pref, path) => {
          const ctx = pref === 'data' ? data : item;
          const v = _r(path, ctx);
          if (typeof v === 'string') return JSON.stringify(v);
          if (typeof v === 'number') return String(v);
          return String(v ?? '');
        });
      };

      // 模式 A: 纯属性访问 data.x.y 或 item.x.y
      const simpleProp = expr.match(/^(data|item)\.([\w.]+)$/);
      if (simpleProp) {
        const v = _r(simpleProp[2], simpleProp[1] === 'data' ? data : item);
        return v !== undefined && v !== null ? String(v) : '';
      }

      // 模式 B: Templates.method(args).prop
      const tplCall = expr.match(/^Templates\.(\w+)\(([^)]*)\)\.?(\w*)$/);
      if (tplCall && Templates[tplCall[1]]) {
        const args = tplCall[2].split(',').map(a => {
          a = a.trim();
          const m = a.match(/^(data|item)\.([\w.]+)$/);
          if (m) return _r(m[2], m[1] === 'data' ? data : item);
          return a.replace(/^['"]|['"]$/g, '');
        }).filter(a => a !== '');
        let result = Templates[tplCall[1]](...args);
        if (tplCall[3]) result = result[tplCall[3]];
        return result !== undefined && result !== null ? String(result) : '';
      }

      // 模式 C: chrome.runtime.getURL('path')
      const crCall = expr.match(/^chrome\.runtime\.getURL\(['"]([^'"]+)['"]\)$/);
      if (crCall) return chrome.runtime.getURL(crCall[1]);

      // 模式 D: 字符串拼接 'prefix' + data.field + 'suffix'
      const concatMatch = expr.match(/^'([^']*)'\s*\+\s*(data|item)\.([\w.]+)\s*\+\s*'([^']*)'$/);
      if (concatMatch) {
        const ctx = concatMatch[2] === 'data' ? data : item;
        const val = _r(concatMatch[3], ctx);
        return concatMatch[1] + (val ?? '') + concatMatch[4];
      }

      // 模式 E: 三元表达式 cond ? val1 : val2（包括嵌套）
      // 用 resolveRefs 替换引用为值，然后纯字符串解析三元
      try {
        const resolved = resolveRefs(expr);
        return this._evalTernary(resolved);
      } catch (e) {
        DBG('RENDER', `表达式求值失败: ${expr} → ${e.message}`);
        return '';
      }
    },

    /** 三元表达式求值（纯字符串操作，无 eval） */
    _evalTernary(resolved) {
      // 解析简单的三元: condition ? trueVal : falseVal
      // 支持嵌套: cond1 ? v1 : cond2 ? v2 : v3
      const trim = s => s.trim();

      // 尝试解析完整三元链
      const parts = resolved.match(/^(.+?)\s*\?\s*(.+?)\s*:\s*(.+)$/);
      if (!parts) return resolved.replace(/^['"]|['"]$/g, '');

      const cond = trim(parts[1]);
      const trueBranch = trim(parts[2]);
      const falseBranch = trim(parts[3]);

      const condTrue = this._evalCondition(cond);
      if (condTrue) {
        // trueBranch 可能有嵌套三元
        return this._evalTernary(trueBranch).replace(/^['"]|['"]$/g, '');
      } else {
        return this._evalTernary(falseBranch).replace(/^['"]|['"]$/g, '');
      }
    },

    /** 简单条件求值，支持 >= <= > < === !== */
    _evalCondition(cond) {
      const t = s => s.trim();

      // parseFloat(x) >= 90 → 提取两边数字比较
      const numCmp = cond.match(/([\d.]+)\s*(>=|<=|>|<|===?|!==?)\s*([\d.]+)/);
      if (numCmp) {
        const a = parseFloat(numCmp[1]), b = parseFloat(numCmp[3]);
        if (!isNaN(a) && !isNaN(b)) {
          switch (numCmp[2]) {
            case '>=': return a >= b;
            case '<=': return a <= b;
            case '>':  return a > b;
            case '<':  return a < b;
            case '==': case '===': return a === b;
            case '!=': case '!==': return a !== b;
          }
        }
      }

      // 字符串比较: "x" === 'y'（兼容双引号和单引号）
      const strCmp = cond.match(/['"]([^'"]*)['"]\s*(===?|!==?)\s*['"]([^'"]*)['"]/);
      if (strCmp) {
        const eq = strCmp[2].startsWith('=');
        return eq ? strCmp[1] === strCmp[3] : strCmp[1] !== strCmp[3];
      }

      // 真值判断: 提取条件中的数字, parseFloat("88") → 88 → truthy
      const numVal = cond.match(/([\d.]+)/);
      if (numVal) {
        const n = parseFloat(numVal[1]);
        return !isNaN(n) && n !== 0;
      }

      // 空/undefined → falsy
      return false;
    },

    /** CSS 注入（每个页面只注入一次） */
    _injectCSS(pageType, css) {
      const id = 'eams-tpl-css-' + pageType;
      if (document.getElementById(id)) return;
      const style = document.createElement('style');
      style.id = id;
      style.textContent = css;
      document.head.appendChild(style);
    },

    /** 执行模板 HTML 中的 <script> 标签（innerHTML 不会自动执行） */
    execScripts(container) {
      if (!container) return;
      container.querySelectorAll('script').forEach(old => {
        const s = document.createElement('script');
        if (old.src) s.src = old.src;
        else s.textContent = old.textContent;
        old.replaceWith(s);
      });
    },
  };

  // ═══════════════════════════════════════════════════════════
  //  UI 模板 —— 用模板字符串渲染页面
  // ═══════════════════════════════════════════════════════════

  const Templates = {
    /** 加载中 */
    loading(emoji, text) {
      return `<div class="eams-loading"><div class="eams-loading-icon">${emoji}</div><div>${text}</div></div>`;
    },

    /** 错误页面 */
    error(msg) {
      return `<div class="eams-loading"><div class="eams-loading-icon">❌</div><div style="color:var(--danger)">${msg}</div></div>`;
    },

    /** 页面通用外壳 */
    shell(title, backLink, content) {
      const header = title
        ? `<div class="eams-header">
            <h1>${title}</h1>
            <div class="eams-header-actions">
              ${backLink ? `<a href="${backLink}" class="eams-back-link">← 返回主页</a>` : ''}
              <button class="eams-theme-btn" title="切换暗色模式">🌙</button>
            </div>
           </div>`
        : '';
      return `<div class="eams-container">${header}${content}</div>`;
    },

    /** Dashboard */
    dashboard(semesterName, currentSid) {
      const coreCards = [
        { icon: '📅', title: '我的课表', href: '#schedule', cls: 'go-schedule' },
        { icon: '📊', title: '我的成绩', href: `/eams/teach/grade/course/person!search.action?semesterId=${currentSid}&projectType=` },

        { icon: '📋', title: '我的考试', href: `/eams/stdExamTable!examTable.action?semester.id=${currentSid}&examType.id=1` },
      ];

      const linkGroups = [
        { title: '📋 课程管理', items: [
          { label: '我的计划', href: '/eams/myPlan.action' },
          { label: '计划完成情况', href: '/eams/myPlanCompl.action' },
          { label: '选课系统', href: '/eams/stdElectCourse.action' },
          { label: '我的选课日志', href: '/eams/stdElectLog.action' },
          { label: '全校开课查询', href: '/eams/publicSearch.action' },
          { label: '学生替代课程申请', href: '/eams/courseSubstitutionApply.action' },
          { label: '学分认定申请', href: '/eams/studentChangeTypeApply.action' },
          { label: '已修学分统计', href: '/eams/teach/grade/transcript/stdFinal.action' },
          { label: '成绩打印', href: '/eams/teach/grade/transcript/studentGradePrint.action' },
          { label: '阶段课成绩查询', href: '/eams/teach/grade/stage/stage-grade-std.action' },
          { label: '转专业报名申请', href: '/eams/stdChangeMajorApply.action' },
          { label: '专业确认报名', href: '/eams/majorShuntSignUp.action' },
          { label: '缓考申请', href: '/eams/examDelayApply.action' },
          { label: '学生评教', href: '/eams/evaluate.action' },
          { label: '学生借教室申请', href: '/eams/classroom/apply/student-activity.action' },
          { label: '教材订购登记', href: '/eams/stdTextbookOrderLine.action' },
        ]},
        { title: '👤 我的信息', items: [
          { label: '我的学籍', href: '/eams/stdDetail.action' },
          { label: '个人联系信息维护', href: '/eams/stdInfoEdit.action' },
          { label: '我的注册', href: '/eams/registerApply.action' },
          { label: '我的缴费信息', href: '/eams/myPayment.action' },
        ]},
        { title: '📖 我的重修', items: [
          { label: '重修报名申请', href: '/eams/restudyApply.action' },
          { label: '重修选课缴费', href: '/eams/stdRestudyApplySearch.action' },
          { label: '我的重修课表', href: '/eams/courseTableForReStd.action' },
          { label: '重修报名日志查询', href: '/eams/restudyApplyLogs.action' },
        ]},
        { title: '🎓 辅修与双学位', items: [
          { label: '辅修报名', href: '/eams/stdAssistApply.action' },
          { label: '辅修选课与缴费', href: '/eams/stdAssistPay!innerIndex.action' },
        ]},
      ];

      const linkSections = linkGroups.map(g => `
        <div class="eams-link-group">
          <h3 class="eams-link-group-title">${g.title}</h3>
          <div class="eams-link-grid">
            ${g.items.map(l => `<a href="${l.href}" class="eams-link-btn" target="_blank">${l.label} →</a>`).join('')}
          </div>
        </div>
      `).join('');

      const badgeURL = chrome.runtime.getURL('assets/icons/badge.png');
      return Templates.shell('', '', `
        <div class="eams-header eams-header-custom">
          <div class="eams-header-left">
            <img src="${badgeURL}" class="eams-badge">
            <div>
              <h1 style="font-size:20px;margin:0">电子科技大学</h1>
              <p style="font-size:13px;color:var(--text-secondary);margin:2px 0 0">本科教学管理系统</p>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <button class="eams-theme-btn" title="切换暗色模式">🌙</button>
            <a href="/eams/home!index.action" class="eams-back-link">返回原版 →</a>
          </div>
        </div>
        <div class="eams-info-bar"><span>当前学期：${semesterName}</span></div>
        <div class="eams-core-grid">
          ${coreCards.map(c => `
            <a${c.cls ? ` class="eams-card ${c.cls}" href="#" data-href="${c.href}"` : ` class="eams-card" href="${c.href}"`}>
              <div class="eams-card-icon">${c.icon}</div>
              <div class="eams-card-title">${c.title}</div>
            </a>
          `).join('')}
        </div>
        ${linkSections}
      `);
    },

    /** 成绩页面 */
    grades(data) {
      const { grades, gpa, wavg, sid, sList } = data;
      const rows = grades.map((g, i) => {
        const sc = parseFloat(g.totalScore);
        const cls = isNaN(sc) ? '' : sc >= 90 ? 'score-high' : sc >= 80 ? 'score-medium' : 'score-low';
        return `<tr>
          <td><input type="checkbox" checked class="eams-grade-check" data-i="${i}"></td>
          <td>${g.courseName}</td>
          <td class="eams-col-muted">${g.courseType}</td>
          <td class="eams-col-center">${g.credits}</td>
          <td class="eams-col-center">${g.finalExam}</td>
          <td class="eams-col-center ${cls}">${g.totalScore}</td>
          <td class="eams-col-center">${g.gpa}</td>
          <td class="eams-col-center">${g.usualScore ? g.usualScore + (g.usualLessonId ? ' <span class="eams-usual-btn" data-id="' + g.usualLessonId + '" data-course="' + g.courseName.replace(/"/g,'&quot;') + '" data-code="' + g.courseCode + '" data-coursenum="' + (g.usualCourseNumber || '') + '">📋</span>' : '') : '<span class="eams-col-muted">-</span>'}</td>
        </tr>`;
      }).join('');

      const stats = [
        { id: 'eams-avg-gpa', value: gpa.avgGPA, label: '平均绩点', color: 'var(--primary)' },
        { id: 'eams-wavg', value: wavg, label: '加权平均', color: '#8b5cf6' },
        { id: 'eams-total-credits', value: gpa.totalCredits, label: '已修学分', color: 'var(--primary)' },
        { id: 'eams-course-count', value: grades.length, label: '课程数量', color: 'var(--primary)' },
      ];

      return Templates.shell('📊 我的成绩', '/eams/home!submenus.action?menu.id=', `
        <div class="eams-toolbar">
          <select class="eams-select eams-semester-select" id="eams-semester-select">${Templates._semesterOpts(sList, sid)}</select>
        </div>
        <div class="eams-stat-grid eams-stat-grid-4">
          ${stats.map(s => `<div class="eams-stat-card"><div class="eams-stat-value" style="color:${s.color}" id="${s.id}">${s.value}</div><div class="eams-stat-label">${s.label}</div></div>`).join('')}
        </div>
        <div class="eams-table-wrap">
          <table class="eams-table">
            <thead><tr>
              <th class="eams-col-center" style="width:40px">计入</th>
              <th class="eams-col-left">课程名称</th>
              <th class="eams-col-left">课程类别</th>
              <th class="eams-col-center">学分</th>
              <th class="eams-col-center">期末成绩</th>
              <th class="eams-col-center">总评成绩</th>
              <th class="eams-col-center">绩点</th>
              <th class="eams-col-center">平时成绩</th>
            </tr></thead>
            <tbody>${rows || '<tr><td colspan="8" class="eams-empty">暂无成绩数据</td></tr>'}</tbody>
          </table>
        </div>
        <div id="eams-modal" class="eams-modal-hidden"></div>
      `);
    },

    /** 考试页面 */
    exams(data) {
      const { exams, sid, etype, sList } = data;
      const items = exams.map(e => {
        const cd = Templates._examCountdown(e.date);
        return `<div class="eams-exam-item">
          <div class="eams-exam-countdown" style="background:${cd.bg}">
            <div class="eams-exam-cd-num">${cd.text}</div>
          </div>
          <div class="eams-exam-info">
            <h3>${e.courseName}</h3>
            <div class="eams-exam-details">
              ${e.date ? `<span>📅 ${e.date}</span>` : ''}
              ${e.time ? `<span>⏰ ${e.time}</span>` : ''}
              ${e.classroom ? `<span>📍 ${e.classroom}</span>` : ''}
              ${e.seatNo ? `<span>💺 座位 ${e.seatNo}</span>` : ''}
            </div>
          </div>
        </div>`;
      }).join('');

      return Templates.shell('📋 我的考试', '/eams/home!submenus.action?menu.id=', `
        <div class="eams-toolbar">
          <select class="eams-select" id="eams-exam-semester">${Templates._semesterOpts(sList, sid)}</select>
          <select class="eams-select" id="eams-exam-type">
            ${Object.entries(CONFIG.examTypes).map(([k, v]) => `<option value="${k}"${k === etype ? ' selected' : ''}>${v}</option>`).join('')}
          </select>
        </div>
        <div class="eams-card-list">
          ${items || '<div class="eams-empty-state">暂无考试安排</div>'}
        </div>
      `);
    },

    /** 课表页面 */
    schedule(data) {
      const { cells, sid, kind, week, sList } = data;
      const rowspan = {}, skip = {};

      // 计算 rowspan：合并同一列中连续的同名课程
      for (let d = 0; d < 7; d++) {
        for (let p = 0; p < 12; p++) {
          const key = `${d}_${p}`;
          if (skip[key]) continue;
          const cd = cells[key];
          if (!cd || cd.length === 0) continue;
          const firstCourse = cd[0].courseName;
          let span = 1;
          for (let np = p + 1; np < 12; np++) {
            const ncd = cells[`${d}_${np}`];
            if (ncd && ncd.length > 0 && ncd[0].courseName === firstCourse) {
              span++;
              skip[`${d}_${np}`] = true;
            } else break;
          }
          if (span > 1) rowspan[key] = span;
        }
      }

      // 生成节次背景色
      const periodCls = (p) => p < 4 ? 'eams-period-am' : p < 8 ? 'eams-period-pm' : 'eams-period-night';

      let rows = '';
      for (let p = 0; p < 12; p++) {
        rows += `<tr><td class="eams-period-cell ${periodCls(p)}">第${p + 1}节</td>`;
        for (let d = 0; d < 7; d++) {
          const key = `${d}_${p}`;
          if (skip[key]) continue;
          const cd = cells[key];
          if (cd && cd.length > 0) {
            const rs = rowspan[key] || 1;
            const content = Templates._scheduleCellContent(cd, data);
            rows += `<td rowspan="${rs}" class="eams-course-cell">${content}</td>`;
          } else {
            rows += '<td class="eams-empty-cell"></td>';
          }
        }
        rows += '</tr>';
      }

      const kindOpts = [
        { v: 'std', l: '学生课表' },
        { v: 'class', l: '班级课表' },
      ].map(o => `<option value="${o.v}"${kind === o.v ? ' selected' : ''}>${o.l}</option>`).join('');

      let weekOpts = `<option value=""${week === '' ? ' selected' : ''}>全部周次</option>`;
      for (let w = 1; w <= 20; w++) weekOpts += `<option value="${w}"${week === String(w) ? ' selected' : ''}>第${w}周</option>`;

      return Templates.shell('📅 我的课表', '/eams/home!submenus.action?menu.id=', `
        <div class="eams-toolbar">
          <select class="eams-select" id="eams-sched-semester">${Templates._semesterOpts(sList, sid)}</select>
          <select class="eams-select" id="eams-sched-kind">${kindOpts}</select>
          <select class="eams-select" id="eams-sched-week">${weekOpts}</select>
        </div>
        <div class="eams-schedule-wrap">
          <table class="eams-schedule-table">
            <thead><tr><th class="eams-period-header">节次</th>${CONFIG.days.map(d => `<th class="eams-day-header">${d}</th>`).join('')}</tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `);
    },

    /** 课表单元格内容 */
    _scheduleCellContent(courses) {
      // 合并同课程（courseName + teacherName 相同）
      const merged = {};
      const order = [];
      for (const c of courses) {
        const mk = `${c.courseName}|${c.teacherName}`;
        if (!merged[mk]) {
          merged[mk] = { ...c };
          order.push(mk);
        } else {
          merged[mk].validWeeks = WeekParser.merge(merged[mk].validWeeks, c.validWeeks || '');
        }
      }

      return order.slice(0, 5).map((mk, i) => {
        const c = merged[mk];
        const parts = [];
        if (i > 0) parts.push('<hr class="eams-course-divider">');
        parts.push(`<div class="eams-course-name">${c.teacherName} ${c.courseName}</div>`);
        // 直接显示原始周数（DOM 获取的是自然语言格式，不是二进制）
        if (c.validWeeks) parts.push(`<div class="eams-course-week">${c.validWeeks}</div>`);
        if (c.roomName) parts.push(`<div class="eams-course-room">${c.roomName}</div>`);
        return parts.join('');
      }).join('');
    },

    /** 倒计时计算 */
    _examCountdown(dateStr) {
      if (!dateStr) return { text: '未知', bg: 'var(--text-secondary)' };
      // 手动解析为本地日期，避免时区问题
      // 支持格式: "2026年6月24日"、"2026-06-24"、"2026-06-24 00:00:00"
      const cleaned = dateStr.replace(/年|月/g, '-').replace(/日/g, '').trim().split(' ')[0];
      const parts = cleaned.split('-');
      if (parts.length < 3) return { text: '未知', bg: 'var(--text-secondary)' };
      const examDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      if (isNaN(examDate.getTime())) return { text: '未知', bg: 'var(--text-secondary)' };
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const diff = Math.round((examDate - now) / (86400000));
      if (diff > 3) return { text: diff + '天', bg: 'var(--primary)' };
      if (diff > 0) return { text: diff + '天', bg: 'var(--danger)' };
      if (diff === 0) return { text: '今天', bg: 'var(--danger)' };
      return { text: '已结束', bg: 'var(--text-secondary)' };
    },

    /** 学期选项 HTML */
    _semesterOpts(list, selectedId) {
      return list.map(s => `<option value="${s.id}"${s.id === selectedId ? ' selected' : ''}>${s.name}</option>`).join('');
    },

    /** 平时成绩详情弹窗 */
    usualModal(courseName, courseCode, courseNumber, teacher, dept, items) {
      const rows = items.map((item, i) =>
        `<tr><td class="eams-col-center">${i + 1}</td><td>${item.type}</td><td class="eams-col-center">${item.score}</td></tr>`
      ).join('');
      return `<div class="eams-modal-overlay" onclick="var m=document.getElementById('eams-modal');m.innerHTML='';m.className='eams-modal-hidden'">
        <div class="eams-modal-box" onclick="event.stopPropagation()">
          <div class="eams-modal-header">
            <h3>📋 ${courseName}</h3>
            <span class="eams-modal-close" onclick="var m=document.getElementById('eams-modal');m.innerHTML='';m.className='eams-modal-hidden'">✕</span>
          </div>
          <div class="eams-modal-body">
            <div class="eams-usual-info">${courseCode}${courseNumber ? ' · ' + courseNumber : ''}${teacher ? ' · ' + teacher : ''}${dept ? ' · ' + dept : ''}</div>
            <table class="eams-table"><thead><tr><th class="eams-col-center">次数</th><th>成绩类型</th><th class="eams-col-center">成绩</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="3" class="eams-empty">暂无数据</td></tr>'}</tbody></table>
          </div>
        </div>
      </div>`;
    },

    /* @INJECT:TEMPLATE */
  };


  // ═══════════════════════════════════════════════════════════
  //  页面注入器 —— 每个页面一个 inject 函数
  // ═══════════════════════════════════════════════════════════

  const Injector = {
    /** Dashboard — 使用 Overlay 覆盖，保留原页面脚本和表单 */
    async dashboard() {
      const sid = Semester.getId();
      DBG('DASH', 'Dashboard overlay 注入');

      const data = { semesterName: Semester.getLabel(sid), currentSid: sid };
      const customHTML = await RuntimeRenderer.render('dashboard', data);
      const content = customHTML || Templates.dashboard(data.semesterName, data.currentSid);

      // 创建 overlay 容器覆盖原页面（不替换 body）
      const overlay = document.createElement('div');
      overlay.id = 'eams-opt-overlay';
      overlay.innerHTML = content;
      overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:999999;overflow:auto;background:var(--bg,#f8fafc);font-family:-apple-system,BlinkMacSystemFont,sans-serif';
      document.body.appendChild(overlay);
      if (customHTML) RuntimeRenderer.execScripts(overlay);  // 执行模板内的 <script>

      // 隐藏原页面内容（但保留 DOM）
      for (const el of document.body.children) {
        if (el !== overlay) el.style.display = 'none';
      }

      // 课表：直接用 GET 导航（课表页表单里包含 ids，加载后自动捕获）
      document.querySelector('.go-schedule')?.addEventListener('click', (e) => {
        e.preventDefault();
        ScheduleState.save({ sid, kind: 'std', week: '' });
        DBG('DASH', 'GET 跳转到课表页');
        window.location.href = '/eams/courseTableForStd.action';
      });
    },

    /** 成绩 */
    async grades() {
      const sid = Semester.getId();
      const sList = Semester.getList();
      this._showLoading('📊', '加载中...');

      try {
        const grades = await DataFetcher.grades(sid);
        const gpa = GPA.calc(grades);
        const wavg = GPA.weightedAvg(grades);
        const data = { grades, gpa, wavg, sid, sList };
        const customHTML = await RuntimeRenderer.render('grades', data);
        const html = customHTML || Templates.grades(data);
        document.body.innerHTML = html;
        document.body.className = 'eams-injected';
        if (customHTML) RuntimeRenderer.execScripts(document.body);
        Injector._bindGradeCheckboxes(grades);
        document.getElementById('eams-semester-select')?.addEventListener('change', function () {
          window.location.href = `/eams/teach/grade/course/person!search.action?semesterId=${this.value}&projectType=`;
        });
      } catch (e) {
        document.body.innerHTML = Templates.error(`成绩加载失败：${e.message}`);
      }
    },

    /** 考试 */
    async exams() {
      const sid = Semester.getId();
      const sList = Semester.getList();
      const urlP = new URLSearchParams(window.location.search);
      const etype = urlP.get('examType.id') || '1';
      this._showLoading('📋', '加载中...');

      try {
        const exams = await DataFetcher.exams(sid, etype);
        const data = { exams, sid, etype, sList };
        const customHTML = await RuntimeRenderer.render('exams', data);
        const html = customHTML || Templates.exams(data);
        document.body.innerHTML = html;
        document.body.className = 'eams-injected';
        if (customHTML) RuntimeRenderer.execScripts(document.body);
        Injector._bindExamSelectors();
      } catch (e) {
        document.body.innerHTML = Templates.error(`考试加载失败：${e.message}`);
      }
    },

    /** 课表（自动注入） */
    async schedule() {
      DBG('INJECT', '课表自动注入开始');
      let cells, state, sList;

      try {
        // 等待课表表格渲染完成
        await DataFetcher.schedule();
        state = ScheduleState.detect();
        sList = Semester.getList();
        cells = DataFetcher.scheduleFromPage();
        DBG('INJECT', `解析: ${Object.keys(cells).length} 个格子`);
      } catch (e) {
        DBG('INJECT', `❌ ${e.message}`);
        return;
      }

      // 渲染（即使 0 个格子也渲染空课表）
      try {
        const data = { cells, sid: state.sid, kind: state.kind, week: state.week, sList };
        const customHTML = await RuntimeRenderer.render('schedule', data);
        const html = customHTML || Templates.schedule(data);
        document.body.innerHTML = html;
        document.body.className = 'eams-injected';
        if (customHTML) RuntimeRenderer.execScripts(document.body);
        Injector._bindScheduleSelectors();
        DBG('INJECT', '课表注入完成');
      } catch (e) {
        DBG('INJECT', `❌ 渲染失败: ${e.message}`);
      }
    },

    /** 展示加载状态 */
    _showLoading(emoji, text) {
      document.body.innerHTML = Templates.loading(emoji, text);
    },

    /** 成绩页面：复选框重新计算 GPA */
    _bindGradeCheckboxes(grades) {
      for (const cb of document.querySelectorAll('.eams-grade-check')) {
        cb.addEventListener('change', () => {
          const exclude = new Set();
          for (const el of document.querySelectorAll('.eams-grade-check')) {
            if (!el.checked) exclude.add(parseInt(el.dataset.i));
          }
          document.getElementById('eams-avg-gpa').textContent = GPA.calc(grades, exclude).avgGPA;
          document.getElementById('eams-wavg').textContent = GPA.weightedAvg(grades, exclude);
          document.getElementById('eams-total-credits').textContent = GPA.calc(grades, exclude).totalCredits;
        });
      }

      // 平时成绩详情按钮
      for (const btn of document.querySelectorAll('.eams-usual-btn')) {
        btn.addEventListener('click', async () => {
          const lessonId = btn.dataset.id;
          const courseName = btn.dataset.course || '';
          const modal = document.getElementById('eams-modal');
          modal.className = '';
          modal.innerHTML = '<div class="eams-modal-overlay"><div class="eams-modal-box" style="text-align:center;padding:40px">加载中...</div></div>';

          try {
            const resp = await fetch(`/eams/teach/grade/usual/usual-grade-std!usualInfo.action?lessonId=${lessonId}&_=${Date.now()}`, {
              headers: { 'X-Requested-With': 'XMLHttpRequest' }
            });
            const html = await resp.text();
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const rows = doc.querySelectorAll('table tr');

            // 提取课程信息（授课教师、开课院系）
            let teacher = '', dept = '';
            for (const r of rows) {
              const cols = r.children;
              if (cols.length < 8) continue;
              for (let i = 0; i < cols.length; i++) {
                const label = (cols[i]?.textContent || '').trim();
                if (label.includes('授课教师') && cols[i + 1]) teacher = cols[i + 1].textContent.trim();
                if (label.includes('开课院系') && cols[i + 1]) dept = cols[i + 1].textContent.trim();
              }
            }

            // 提取成绩明细
            const items = [];
            for (const r of rows) {
              const cols = r.children;
              if (cols.length < 3) continue;
              const idx = (cols[0]?.textContent || '').trim();
              if (!idx || isNaN(parseInt(idx))) continue;

              const typeRows = cols[1]?.querySelectorAll('table tr') || [];
              const scoreRows = cols[2]?.querySelectorAll('table tr') || [];
              const maxLen = Math.max(typeRows.length, scoreRows.length);

              for (let ri = 0; ri < maxLen; ri++) {
                const type = (typeRows[ri]?.textContent || '').trim();
                const score = (scoreRows[ri]?.textContent || '').trim();
                if (type && score) items.push({ type, score });
              }
            }
            modal.innerHTML = Templates.usualModal(courseName, btn.dataset.code || '', btn.dataset.coursenum || '', teacher, dept, items);
          } catch (e) {
            modal.innerHTML = `<div class="eams-modal-overlay"><div class="eams-modal-box" style="text-align:center;padding:40px;color:#ef4444">加载失败：${e.message}</div></div>`;
          }
        });
      }
    },

    /** 考试页面：学期/类型选择器联动 */
    _bindExamSelectors() {
      const reload = () => {
        const sid = document.getElementById('eams-exam-semester').value;
        const et = document.getElementById('eams-exam-type').value;
        window.location.href = `/eams/stdExamTable!examTable.action?semester.id=${sid}&examType.id=${et}`;
      };
      document.getElementById('eams-exam-semester')?.addEventListener('change', reload);
      document.getElementById('eams-exam-type')?.addEventListener('change', reload);
    },

    /** 课表页面：选择器联动（POST 提交表单） */
    _bindScheduleSelectors() {
      const submit = () => {
        const state = {
          sid: document.getElementById('eams-sched-semester').value,
          kind: document.getElementById('eams-sched-kind').value,
          week: document.getElementById('eams-sched-week').value,
        };
        ScheduleState.save(state);
        const f = document.createElement('form');
        f.method = 'POST';
        f.action = '/eams/courseTableForStd!courseTable.action';
        const params = { ignoreHead: '1', 'setting.kind': state.kind, startWeek: state.week, 'project.id': '1', isEng: '0', 'semester.id': state.sid, ids: ScheduleState.getIds(state.kind) };
        for (const [k, v] of Object.entries(params)) {
          const inp = document.createElement('input');
          inp.type = 'hidden'; inp.name = k; inp.value = v;
          f.appendChild(inp);
        }
        document.body.appendChild(f);
        f.submit();
      };
      document.getElementById('eams-sched-semester')?.addEventListener('change', submit);
      document.getElementById('eams-sched-kind')?.addEventListener('change', submit);
      document.getElementById('eams-sched-week')?.addEventListener('change', submit);
    },

    /* @INJECT:INJECTOR */
  };


  // ═══════════════════════════════════════════════════════════
  //  消息监听 —— 来自 Popup 的模板切换通知
  // ═══════════════════════════════════════════════════════════

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'eams-template-changed') {
      DBG('RENDER', '模板已切换，刷新页面');
      sendResponse({ ok: true });
      window.location.reload();
    }
  });

  // ═══════════════════════════════════════════════════════════
  //  页面检测 & 入口
  // ═══════════════════════════════════════════════════════════

  /**
   * 检测当前 EAMS 页面类型
   */
  function detectPage() {
    const url = window.location.href;
    // 初始化模式：跳过注入，让用户通过原版导航操作
    if (url.includes('eams_opt_init=1')) return null;
    if (url.includes('courseTableForStd')) return 'schedule';
    if (url.includes('teach/grade/course/person!search')) return 'grades';
    if (url.includes('teach/grade/usual/usual-grade-std!search')) return 'regular-grades';
    if (url.includes('stdExamTable!examTable')) return 'exams';
    if (url.includes('home.action') || url.includes('homeExt.action') || url.includes('home!submenus')) return 'dashboard';
    /* @INJECT:DETECT */
    return null;
  }

  /** 从表单中提取 ids（直接 input 或 params 字符串） */
  function extractIdsFromForms() {
    // 方法1: 直接 input[name="ids"]
    for (const el of document.querySelectorAll('form input[name="ids"]')) {
      if (el.value) return el.value;
    }
    // 方法2: input[name="params"] 里可能嵌了 &ids=xxx&
    for (const el of document.querySelectorAll('form input[name="params"]')) {
      const m = el.value.match(/[?&]ids=(\d+)/);
      if (m) return m[1];
    }
    return null;
  }

  /** 全局捕获 ids：每次页面加载时尝试从 form 中提取 */
  function captureIdsGlobally() {
    const ids = extractIdsFromForms();
    if (ids) {
      ScheduleState.saveIds(ids, 'std');
      DBG('MAIN', `全局捕获 ids(std)=${ids}`);
    }
  }

  function main() {
    captureIdsGlobally();
    const page = detectPage();
    console.log('[EAMS优化版] 检测到页面:', page);

    switch (page) {
      case 'dashboard': Injector.dashboard(); break;
      case 'grades': Injector.grades(); break;
      case 'exams': Injector.exams(); break;
      case 'schedule': Injector.schedule(); break;
      /* @INJECT:MAIN */
      default:
        console.log('[EAMS优化版] 非目标页面，显示浮动返回按钮');
        // 右下角浮动按钮回到优化版首页
        const backBtn = document.createElement('a');
        backBtn.href = '/eams/home!submenus.action?menu.id=';
        backBtn.textContent = '📚 返回优化版';
        backBtn.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:999999;background:#3b82f6;color:white;padding:12px 20px;border-radius:8px;text-decoration:none;font:14px sans-serif;box-shadow:0 4px 12px rgba(0,0,0,0.3);';
        document.body.appendChild(backBtn);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
  } else {
    main();
  }

})();
