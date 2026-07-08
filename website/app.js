const repo = 'MarkHoo/Ascend-Todo';
const releaseApi = '/.netlify/functions/latest-release';
const githubReleaseApi = `https://api.github.com/repos/${repo}/releases/latest`;
const latestReleaseUrl = `https://github.com/${repo}/releases/latest`;

const messages = {
  en: {
    brand: 'Ascend Todo',
    navFeatures: 'Features',
    navShowcase: 'Showcase',
    navDownload: 'Download',
    github: 'GitHub',
    eyebrow: 'A desktop command center for deliberate living',
    heroTitle: 'Ascend Todo',
    heroSubtitle: 'Bring goals, tasks, calendar blocks, focus sessions, and personal reviews into one elegant workspace built for serious daily execution.',
    downloadLatest: 'Download latest',
    detecting: 'Detecting your system...',
    allDownloads: 'View all installers',
    releaseLoading: 'Loading latest GitHub release...',
    releaseReady: 'Latest release: {{tag}}',
    releaseFallback: 'Could not read GitHub release details. Open the release page instead.',
    releaseResolving: 'latest link resolving',
    trustLocal: 'Local-first',
    trustOpen: 'Open source',
    trustCross: 'Windows, macOS, Linux',
    previewOverview: 'Overview',
    previewBoard: 'Board detail',
    previewGoals: 'Goals',
    previewCalendar: 'Calendar',
    featuresEyebrow: 'Designed for people who actually execute',
    featuresTitle: 'A calmer operating system for your day',
    featuresLead: 'Ascend Todo keeps planning beautiful but practical: every task can become time, every goal can become evidence, and every focus session can become visible progress.',
    featureTasksTitle: 'Task boards with context',
    featureTasksText: 'Turn messy work into structured boards, rich notes, reminders, priorities, and execution-ready cards.',
    featureGoalsTitle: 'Goals with measurable progress',
    featureGoalsText: 'Build goals around key results, check-ins, and progress history so ambition turns into a visible trajectory.',
    featureCalendarTitle: 'Calendar planning that respects time',
    featureCalendarText: 'Arrange tasks and events across day, week, and month views with real time blocks and schedule clarity.',
    featureFocusTitle: 'Focus analytics, not just a timer',
    featureFocusText: 'Use countdown or count-up focus sessions, then understand where attention actually went.',
    workflowEyebrow: 'Private by default',
    workflowTitle: 'A polished local workspace, ready for cloud continuity',
    workflowText: 'Ascend Todo is useful from the first launch without an account. When the sync API is available, verified accounts can move the same planning system across devices.',
    workflowItem1: 'Local data remains on the current device unless you enable cloud sync.',
    workflowItem2: 'Sync covers tasks, goals, settings, calendar data, devices, and account state.',
    workflowItem3: 'Avatar images stay local, keeping personal identity lightweight and private.',
    downloadEyebrow: 'Latest release',
    downloadTitle: 'Choose the right installer',
    downloadLead: 'The primary button automatically selects the best package for your system. Advanced users can choose a specific installer below.',
    footer: 'Ascend Todo is an open-source desktop planner crafted for high-quality personal execution.',
    footerRelease: 'Latest release',
    download: 'Download',
    unavailable: 'Not available yet',
    windowsMsi: 'Windows MSI installer',
    windowsExe: 'Windows EXE installer',
    macApple: 'macOS Apple silicon',
    macIntel: 'macOS Intel',
    linuxX64: 'Linux x86_64 AppImage',
    linuxArm: 'Linux ARM64 AppImage',
    recommended: 'Recommended for this device',
    genericDesc: 'Built from the latest GitHub release.',
  },
  'zh-CN': {
    brand: '光阶Todo',
    navFeatures: '功能',
    navShowcase: '预览',
    navDownload: '下载',
    github: 'GitHub',
    eyebrow: '为高质量生活与工作打造的桌面中枢',
    heroTitle: '光阶Todo',
    heroSubtitle: '把目标、任务、日历时间块、专注记录和阶段复盘整合进一个优雅克制的桌面工作区，让每天的执行更清晰、更有掌控感。',
    downloadLatest: '下载最新版',
    detecting: '正在识别你的系统...',
    allDownloads: '查看全部安装包',
    releaseLoading: '正在读取 GitHub 最新版本...',
    releaseReady: '最新版本：{{tag}}',
    releaseFallback: '暂时无法读取 GitHub 版本信息，可打开发布页下载。',
    releaseResolving: '正在匹配最新下载链接',
    trustLocal: '本地优先',
    trustOpen: '开源透明',
    trustCross: 'Windows、macOS、Linux',
    previewOverview: '总览',
    previewBoard: '看板详情',
    previewGoals: '目标',
    previewCalendar: '日历',
    featuresEyebrow: '为真正要把事情做成的人设计',
    featuresTitle: '让一天拥有更高级的秩序感',
    featuresLead: '光阶Todo 不是简单待办列表，而是一套从目标到行动、从时间到复盘的桌面工作系统：任务可以落到时间，目标可以沉淀证据，专注可以变成可见进展。',
    featureTasksTitle: '带上下文的任务看板',
    featureTasksText: '把复杂事项拆成结构化看板、富文本说明、提醒、优先级和可执行卡片，减少切换和遗忘。',
    featureGoalsTitle: '可度量的目标推进',
    featureGoalsText: '用关键结果、检查日期和进度历史承接长期目标，让野心不再停留在口号。',
    featureCalendarTitle: '尊重时间的日历规划',
    featureCalendarText: '在日、周、月视图中安排任务和日程，用真实时间块看见一天的负载与节奏。',
    featureFocusTitle: '不止计时的专注分析',
    featureFocusText: '支持倒计时与正计时专注，并把注意力投入沉淀为趋势、统计和复盘依据。',
    workflowEyebrow: '默认私密',
    workflowTitle: '精致的本地工作区，也为云端连续性准备好',
    workflowText: '无需账号也能从首次打开开始使用。同步 API 上线后，完成邮箱验证的账号即可在多设备之间延续同一套计划系统。',
    workflowItem1: '除非启用云端同步，本地数据默认保存在当前设备。',
    workflowItem2: '同步覆盖任务、目标、设置、日历、设备和账号状态。',
    workflowItem3: '头像仍保存在本机，让身份信息更轻量、更私密。',
    downloadEyebrow: '最新发布',
    downloadTitle: '选择适合你的安装包',
    downloadLead: '主下载按钮会自动判断当前系统并匹配推荐安装包。高级用户也可以在下方选择指定平台版本。',
    footer: '光阶Todo 是一款为高质量个人执行打造的开源桌面计划工具。',
    footerRelease: '最新发布',
    download: '下载',
    unavailable: '暂未提供',
    windowsMsi: 'Windows MSI 安装包',
    windowsExe: 'Windows EXE 安装包',
    macApple: 'macOS Apple 芯片',
    macIntel: 'macOS Intel 芯片',
    linuxX64: 'Linux x86_64 AppImage',
    linuxArm: 'Linux ARM64 AppImage',
    recommended: '推荐用于当前设备',
    genericDesc: '来自 GitHub 最新发布版本。',
  },
  'zh-TW': {
    brand: '光階Todo',
    navFeatures: '功能',
    navShowcase: '預覽',
    navDownload: '下載',
    github: 'GitHub',
    eyebrow: '為高品質生活與工作打造的桌面中樞',
    heroTitle: '光階Todo',
    heroSubtitle: '把目標、任務、日曆時間區塊、專注記錄和階段複盤整合進一個優雅克制的桌面工作區，讓每天的執行更清晰、更有掌控感。',
    downloadLatest: '下載最新版',
    detecting: '正在識別你的系統...',
    allDownloads: '查看全部安裝包',
    releaseLoading: '正在讀取 GitHub 最新版本...',
    releaseReady: '最新版本：{{tag}}',
    releaseFallback: '暫時無法讀取 GitHub 版本資訊，可打開發布頁下載。',
    releaseResolving: '正在匹配最新下載連結',
    trustLocal: '本機優先',
    trustOpen: '開源透明',
    trustCross: 'Windows、macOS、Linux',
    previewOverview: '總覽',
    previewBoard: '看板詳情',
    previewGoals: '目標',
    previewCalendar: '日曆',
    featuresEyebrow: '為真正要把事情做成的人設計',
    featuresTitle: '讓一天擁有更高級的秩序感',
    featuresLead: '光階Todo 不是簡單待辦列表，而是一套從目標到行動、從時間到複盤的桌面工作系統：任務可以落到時間，目標可以沉澱證據，專注可以變成可見進展。',
    featureTasksTitle: '帶上下文的任務看板',
    featureTasksText: '把複雜事項拆成結構化看板、富文本說明、提醒、優先級和可執行卡片，減少切換和遺忘。',
    featureGoalsTitle: '可度量的目標推進',
    featureGoalsText: '用關鍵結果、檢查日期和進度歷史承接長期目標，讓野心不再停留在口號。',
    featureCalendarTitle: '尊重時間的日曆規劃',
    featureCalendarText: '在日、週、月視圖中安排任務和日程，用真實時間區塊看見一天的負載與節奏。',
    featureFocusTitle: '不止計時的專注分析',
    featureFocusText: '支援倒計時與正計時專注，並把注意力投入沉澱為趨勢、統計和複盤依據。',
    workflowEyebrow: '預設私密',
    workflowTitle: '精緻的本機工作區，也為雲端連續性準備好',
    workflowText: '無需帳號也能從首次打開開始使用。同步 API 上線後，完成信箱驗證的帳號即可在多裝置之間延續同一套計劃系統。',
    workflowItem1: '除非啟用雲端同步，本機資料預設保存在目前裝置。',
    workflowItem2: '同步覆蓋任務、目標、設定、日曆、裝置和帳號狀態。',
    workflowItem3: '頭像仍保存在本機，讓身分資訊更輕量、更私密。',
    downloadEyebrow: '最新發布',
    downloadTitle: '選擇適合你的安裝包',
    downloadLead: '主下載按鈕會自動判斷目前系統並匹配推薦安裝包。進階使用者也可以在下方選擇指定平台版本。',
    footer: '光階Todo 是一款為高品質個人執行打造的開源桌面計劃工具。',
    footerRelease: '最新發布',
    download: '下載',
    unavailable: '暫未提供',
    windowsMsi: 'Windows MSI 安裝包',
    windowsExe: 'Windows EXE 安裝包',
    macApple: 'macOS Apple 晶片',
    macIntel: 'macOS Intel 晶片',
    linuxX64: 'Linux x86_64 AppImage',
    linuxArm: 'Linux ARM64 AppImage',
    recommended: '推薦用於目前裝置',
    genericDesc: '來自 GitHub 最新發布版本。',
  },
};

