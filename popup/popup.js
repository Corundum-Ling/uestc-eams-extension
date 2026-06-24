/**
 * EAMS 优化版 v2 — Popup
 *
 * 双页 Tab：导航 + 模板管理（存储驱动，不硬编码页面列表）
 */
document.addEventListener('DOMContentLoaded', async () => {
  const statusEl = document.getElementById('status');

  // ── EAMS 连接状态 ──────────────────────────────────────
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url?.includes('eams.uestc.edu.cn')) {
      statusEl.textContent = '✅ 已连接 EAMS';
      statusEl.style.color = '#22c55e';
    } else {
      statusEl.textContent = '⚠️ 请访问 EAMS 页面';
      statusEl.style.color = '#f59e0b';
    }
  } catch {
    statusEl.textContent = '插件已就绪';
  }

  // ── Tab 切换 ────────────────────────────────────────────
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('page-' + tab.dataset.tab).classList.add('active');
      if (tab.dataset.tab === 'tpl') renderAllPages();
    });
  });

  // ── 页面导航 ────────────────────────────────────────────
  function navigate(path) {
    chrome.tabs.create({ url: 'https://eams.uestc.edu.cn' + path });
  }
  document.querySelector('[data-page="dashboard"]')?.addEventListener('click', (e) => {
    e.preventDefault(); navigate('/eams/home!submenus.action?menu.id=');
  });
  document.querySelector('[data-page="schedule"]')?.addEventListener('click', (e) => {
    e.preventDefault(); navigate('/eams/home!submenus.action?menu.id=');
  });
  document.querySelector('[data-page="grades"]')?.addEventListener('click', (e) => {
    e.preventDefault(); navigate('/eams/teach/grade/course/person!search.action');
  });
  document.querySelector('[data-page="exams"]')?.addEventListener('click', (e) => {
    e.preventDefault(); navigate('/eams/stdExamTable!examTable.action?examType.id=1');
  });

  // ═══════════════════════════════════════════════════════════
  //  模板管理 —— 存储驱动，不硬编码
  // ═══════════════════════════════════════════════════════════

  const STORAGE_KEY = 'eams_opt_templates_v2';
  const FILE_PICKER = document.getElementById('file-picker');

  // 已知页面的显示名（仅供美化，不限制导入）
  const PAGE_LABELS = {
    dashboard: { icon: '🏠', label: 'Dashboard' },
    grades:    { icon: '📊', label: '成绩' },
    exams:     { icon: '📋', label: '考试' },
    schedule:  { icon: '📅', label: '课表' },
  };
  function pageInfo(key) {
    return PAGE_LABELS[key] || { icon: '📄', label: key };
  }

  async function loadData() {
    const r = await chrome.storage.local.get(STORAGE_KEY);
    return r[STORAGE_KEY] || {};
  }
  async function saveData(data) {
    await chrome.storage.local.set({ [STORAGE_KEY]: data });
  }
  function genId() { return 't' + Date.now() + Math.random().toString(36).slice(2, 6); }

  /** 通知打开的 EAMS 页面刷新 */
  async function notifyEAMSPage() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.url?.includes('eams.uestc.edu.cn') && tab.id) {
        await chrome.tabs.sendMessage(tab.id, { type: 'eams-template-changed' });
      }
    } catch { /* ignore */ }
  }

  /** 渲染模板管理页面 */
  async function renderAllPages() {
    const data = await loadData();
    const container = document.getElementById('tpl-list');
    const pageKeys = Object.keys(data).filter(k => data[k]?.items && Object.keys(data[k].items).length > 0);

    if (pageKeys.length === 0) {
      container.innerHTML = '<div class="tpl-empty">暂无自定义模板<br>点击下方按钮导入</div>';
      return;
    }

    container.innerHTML = pageKeys.map(pageKey => {
      const info = pageInfo(pageKey);
      const pageData = data[pageKey];
      const items = pageData.items || {};
      const activeId = pageData.activeId;

      const optionHTML = Object.entries(items).map(([id, item]) => `
        <div class="tpl-option ${activeId === id ? 'active' : ''}"
             data-page="${pageKey}" data-id="${id}">
          <div class="radio"></div>
          <span class="tpl-opt-name">${escHtml(item.name || '未命名')}</span>
          <span class="tpl-opt-label">自定义</span>
          <button class="tpl-opt-del" data-page="${pageKey}" data-id="${id}">✕</button>
        </div>
      `).join('');

      return `
        <div class="tpl-group">
          <div class="tpl-group-title">${info.icon} ${info.label}</div>
          <div class="tpl-option ${!activeId ? 'active' : ''}"
               data-page="${pageKey}" data-id="">
            <div class="radio"></div>
            <span class="tpl-opt-name">默认</span>
          </div>
          ${optionHTML}
        </div>
      `;
    }).join('');

    // 选择模板
    container.querySelectorAll('.tpl-option[data-page]').forEach(el => {
      el.addEventListener('click', async () => {
        const pageKey = el.dataset.page;
        const id = el.dataset.id || null;
        const data = await loadData();
        if (!data[pageKey]) data[pageKey] = { activeId: null, items: {} };
        data[pageKey].activeId = id;
        await saveData(data);
        renderAllPages();
        notifyEAMSPage();
      });
    });

    // 删除模板
    container.querySelectorAll('.tpl-opt-del').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const pageKey = btn.dataset.page;
        const id = btn.dataset.id;
        const data = await loadData();
        if (data[pageKey]?.items[id]) {
          delete data[pageKey].items[id];
          if (data[pageKey].activeId === id) data[pageKey].activeId = null;
          if (Object.keys(data[pageKey].items).length === 0) delete data[pageKey];
          await saveData(data);
          renderAllPages();
          notifyEAMSPage();
        }
      });
    });

    // 导入到此页
    container.querySelectorAll('.tpl-opt-import').forEach(btn => {
      btn.addEventListener('click', () => {
        FILE_PICKER.dataset.targetPage = btn.dataset.page;
        FILE_PICKER.click();
      });
    });
  }

  function escHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  // ═══ 文件导入 ═══════════════════════════════════════════

  document.getElementById('tpl-import').addEventListener('click', () => {
    FILE_PICKER.dataset.targetPage = '';
    FILE_PICKER.click();
  });

  function parseConfig(base, jsonText) {
    if (jsonText) { try { return JSON.parse(jsonText); } catch {} }
    // 从文件名推测
    const known = {
      dashboard: { methodName: 'dashboard', pageTitle: 'Dashboard' },
      grades:    { methodName: 'grades',    pageTitle: '成绩' },
      exams:     { methodName: 'exams',     pageTitle: '考试' },
      schedule:  { methodName: 'schedule',  pageTitle: '课表' },
    };
    return known[base] || { methodName: base, pageTitle: base };
  }

  FILE_PICKER.addEventListener('change', async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // 按基名分组
    const groups = {};
    for (const file of files) {
      const m = file.name.match(/^(.+)\.(html|json|css)$/);
      if (!m) continue;
      if (!groups[m[1]]) groups[m[1]] = {};
      groups[m[1]][m[2]] = file;
    }

    const data = await loadData();
    let imported = 0;
    const forcePage = FILE_PICKER.dataset.targetPage;

    for (const [base, group] of Object.entries(groups)) {
      if (!group.html) continue;
      try {
        const html = await group.html.text();
        const config = group.json ? parseConfig(base, await group.json.text()) : parseConfig(base, null);
        const css = group.css ? await group.css.text() : '';
        const methodName = config.methodName || base;

        // 确定页面 key：优先 forcePage，其次 methodName
        const pageKey = forcePage || methodName;

        if (!data[pageKey]) data[pageKey] = { activeId: null, items: {} };
        const id = genId();
        data[pageKey].items[id] = {
          name: config.pageTitle || methodName,
          html,
          css,
          importedAt: Date.now(),
        };
        if (Object.keys(data[pageKey].items).length === 1) {
          data[pageKey].activeId = id;
        }
        imported++;
      } catch (err) {
        console.error('导入模板失败:', err);
      }
    }

    if (imported > 0) {
      await saveData(data);
      document.querySelector('.tab[data-tab="tpl"]')?.click();
      renderAllPages();
      showToast(`✅ 已导入 ${imported} 个模板`);
      notifyEAMSPage();
    }

    e.target.value = '';
  });

  // ═══ 全部恢复默认 ═══════════════════════════════════════

  document.getElementById('tpl-reset').addEventListener('click', async () => {
    if (!confirm('确定清除所有自定义模板？')) return;
    await chrome.storage.local.remove(STORAGE_KEY);
    renderAllPages();
    notifyEAMSPage();
  });

  // ═══ Toast ══════════════════════════════════════════════

  function showToast(msg) {
    const el = document.createElement('div');
    el.textContent = msg;
    Object.assign(el.style, {
      position: 'fixed', top: '0', left: '0', right: '0',
      padding: '8px', background: 'var(--primary)',
      color: '#fff', fontSize: '12px', textAlign: 'center', zIndex: '999',
      transition: 'opacity 0.3s',
    });
    document.body.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 1500);
  }

  if (document.querySelector('.tab[data-tab="tpl"].active')) renderAllPages();
});
