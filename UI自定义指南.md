# EAMS 优化版 — UI 自定义指南

## 架构概览

UI 和数据逻辑完全分离。改外观**不需要动数据获取代码**。

```
content/main.js
├── Config / Semester / GPA / WeekParser  → 数据逻辑（不动）
├── DataFetcher                           → 数据获取（不动）
├── ScheduleState                         → 状态管理（不动）
├── Templates                             → 🎨 UI 模板（改这里）
├── Injector                              → 注入逻辑（通常不动）
└── detectPage / main                     → 入口（不动）

content/styles.css                        → 🎨 样式（改这里）
```

---

## 一、改样式（CSS）

所有样式在 `content/styles.css`，使用 CSS 变量做主题：

```css
:root {
  --primary: #3b82f6;        /* 主色 */
  --success: #22c55e;        /* 成功/高分 */
  --warning: #f59e0b;        /* 警告/中分 */
  --danger: #ef4444;         /* 危险/低分 */
  --bg: #f8fafc;             /* 背景 */
  --card: #ffffff;           /* 卡片背景 */
  --text: #1e293b;           /* 主文字 */
  --text-secondary: #64748b; /* 次要文字 */
  --border: #e2e8f0;         /* 边框 */
  --radius: 12px;            /* 圆角 */
  --shadow: 0 1px 3px rgba(0,0,0,0.1);
}
```

改主题色只需改变量值，例如深色模式：

```css
:root {
  --bg: #0f172a;
  --card: #1e293b;
  --text: #f1f5f9;
  --text-secondary: #94a3b8;
  --border: #334155;
}
```

---

## 二、改页面结构（Templates）

每个页面在 `Templates` 对象中有独立方法。数据通过参数传入，你只需要组织 HTML。

### Dashboard — `Templates.dashboard(data)`

```javascript
dashboard(semesterName, currentSid) {
    // 返回完整 HTML 字符串
    return Templates.shell('标题', '', `内容`);
}
```

**数据**:
| 参数 | 说明 |
|------|------|
| `semesterName` | 当前学期中文名 |
| `currentSid` | 当前学期 ID |

**核心卡片数组** (`coreCards`)：修改卡片图标、标题、链接。
**功能链接分组** (`linkGroups`)：按分类组织原系统入口。

### 成绩页 — `Templates.grades(data)`

```javascript
grades({ grades, gpa, wavg, sid, sList })
```

**数据**:
| 字段 | 类型 | 说明 |
|------|------|------|
| `grades` | Array | 课程数组 |
| `grades[].courseName` | string | 课程名称 |
| `grades[].courseCode` | string | 课程代码 |
| `grades[].courseType` | string | 课程类别 |
| `grades[].credits` | string | 学分 |
| `grades[].finalExam` | string | 期末成绩 |
| `grades[].totalScore` | string | 总评成绩 |
| `grades[].gpa` | string | 绩点 |
| `grades[].usualScore` | string | 平时成绩（空串表示无） |
| `grades[].usualLessonId` | string | 平时成绩详情 ID（空串表示无） |
| `gpa` | object | `{ avgGPA, totalCredits }` |
| `wavg` | string | 加权平均分 |
| `sid` | string | 当前学期 ID |
| `sList` | Array | 学期列表 |

### 考试页 — `Templates.exams(data)`

```javascript
exams({ exams, sid, etype, sList })
```

**数据**:
| 字段 | 说明 |
|------|------|
| `exams[].courseName` | 课程名 |
| `exams[].date` | 日期 |
| `exams[].time` | 时间 |
| `exams[].classroom` | 教室 |
| `exams[].seatNo` | 座位号 |

倒计时用 `Templates._examCountdown(dateStr)` → `{ text, bg }`。

### 课表页 — `Templates.schedule(data)`

```javascript
schedule({ cells, sid, kind, week, sList })
```

**数据**:
| 字段 | 说明 |
|------|------|
| `cells` | object | 格子数据 `{ "day_period": [{course}] }` |
| `cells[key][].courseName` | 课程名（含教师） |
| `cells[key][].roomName` | 教室 |
| `cells[key][].validWeeks` | 周数 |
| `sid` | 学期 ID |
| `kind` | `"std"` 或 `"class"` |
| `week` | 周次 |

### 通用壳 — `Templates.shell(title, backLink, content)`

```javascript
Templates.shell('页面标题', '/返回链接', '主内容 HTML')
```

- `backLink` 为空字符串时不显示返回按钮
- 所有页面都通过这个包装

### 弹窗 — `Templates.usualModal(courseName, courseCode, courseNumber, teacher, dept, items)`

```javascript
usualModal('课程名', '课程代码', '课程序号', '教师', '院系', items)
```

`items` 格式: `[{ type: '作业类型', score: '分数' }, ...]`

---

## 三、修改示例

### 示例：给成绩表加一列「排名」

1. 在 `Templates.grades()` 的表头加 `<th>排名</th>`
2. 在行模板加 `<td>${g.rank || '-'}</td>`
3. 在 `DataFetcher.grades()` 里抓排名数据并赋值

### 示例：把课表改造成日历风格

1. 重写 `Templates.schedule()` 的 HTML 生成部分
2. 改 `content/styles.css` 的课表样式
3. 数据用 `cells` 对象，按 `day`/`period` 索引拿到课程

### 示例：在 Dashboard 加欢迎语

```javascript
// Templates.dashboard() 的 shell 内容开头加一行
<div class="eams-welcome">你好，今天有 ${今日课程数} 节课</div>
```

---

## 四、注入流程（了解即可）

```
页面加载 → detectPage() 检测 URL → 匹配页面类型
  ├─ dashboard → Injector.dashboard()   → Templates.dashboard()
  ├─ grades    → Injector.grades()      → DataFetcher → Templates.grades()
  ├─ exams     → Injector.exams()       → DataFetcher → Templates.exams()
  └─ schedule  → Injector.schedule()    → DataFetcher → Templates.schedule()
```

注入器（`Injector`）负责：调用数据获取 → 调用模板渲染 → 绑定事件。

如果要加新页面：
1. 在 `detectPage()` 加 URL 匹配规则
2. 在 `Injector` 加注入方法
3. 在 `Templates` 加模板方法
4. 在 `main()` 的 switch 加 case

