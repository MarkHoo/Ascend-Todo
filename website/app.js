const repo = 'MarkHoo/Ascend-Todo';
const releaseApi = `https://api.github.com/repos/${repo}/releases/latest`;
const latestReleaseUrl = `https://github.com/${repo}/releases/latest`;

const messages = {
  en: {
    brand: 'Ascend Todo',
    navFeatures: 'Features',
    navWorkflow: 'Workflow',
    navDownload: 'Download',
    github: 'GitHub',
    eyebrow: 'Desktop planner for focused work',
    heroTitle: 'Ascend Todo',
    heroSubtitle: 'A calm desktop workspace for tasks, goals, calendars, reminders, and Pomodoro focus.',
    downloadLatest: 'Download latest',
    detecting: 'Detecting your system...',
    allDownloads: 'All downloads',
    releaseLoading: 'Loading latest GitHub release...',
    releaseReady: 'Latest release: {{tag}}',
    releaseFallback: 'Could not read GitHub release details. Open the release page instead.',
    previewToday: 'Today',
    previewCalendar: 'Calendar',
    previewGoals: 'Goals',
    previewFocus: 'Focus',
    previewPlan: 'Deep work plan',
    previewTask1: 'Review weekly goals',
    previewTask2: 'Ship product notes',
    previewTask3: 'Focus session',
    featuresEyebrow: 'Built for real planning',
    featuresTitle: 'Everything lives in one rhythm',
    featureTasksTitle: 'Task boards',
    featureTasksText: 'Organize projects, tasks, notes, reminders, and progress without leaving the desktop.',
    featureGoalsTitle: 'Goals and reviews',
    featureGoalsText: 'Track goals, key results, check-ins, and progress history with a clear planning loop.',
    featureCalendarTitle: 'Calendar planning',
    featureCalendarText: 'Arrange tasks and events across day, week, and month views with practical time blocks.',
    featureFocusTitle: 'Pomodoro focus',
    featureFocusText: 'Run countdown or count-up focus sessions and keep output visible over time.',
    workflowEyebrow: 'Private first',
    workflowTitle: 'Works offline, ready for cloud sync',
    workflowText: 'The app is useful as a local desktop planner from the first launch. Account sync can be enabled when the API service is available.',
    workflowItem1: 'Local data stays on your device by default.',
    workflowItem2: 'Cloud sync covers tasks, goals, settings, and calendars.',
    workflowItem3: 'Avatar images remain local for privacy.',
    downloadEyebrow: 'Latest release',
    downloadTitle: 'Choose your installer',
    footer: 'Ascend Todo is an open-source desktop planner.',
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
    navWorkflow: '工作流',
    navDownload: '下载',
    github: 'GitHub',
    eyebrow: '专注工作的桌面计划工具',
    heroTitle: '光阶Todo',
    heroSubtitle: '把任务、目标、日历、提醒和番茄钟放进一个安静清晰的桌面工作区。',
    downloadLatest: '下载最新版',
    detecting: '正在识别你的系统...',
    allDownloads: '全部下载',
    releaseLoading: '正在读取 GitHub 最新版本...',
    releaseReady: '最新版本：{{tag}}',
    releaseFallback: '暂时无法读取 GitHub 版本信息，可打开发布页下载。',
    previewToday: '今天',
    previewCalendar: '日历',
    previewGoals: '目标',
    previewFocus: '专注',
    previewPlan: '深度工作计划',
    previewTask1: '复盘本周目标',
    previewTask2: '整理产品记录',
    previewTask3: '专注时段',
    featuresEyebrow: '为真实计划而设计',
    featuresTitle: '所有安排保持同一个节奏',
    featureTasksTitle: '任务看板',
    featureTasksText: '在桌面内组织项目、任务、笔记、提醒和进度，不需要频繁切换工具。',
    featureGoalsTitle: '目标与复盘',
    featureGoalsText: '管理目标、关键结果、检查记录和进度历史，形成清晰的计划闭环。',
    featureCalendarTitle: '日历规划',
    featureCalendarText: '在日、周、月视图中安排任务和日程，用时间块规划真实的一天。',
    featureFocusTitle: '番茄钟专注',
    featureFocusText: '支持倒计时和正计时专注，并让产出趋势持续可见。',
    workflowEyebrow: '本地优先',
    workflowTitle: '离线可用，也为云端同步准备好',
    workflowText: '首次打开即可作为本地桌面计划工具使用。账号同步会在 API 服务可用后开启。',
    workflowItem1: '默认情况下，本地数据保存在当前设备。',
    workflowItem2: '云端同步覆盖任务、目标、设置和日历数据。',
    workflowItem3: '头像仅保存在本机，保护个人隐私。',
    downloadEyebrow: '最新版本',
    downloadTitle: '选择你的安装包',
    footer: '光阶Todo 是一个开源桌面计划工具。',
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
    navWorkflow: '工作流',
    navDownload: '下載',
    github: 'GitHub',
    eyebrow: '專注工作的桌面計劃工具',
    heroTitle: '光階Todo',
    heroSubtitle: '把任務、目標、日曆、提醒和番茄鐘放進一個安靜清晰的桌面工作區。',
    downloadLatest: '下載最新版',
    detecting: '正在識別你的系統...',
    allDownloads: '全部下載',
    releaseLoading: '正在讀取 GitHub 最新版本...',
    releaseReady: '最新版本：{{tag}}',
    releaseFallback: '暫時無法讀取 GitHub 版本資訊，可打開發布頁下載。',
    previewToday: '今天',
    previewCalendar: '日曆',
    previewGoals: '目標',
    previewFocus: '專注',
    previewPlan: '深度工作計劃',
    previewTask1: '複盤本週目標',
    previewTask2: '整理產品記錄',
    previewTask3: '專注時段',
    featuresEyebrow: '為真實計劃而設計',
    featuresTitle: '所有安排保持同一個節奏',
    featureTasksTitle: '任務看板',
    featureTasksText: '在桌面內組織專案、任務、筆記、提醒和進度，不需要頻繁切換工具。',
    featureGoalsTitle: '目標與複盤',
    featureGoalsText: '管理目標、關鍵結果、檢查記錄和進度歷史，形成清晰的計劃閉環。',
    featureCalendarTitle: '日曆規劃',
    featureCalendarText: '在日、週、月檢視中安排任務和日程，用時間區塊規劃真實的一天。',
    featureFocusTitle: '番茄鐘專注',
    featureFocusText: '支援倒數和正計時專注，並讓產出趨勢持續可見。',
    workflowEyebrow: '本機優先',
    workflowTitle: '離線可用，也為雲端同步準備好',
    workflowText: '首次打開即可作為本機桌面計劃工具使用。帳號同步會在 API 服務可用後開啟。',
    workflowItem1: '預設情況下，本機資料保存在目前裝置。',
    workflowItem2: '雲端同步覆蓋任務、目標、設定和日曆資料。',
    workflowItem3: '頭像僅保存在本機，保護個人隱私。',
    downloadEyebrow: '最新版本',
    downloadTitle: '選擇你的安裝包',
    footer: '光階Todo 是一個開源桌面計劃工具。',
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

const platforms = [
  { key: 'windows-msi', label: 'windowsMsi', pattern: /windows-x86_64\.msi$/i, os: 'windows' },
  { key: 'windows-exe', label: 'windowsExe', pattern: /windows-x86_64\.exe$/i, os: 'windows' },
  { key: 'macos-aarch64', label: 'macApple', pattern: /macos-aarch64\.dmg$/i, os: 'mac-arm' },
  { key: 'macos-x86_64', label: 'macIntel', pattern: /macos-x86_64\.dmg$/i, os: 'mac-intel' },
  { key: 'linux-x86_64', label: 'linuxX64', pattern: /linux-x86_64\.AppImage$/i, os: 'linux' },
  { key: 'linux-aarch64', label: 'linuxArm', pattern: /linux-aarch64\.AppImage$/i, os: 'linux-arm' },
];

let currentLanguage = detectLanguage();
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
  renderDownloads();
}

function detectPlatform() {
  const ua = navigator.userAgent.toLowerCase();
  const platform = (navigator.platform || '').toLowerCase();
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

  const primary = document.getElementById('primaryDownload');
  const meta = document.getElementById('primaryDownloadMeta');
  const primaryAsset = findAsset(recommended);
  primary.href = primaryAsset?.browser_download_url || latestReleaseUrl;
  meta.textContent = primaryAsset
    ? `${text(recommended.label)}${latestTag ? ` · ${latestTag}` : ''}`
    : text('detecting');
}

async function loadRelease() {
  const status = document.getElementById('releaseStatus');
  try {
    const response = await fetch(releaseApi, { headers: { Accept: 'application/vnd.github+json' } });
    if (!response.ok) throw new Error(`GitHub ${response.status}`);
    const release = await response.json();
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

document.getElementById('languageSelect').addEventListener('change', (event) => {
  currentLanguage = event.target.value;
  localStorage.setItem('ascendTodoLanguage', currentLanguage);
  translate();
});

translate();
loadRelease();