const previewKeys = ['previewOverview', 'previewBoard', 'previewGoals', 'previewCalendar'];
const platforms = [
  { key: 'windows-msi', label: 'windowsMsi', pattern: /windows-x86_64\.msi$/i, os: 'windows' },
  { key: 'windows-exe', label: 'windowsExe', pattern: /windows-x86_64\.exe$/i, os: 'windows' },
  { key: 'macos-aarch64', label: 'macApple', pattern: /macos-aarch64\.dmg$/i, os: 'mac-arm' },
  { key: 'macos-x86_64', label: 'macIntel', pattern: /macos-x86_64\.dmg$/i, os: 'mac-intel' },
  { key: 'linux-x86_64', label: 'linuxX64', pattern: /linux-x86_64\.AppImage$/i, os: 'linux' },
  { key: 'linux-aarch64', label: 'linuxArm', pattern: /linux-aarch64\.AppImage$/i, os: 'linux-arm' },
];

let currentLanguage = detectLanguage();
let currentPreview = 0;
let latestAssets = [];
let latestTag = '';

function detectLanguage() {
  const saved = localStorage.getItem('ascendTodoLanguage');
  if (saved && messages[saved]) return saved;
  const language = navigator.language || 'en';
  if (language.toLowerCase().startsWith('zh-tw') || language.toLowerCase().startsWith('zh-hk')) return 'zh-TW';
  if (language.toLowerCase().startsWith('zh')) return 'zh-CN';
  return 'en';
}

