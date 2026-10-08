const plugin = app.plugins.plugins['dashell-player'];
const normalizePath = (value) => value.replace(/[\\/]+/g, '\\').toLowerCase();
if (!plugin || normalizePath(app.vault.adapter.getBasePath()) !== 'f:\\qiaomu-reader-english') {
  throw new Error('Run only with Dashell Player enabled in F:\\qiaomu-reader-english');
}

const stem = `__Codex-DashellPlayer-Dictation-${Date.now()}`;
const mediaPath = `${stem}.wav`;
const subtitlePath = `${stem}.srt`;
const evidenceDir = require('os').tmpdir();
const workspaceSnapshot = app.workspace.getLayout();
const settingsSnapshot = JSON.parse(JSON.stringify(plugin.settings));
const windowRef = require('@electron/remote').getCurrentWindow();
const originalBounds = windowRef.getBounds();
const wasMaximized = windowRef.isMaximized();
const sidebars = {
  leftCollapsed: app.workspace.leftSplit?.collapsed ?? true,
  rightCollapsed: app.workspace.rightSplit?.collapsed ?? true,
};
let media;
let subtitle;
let playerLeaf;
let dictationLeaf;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const waitFor = async (check, label, timeout = 10000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = check();
    if (value) return value;
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${label}`);
};
const assert = (condition, label) => {
  if (!condition) throw new Error(`Dictation UI regression: ${label}`);
};
const activeDotVisible = (expectedIndex = '39') => {
  const panel = dictationLeaf?.view?.containerEl?.querySelector('.lp-dictation-panel');
  const dots = panel?.querySelector('.lp-dictation-progress-dots');
  const activeDot = dots?.querySelector('[data-dot-state^="active"]');
  if (!dots || !activeDot || activeDot.getAttribute('data-dot-index') !== expectedIndex) return false;
  const dotRect = activeDot.getBoundingClientRect();
  const listRect = dots.getBoundingClientRect();
  return dotRect.left >= listRect.left - 1 && dotRect.right <= listRect.right + 1;
};
const createWav = () => {
  const dataBytes = 8000 * 2 * 90;
  const wav = new ArrayBuffer(44 + dataBytes);
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
  ascii(36, 'data'); header.setUint32(40, dataBytes, true);
  return wav;
};
const formatTime = (seconds) => {
  const hours = String(Math.floor(seconds / 3600)).padStart(2, '0');
  const minutes = String(Math.floor(seconds / 60) % 60).padStart(2, '0');
  const rest = String(seconds % 60).padStart(2, '0');
  return `${hours}:${minutes}:${rest},000`;
};
const createSubtitles = () => Array.from({ length: 40 }, (_, index) => {
  const sentence = index === 0
    ? "The careful listener follows every small change in the speaker's voice."
    : `Sentence ${index + 1} keeps the dictation controls useful in a narrow Obsidian pane.`;
  return `${index + 1}\n${formatTime(index * 2)} --> ${formatTime(index * 2 + 2)}\n${sentence}\n`;
}).join('\n');

const inspect = (label) => {
  const root = dictationLeaf?.view?.containerEl;
  const panel = root?.querySelector('.lp-dictation-panel');
  const dots = panel?.querySelector('.lp-dictation-progress-dots');
  const activeDot = dots?.querySelector('[data-dot-state^="active"]');
  const progress = panel?.querySelector('.lp-dictation-progress-action');
  const replay = panel?.querySelector('.lp-dictation-replay-action');
  const boxes = panel?.querySelector('.lp-dictation-boxes');
  const shortcuts = panel?.querySelector('.lp-dictation-shortcuts');
  assert(panel && dots && progress && replay && boxes, `${label}: dictation controls are missing`);
  assert(dots.children.length === 40, `${label}: expected 40 sentence markers, got ${dots.children.length}`);
  assert(getComputedStyle(dots).flexWrap === 'nowrap', `${label}: sentence markers wrapped into multiple rows`);
  if (label.startsWith('narrow')) {
    assert(dots.scrollWidth > dots.clientWidth, `${label}: long sentence list does not scroll horizontally`);
  }
  assert(progress.textContent.includes('/'), `${label}: input count is missing`);
  assert(getComputedStyle(progress).flexDirection === 'column', `${label}: input progress is not visually secondary`);
  assert(replay.querySelector('svg') && replay.textContent.trim(), `${label}: replay action is not clearly presented`);
  assert(shortcuts?.children.length === 2, `${label}: replay shortcut is duplicated below the action row`);
  assert(boxes.getBoundingClientRect().width <= panel.getBoundingClientRect().width + 1, `${label}: input area exceeds the panel`);
  if (activeDot) {
    const dotRect = activeDot.getBoundingClientRect();
    const listRect = dots.getBoundingClientRect();
    assert(
      dotRect.left >= listRect.left - 1 && dotRect.right <= listRect.right + 1,
      `${label}: active sentence ${activeDot.getAttribute('data-dot-index')} is outside its viewport (${Math.round(dotRect.left)}-${Math.round(dotRect.right)} vs ${Math.round(listRect.left)}-${Math.round(listRect.right)}, scroll ${dots.scrollLeft}/${dots.scrollWidth})`,
    );
  }
  return {
    label,
    panelWidth: Math.round(panel.getBoundingClientRect().width),
    dots: dots.children.length,
    dotsWidth: Math.round(dots.clientWidth),
    dotsScrollWidth: Math.round(dots.scrollWidth),
    headlineDirection: getComputedStyle(panel.querySelector('.lp-dictation-headline')).flexDirection,
    boxWidth: Math.round(boxes.getBoundingClientRect().width),
    progress: progress.textContent.trim(),
    activeIndex: activeDot?.getAttribute('data-dot-index') ?? null,
  };
};

try {
  if (app.vault.getAbstractFileByPath(mediaPath) || app.vault.getAbstractFileByPath(subtitlePath)) {
    throw new Error('A temporary fixture path already exists');
  }
  if (wasMaximized) windowRef.unmaximize();
  if (!sidebars.leftCollapsed) app.workspace.leftSplit.collapse();
  if (!sidebars.rightCollapsed) app.workspace.rightSplit.collapse();
  windowRef.setSize(1440, 900);
  media = await app.vault.createBinary(mediaPath, createWav());
  subtitle = await app.vault.create(subtitlePath, createSubtitles());

  playerLeaf = app.workspace.getLeaf('tab');
  await playerLeaf.setViewState({
    type: 'langplayer-view',
    state: { file: media.path },
    active: true,
  });
  await app.workspace.revealLeaf(playerLeaf);
  await waitFor(() => playerLeaf?.view?.containerEl?.querySelector('.lp-controls-row'), 'player controls');
  dictationLeaf = app.workspace.createLeafBySplit(playerLeaf, 'vertical', false);
  await dictationLeaf.setViewState({ type: 'langplayer-dictation', active: true });
  await app.workspace.revealLeaf(dictationLeaf);
  const dots = await waitFor(() => dictationLeaf?.view?.containerEl?.querySelectorAll('.lp-dictation-progress-dots .lp-dot').length === 40, '40 dictation sentence markers');
  const dotButtons = dictationLeaf.view.containerEl.querySelectorAll('.lp-dictation-progress-dots .lp-dot');
  dotButtons[39].click();
  await waitFor(activeDotVisible, 'active sentence auto-scroll');

  const wide = inspect('wide split');
  const wideShot = require('path').join(evidenceDir, 'dashell-player-dictation-wide.png');
  require('fs').writeFileSync(wideShot, (await windowRef.webContents.capturePage()).toPNG());

  windowRef.unmaximize();
  windowRef.setSize(840, 850);
  await waitFor(() => windowRef.getBounds().width === 840, 'narrow host window size');
  await sleep(300);
  await waitFor(activeDotVisible, 'active sentence remains visible after pane resize');
  const narrow = inspect('narrow split');
  assert(narrow.panelWidth < 620, `narrow test did not create a compact panel (${narrow.panelWidth}px)`);
  assert(narrow.headlineDirection === 'column', 'narrow split did not activate the compact header layout');
  const narrowShot = require('path').join(evidenceDir, 'dashell-player-dictation-narrow.png');
  require('fs').writeFileSync(narrowShot, (await windowRef.webContents.capturePage()).toPNG());

  const progressButton = dictationLeaf.view.containerEl.querySelector('.lp-dictation-progress-action');
  const hiddenInput = dictationLeaf.view.containerEl.querySelector('.lp-dictation-hidden-input');
  progressButton.click();
  assert(document.activeElement === hiddenInput, 'input progress control no longer returns focus to dictation');
  const shortcutCount = dictationLeaf.view.containerEl.querySelector('.lp-dictation-shortcuts')?.children.length;
  assert(shortcutCount === 2, 'hint shortcut is missing or replay shortcut is still duplicated');

  return {
    vault: app.vault.adapter.getBasePath(),
    version: plugin.manifest.version,
    fixtureCount: dots,
    layouts: [wide, narrow],
    screenshots: [wideShot, narrowShot],
    inputFocusPreserved: true,
    replayActionPresent: true,
  };
} finally {
  for (const type of ['langplayer-view', 'langplayer-dictation']) {
    for (const leaf of app.workspace.getLeavesOfType(type)) {
      if (leaf === playerLeaf || leaf === dictationLeaf) leaf.detach();
    }
  }
  await sleep(550);
  if (subtitle) await app.vault.delete(subtitle);
  if (media) await app.vault.delete(media);
  await sleep(100);
  await plugin.settingsSaveQueue;
  Object.assign(plugin.settings, settingsSnapshot);
  await plugin.saveSettings();
  await app.workspace.changeLayout(workspaceSnapshot);
  await sleep(100);
  windowRef.setBounds(originalBounds);
  if (!sidebars.leftCollapsed) app.workspace.leftSplit.expand();
  if (!sidebars.rightCollapsed) app.workspace.rightSplit.expand();
  if (wasMaximized) windowRef.maximize();
}
