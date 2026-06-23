/**
 * EAMS 优化版 v2 — Popup
 *
 * 快速导航到各 EAMS 页面。Content script 会自动注入优化 UI。
 * 课表需要 POST，所以导航到首页让 dashboard 的"我的课表"卡片处理。
 */
document.addEventListener('DOMContentLoaded', async () => {
  const statusEl = document.getElementById('status');

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

  /** 在 EAMS 域内打开链接 */
  function navigate(path) {
    chrome.tabs.create({ url: 'https://eams.uestc.edu.cn' + path });
  }

  document.querySelector('[data-page="dashboard"]').addEventListener('click', (e) => {
    e.preventDefault();
    navigate('/eams/home!submenus.action?menu.id=');
  });

  // 课表：去首页，dashboard 的 injector 会处理 POST
  document.querySelector('[data-page="schedule"]').addEventListener('click', (e) => {
    e.preventDefault();
    navigate('/eams/home!submenus.action?menu.id=');
  });

  document.querySelector('[data-page="grades"]').addEventListener('click', (e) => {
    e.preventDefault();
    navigate('/eams/teach/grade/course/person!search.action');
  });

  document.querySelector('[data-page="exams"]').addEventListener('click', (e) => {
    e.preventDefault();
    navigate('/eams/stdExamTable!examTable.action?examType.id=1');
  });
});