function detectTheme() {
  const saved = localStorage.getItem('ascendTodoSiteTheme');
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('ascendTodoSiteTheme', theme);
  const toggle = document.getElementById('themeToggle');
  if (!toggle) return;
  toggle.innerHTML = theme === 'dark'
    ? '<svg class="sun-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 4.25a.75.75 0 0 1 .75-.75h.5a.75.75 0 0 1 0 1.5h-.5a.75.75 0 0 1-.75-.75Zm0 15.5a.75.75 0 0 1 .75-.75h.5a.75.75 0 0 1 0 1.5h-.5a.75.75 0 0 1-.75-.75ZM4.25 12a.75.75 0 0 1-.75-.75v-.5a.75.75 0 0 1 1.5 0v.5a.75.75 0 0 1-.75.75Zm15.5 0a.75.75 0 0 1-.75-.75v-.5a.75.75 0 0 1 1.5 0v.5a.75.75 0 0 1-.75.75ZM6.02 6.02a.75.75 0 0 1 1.06 0l.35.35a.75.75 0 0 1-1.06 1.06l-.35-.35a.75.75 0 0 1 0-1.06Zm10.55 10.55a.75.75 0 0 1 1.06 0l.35.35a.75.75 0 0 1-1.06 1.06l-.35-.35a.75.75 0 0 1 0-1.06Zm1.41-10.55a.75.75 0 0 1 0 1.06l-.35.35a.75.75 0 1 1-1.06-1.06l.35-.35a.75.75 0 0 1 1.06 0ZM7.43 16.57a.75.75 0 0 1 0 1.06l-.35.35a.75.75 0 0 1-1.06-1.06l.35-.35a.75.75 0 0 1 1.06 0ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z"/></svg>'
    : '<svg class="moon-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20.72 15.42A9.3 9.3 0 0 1 8.58 3.28a.85.85 0 0 1 1.08 1.06 7.6 7.6 0 0 0 10 10 .85.85 0 0 1 1.06 1.08Z"/><circle cx="17.2" cy="7" r="1.1" fill="currentColor" opacity=".85"/></svg>';
  toggle.title = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
}

