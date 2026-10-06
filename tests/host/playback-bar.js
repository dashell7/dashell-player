const plugin = app.plugins.plugins['dashell-player'] || app.plugins.plugins.langplayer;
if (!plugin) throw new Error('LangPlayer is not enabled');
if (app.vault.adapter.basePath !== 'F:\\qiaomu-reader-english') {
  throw new Error(`Unexpected vault: ${app.vault.adapter.basePath}`);
}

const stem = '__Codex-LangPlayer-PlaybackBar-20261005';
const mediaPath = `${stem}.wav`;
const subtitlePath = `${stem}.srt`;
if (app.vault.getAbstractFileByPath(mediaPath) || app.vault.getAbstractFileByPath(subtitlePath)) {
  throw new Error('Test fixture path already exists');
}

const waitFor = async (getValue, label, timeout = 8000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = getValue();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw new Error(`Timed out waiting for ${label}`);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const snapshotSettings = JSON.parse(JSON.stringify(plugin.settings));
const existingLeaves = new Set(app.workspace.getLeavesOfType('langplayer-view'));
const previousLeaf = app.workspace.getMostRecentLeaf();
let media;
let subtitle;
let playerLeaf;

const createWav = () => {
  const wav = new ArrayBuffer(44 + 16000);
  const bytes = new Uint8Array(wav);
  const header = new DataView(wav);
  const ascii = (offset, value) => [...value].forEach((letter, index) => { bytes[offset + index] = letter.charCodeAt(0); });
  ascii(0, 'RIFF'); header.setUint32(4, wav.byteLength - 8, true);
  ascii(8, 'WAVE'); ascii(12, 'fmt '); header.setUint32(16, 16, true);
  header.setUint16(20, 1, true); header.setUint16(22, 1, true);
  header.setUint32(24, 8000, true); header.setUint32(28, 16000, true);
  header.setUint16(32, 2, true); header.setUint16(34, 16, true);
  ascii(36, 'data'); header.setUint32(40, 16000, true);
  return wav;
};

const getPlayerRoot = () => playerLeaf?.view?.containerEl;
const getBar = () => getPlayerRoot()?.querySelector('.lp-playback-bar');
const getMediaArea = () => getPlayerRoot()?.querySelector('.lp-audio-visual, .lp-video-area');
const apply = async (values) => {
  Object.assign(plugin.settings, values);
  // The settings screen uses saveSettings(). Calling it here exercises the
  // production persistence and runtime-refresh path instead of dispatching an
  // event from the host-evaluation isolated world.
  await plugin.saveSettings();
  await sleep(80);
};

const assert = (condition, label) => {
  if (!condition) throw new Error(`Playback toolbar regression: ${label}`);
};

try {
  media = await app.vault.createBinary(mediaPath, createWav());
  subtitle = await app.vault.create(
    subtitlePath,
    '1\n00:00:00,000 --> 00:00:02,000\nAloud keeps the playback toolbar stable.\n朗读工具条保持稳定。\n',
  );

  // Keep the test focused on the player view and avoid creating a second leaf.
  await apply({
    playbackBarVisibility: 'always',
    playbackBarDisplay: 'fixed',
    playbackBarPosition: 'bottom',
    playbackBarAutoHideMs: 1000,
    subtitlePanelAutoOpen: false,
  });
  // Always use an owned split leaf. Reusing getLeaf('tab') can replace an
  // already-open player and leave it pointing to a fixture that this test
  // deletes during cleanup.
  playerLeaf = previousLeaf
    ? app.workspace.createLeafBySplit(previousLeaf, 'vertical', false)
    : app.workspace.getLeaf('tab');
  await playerLeaf.setViewState({ type: 'langplayer-view', state: { file: media.path }, active: true });
  await app.workspace.revealLeaf(playerLeaf);
  const root = await waitFor(getPlayerRoot, 'player view');
  const bar = await waitFor(getBar, 'playback toolbar');
  const mediaArea = await waitFor(getMediaArea, 'media area');
  await sleep(200);

  const view = playerLeaf.view;
  const sessionId = view.sessionId;
  const layout = root.querySelector('.lp-video-column, .lp-audio-layout');
  const mediaElement = layout?.querySelector('.lp-audio-visual, .lp-video-area');
  if (!layout || !mediaElement) throw new Error('Player layout did not mount');
  const toolbarOrder = Number.parseInt(getComputedStyle(bar).order, 10);
  const mediaOrder = Number.parseInt(getComputedStyle(mediaElement).order, 10);
  const bottomRect = mediaArea.getBoundingClientRect();
  const fixedBottom = {
    hasFixedClass: bar.classList.contains('lp-playback-bar--fixed'),
    hasBottomClass: bar.classList.contains('lp-playback-bar--bottom'),
    toolbarVisible: !bar.classList.contains('is-hidden') && bar.getAttribute('aria-hidden') === 'false',
    toolbarMinHeight: getComputedStyle(bar).minHeight,
    toolbarAfterMedia: toolbarOrder > mediaOrder,
  };
  assert(fixedBottom.hasFixedClass && fixedBottom.hasBottomClass && fixedBottom.toolbarVisible,
    'fixed bottom toolbar is not visible');
  assert(fixedBottom.toolbarAfterMedia, 'fixed bottom toolbar is not after the media area');

  // A hidden fixed bar must retain its measured height so the media area does not jump.
  await apply({ playbackBarVisibility: 'never' });
  await waitFor(() => bar.classList.contains('is-hidden') && bar.hasAttribute('inert'), 'hidden fixed toolbar');
  const hiddenFixedRect = mediaArea.getBoundingClientRect();
  const hiddenFixed = {
    hidden: bar.classList.contains('is-hidden'),
    inert: bar.hasAttribute('inert'),
    sameMediaTop: Math.abs(hiddenFixedRect.top - bottomRect.top) < 1,
    sameMediaHeight: Math.abs(hiddenFixedRect.height - bottomRect.height) < 1,
  };
  assert(hiddenFixed.hidden && hiddenFixed.inert && hiddenFixed.sameMediaTop && hiddenFixed.sameMediaHeight,
    'hidden fixed toolbar changes the media layout');

  // Top fixed mode changes flex order while preserving the media region dimensions.
  await apply({ playbackBarVisibility: 'always', playbackBarDisplay: 'fixed', playbackBarPosition: 'top' });
  await waitFor(() => bar.classList.contains('lp-playback-bar--top') && !bar.classList.contains('is-hidden'), 'top fixed toolbar');
  const topRect = mediaArea.getBoundingClientRect();
  const topToolbarOrder = Number.parseInt(getComputedStyle(bar).order, 10);
  const topMediaOrder = Number.parseInt(getComputedStyle(mediaElement).order, 10);
  const fixedTop = {
    hasTopClass: bar.classList.contains('lp-playback-bar--top'),
    toolbarBeforeMedia: topToolbarOrder < topMediaOrder,
    mediaHeightStable: Math.abs(topRect.height - bottomRect.height) < 1,
  };
  assert(fixedTop.hasTopClass && fixedTop.toolbarBeforeMedia && fixedTop.mediaHeightStable,
    'top fixed toolbar has the wrong position or changes the media layout');

  // Floating mode overlays the media and hides after inactivity. Use a native
  // pointer event on the actual player so React dispatches the session-scoped
  // activity event from the renderer that owns this player.
  await apply({ playbackBarDisplay: 'floating', playbackBarPosition: 'bottom', playbackBarAutoHideMs: 1000 });
  await waitFor(() => bar.classList.contains('lp-playback-bar--floating') && !bar.classList.contains('is-hidden'), 'visible floating toolbar');
  const floatingRect = mediaArea.getBoundingClientRect();
  const floatingVisible = !bar.classList.contains('is-hidden');
  await sleep(1200);
  const floatingHidden = bar.classList.contains('is-hidden') && bar.hasAttribute('inert');
  const hiddenFloatingRect = mediaArea.getBoundingClientRect();
  mediaArea.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
  await waitFor(() => !bar.classList.contains('is-hidden') && !bar.hasAttribute('inert'), 'floating toolbar after player activity');
  const revealedByOwnActivity = !bar.classList.contains('is-hidden') && !bar.hasAttribute('inert');
  const floating = {
    floatingVisible,
    floatingHidden,
    revealedByOwnActivity,
    mediaLayoutStable: Math.abs(floatingRect.height - hiddenFloatingRect.height) < 1,
  };
  assert(floating.floatingVisible && floating.floatingHidden && floating.revealedByOwnActivity && floating.mediaLayoutStable,
    'floating toolbar does not hide, reveal, or preserve the media layout');

  return {
    vault: app.vault.adapter.basePath,
    version: plugin.manifest.version,
    settingsVersion: plugin.settings.settingsVersion,
    fixedBottom,
    hiddenFixed,
    fixedTop,
    floating,
  };
} finally {
  Object.assign(plugin.settings, snapshotSettings);
  await plugin.saveSettings();
  if (playerLeaf && !existingLeaves.has(playerLeaf)) playerLeaf.detach();
  for (const leaf of app.workspace.getLeavesOfType('langplayer-view')) {
    if (!existingLeaves.has(leaf)) leaf.detach();
  }
  await sleep(100);
  if (subtitle) await app.vault.delete(subtitle);
  if (media) await app.vault.delete(media);
  if (previousLeaf?.view?.containerEl?.isConnected) {
    app.workspace.setActiveLeaf(previousLeaf, { focus: false });
  }
}
