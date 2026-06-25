# EAMS 优化版 — UI 自定义指南

> 你想改什么？下表直接跳到对应章节。

| 我想…… | 跳到 |
|--------|------|
| 换颜色、改主题 | [§2 CSS 变量参考](#2-css-变量参考) |
| 改课表配色/布局 | [§2 CSS 变量](#2-css-变量参考) + [§3.7 课表模板](#37-templatesscheduledata) |
| 增删 Dashboard 卡片或链接 | [§3.4 Dashboard 模板](#34-templatesdashboard-完整数据结构) |
| 给成绩表加个列 | [§5.3 示例：给成绩表加新列](#53-示例给成绩表加新列) |
| 改考试页面布局 | [§3.6 考试模板](#36-templatesexamsdata) |
| 理解数据怎么来的 | [§1 架构概览](#1-架构概览) |
| 给插件加个新页面 | [§6 添加新页面](#6-逐步教程添加新页面) |
| **用 HTML 替换页面模板** | [§7 Build Script 模板编写](#7-build-script--模板编写参考) |
| **写模板需要哪些数据字段** | [§7.9 数据契约](#79-数据契约每个模板收到的-data-对象) |
| **AI 要写模板的语法规范** | [§7.2 占位符语法](#72-占位符语法) |
| **自定义加载动画** | [§3.8 Templates._loading()](#38-templates_loading) + [§7.8.5 _loading 模板](#785-_loading-模板示例) |

---

## 1. 架构概览

UI 和数据逻辑完全分离。**改外观不需要动数据获取代码。**

```
┌─────────────────────────────────────────────────────┐
│  EAMS 页面加载                                       │
│  https://eams.uestc.edu.cn/xxx.action               │
└──────────┬──────────────────────────────────────────┘
           ▼
┌──────────────────────┐
│  detectPage()        │ ← 检测 URL → 识别页面类型
│  (main.js 末尾)      │    'dashboard' / 'grades' / 'exams' / 'schedule'
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│  Injector.xxx()      │ ← 页面注入器
│                      │    1. 显示加载动画
│                      │    2. 调用 DataFetcher 获取数据
│                      │    3. 调用 Templates.xxx() 渲染页面
│                      │    4. 替换 DOM + 绑定事件
└────┬──────────┬──────┘
     ▼          ▼
┌──────────┐ ┌──────────────┐
│ DataFetcher│ │ Templates   │ ← 🎨 **你在这里改**
│ (不动)    │ │ main.js 中  │
│ fetch EAMS│ │ 模板方法     │
│ + DOM解析  │ │ 返回 HTML   │
└──────────┘ └──────┬───────┘
                    ▼
┌──────────────────────┐
│ Injector 替换 DOM    │
│ content/styles.css   │ ← 🎨 **样式也在这改**
└──────────────────────┘
```

### 各层职责

| 层 | 文件 | 行数 | 你可以改吗？ |
|----|------|------|------------|
| `Templates` | `content/main.js` 第 805-1131 行 | 11 个方法 | ✅ **改这里**——页面结构 |
| `content/styles.css` | `content/styles.css` | ~590 行 | ✅ **改这里**——视觉样式 |
| `Injector` | `content/main.js` 第 1138-1341 行 | 8 个方法 | ⚠️ 绑定事件、控制流程 |
| `DataFetcher` | `content/main.js` 第 401-798 行 | 纯数据获取+解析 | ❌ 通常不动（除非要抓新数据） |
| `Config` | `content/main.js` 第 14-22 行 | 配置常量 | ⚠️ 课表周次名、考试类型名 |

**原则：90% 的视觉改动只需要改 Templates 和 CSS。** 只有当你需要 EAMS 页面中有但插件没抓的字段时，才需要动 DataFetcher（参见 [§5.3](#53-示例给成绩表加新列)）。

---

## 2. CSS 变量参考

所有样式使用 CSS 自定义属性（variables）做主题，位于 `content/styles.css` 的 `:root` 中。

### 2.1 完整变量表

| 变量 | 默认值 | 控制什么 | 改它 |
|------|--------|---------|------|
| `--primary` | `#3b82f6` | 主色：按钮、链接、活跃状态、蓝绿色倒计时 | 品牌色 |
| `--primary-hover` | `#2563eb` | 悬停：按钮、链接、返回主页 | 主色更深色 |
| `--success` | `#22c55e` | 高分（≥90）文字色、成功状态 | ✅ |
| `--warning` | `#f59e0b` | 中分（≥80 且 <90）文字色、警告 | ✅ |
| `--danger` | `#ef4444` | 低分（<80）文字色、紧急倒计时、错误 | ✅ |
| `--bg` | `#f8fafc` | 页面背景色 | 改全站背景 |
| `--card` | `#ffffff` | 卡片/表格/表头/工具栏背景 | 浅色主题保留白色 |
| `--text` | `#1e293b` | 主文字颜色 | 深色模式改亮色 |
| `--text-secondary` | `#64748b` | 次要文字：标签、元信息、空状态提示 | ✅ |
| `--border` | `#e2e8f0` | 表格边框、卡片分隔、表单输入框 | ✅ |
| `--radius` | `12px` | 所有圆角 | 改小为 `8px` |
| `--shadow` | `0 1px 3px rgba(0,0,0,0.1)` | 卡片默认阴影 | ✅ |
| `--shadow-hover` | `0 8px 24px rgba(0,0,0,0.15)` | 卡片悬停阴影 | ✅ |
| `--font` | `-apple-system, ...` | 全站字体 | 改中文字体 |

### 2.2 深色模式示例

改 `--bg` / `--card` / `--text` 即可实现深色模式，无需改动 HTML：

```css
:root {
  --bg: #0f172a;
  --card: #1e293b;
  --text: #f1f5f9;
  --text-secondary: #94a3b8;
  --border: #334155;
}
```

### 2.3 常用 CSS 类参考

| CSS 类 | 用在 | 说明 |
|--------|------|------|
| `.eams-container` | 页面最外层 | `max-width: 1200px` 居中容器 |
| `.eams-header` | 页面顶部标题栏 | 白色卡片背景，flex 布局 |
| `.eams-toolbar` | 下拉框工具栏行 | 白色卡片背景，水平排列 |
| `.eams-table-wrap` | 表格外层 | 圆角+溢出滚动 |
| `.eams-table` | 数据表格 | 全宽、条纹行、分隔线 |
| `.eams-card` | Dashboard 卡片 | 圆角+悬停上浮动画 |
| `.eams-stat-grid` | 统计卡片网格 | flex 排列统计值 |
| `.eams-link-group` | 一组功能链接 | 卡片式分组 |
| `.eams-exam-item` | 单条考试信息 | 倒计时+信息的 flex 行 |
| `.eams-schedule-table` | 课表网格 | `table-layout: fixed` 固定列宽 |
| `.eams-modal-overlay` | 弹窗遮罩 | 半透明黑色+居中弹窗 |
| `.score-high` | 高分颜色 | 绿色 `var(--success)` |
| `.score-medium` | 中分颜色 | 琥珀色 `var(--warning)` |
| `.score-low` | 低分颜色 | 红色 `var(--danger)` |
| `.eams-loading` | 加载/错误状态 | 居中 flex 容器 |
| `.eams-spinner` | 加载动画旋转圆环 | 圆形 border spinner，由 `@keyframes eams-spin` 驱动 |
| `.eams-empty` | 空表格提示 | 灰色居中文字 |

---

## 3. Templates 完整参考

所有模板方法在 `content/main.js` 的 `Templates` 对象中。每个方法接收纯数据，返回 HTML 字符串。

### 3.1 `Templates.loading(emoji, text)`

**用途**：全屏加载动画，在 DataFetcher 获取数据时展示。

**参数**：
| 参数 | 类型 | 说明 |
|------|------|------|
| `emoji` | string | 加载图标 emoji |
| `text` | string | 加载文字 |

**返回 HTML**：
```html
<div class="eams-loading">
  <div class="eams-loading-icon">{emoji}</div>
  <div>{text}</div>
</div>
```

**使用场景**：旧版 injector 内部调用（`_showLoading()`），新版 `main()` 使用独立的 `_loading` 模板体系（见 §3.8）。此方法依然可用，可在自定义模板的 `{{=Templates.loading(...)}}` 中引用。

**CSS 关联**：`.eams-loading` — 居中 flex，`height: 60vh`。`.eams-loading-icon` — 大号 emoji 尺寸。

---

### 3.2 `Templates.error(msg)`

**用途**：全屏错误提示，数据获取失败时展示。

**参数**：
| 参数 | 类型 | 说明 |
|------|------|------|
| `msg` | string | 错误信息（通常传 `e.message`） |

**返回 HTML**：与 `loading()` 相同结构，但 emoji 固定为 ❌，文字颜色用 `var(--danger)`。

---

### 3.3 `Templates.shell(title, backLink, content)`

**用途**：页面通用外壳，包装所有页面内容。提供一致的标题栏和返回按钮。

**参数**：
| 参数 | 类型 | 说明 |
|------|------|------|
| `title` | string | 页面标题（`<h1>`）。**空字符串 = 不显示标题栏**（Dashboard 用） |
| `backLink` | string | "← 返回主页" 链接的 URL。**空字符串 = 不显示返回按钮** |
| `content` | string | 页面主体 HTML |

**返回 HTML 结构**：
```html
<div class="eams-container">
  <!-- title 非空时才出现： -->
  <div class="eams-header">
    <h1>{title}</h1>
    <!-- backLink 非空时才出现： -->
    <a href="{backLink}" class="eams-back-link">← 返回主页</a>
  </div>
  {content}
</div>
```

**注意**：Dashboard 调用 `Templates.shell('', '', ...)`（空 title），所以 shell 不生成 header，而是由 dashboard() 内部自己渲染更复杂的标题区域。

---

### 3.4 `Templates.dashboard()` — 完整数据结构

**签名**：`dashboard(semesterName, currentSid)`

**参数**：
| 参数 | 类型 | 说明 |
|------|------|------|
| `semesterName` | string | 当前学期中文名，如 `"2025-2026 第二学期"` |
| `currentSid` | string | 当前学期数字 ID，如 `"483"` |

#### 核心卡片数据 (`coreCards`)

```javascript
const coreCards = [
  {
    icon: '📅',          // emoji 图标
    title: '我的课表',    // 卡片标题
    href: '#schedule',   // 链接。'#'开头表示 JS 事件处理
    cls: 'go-schedule'   // 可选，附加 CSS 类。'go-schedule' 触发 Injector 的事件监听
  },
  {
    icon: '📊',
    title: '我的成绩',
    href: `/eams/teach/grade/course/person!search.action?semesterId=${currentSid}&projectType=`
    // cls 不存在 → 直接作为 <a href="..."> 渲染
  },
  {
    icon: '📋',
    title: '我的考试',
    href: `/eams/stdExamTable!examTable.action?semester.id=${currentSid}&examType.id=1`
  }
]
```

**渲染逻辑**：有 `cls` → `<a class="eams-card {cls}" href="#" data-href="{href}">`；无 `cls` → `<a class="eams-card" href="{href}">`。

#### 功能链接分组 (`linkGroups`)

```javascript
const linkGroups = [
  {
    title: '📋 课程管理',        // 分组标题
    items: [                     // 该组下的链接列表
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
    ]
  },
  {
    title: '👤 我的信息',
    items: [
      { label: '我的学籍', href: '/eams/stdDetail.action' },
      { label: '个人联系信息维护', href: '/eams/stdInfoEdit.action' },
      { label: '我的注册', href: '/eams/registerApply.action' },
      { label: '我的缴费信息', href: '/eams/myPayment.action' },
    ]
  },
  {
    title: '📖 我的重修',
    items: [
      { label: '重修报名申请', href: '/eams/restudyApply.action' },
      { label: '重修选课缴费', href: '/eams/stdRestudyApplySearch.action' },
      { label: '我的重修课表', href: '/eams/courseTableForReStd.action' },
      { label: '重修报名日志查询', href: '/eams/restudyApplyLogs.action' },
    ]
  },
  {
    title: '🎓 辅修与双学位',
    items: [
      { label: '辅修报名', href: '/eams/stdAssistApply.action' },
      { label: '辅修选课与缴费', href: '/eams/stdAssistPay!innerIndex.action' },
    ]
  }
]
```

**渲染逻辑**：每个分组渲染为：
```html
<div class="eams-link-group">
  <h3 class="eams-link-group-title">{title}</h3>
  <div class="eams-link-grid">
    <a href="{href}" class="eams-link-btn" target="_blank">{label} →</a>
    <!-- 所有 items 循环 -->
  </div>
</div>
```

**完整 HTML 输出结构**（含校徽头 + 信息栏 + 卡片 + 链接）：
```html
<div class="eams-container">
  <div class="eams-header eams-header-custom">
    <div class="eams-header-left">
      <img src="chrome-extension://xxx/assets/icons/badge.png" class="eams-badge">
      <div>
        <h1>电子科技大学</h1>
        <p>本科教学管理系统</p>
      </div>
    </div>
    <a href="/eams/home!index.action" class="eams-back-link">返回原版 →</a>
  </div>
  <div class="eams-info-bar">
    <span>当前学期：{semesterName}</span>
  </div>
  <div class="eams-core-grid">
    <!-- 3 张卡片 -->
  </div>
  <!-- 4 组 linkGroups -->
</div>
```

**CSS 关联**：`.eams-header-custom` / `.eams-header-left` / `.eams-badge` / `.eams-info-bar` / `.eams-core-grid` / `.eams-card` / `.eams-card-icon` / `.eams-card-title` / `.eams-link-group` / `.eams-link-group-title` / `.eams-link-grid` / `.eams-link-btn`。

---

### 3.5 `Templates.grades(data)`

**签名**：`grades({ grades, gpa, wavg, sid, sList })`

**参数完整结构**：

```javascript
grades[i] = {
  courseCode: string,        // 课程代码，如 "E0900420"
  courseName: string,        // 课程名称，如 "大学物理实验I"
  courseType: string,        // 课程类别，如 "学科基础课"
  credits: string,           // 学分，如 "1.0"
  finalExam: string,         // 期末成绩，如 "85"
  totalScore: string,        // 总评成绩，如 "88"
  gpa: string,               // 绩点，如 "3.7"
  usualScore: string,        // 平时成绩，"90" 或 ""（空串=无）
  usualLessonId: string,     // 平时成绩详情 ID，"12345" 或 ""（空串=无详情）
  usualCourseNumber: string, // 课序号（可选），如 "01" 或 ""
}

gpa = {
  avgGPA: string,            // 平均绩点，如 "3.52"
  totalCredits: string,      // 总学分，如 "18.0"
}

wavg: string                 // 加权平均分，如 "85.63"
sid: string                  // 当前选中学期 ID
sList: Array                 // 学期列表，格式 [{ id: string, name: string }]
```

#### 分数颜色逻辑（内联判断，无独立方法）

| 条件 | CSS 类 | 效果 |
|------|--------|------|
| `isNaN(parseFloat(totalScore))` | `''`（无） | 默认颜色 |
| `totalScore >= 90` | `score-high` | `var(--success)` 绿色 |
| `totalScore >= 80` | `score-medium` | `var(--warning)` 琥珀色 |
| `totalScore < 80` | `score-low` | `var(--danger)` 红色 |

#### 平时成绩按钮逻辑

- 仅在 `usualScore` 非空时显示
- 若 `usualLessonId` 也存在，显示 📋 按钮（`<span class="eams-usual-btn">`）
- 按钮携带 `data-id`（lessonId）、`data-course`、`data-code`、`data-coursenum` 属性
- 点击触发 `Injector._bindGradeCheckboxes()` 中的事件处理：显示弹窗 → fetch 平时成绩详情 → 渲染 `Templates.usualModal()`
- 若 `usualScore` 非空但 `usualLessonId` 为空，只显示分数，不显示 📋 按钮

#### 复选框 GPA 重算逻辑

- 每行有 `<input type="checkbox" class="eams-grade-check" data-i="{index}">`
- 取消勾选 → 重新计算 GPA、加权平均、总学分（排除该课程）
- 统计卡片实时更新：`#eams-avg-gpa`、`#eams-wavg`、`#eams-total-credits`、`#eams-course-count`

#### 学期切换

- 下拉框 `<select id="eams-semester-select">` → 切换后跳转到新 URL：`/eams/teach/grade/course/person!search.action?semesterId={newSid}`

**输出 HTML 结构**：
```html
<div class="eams-container">
  <div class="eams-header"><h1>📊 我的成绩</h1><a href="...">← 返回主页</a></div>
  <div class="eams-toolbar">
    <select class="eams-select" id="eams-semester-select">...</select>
  </div>
  <div class="eams-stat-grid eams-stat-grid-4">
    <div class="eams-stat-card"><div class="eams-stat-value">3.52</div><div class="eams-stat-label">平均绩点</div></div>
    <!-- 4 个统计卡片 -->
  </div>
  <div class="eams-table-wrap">
    <table class="eams-table">
      <thead><tr><th>计入</th><th>课程名称</th><th>课程类别</th><th>学分</th><th>期末成绩</th><th>总评成绩</th><th>绩点</th><th>平时成绩</th></tr></thead>
      <tbody>...</tbody>
    </table>
  </div>
</div>
```

**CSS 关联**：`.eams-toolbar` / `.eams-select` / `.eams-stat-grid` / `.eams-stat-grid-4` / `.eams-stat-card` / `.eams-stat-value` / `.eams-stat-label` / `.eams-table-wrap` / `.eams-table` / `.eams-grade-check` / `.eams-usual-btn` / `.eams-col-center` / `.eams-col-left` / `.eams-col-muted` / `.eams-empty` / `.score-high` / `.score-medium` / `.score-low`。

---

### 3.6 `Templates.exams(data)`

**签名**：`exams({ exams, sid, etype, sList })`

**参数完整结构**：

```javascript
exams[i] = {
  courseName: string,    // 课程名称，如 "大学物理"
  date: string,          // 考试日期，"2026年6月24日" / "2026-06-24"
  time: string,          // 考试时间，"09:00-11:00"
  classroom: string,     // 教室，"品学楼A201"
  seatNo: string,        // 座位号，"15"
  examType: string,      // 考试类型，"期末考试"（从 EAMS 原始页面抓取）
}

sid: string              // 当前学期 ID
etype: string            // 考试类型 ID："1"=期末考试 "2"=期中考试 "3"=补缓考
sList: Array             // 学期列表
```

#### 倒计时辅助方法 `_examCountdown(dateStr)`

返回 `{ text: string, bg: string }`：

| 条件 | `text` | `bg`（CSS 背景色） |
|------|--------|-------------------|
| 距离考试 > 3 天 | `"N天"` | `var(--primary)` 蓝色 |
| 1-3 天（含） | `"N天"` | `var(--danger)` 红色 |
| 当天 | `"今天"` | `var(--danger)` 红色 |
| 已过 | `"已结束"` | `var(--text-secondary)` 灰色 |
| 日期无效/为空 | `"未知"` | `var(--text-secondary)` 灰色 |

支持日期格式：`"2026年6月24日"`、`"2026-06-24"`、`"2026-06-24 00:00:00"`。

#### 考试类型映射（来自 `CONFIG.examTypes`）

```javascript
const examTypes = {
  '1': '期末考试',
  '2': '期中考试',
  '3': '补缓考',
};
```

**输出 HTML 结构**：
```html
<div class="eams-container">
  <div class="eams-header"><h1>📋 我的考试</h1><a href="...">← 返回主页</a></div>
  <div class="eams-toolbar">
    <select id="eams-exam-semester">...</select>
    <select id="eams-exam-type">
      <option value="1">期末考试</option>
      <option value="2">期中考试</option>
      <option value="3">补缓考</option>
    </select>
  </div>
  <div class="eams-card-list">
    <div class="eams-exam-item">
      <div class="eams-exam-countdown" style="background:...">
        <div class="eams-exam-cd-num">3天</div>
      </div>
      <div class="eams-exam-info">
        <h3>课程名称</h3>
        <div class="eams-exam-details">
          <span>📅 2026-06-24</span>
          <span>⏰ 09:00-11:00</span>
          <span>📍 品学楼A201</span>
          <span>💺 座位 15</span>
        </div>
      </div>
    </div>
  </div>
</div>
```

---

### 3.7 `Templates.schedule(data)`

**签名**：`schedule({ cells, sid, kind, week, sList })`

#### `cells` 数据结构

这是课表最核心的数据。key 的格式为 `"{dayIndex}_{periodIndex}"`：

```javascript
cells = {
  "0_0": [{ courseName, teacherName, roomName, validWeeks }],  // 周一 第1节
  "3_5": [{ courseName, teacherName, roomName, validWeeks }],  // 周四 第6节
  "6_11": [{ courseName, teacherName, roomName, validWeeks }], // 周日 第12节
  // 同一个格子可能有多门课（合并显示）
  "1_2": [
    { courseName: "高等数学", teacherName: "张老师", roomName: "品学楼A301", validWeeks: "1-16周" },
    { courseName: "英语",     teacherName: "李老师", roomName: "品学楼B201", validWeeks: "3-12周(双)" }
  ]
}
```

**索引规则**：
- `dayIndex`: `0`=周一 `1`=周二 ... `6`=周日（与 `CONFIG.days` 对应）
- `periodIndex`: `0`=第1节 `1`=第2节 ... `11`=第12节
- 一个格子里可能有多门课（数组），用 `<hr>` 分隔显示（最多显示 5 门）

#### 单元格合并逻辑

连续相同课程（`courseName` 相同）会合并，用 `rowspan` 实现：
```javascript
// 例：周一第 1-2 节都是"高等数学(张老师)" → 渲染一个 rowspan=2 的 td
rowspan["0_0"] = 2  // 第1节标记 rowspan=2
skip["0_1"] = true  // 第2节跳过渲染
```

#### 其他参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `sid` | string | 当前学期 ID |
| `kind` | string | `"std"` = 学生课表, `"class"` = 班级课表 |
| `week` | string | `""` = 全部周次, 或 `"1"`~`"20"` = 某周 |
| `sList` | Array | 学期列表 |

#### 节次背景色

```javascript
const periodBg = (p) => p < 4 ? '#EEFF00'       // 第1-4节 → 黄色
                   : p < 8 ? '#33BB00'            // 第5-8节 → 绿色
                   : 'pink';                      // 第9-12节 → 粉色
```

#### 私有辅助 `_scheduleCellContent(courses)`

- 合并同课程：用 `courseName|teacherName` 作为合并 key
- 合并周次：用 `WeekParser.merge()` 合并
- 最多显示 5 门课
- 每门课渲染：`教师名 课程名` + `有效周数` + `教室`
- 多门课用 `<hr class="eams-course-divider">` 分隔

**输出 HTML 结构**：
```html
<div class="eams-container">
  <div class="eams-header"><h1>📅 我的课表</h1><a href="...">← 返回主页</a></div>
  <div class="eams-toolbar">
    <select id="eams-sched-semester">...</select>
    <select id="eams-sched-kind">
      <option value="std">学生课表</option>
      <option value="class">班级课表</option>
    </select>
    <select id="eams-sched-week">
      <option value="">全部周次</option>
      <option value="1">第1周</option> <!-- 1-20 -->
    </select>
  </div>
  <div class="eams-schedule-wrap">
    <table class="eams-schedule-table">
      <thead><tr><th class="eams-period-header">节次</th><th class="eams-day-header">周一</th>...<th class="eams-day-header">周日</th></tr></thead>
      <tbody>
        <tr>
          <td class="eams-period-cell" style="background:#EEFF00">第1节</td>
          <td class="eams-course-cell" rowspan="2">...</td>
          <td class="eams-empty-cell"></td>
          ...
        </tr>
        <!-- 12 行 -->
      </tbody>
    </table>
  </div>
</div>
```

---

### 3.8 `Templates._semesterOpts(list, selectedId)`

**用途**：生成学期下拉框的 `<option>` HTML。

**签名**：`_semesterOpts(list, selectedId)`

**参数**：
- `list`: `[{ id: "483", name: "2025-2026 第一学期" }, ...]`
- `selectedId`: 当前选中的学期 ID

**返回**：`<option value="483" selected>2025-2026 第一学期</option><option value="503">2025-2026 第二学期</option>...`

**用于**：所有页面的学期选择器（grades / exams / schedule）。

---

### 3.9 `Templates.usualModal(courseName, courseCode, courseNumber, teacher, dept, items)`

**用途**：平时成绩详情弹窗。

**参数**：
| 参数 | 类型 | 说明 |
|------|------|------|
| `courseName` | string | 课程名 |
| `courseCode` | string | 课程代码 |
| `courseNumber` | string | 课序号（可能为空） |
| `teacher` | string | 教师名（可能为空） |
| `dept` | string | 院系（可能为空） |
| `items` | Array | `[{ type: "作业", score: "95" }, ...]` |

**事件绑定**：
- 点击遮罩层 → 关闭弹窗
- 点击 ✕ 按钮 → 关闭弹窗

**输出 HTML**：
```html
<div class="eams-modal-overlay" onclick="closeModal()">
  <div class="eams-modal-box" onclick="event.stopPropagation()">
    <div class="eams-modal-header">
      <h3>📋 {courseName}</h3>
      <span class="eams-modal-close" onclick="closeModal()">✕</span>
    </div>
    <div class="eams-modal-body">
      <div class="eams-usual-info">{courseCode} · {courseNumber} · {teacher} · {dept}</div>
      <table class="eams-table">
        <thead><tr><th>次数</th><th>成绩类型</th><th>成绩</th></tr></thead>
        <tbody><tr><td>1</td><td>作业</td><td>95</td></tr></tbody>
      </table>
    </div>
  </div>
</div>
```

---

### 3.10 `Templates._loading()` — 页面切换加载动画

**用途**：页面加载时显示的过渡动画，遮挡原页面构建过程。可自定义为任意 HTML/CSS 动画。

**签名**：`_loading()`

**参数**：无（数据通过 `data` 对象传入 `{{field}}` 占位符引用）。

**数据字段**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `isDark` | boolean | 当前是否为暗色模式 |

**默认输出**（内置 spinner）：
```html
<div class="eams-loading">
  <div class="eams-spinner"></div>
  <div style="margin-top:16px;font-size:16px;color:var(--text-secondary,#64748b)">加载中...</div>
</div>
```

**CSS 关联**：
- `.eams-spinner` — 旋转圆环（40×40，4px border，右上蓝色），由 `@keyframes eams-spin`（0.8s linear infinite）驱动
- `#eams-loading-overlay` — 固定定位全屏遮罩，z-index: 1000000

**自定义方式**：在 `dev/templates/` 下创建 `_loading` 模板（见 §7.8.5），通过 Popup 导入或 build script 注入。无自定义模板时自动降级到内置 spinner。

---

## 4. Injector 参考

Injector 是页面注入器——它调用 DataFetcher 拿数据，调用 Templates 渲染，再把结果写入 DOM。一般不改这里，除非你要改注入逻辑。

| 方法 | 行为 | 异步？ |
|------|------|--------|
| `Injector.dashboard()` | 创建浮动 overlay（`#eams-opt-overlay`），隐藏原 body 子节点。绑定"我的课表"卡片点击事件（GET `/eams/courseTableForStd.action`） | ❌ |
| `Injector.grades()` | 显示加载 → 调用 `DataFetcher.grades(sid)` → 计算 GPA → 渲染 → 绑定复选框+平时成绩按钮事件 | ✅ |
| `Injector.exams()` | 显示加载 → 调用 `DataFetcher.exams(sid, etype)` → 渲染 → 绑定下拉框事件（跳转 URL） | ✅ |
| `Injector.schedule()` | 轮询等待课表 DOM 加载 → 检测状态 → 解析格子 → 渲染 → 绑定下拉框事件（POST 提交查询） | ✅ |
| ~~`Injector._showLoading(emoji, text)`~~ | ~~用加载模板替换 body~~（**已删除**，改用 §3.10 的 overlay 体系） | — |
| `Injector._bindGradeCheckboxes(grades)` | 为 `.eams-grade-check` 绑定 change 事件（重算 GPA），为 `.eams-usual-btn` 绑定 click 事件（fetch 详情+弹窗） | ✅ |
| `Injector._bindExamSelectors()` | 为学期/考试类型下拉框绑定 change 事件，跳转对应 URL | ❌ |
| `Injector._bindScheduleSelectors()` | 构建隐藏表单并 POST 提交到课表查询接口 | ❌ |

---

## 5. 完整修改示例

### 5.1 示例：改为深色主题（纯 CSS）

改 `content/styles.css` 的 `:root` 变量：

```css
:root {
  --bg: #0f172a;
  --card: #1e293b;
  --text: #f1f5f9;
  --text-secondary: #94a3b8;
  --border: #334155;
}
```

其余完全不动。

---

### 5.2 示例：在 Dashboard 加「每日课数」欢迎语

改 `Templates.dashboard()`（main.js 第 828-905 行）。在 `shell` 调用的内容开头加一行：

```javascript
// Templates.dashboard() 中，在 return Templates.shell(...) 的内容最前面：
const todayCourses = calculateTodayCourses(semesterName); // 你自己定义的函数
return Templates.shell('', '', `
  <div class="eams-welcome">你好👋，今天有 ${todayCourses} 节课</div>
  <!-- 剩下的校徽头 + 卡片 + 链接 -->
`);
```

你还需要在 `Templates.dashboard()` 上方定义 `calculateTodayCourses()`。

---

### 5.3 示例：给成绩表加新列

#### 情况 A：列的内容从已有数据派生（无需改 DataFetcher）

例如加一列"总绩点 = 绩点 × 学分"：

```javascript
// Templates.grades() 中，在 map 循环里加：
const totalGpaPoint = (parseFloat(g.gpa) * parseFloat(g.credits)).toFixed(1);

// 在表头加一列：
// 在 `</tr></thead>` 之前加 <th>总绩点</th>
// 在行模板加 <td>${totalGpaPoint}</td>
```

**完整修改**（在 `grades()` 的 `rows = grades.map(...)` 内部）：

```javascript
const sc = parseFloat(g.totalScore);
const cls = isNaN(sc) ? '' : sc >= 90 ? 'score-high' : sc >= 80 ? 'score-medium' : 'score-low';
const totalGpaPoint = (parseFloat(g.gpa) * parseFloat(g.credits)).toFixed(1); // ← 新增
return `<tr>
  <td><input type="checkbox" checked class="eams-grade-check" data-i="${i}"></td>
  <td>${g.courseName}</td>
  <td class="eams-col-muted">${g.courseType}</td>
  <td class="eams-col-center">${g.credits}</td>
  <td class="eams-col-center">${g.finalExam}</td>
  <td class="eams-col-center ${cls}">${g.totalScore}</td>
  <td class="eams-col-center">${g.gpa}</td>
  <td class="eams-col-center">${totalGpaPoint}</td>  <!-- 替换原来的绩点列，或作为新列 -->
  <td class="eams-col-center">...</td>
</tr>`;
```

表头也同步加对应 `<th>`。

#### 情况 B：列的内容来自 EAMS 已有但插件没抓的字段（需改 DataFetcher）

例如加一列"排名"——EAMS 成绩页有排名数据，但 DataFetcher 没抓它：

**第 1 步**：在 `DataFetcher.grades(sid)` 的解析逻辑中找到排名数据。找到 EAMS 返回 HTML 中排名所在的 DOM 元素，加一行解析：

```javascript
// DataFetcher.grades() 的解析循环中：
rank: row.querySelector('.rank-col')?.textContent?.trim() || 'N/A',
```

**第 2 步**：在 `Templates.grades()` 中渲染它（同情况 A）。

---

### 5.4 示例：往 Dashboard 加一个自定义链接

改 `Templates.dashboard()` 中的 `linkGroups` 数组。比如在「我的信息」组加一个"校园地图"链接：

```javascript
{ title: '👤 我的信息', items: [
  { label: '我的学籍', href: '/eams/stdDetail.action' },
  { label: '校园地图', href: 'https://map.uestc.edu.cn' },  // ← 新增
  // ...
]},
```

或新增一个分组：

```javascript
const linkGroups = [
  // 已有分组...
  { title: '🔧 常用工具', items: [          // ← 新分组
    { label: '校园 VPN', href: 'https://vpn.uestc.edu.cn' },
    { label: '图书馆', href: 'https://lib.uestc.edu.cn' },
  ]},
];
```

---

### 5.5 示例：改课表的时间段配色

改 `Templates.schedule()` 中的 `periodBg` 函数：

```javascript
// 原版
const periodBg = (p) => p < 4 ? '#EEFF00' : p < 8 ? '#33BB00' : 'pink';

// 改为蓝紫色系
const periodBg = (p) => p < 4 ? '#E0F2FE' : p < 8 ? '#DDD6FE' : '#FECDD3';

// 或用 CSS 变量
const periodBg = (p) => p < 4 ? 'var(--primary)' : p < 8 ? 'var(--success)' : 'var(--warning)';
```

---

### 5.6 示例：隐藏 Dashboard 的学期信息栏

纯 CSS，在 `content/styles.css` 加一行：

```css
.eams-info-bar { display: none; }
```

---

### 5.7 示例：把考试改为按教室分组

改 `Templates.exams()` 的渲染逻辑：

```javascript
// exams() 中，把 exams 按 classroom 分组：
const grouped = {};
for (const e of exams) {
  const room = e.classroom || '未分配';
  if (!grouped[room]) grouped[room] = [];
  grouped[room].push(e);
}

// 然后分组渲染：
const items = Object.entries(grouped).map(([room, roomExams]) => `
  <h3>📍 ${room}</h3>
  ${roomExams.map(e => `<div class="eams-exam-item">...</div>`).join('')}
`).join('');
```

---

## 6. 逐步教程：添加新页面

要在插件里加一个全新的页面，分 4 步：

### 第 1 步：在 Templates 加渲染方法

```javascript
// Templates 对象中（main.js ~805-1131 行）
myNewPage(data) {
  const { items, sid, sList } = data;
  const listHTML = items.map(item => `
    <div class="eams-card-item">
      <h3>${item.title}</h3>
      <p>${item.description}</p>
    </div>
  `).join('');
  
  return Templates.shell('📌 新页面', '/eams/home!submenus.action?menu.id=', `
    <div class="eams-toolbar">
      <select class="eams-select">${Templates._semesterOpts(sList, sid)}</select>
    </div>
    <div class="eams-card-list">${listHTML || '<div class="eams-empty-state">暂无数据</div>'}</div>
  `);
}
```

### 第 2 步：在 detectPage() 加 URL 匹配

```javascript
// detectPage() 函数中
if (url.includes('myNewPage')) return 'myNewPage';
```

插在最后一个条件之前（第 1360 行之前）。

### 第 3 步：在 Injector 加注入方法

```javascript
// Injector 对象中
async myNewPage() {
  this._showLoading('🚀', '加载中...');
  try {
    const sid = Semester.getId(); // 或用 URL 参数获取
    const data = await DataFetcher.myNewPageData(sid); // 如果你有 DataFetcher 方法
    // 或直接用静态数据：
    // const data = { items: [...], sid, sList: Semester.getList() };
    document.body.innerHTML = Templates.myNewPage(data);
    this._bindMyNewPageSelectors();
  } catch (e) {
    document.body.innerHTML = Templates.error(e.message);
  }
}
```

### 第 4 步：在 main() 的 switch 加 case

```javascript
// main() 的 switch 中
case 'myNewPage': Injector.myNewPage(); break;
```

---

## 7. Build Script — 模板编写参考

> 本节为**模板语法规范**，写给人类和 AI 共同阅读。
> 用本节语法写出的 `.html` + `.json` 文件，放入 `dev/templates/` 目录，运行 `node scripts/build-template.js <模板名>` 即可注入插件。

---

### 7.1 快速索引

| 你想 | 看 |
|-----|----|
| 了解全部占位符 | [7.2 占位符语法](#72-占位符语法) |
| 写一个新模板 | [7.3 JSON 配置](#73-json-配置) + [7.4 模板结构规范](#74-模板结构规范) |
| 改考试页模板 | [7.5 完整示例：exams](#75-完整示例-exams-模板) |
| 改课表页模板 | [7.6 完整示例：schedule](#76-完整示例-schedule-模板) |
| 改成绩页模板 | [7.7 完整示例：grades](#77-完整示例-grades-模板) |
| 改 Dashboard 模板 | [7.8 完整示例：dashboard](#78-完整示例-dashboard-模板) |
| 数据从哪里来 | [7.9 数据契约](#79-数据契约每个模板收到的-data-对象) |
| 运行注入命令 | [7.10 工作流](#710-工作流) |

---

### 7.2 占位符语法

模板文件（.html）中可使用以下占位符：

#### 7.2.1 普通字段 `{{fieldName}}`

**语法**：`{{字段名}}`
**生成**：`${data.字段名}`
**适用**：模板顶层（不在循环内）引用数据字段时

```
模板：当前学期：{{semesterName}}
生成：当前学期：${data.semesterName}
```

#### 7.2.2 内联表达式 `{{=JS表达式}}`

**语法**：`{{=任意JS表达式}}`
**生成**：`${任意JS表达式}`
**适用**：需要调用函数或计算时

```
模板：<span style="background:{{=Templates._examCountdown(item.date).bg}}">
生成：<span style="background:${Templates._examCountdown(item.date).bg}">
```

可在 `{{=}}` 中使用的全局变量：
- `data` — 当前模板的数据对象
- `item` — 仅在 `{{#each}}` 块内可用，指数组当前元素
- `Templates` — 可调用其他模板方法
- `CONFIG` — 配置常量
- `WeekParser` — 周次工具
- `Semester` — 学期工具

#### 7.2.3 循环 `{{#each array}}...{{/each}}`

**语法**：
```
{{#each 数组名}}
  ...{{字段名}}...{{=表达式}}...
{{/each}}
```
**生成**：`data.数组名.map(item => \`...\`).join('')`
**规则**：
- 循环内部用 `{{字段名}}` 引用 **数组元素的属性**
- 循环内部也可用 `{{=表达式}}`，其中用 `item.属性` 引用
- 同一模板可以有多个循环

```
模板：
{{#each exams}}
  <div>{{courseName}} — {{date}}</div>
{{/each}}

生成：
${data.exams.map(item => `
  <div>${item.courseName} — ${item.date}</div>
`).join('')}
```

#### 7.2.4 特殊占位符（自动生成 HTML）

以下占位符由脚本识别并替换为完整 HTML 代码段：

| 占位符 | 生成代码 | 用于 |
|--------|---------|------|
| `{{sListOptions}}` | `Templates._semesterOpts(data.sList, data.sid)` | 学期下拉框 `<option>` 列表 |
| `{{examTypeOptions}}` | `CONFIG.examTypes` 遍历渲染 | 考试类型下拉框（期末考试/期中考试/补缓考） |

> ⚠️ **特殊占位符不能用在 `{{#each}}` 内部。**

#### 7.2.5 综合示例

```html
<div class="eams-toolbar">
  <select id="semester">{{sListOptions}}</select>
  <select id="type">{{examTypeOptions}}</select>
</div>

<div class="eams-card-list">
  {{#each exams}}
  <div class="eams-exam-item">
    <!-- 普通字段 -->
    <h3>{{courseName}}</h3>
    <span>📅 {{date}}</span>
    <!-- 内联表达式（调用函数） -->
    <span class="cd" style="background:{{=Templates._examCountdown(item.date).bg}}">
      {{=Templates._examCountdown(item.date).text}}
    </span>
  </div>
  {{/each}}
</div>
```

---

### 7.3 JSON 配置

每个模板需要一个同名的 `.json` 配置文件。

#### 字段说明

```json
{
  "methodName": "exams",
  "pageTitle": "📋 我的考试",
  "backLink": "/eams/home!submenus.action?menu.id=",
  "urlPattern": "stdExamTable!examTable",
  "injectorType": "async"
}
```

| 字段 | 必填 | 类型 | 说明 |
|------|------|------|------|
| `methodName` | ✅ | string | 对应 `Templates.methodName()`。**与页面同名时替换，不同名时新增** |
| `pageTitle` | ✅ | string | 页面标题，出现在 `<h1>` 中和 JSDoc 注释中 |
| `backLink` | ❌ | string | "返回主页"链接。默认 `/eams/home!submenus.action?menu.id=` |
| `urlPattern` | ✅ | string | EAMS URL 中包含的特征字符串，用于 `detectPage()` 匹配 |
| `injectorType` | ❌ | string | `"async"` 或 `"sync"`。默认 `"async"`。仅新增页面时生效 |
| `--` | `cssPath` | ❌ | string | 自动检测：同目录下同名的 `.css` 文件会被注入到 `styles.css` |

> 📁 **CSS 注入**：在同目录放一个 `<模板名>.css` 文件，脚本会自动将其内容注入到 `styles.css` 的 `/* @INJECT:STYLES */` 标记处。
> 可用于覆盖 CSS 变量、增加页面专属样式，或完全重写组件样式。

---

### 7.4 模板结构规范

每个模板文件的通用骨架：

```html
<!-- 模板顶部注释：说明页面用途 -->
<div class="eams-toolbar">
  <!-- 下拉框选择器（如有） -->
  <select class="eams-select">{{sListOptions}}</select>
</div>

<!-- 主体内容区域 -->
<div class="eams-xxx">
  {{#each items}}
  <div class="eams-item">
    <!-- 渲染每项数据 -->
  </div>
  {{/each}}
</div>
```

**CSS 类命名规范**（保持已有风格）：
- 容器：`.eams-container`（由 shell 自动包装）
- 工具栏：`.eams-toolbar`
- 下拉框：`.eams-select`
- 表格：`.eams-table` → 表头 `.eams-table thead`，条目 `.eams-table tbody`
- 统计卡片网格：`.eams-stat-grid`
- 空状态：`.eams-empty` / `.eams-empty-state`
- 列对齐：`.eams-col-center` / `.eams-col-left`

---

### 7.5 完整示例：exams 模板

```html
<!-- 考试页模板 — 替换 Templates.exams(data) -->
<div class="eams-toolbar">
  <select class="eams-select" id="eams-exam-semester">{{sListOptions}}</select>
  <select class="eams-select" id="eams-exam-type">{{examTypeOptions}}</select>
</div>

<div class="eams-card-list">
  {{#each exams}}
  <div class="eams-exam-item">
    <div class="eams-exam-countdown"
         style="background:{{=Templates._examCountdown(item.date).bg}}">
      <div class="eams-exam-cd-num">
        {{=Templates._examCountdown(item.date).text}}
      </div>
    </div>
    <div class="eams-exam-info">
      <h3>{{courseName}}</h3>
      <div class="eams-exam-details">
        <span>📅 {{date}}</span>
        <span>⏰ {{time}}</span>
        <span>📍 {{classroom}}</span>
        <span>💺 座位 {{seatNo}}</span>
      </div>
    </div>
  </div>
  {{/each}}
</div>
```

配套 `exams.json`：

```json
{
  "methodName": "exams",
  "pageTitle": "📋 我的考试",
  "backLink": "/eams/home!submenus.action?menu.id=",
  "urlPattern": "stdExamTable!examTable",
  "injectorType": "async"
}
```

> ⚠️ **注意**：倒计时必须用 `{{=Templates._examCountdown(item.date)}}` 语法，因为 `countdownText` 和 `countdownBg` 不是数据字段，而是由日期实时计算得出的。

---

### 7.6 完整示例：schedule 模板

```html
<!-- 课表页模板 — 替换 Templates.schedule(data) -->
<div class="eams-toolbar">
  <select class="eams-select" id="eams-sched-semester">{{sListOptions}}</select>
  <select class="eams-select" id="eams-sched-kind">
    <option value="std"{{=data.kind === 'std' ? ' selected' : ''}}>学生课表</option>
    <option value="class"{{=data.kind === 'class' ? ' selected' : ''}}>班级课表</option>
  </select>
  <select class="eams-select" id="eams-sched-week">
    <option value=""{{=data.week === '' ? ' selected' : ''}}>全部周次</option>
    {{#each weeks}}
    <option value="{{value}}"{{=data.week === value ? ' selected' : ''}}>第{{value}}周</option>
    {{/each}}
  </select>
</div>

<div class="eams-schedule-wrap">
  <table class="eams-schedule-table">
    <thead>
      <tr>
        <th class="eams-period-header">节次</th>
        {{#each dayHeaders}}
        <th class="eams-day-header">{{name}}</th>
        {{/each}}
      </tr>
    </thead>
    <tbody>
      {{#each rows}}
      <tr>
        <td class="eams-period-cell" style="background:{{bg}}">第{{index}}节</td>
        {{#each cells}}
        <td class="{{=item.courses ? 'eams-course-cell' : 'eams-empty-cell'}}"
            {{=item.rowspan > 1 ? 'rowspan="' + item.rowspan + '"' : ''}}>
          {{=item.courses || ''}}
        </td>
        {{/each}}
      </tr>
      {{/each}}
    </tbody>
  </table>
</div>
```

> ⚠️ **注意**：课表的数据结构较复杂，建议直接修改原 `Templates.schedule()` 的 JS 逻辑（§3.7），而不是用模板替换——课表的 rowspan 合并、节次背景色计算、课程去重等逻辑在 JS 中处理比在模板中更清晰。

---

### 7.7 完整示例：grades 模板

```html
<!-- 成绩页模板 — 替换 Templates.grades(data) -->
<div class="eams-toolbar">
  <select class="eams-select" id="eams-semester-select">{{sListOptions}}</select>
</div>

<div class="eams-stat-grid eams-stat-grid-4">
  <div class="eams-stat-card">
    <div class="eams-stat-value" style="color:var(--primary)">{{gpa.avgGPA}}</div>
    <div class="eams-stat-label">平均绩点</div>
  </div>
  <div class="eams-stat-card">
    <div class="eams-stat-value" style="color:#8b5cf6">{{wavg}}</div>
    <div class="eams-stat-label">加权平均</div>
  </div>
  <div class="eams-stat-card">
    <div class="eams-stat-value" style="color:var(--primary)">{{gpa.totalCredits}}</div>
    <div class="eams-stat-label">已修学分</div>
  </div>
  <div class="eams-stat-card">
    <div class="eams-stat-value" style="color:var(--primary)">{{=data.grades.length}}</div>
    <div class="eams-stat-label">课程数量</div>
  </div>
</div>

<div class="eams-table-wrap">
  <table class="eams-table">
    <thead>
      <tr>
        <th style="width:40px">计入</th>
        <th>课程名称</th>
        <th>课程类别</th>
        <th>学分</th>
        <th>期末成绩</th>
        <th>总评成绩</th>
        <th>绩点</th>
        <th>平时成绩</th>
      </tr>
    </thead>
    <tbody>
      {{#each grades}}
      <tr>
        <td class="eams-col-center">
          <input type="checkbox" checked class="eams-grade-check" data-i="{{=item.index}}">
        </td>
        <td>{{courseName}}</td>
        <td class="eams-col-muted">{{courseType}}</td>
        <td class="eams-col-center">{{credits}}</td>
        <td class="eams-col-center">{{finalExam}}</td>
        <!-- 分数颜色用内联表达式判定 -->
        <td class="eams-col-center
          {{=parseFloat(item.totalScore) >= 90 ? 'score-high' : parseFloat(item.totalScore) >= 80 ? 'score-medium' : parseFloat(item.totalScore) ? 'score-low' : ''}}">
          {{totalScore}}
        </td>
        <td class="eams-col-center">{{gpa}}</td>
        <td class="eams-col-center">
          {{=item.usualScore ? item.usualScore + (item.usualLessonId ? ' <span class="eams-usual-btn">📋</span>' : '') : '<span class="eams-col-muted">-</span>'}}
        </td>
      </tr>
      {{/each}}
    </tbody>
  </table>
</div>
```

> ⚠️ **注意**：
> - 复选框的 `data-i` 索引用 `{{=item.index}}` 获取（在 `{{#each}}` 内部 `item` 指向数组元素，不包含 index，所以需要额外处理）
> - 分数颜色逻辑和平时成绩按钮逻辑在 `{{=}}` 中完整保留了原 JS 逻辑
> - 如果要在模板中获取数组索引，需在 Injector 传入数据时预加 `index` 字段

---

### 7.8 完整示例：dashboard 模板

Dashboard 的数据较特殊（没有 DataFetcher），直接用 `Semester` 工具构造：

```html
<!-- Dashboard 模板 — 替换 Templates.dashboard(data) -->
<!-- data: { semesterName, currentSid } -->
<div class="eams-toolbar">
  <span class="eams-info-bar">当前学期：{{semesterName}}</span>
</div>

<div class="eams-core-grid">
  <a class="eams-card go-schedule" href="#" data-href="#schedule">
    <div class="eams-card-icon">📅</div>
    <div class="eams-card-title">我的课表</div>
  </a>
  <a class="eams-card"
     href="{{='/eams/teach/grade/course/person!search.action?semesterId=' + data.currentSid + '&projectType='}}">
    <div class="eams-card-icon">📊</div>
    <div class="eams-card-title">我的成绩</div>
  </a>
  <a class="eams-card"
     href="{{='/eams/stdExamTable!examTable.action?semester.id=' + data.currentSid + '&examType.id=1'}}">
    <div class="eams-card-icon">📋</div>
    <div class="eams-card-title">我的考试</div>
  </a>
</div>
```

---

### 7.8.5 `_loading` 模板示例

**用途**：自定义页面加载动画。无自定义模板时使用内置 CSS spinner。

**JSON 配置**（`_loading.json`）：
```json
{
  "methodName": "_loading",
  "pageTitle": "加载动画",
  "urlPattern": "（非页面类型，无 URL 匹配）",
  "injectorType": "none",
  "dataFields": ["isDark"]
}
```

**数据字段**：
| 字段 | 类型 | 示例值 | 说明 |
|------|------|--------|------|
| `isDark` | boolean | `false` | 当前是否为暗色模式。可用于切换加载画面背景色 |

**完整 HTML 模板示例**（`_loading.html`）：

```html
<div style="
  display: flex; align-items: center; justify-content: center;
  height: 100vh; font-family: -apple-system, BlinkMacSystemFont, sans-serif;
  background: {{=isDark ? '#0f172a' : '#f8fafc'}};
">
  <div style="text-align: center;">
    <!-- 自定义动画：用三颗跳动的点 -->
    <div style="display: flex; gap: 12px; justify-content: center; margin-bottom: 20px;">
      <div class="eams-dot" style="
        width: 16px; height: 16px; border-radius: 50%;
        background: var(--primary, #3b82f6);
        animation: eams-bounce 0.6s ease infinite alternate;
      "></div>
      <div class="eams-dot" style="
        width: 16px; height: 16px; border-radius: 50%;
        background: var(--primary, #3b82f6);
        animation: eams-bounce 0.6s ease infinite alternate 0.2s;
      "></div>
      <div class="eams-dot" style="
        width: 16px; height: 16px; border-radius: 50%;
        background: var(--primary, #3b82f6);
        animation: eams-bounce 0.6s ease infinite alternate 0.4s;
      "></div>
    </div>
    <div style="font-size: 14px; color: var(--text-secondary, #64748b);">加载中...</div>
  </div>
</div>
```

可选的关联 CSS（`_loading.css`）：
```css
@keyframes eams-bounce {
  from { transform: translateY(0); opacity: 0.4; }
  to   { transform: translateY(-12px); opacity: 1; }
}
```

**模板风格提示**：
- 加载动画不涉及数据请求，可以直接在 HTML 中嵌入所有内容（CSS + JS + 动画）
- 如果你希望在加载画面中嵌入品牌 logo，可使用 `{{=chrome.runtime.getURL('assets/icons/badge.png')}}`
- 暗色模式判断用 `{{=isDark ? '深色值' : '浅色值'}}`

---

### 7.9 数据契约：每个模板收到的 `data` 对象

这是 AI 编写模板时需要的最关键信息——**data 里面到底有什么字段**。

#### `Templates.exams(data)`

```javascript
data = {
  exams: [                    // 考试数组
    {
      courseName: "大学物理",  // 课程名
      date: "2026年6月24日",   // 考试日期（多种格式）
      time: "09:00-11:00",    // 考试时间
      classroom: "品学楼A201", // 教室
      seatNo: "15",           // 座位号
      examType: "期末考试",    // 考试类型（中文）
    }
  ],
  sid: "483",                 // 当前学期 ID
  etype: "1",                 // 考试类型 ID（1=期末 2=期中 3=补缓考）
  sList: [{ id, name }],      // 学期列表
}
```

> 倒计时使用 `Templates._examCountdown(dateStr)` 函数计算，返回 `{ text: string, bg: string }`。

#### `Templates.schedule(data)`

```javascript
data = {
  cells: {                    // 课表格子
    "0_0": [{                 // key = "{dayIndex}_{periodIndex}"
      courseName: "高数",      // 课程名（含教师名）
      teacherName: "张老师",   // 教师名
      roomName: "A301",       // 教室
      validWeeks: "1-16周",    // 有效周次（已格式化）
    }]
    // "day_period" 格式: dayIndex 0=周一~6=周日, periodIndex 0=第1节~11=第12节
  },
  sid: "483",
  kind: "std",                // "std" 或 "class"
  week: "",                   // ""=全部, 或 "1"~"20"
  sList: [{ id, name }],
}
```

> 课表的 rowspan 合并逻辑和节次背景色在 JS 中处理，不在数据中。建议直接改 JS 而不是用模板替换。

#### `Templates.grades(data)`

```javascript
data = {
  grades: [
    {
      courseCode: "E0900420",
      courseName: "大学物理实验I",
      courseType: "学科基础课",
      credits: "1.0",
      finalExam: "85",          // 期末成绩
      totalScore: "88",         // 总评成绩
      gpa: "3.7",              // 绩点
      usualScore: "90",        // 平时成绩。""=无
      usualLessonId: "12345",  // 平时成绩详情 ID。""=无详情
      usualCourseNumber: "01", // 课序号。""=无
    }
  ],
  gpa: { avgGPA: "3.52", totalCredits: "18.0" },
  wavg: "85.63",              // 加权平均分
  sid: "483",
  sList: [{ id, name }],
}
```

> 分数颜色：≥90 → `.score-high`（绿色），≥80 → `.score-medium`（琥珀色），<80 → `.score-low`（红色）。
> 平时成绩按钮：`usualScore` 非空且 `usualLessonId` 非空时显示 📋 按钮。

#### `Templates.dashboard(data)`

```javascript
data = {
  semesterName: "2025-2026 第二学期",
  currentSid: "503",
}
```

> Dashboard 由 `Injector.dashboard()` 直接构造数据，不从 DataFetcher 获取。
> 校徽图片用 `{{=chrome.runtime.getURL('assets/icons/badge.png')}}` 引用。

#### `Templates._loading(data)`

```javascript
data = {
  isDark: false,         // boolean，当前是否为暗色模式
}
```

> `_loading` 不是页面模板（不匹配任何 URL），仅在启动时由 `showLoadingOverlay()` + `upgradeLoadingOverlay()` 调用用于显示过渡动画。
> 自定义 CSS 可覆盖 `#eams-loading-overlay` 的背景色、`@keyframes` 动画等。

---

### 7.10 工作流

**修改已有页面**（如改考试页）：

```bash
# 1. dev/templates/exams.html 写模板
# 2. dev/templates/exams.json 配置
# 3. （可选）dev/templates/exams.css 自定义样式
# 4. 运行
node scripts/build-template.js exams
# 5. 刷新浏览器插件 → 立即可见
```

**自定义 CSS 示例**（exams.css）：

```css
/* 覆盖 CSS 变量：改变考试页主题色 */
:root {
  --primary: #8b5cf6;
  --danger: #dc2626;
  --radius: 8px;
}

/* 新增或覆盖组件样式 */
.eams-exam-item {
  border-left: 4px solid var(--primary);
  margin: 12px 0;
}
```

> CSS 文件中的 `:root` 变量覆盖会优先生效（因为注入位置在原始 CSS 之后）。

**新增页面**（少见）：

```bash
# 流程同上，但需额外：
# - 检查 main.js 中 @INJECT 标记是否存在
# - 补充 Injector 中的 TODO 部分（DataFetcher 调用）
```

**撤销修改**：

```bash
# 脚本每次运行会创建 content/main.js.bak 备份
# 恢复：cp content/main.js.bak content/main.js
```

---

### 7.11 常见错误

| 错误 | 原因 | 修复 |
|------|------|------|
| `Cannot read properties of undefined (reading 'map')` | `{{#each X}}` 中的 X 在 data 中不存在 | 检查字段名是否匹配数据契约（§7.9） |
| `xxx is not a function` | `{{=}}` 中的函数名写错或未定义 | 确认可用函数列表（§7.2.2） |
| 页面空白 | 模板中有语法错误 | 打开浏览器控制台查看具体错误 |
| 页面还是旧版 | 浏览器插件缓存未刷新 | 到 `chrome://extensions` 点刷新按钮 |

---

## 8. 何时需要改 DataFetcher

| 情况 | 例子 | 怎么办 |
|------|------|--------|
| ✅ 改样式 / 改布局 | 改颜色、改列宽、改分组 | 只改 CSS 或 Templates |
| ✅ 从已有数据派生新列 | 总绩点 = GPA × 学分 | 只改 Templates |
| ⚠️ 已有字段但没显示 | 课程类别已在数据中但被注释了 | 只改 Templates |
| ❌ 需要新字段 | 排名、教师评价、上课人数 | **必须**改 DataFetcher 解析 + Templates 渲染 |
| ❌ 需要不同页面的数据 | Dashboard 想显示成绩概览 | **必须**加新的 DataFetcher 方法 + 调取数据 |

### 修改 DataFetcher 的通用步骤

以给成绩页加"排名"为例，实际代码如下。

**改 DataFetcher.grades()**（main.js ~401 行），在解析循环中新增：

```javascript
// 找到成绩表格的每一行解析部分，在 return 对象里加：
{
  // ... 已有字段,
  rank: row.querySelector('td:nth-child(6)')?.textContent?.trim() || '',
}
```

然后回到 Templates 渲染（同 [§5.3](#53-示例给成绩表加新列) 情况 A 的改法）。

---

## 附录：CSS 变量速查图

```
┌─────────────────────┐
│  --bg               │  ← 页面背景
│  ┌─────────────────┐│
│  │ --card          ││  ← 卡片/表格/标题栏/工具栏背景
│  │ ┌─────────────┐ ││
│  │ │ --text      │ ││  ← 主文字
│  │ │ --text-secondary││  ← 次要文字
│  │ └─────────────┘ ││
│  │ ──border ─────── ││  ← 表格边框、分隔线
│  │ ──radius ─────── ││  ← 圆角
│  │ ──shadow ─────── ││  ← 卡片阴影
│  └─────────────────┘│
│                     │
│  --primary  ─── 主色│
│  --success  ─── 绿色│
│  --warning  ─── 琥珀│
│  --danger   ─── 红色│
└─────────────────────┘
```

---

## 9. 暗色模式

全局内置，所有页面通用。

### 开关按钮

在任意模板中加一个按钮即可切换暗色/亮色：

```html
<button class="eams-theme-btn">🌙</button>
```

不需要 `onclick` 或 `<script>`，内容脚本自动处理。

### 默认界面

成绩/考试/课表/Dashboard 的标题栏右侧自带 🌙 按钮，开箱即用。

### CSS 变量覆盖

暗色模式通过 `[data-eams-theme="dark"]` 覆盖 `:root` 变量实现。所有使用 `var()` 的元素会自动响应。

如需自定义暗色变量，在模板 CSS 中添加：

```css
[data-eams-theme="dark"] {
  --primary: #60a5fa;
  --bg: #0f172a;
  --card: #1e293b;
  --text: #f1f5f9;
}
```

---

## 10. 模板管理（Popup 导入）

从插件的 Popup 弹窗可以直接管理模板，无需命令行。

操作路径：
1. 点击插件图标 → 切到「🎨 模板」Tab
2. 点击「＋ 导入模板」→ 选择文件夹
3. 导入后自动归类，点击模板名切换，点 ✕ 删除
4. 切换时自动刷新 EAMS 页面

> 存储驱动：模板按 `.json` 中的 `methodName` 自动归类到对应页面。

---

## 11. Build Script（已废弃）

`scripts/build-template.js` 是旧版构建工具，已由 Popup 导入（§10）替代。
保留文件未删，但不再推荐使用。需要时可直接运行：

```bash
node scripts/build-template.js <模板名>
```