function text(key) {
  return messages[currentLanguage][key] || messages.en[key] || key;
}

function translate() {
  document.documentElement.lang = currentLanguage;
  document.querySelectorAll('[data-i18n]').forEach((node) => {
    const key = node.getAttribute('data-i18n');
    if (key) node.textContent = text(key);
  });
  document.title = text('brand');
  document.getElementById('languageSelect').value = currentLanguage;
  updatePreview(currentPreview);
  renderDownloads();
}

function detectPlatform() {
  const uaDataPlatform = navigator.userAgentData?.platform?.toLowerCase?.() || '';
  const ua = navigator.userAgent.toLowerCase();
  const platform = `${uaDataPlatform} ${navigator.platform || ''}`.toLowerCase();
  if (ua.includes('windows')) return 'windows';
  if (ua.includes('mac') || platform.includes('mac')) {
    if (ua.includes('arm') || ua.includes('aarch64')) return 'mac-arm';
    return 'mac-intel';
  }
  if (ua.includes('linux')) {
    if (ua.includes('aarch64') || ua.includes('arm64')) return 'linux-arm';
    return 'linux';
  }
  return 'windows';
}

function renderPrimaryDownload() {
  const primary = document.getElementById('primaryDownload');
  const meta = document.getElementById('primaryDownloadMeta');
  if (!primary || !meta) return;
  const recommended = recommendedItem();
  const primaryAsset = findAsset(recommended);
  primary.href = primaryAsset?.browser_download_url || latestReleaseUrl;
  meta.textContent = primaryAsset
    ? `${text(recommended.label)} · ${latestTag || 'latest'}`
    : `${text(recommended.label)} · ${text('releaseResolving')}`;
}

function findAsset(item) {
  return latestAssets.find((asset) => item.pattern.test(asset.name));
}

function recommendedItem() {
  const os = detectPlatform();
  if (os === 'windows') return platforms.find((item) => item.key === 'windows-msi');
  return platforms.find((item) => item.os === os) || platforms[0];
}

function renderDownloads() {
  const grid = document.getElementById('downloadGrid');
  if (!grid) return;
  const recommended = recommendedItem();

  grid.innerHTML = platforms.map((item) => {
    const asset = findAsset(item);
    const label = text(item.label);
    const isRecommended = recommended.key === item.key;
    const href = asset?.browser_download_url || latestReleaseUrl;
    const disabled = latestAssets.length > 0 && !asset;
    return `
      <article class="download-card">
        <div>
          <h3>${label}</h3>
          <p>${isRecommended ? text('recommended') : text('genericDesc')}</p>
        </div>
        <a class="${disabled ? 'disabled' : ''}" href="${href}" target="_blank" rel="noreferrer">
          ${disabled ? text('unavailable') : text('download')}
        </a>
      </article>
    `;
  }).join('');

  renderPrimaryDownload();
}

function updatePreview(index) {
  currentPreview = index;
  document.querySelectorAll('.preview-image').forEach((image, imageIndex) => {
    image.classList.toggle('active', imageIndex === index);
  });
  document.querySelectorAll('.preview-tabs button').forEach((button, buttonIndex) => {
    button.classList.toggle('active', buttonIndex === index);
  });
  document.getElementById('previewTitle').textContent = text(previewKeys[index]);
}

async function loadRelease() {
  const status = document.getElementById('releaseStatus');
  try {
    const release = await fetchReleaseData();
    latestTag = release.tag_name || '';
    latestAssets = Array.isArray(release.assets) ? release.assets : [];
    status.textContent = text('releaseReady').replace('{{tag}}', latestTag || 'latest');
  } catch {
    latestAssets = [];
    latestTag = '';
    status.textContent = text('releaseFallback');
  }
  renderDownloads();
}

async function fetchReleaseData() {
  for (const url of [releaseApi, githubReleaseApi]) {
    try {
      const response = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
      if (!response.ok) continue;
      return response.json();
    } catch {
      // Try the next source.
    }
  }
  throw new Error('Release lookup failed');
}

document.getElementById('languageSelect').addEventListener('change', (event) => {
  currentLanguage = event.target.value;
  localStorage.setItem('ascendTodoLanguage', currentLanguage);
  translate();
});

document.getElementById('themeToggle').addEventListener('click', () => {
  setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
});

document.querySelectorAll('.preview-tabs button').forEach((button) => {
  button.addEventListener('click', () => updatePreview(Number(button.dataset.preview)));
});

setTheme(detectTheme());
translate();
loadRelease();
window.setInterval(() => updatePreview((currentPreview + 1) % previewKeys.length), 4200);
