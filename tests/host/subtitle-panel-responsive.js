const plugin = app.plugins.plugins['dashell-player'] || app.plugins.plugins.langplayer;
if (!plugin || app.vault.adapter.basePath !== 'F:\\qiaomu-reader-english') {
  throw new Error('Run only with Dashell Player enabled in the designated QA vault');
}

const stem = `__Codex-LangPlayer-Responsive-${Date.now()}`;
const mediaPath = `${stem}.wav`;
const subtitlePath = `${stem}.srt`;
const viewTypes = ['langplayer-view', 'langplayer-subtitle-panel'];
const existingLeaves = new Set(viewTypes.flatMap((type) => app.workspace.getLeavesOfType(type)));
const previousLeaf = app.workspace.getMostRecentLeaf();
const settingsSnapshot = JSON.parse(JSON.stringify(plugin.settings));
const windowRef = require('electron').remote.getCurrentWindow();
const originalBounds = windowRef.getBounds();
const wasMaximized = windowRef.isMaximized();
const sidebars = {
  leftCollapsed: app.workspace.leftSplit?.collapsed ?? true,
  rightCollapsed: app.workspace.rightSplit?.collapsed ?? true,
};
let media;
let subtitle;
let playerLeaf;
let panelLeaf;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const waitFor = async (check, label, timeout = 8000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = check();
    if (value) return value;
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${label}`);
};
const assert = (condition, label) => {
  if (!condition) throw new Error(`Responsive layout regression: ${label}`);
};

const createWav = () => {
  const wav = new ArrayBuffer(44 + 16000);
  const bytes = new Uint8Array(wav);
  const header = new DataView(wav);
  const ascii = (offset, value) => [...value].forEach((letter, index) => {
    bytes[offset + index] = letter.charCodeAt(0);
  });
  ascii(0, 'RIFF'); header.setUint32(4, wav.byteLength - 8, true);
  ascii(8, 'WAVE'); ascii(12, 'fmt '); header.setUint32(16, 16, true);
  header.setUint16(20, 1, true); header.setUint16(22, 1, true);
  header.setUint32(24, 8000, true); header.setUint32(28, 16000, true);
  header.setUint16(32, 2, true); header.setUint16(34, 16, true);
  ascii(36, 'data'); header.setUint32(40, 16000, true);
  return wav;
};

const inspectAtSize = async (width, height) => {
  windowRef.setSize(width, height);
  await sleep(250);
  const bounds = windowRef.getBounds();
  assert(
    Math.abs(bounds.width - width) <= 2 && Math.abs(bounds.height - height) <= 2,
    `requested ${width}x${height}, but the host window is ${bounds.width}x${bounds.height}`,
  );

  const playerRoot = playerLeaf?.view?.containerEl;
  const panelRoot = panelLeaf?.view?.containerEl;
  const controls = playerRoot?.querySelector('.lp-controls-row');
  const toolbar = panelRoot?.querySelector('.lp-subtitle-toolbar');
  const playerContainer = playerRoot?.querySelector('.lp-audio-layout, .lp-video-column');
  const subtitlePanel = panelRoot?.querySelector('.lp-subtitle-panel');
  if (!controls || !toolbar || !playerContainer || !subtitlePanel) {
    throw new Error('Player or subtitle panel did not mount');
  }

  const playerWidth = playerContainer.getBoundingClientRect().width;
  const controlsDisplay = getComputedStyle(controls).display;
  const controlsFit = controls.scrollWidth <= controls.clientWidth + 1;
  const toolbarFit = toolbar.scrollWidth <= toolbar.clientWidth + 1;
  const panelFit = subtitlePanel.scrollWidth <= subtitlePanel.clientWidth + 1;
  const usesCompactControls = playerWidth <= 760 ? controlsDisplay === 'grid' : true;

  assert(usesCompactControls, `${width}px window does not switch narrow player controls to the grid layout`);
  const controlChildren = [...controls.children].map((element) => ({
    className: element.className,
    width: Math.round(element.getBoundingClientRect().width),
  }));
  assert(
    controlsFit,
    `${width}px window overflows the player controls (${controls.scrollWidth}/${controls.clientWidth}; ${JSON.stringify(controlChildren)})`,
  );
  assert(toolbarFit, `${width}px window overflows the subtitle toolbar`);
  assert(panelFit, `${width}px window overflows the subtitle panel`);

  return {
    window: { width: bounds.width, height: bounds.height },
    playerWidth: Math.round(playerWidth),
    controlsDisplay,
    controlsFit,
    toolbarFit,
    panelFit,
  };
};

try {
  if (wasMaximized) windowRef.unmaximize();
  if (!sidebars.leftCollapsed) app.workspace.leftSplit.collapse();
  if (!sidebars.rightCollapsed) app.workspace.rightSplit.collapse();
  await sleep(100);
  media = await app.vault.createBinary(mediaPath, createWav());
  subtitle = await app.vault.create(
    subtitlePath,
    '1\n00:00:00,000 --> 00:00:02,000\nResponsive controls keep every action reachable.\n响应式控件会保持所有操作可用。\n',
  );
  plugin.settings.subtitlePanelAutoOpen = false;
  await plugin.saveSettings();

  // A tab leaf belongs to the main workspace group. Splitting the currently
  // active leaf can instead target a collapsed sidebar, producing a pane too
  // narrow to represent a real player layout.
  playerLeaf = app.workspace.getLeaf('tab');
  await playerLeaf.setViewState({
    type: 'langplayer-view',
    state: { file: media.path },
    active: true,
  });
  await app.workspace.revealLeaf(playerLeaf);
  await waitFor(
    () => playerLeaf?.view?.containerEl?.querySelector('.lp-controls-row'),
    'player controls',
  );

  panelLeaf = app.workspace.createLeafBySplit(playerLeaf, 'vertical', false);
  await panelLeaf.setViewState({ type: 'langplayer-subtitle-panel', active: false });
  const subtitleCard = await waitFor(
    () => panelLeaf?.view?.containerEl?.querySelector('.lp-subtitle-card'),
    'subtitle card',
  );
  assert(subtitleCard.textContent.includes('Responsive controls keep every action reachable.'), 'matching subtitle was not loaded');

  const wide = await inspectAtSize(1200, 850);
  const narrow = await inspectAtSize(820, 850);
  const screenshotPath = require('path').join(
    require('os').tmpdir(),
    'langplayer-subtitle-panel-responsive-active.png',
  );
  const image = await windowRef.webContents.capturePage();
  require('fs').writeFileSync(screenshotPath, image.toPNG());
  return {
    vault: app.vault.adapter.basePath,
    version: plugin.manifest.version,
    subtitleLoaded: true,
    wide,
    narrow,
    screenshotPath,
  };
} finally {
  Object.assign(plugin.settings, settingsSnapshot);
  await plugin.saveSettings();
  for (const type of viewTypes) {
    for (const leaf of app.workspace.getLeavesOfType(type)) {
      if (!existingLeaves.has(leaf)) leaf.detach();
    }
  }
  await sleep(100);
  if (subtitle) await app.vault.delete(subtitle);
  if (media) await app.vault.delete(media);
  windowRef.setBounds(originalBounds);
  if (!sidebars.leftCollapsed) app.workspace.leftSplit.expand();
  if (!sidebars.rightCollapsed) app.workspace.rightSplit.expand();
  if (wasMaximized) windowRef.maximize();
  if (previousLeaf?.view?.containerEl?.isConnected) {
    app.workspace.setActiveLeaf(previousLeaf, { focus: false });
  }
}
