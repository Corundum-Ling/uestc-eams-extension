# uestc-eams-extension

**电子科技大学本科教学管理系统浏览器插件**

拦截原页面，用现代化 UI 完全重制课表/成绩/考试页面

UI 支持高度自定义

---

## ✨ 特性

- **成绩页** — 学期切换 · GPA/加权平均/学分统计 · 排除课程重算 · 平时成绩合并
- **课表页** — 学生/班级课表切换 · 7×12 网格 · rowspan 合并 · 周次选择
- **考试页** — 学期/考试类型切换 · 倒计时显示
- **Dashboard** — 核心入口 + 26 项原系统功能链接（按分类组织）
- **暗色模式** — 全局内置，所有页面通用，支持模板自定义颜色
- **模板管理** — Popup 弹窗直接导入/切换/删除模板，无需命令行

## 🖼️ 示例页面截图

![Dashboard 主页](example/dashboard.png)

## 📦 安装

```bash
# 1. 克隆仓库
git clone https://github.com/Corundum-Ling/uestc-eams-extension.git

# 2. 加载到浏览器
# Edge → edge://extensions/ （开启开发者模式 → 加载已解压的扩展）
# Chrome → chrome://extensions/ （开启开发者模式 → 加载已解压的扩展）
```

## 🎨 自定义

UI 与数据逻辑完全分离。修改外观有三种方式：

### 方式一：Popup 导入（推荐）

从插件弹窗直接导入模板，无需命令行：

1. 点击插件图标 → 切到「🎨 模板」Tab
2. 点击「＋ 导入模板」→ 选择文件夹
3. 导入后自动归类，点击切换，支持多模板管理

### 方式二：Build Script（旧版）

在 `dev/templates/` 创建 HTML/CSS/JSON 文件后运行：

```bash
node scripts/build-template.js <模板名>
```

### 方式三：直接修改

- `content/main.js` → `Templates` 对象 — 页面 HTML 模板
- `content/styles.css` — 样式（CSS 变量主题）

### 暗色模式

内置全局暗色模式。所有页面标题栏右侧有 🌙 按钮，自定义模板中加 `<button class="eams-theme-btn">🌙</button>` 即可。

详细说明见 [`UI自定义指南.md`](UI自定义指南.md)。


## 🛠️ 技术方案

- **架构**：Content Script Hook — 注入后完全替换页面 DOM
- **数据**：fetch EAMS HTML 端点 + DOM 解析（无 JSON API）
- **渲染**：原生 HTML/CSS/JS，模板字符串，零依赖
- **状态**：localStorage 持久化 + sessionStorage 会话
- **样式**：CSS 变量主题，响应式布局

## 📄 许可证

本项目基于 [MIT License](https://opensource.org/licenses/MIT) 开源。
