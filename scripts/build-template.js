/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║  ⚠️  当前阶段废弃 — 保留待定                            ║
 * ║                                                         ║
 * ║  新的模板流程走 Popup 导入 + 运行时渲染（chrome.storage）║
 * ║  如需重新启用，删除本框即可。                            ║
 * ╚══════════════════════════════════════════════════════════╝
 *
 * EAMS Extension — HTML 模板快速嵌入脚本
 *
 * 用法：node scripts/build-template.js <模板名>
 * 示例：node scripts/build-template.js exams
 *
 * 功能：用 HTML 文件替换或新增页面模板
 *   - 如果 methodName 已存在 → 替换 Templates 方法体
 *   - 如果 methodName 不存在 → 注入全部 4 个块（新增页面）
 *
 * 占位符语法：
 *   {{fieldName}}          → ${data.fieldName}             简单字段
 *   {{sListOptions}}       → Templates._semesterOpts()     学期下拉框
 *   {{examTypeOptions}}    → CONFIG.examTypes 渲染          考试类型下拉框
 *   {{=JS表达式}}          → ${JS表达式}                    内联 JS 表达式
 *   {{#each array}}...{{/each}}  → 循环数组
 *
 * 工作流：
 *   1. dev/templates/exams.html 写你的 HTML 模板
 *   2. dev/templates/exams.json 配置（methodName 对应原方法名）
 *   3. （可选）同目录放 exams.css 自定义样式
 *   4. node scripts/build-template.js exams
 *   5. 刷新浏览器 → 新 UI 立即可见
 *
 * 恢复：脚本备份了 content/main.js.bak 和 content/styles.css.bak
 *   cp content/main.js.bak content/main.js
 *   cp content/styles.css.bak content/styles.css
 */

const fs = require('fs');
const path = require('path');

// ── 配置 ──────────────────────────────────────────────────
const ROOT = path.resolve(__dirname, '..');
const TEMPLATES_DIR = path.join(ROOT, 'dev', 'templates');
const MAIN_JS = path.join(ROOT, 'content', 'main.js');
const MAIN_JS_BAK = MAIN_JS + '.bak';
const STYLES_CSS = path.join(ROOT, 'content', 'styles.css');
const STYLES_CSS_BAK = STYLES_CSS + '.bak';

const MARKERS = {
  TEMPLATE: '/* @INJECT:TEMPLATE */',
  DETECT: '/* @INJECT:DETECT */',
  INJECTOR: '/* @INJECT:INJECTOR */',
  MAIN: '/* @INJECT:MAIN */',
  STYLES: '/* @INJECT:STYLES */',
};

// ── CLI ────────────────────────────────────────────────────
const templateName = process.argv[2];
if (!templateName) {
  console.error('❌ 用法: node scripts/build-template.js <模板名>');
  process.exit(1);
}

// ── 读取输入 ───────────────────────────────────────────────
const htmlPath = path.join(TEMPLATES_DIR, `${templateName}.html`);
const jsonPath = path.join(TEMPLATES_DIR, `${templateName}.json`);

if (!fs.existsSync(htmlPath)) { console.error(`❌ 找不到 HTML: ${htmlPath}`); process.exit(1); }
if (!fs.existsSync(jsonPath)) { console.error(`❌ 找不到 JSON: ${jsonPath}`); process.exit(1); }

const rawHTML = fs.readFileSync(htmlPath, 'utf-8').trim();
const config = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

const requiredFields = ['methodName', 'urlPattern'];
for (const f of requiredFields) {
  if (!config[f]) { console.error(`❌ JSON 缺少 "${f}"`); process.exit(1); }
}

const method = config.methodName;
const pageTitle = config.pageTitle;
const backLink = config.backLink || '/eams/home!submenus.action?menu.id=';

console.log(`📦 模板: ${templateName}`);
console.log(`   methodName: ${method}`);
console.log(`   urlPattern: ${config.urlPattern}`);

// ── 扫描 {{#each}} 提取数组名 ──────────────────────────────
const eachMatches = [...rawHTML.matchAll(/\{\{#each (\w+)\}\}/g)];
const arrayNames = eachMatches.map(m => m[1]).filter(Boolean);
const primaryArray = arrayNames[0] || 'items';

// ── HTML → JS 模板字面量 ──────────────────────────────────
function convertHTML(html) {
  let result = html.replace(/`/g, '\\`');
  result = result.replace(/\$\{/g, '\\${');

  // {{=expr}} 内联表达式（优先处理）
  result = result.replace(/\{\{=(.*?)\}\}/g, '${$1}');

  // {{#each}}...{{/each}}
  result = result.replace(/\{\{#each (\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (_, name, inner) => {
    const mapped = inner
      .replace(/\{\{=(.*?)\}\}/g, '${$1}')
      .replace(/\{\{(\w+)\}\}/g, '${item.$1}');
    return `\${data.${name}.map(item => \`${mapped}\`).join('')}`;
  });

  // 特殊占位符
  result = result.replace(/\{\{sListOptions\}\}/g, '${Templates._semesterOpts(data.sList, data.sid)}');
  result = result.replace(/\{\{examTypeOptions\}\}/g,
    '${Object.entries(CONFIG.examTypes).map(([k, v]) => `<option value="${k}"${k === data.etype ? \' selected\' : \'\'}>${v}</option>`).join(\'\')}');

  // 普通 {{field}}
  result = result.replace(/\{\{(\w+)\}\}/g, '${data.$1}');

  return result;
}

const convertedHTML = convertHTML(rawHTML);

// ── 生成的代码块 ──────────────────────────────────────────
const newMethodBody = `return Templates.shell('${pageTitle}', '${backLink}', \`${convertedHTML}\`);`;

const blockTemplate = `
    /**
     * ${pageTitle}
     * ⚡ 由 build-template (${templateName}) 生成 — 手动修改将被覆盖
     */
    ${method}(data) {
      ${newMethodBody}
    },`;

const blockDetect = `    if (url.includes('${config.urlPattern}')) return '${method}';`;

const arrayInit = primaryArray + ': []';
const injectorBody = config.injectorType === 'async' ? `
    /** ${pageTitle}（由 build-template 注入） */
    async ${method}() {
      this._showLoading('🚀', '加载中...');
      try {
        const sid = Semester.getId();
        const data = await DataFetcher.${method}(sid);
        document.body.innerHTML = Templates.${method}(data);
      } catch (e) {
        document.body.innerHTML = Templates.error(e.message);
      }
    },` : `
    /** ${pageTitle}（由 build-template 注入） */
    ${method}() {
      document.body.innerHTML = Templates.${method}({ ${arrayInit}, sid: Semester.getId(), sList: Semester.getList() });
    },`;

const blockInjector = injectorBody;
const blockMain = `      case '${method}': Injector.${method}(); break;`;

// ── 读取 main.js ───────────────────────────────────────────
let mainJS = fs.readFileSync(MAIN_JS, 'utf-8');

// ── 判断是替换还是新增 ─────────────────────────────────────
// 匹配 method( 开头的参数列表，兼容 (data)、(semesterName, currentSid) 等
const methodRegex = new RegExp(`\\n    ${method}\\([^)]*\\)\\s*\\{`);
const methodExists = methodRegex.test(mainJS);

// 只检查 main.js 中的标记（STYLES 在 styles.css 中）
const JS_MARKERS = { TEMPLATE: MARKERS.TEMPLATE, DETECT: MARKERS.DETECT, INJECTOR: MARKERS.INJECTOR, MAIN: MARKERS.MAIN };

// ── 备份所有将修改的文件 ────────────────────────────────────
const backups = [];
function backupFile(filePath) {
  const bak = filePath + '.bak';
  fs.copyFileSync(filePath, bak);
  backups.push(path.relative(ROOT, bak));
}

backupFile(MAIN_JS);
backupFile(STYLES_CSS);
backups.forEach(b => console.log(`✅ 备份: ${b}`));

if (methodExists) {
  // ── 模式 A: 替换已有方法 ──────────────────────────────
  // 只替换 Templates 方法体，Injector/detectPage/main 不动

  const methodMatch = mainJS.match(new RegExp('\\n    ' + method + '\\([^)]*\\)\\s*\\{'));
  if (!methodMatch) {
    console.error('❌ 内部错误：方法存在但找不到位置');
    process.exit(1);
  }
  const methodStart = methodMatch.index;

  const braceOpen = mainJS.indexOf('{', methodStart);
  if (braceOpen === -1) { console.error('❌ 找不到方法体'); process.exit(1); }

  // 简单花括号计数器：在此代码库中，所有 ${} 的括号都是成对匹配的
  let depth = 0;
  let endPos = -1;
  for (let i = braceOpen; i < mainJS.length; i++) {
    if (mainJS[i] === '{') depth++;
    else if (mainJS[i] === '}') {
      depth--;
      if (depth === 0) { endPos = i; break; }
    }
  }

  if (endPos === -1) { console.error('❌ 无法定位方法结尾'); process.exit(1); }

  // 提取参数名，判断是否需要 data 桥接
  const paramStr = methodMatch[0].match(/\(([^)]*)\)/)[1];     // "semesterName, currentSid" 或 "data"
  const params = paramStr.split(',').map(s => s.trim()).filter(Boolean); // ['semesterName', 'currentSid'] 或 ['data']
  const needsDataBridge = params.length !== 1 || params[0] !== 'data';

  const bodyPrefix = needsDataBridge
    ? 'const data = { ' + params.join(', ') + ' };\n      '
    : '';

  // 替换方法体
  mainJS = mainJS.substring(0, braceOpen + 1) + '\n      ' + bodyPrefix + newMethodBody + mainJS.substring(endPos);

  if (needsDataBridge) {
    console.log(`   🔗 data 桥接: { ${params.join(', ')} } → data`);
  }

  fs.writeFileSync(MAIN_JS, mainJS, 'utf-8');

  console.log(`\n✅ 已替换 Templates.${method}() — 新 UI 立即可见`);
  console.log(`   📄 新的 HTML 模板已注入到 content/main.js`);
  console.log(`\n⚠️  刷新浏览器中已加载的扩展即可查看效果`);

} else {
  // ── 模式 B: 新增页面 ─────────────────────────────────
  for (const [key, marker] of Object.entries(JS_MARKERS)) {
    if (!mainJS.includes(marker)) {
      console.error(`❌ 未找到插入标记 "${marker}"，请先在 main.js 中添加`);
      process.exit(1);
    }
  }

  mainJS = mainJS.replace(MARKERS.TEMPLATE, blockTemplate + '\n' + MARKERS.TEMPLATE);
  mainJS = mainJS.replace(MARKERS.DETECT, blockDetect + '\n' + MARKERS.DETECT);
  mainJS = mainJS.replace(MARKERS.INJECTOR, blockInjector + '\n' + MARKERS.INJECTOR);
  mainJS = mainJS.replace(MARKERS.MAIN, blockMain + '\n' + MARKERS.MAIN);

  fs.writeFileSync(MAIN_JS, mainJS, 'utf-8');

  console.log(`\n✅ 新增页面: ${method}`);
  console.log(`   📄 Templates  : ${method}()`);
  console.log(`   🔍 detectPage : contains('${config.urlPattern}') → '${method}'`);
  console.log(`   ⚙️  Injector   : ${method}()`);
  console.log(`   🏠 main()     : case '${method}'`);
}

// ── 可选: 注入 CSS ─────────────────────────────────────────
const cssPath = path.join(TEMPLATES_DIR, `${templateName}.css`);
let cssInjected = false;

if (fs.existsSync(cssPath)) {
  const customCSS = fs.readFileSync(cssPath, 'utf-8').trim();
  if (customCSS) {
    let stylesCSS = fs.readFileSync(STYLES_CSS, 'utf-8');
    if (!stylesCSS.includes(MARKERS.STYLES)) {
      console.log(`⚠️  发现 ${templateName}.css，但 styles.css 缺少 "${MARKERS.STYLES}"，已跳过`);
    } else {
      const cssBlock = `\n/* ── ${templateName} template styles ── */\n${customCSS}\n`;
      stylesCSS = stylesCSS.replace(MARKERS.STYLES, cssBlock + '\n' + MARKERS.STYLES);
      fs.writeFileSync(STYLES_CSS, stylesCSS, 'utf-8');
      cssInjected = true;
      console.log(`   🎨 CSS  : ${path.relative(ROOT, cssPath)} → styles.css`);
    }
  }
} else {
  console.log(`   🎨 CSS  : (无自定义样式, 使用默认 CSS 变量)`);
}

// ── 恢复指引 ───────────────────────────────────────────────
console.log(`\n📋 已备份:`);
console.log(`   - ${backups[0]}  (main.js)`);
console.log(`   - ${backups[1]}  (styles.css)`);
console.log(`\n↩️  撤销:`);
console.log(`   cp ${backups[0]} content/main.js`);
console.log(`   cp ${backups[1]} content/styles.css`);
