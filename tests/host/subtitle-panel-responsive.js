const plugin = app.plugins.plugins['dashell-player'];
const normalizePath = (value) => value.replace(/[\\/]+/g, '\\').toLowerCase();
const vaultPath = app.vault.adapter.getBasePath();
if (!plugin || normalizePath(vaultPath) !== 'f:\\qiaomu-reader-english') {
  throw new Error('Run only with Dashell Player enabled in F:\\qiaomu-reader-english');
}

const stem = `__Codex-LangPlayer-Responsive-${Date.now()}`;
const mediaPath = `${stem}.wav`;
const subtitlePath = `${stem}.srt`;
const videoPath = globalThis.__DASHELL_PLAYER_VIDEO_PATH__;
const evidenceDir = globalThis.__DASHELL_PLAYER_EVIDENCE_DIR__ || require('os').tmpdir();
if (typeof videoPath !== 'string' || !/^__Codex-DashellPlayer-Video-[a-z0-9-]+\.mp4$/i.test(videoPath)) {
  throw new Error('A unique synthetic video fixture path is required');
}
const videoSubtitlePath = `${videoPath.replace(/\.mp4$/i, '')}.srt`;
const viewTypes = ['langplayer-view', 'langplayer-subtitle-panel'];
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
let videoSubtitle;
let videoFile;
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

const inspectAtSize = async (width, height, label, mediaKind = 'audio') => {
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

  const iconButtons = [
    ...playerRoot.querySelectorAll('.lp-icon-button'),
    ...panelRoot.querySelectorAll('.lp-icon-button'),
  ];
  const playerButtons = [...controls.querySelectorAll('.lp-ctrl-btn')];
  const unevenButtons = playerButtons
    .filter((button) => !button.classList.contains('lp-ctrl-btn--play'))
    .filter((button) => {
      const rect = button.getBoundingClientRect();
      return Math.abs(rect.width - 40) > 1 || Math.abs(rect.height - 40) > 1;
    })
    .map((button) => ({
      className: button.className,
      width: Math.round(button.getBoundingClientRect().width),
      height: Math.round(button.getBoundingClientRect().height),
    }));
  assert(unevenButtons.length === 0, `${label}: player control buttons do not share a 40px square (${JSON.stringify(unevenButtons)})`);
  const playButton = controls.querySelector('.lp-ctrl-btn--play');
  if (playButton) {
    const rect = playButton.getBoundingClientRect();
    assert(Math.abs(rect.width - 46) <= 1 && Math.abs(rect.height - 46) <= 1, `${label}: primary play button lost its larger size`);
  }
  assert(iconButtons.every((button) => button.hasAttribute('aria-labelledby')), `${label}: an icon button has no accessible name reference`);
  assert(iconButtons.every((button) => !button.hasAttribute('aria-label')), `${label}: an icon button may trigger an extra Obsidian hover tooltip`);
  assert(iconButtons.every((button) => {
    const ids = button.getAttribute('aria-labelledby')?.trim().split(/\s+/) ?? [];
    return ids.length > 0 && ids.every((id) => document.getElementById(id)?.textContent.trim());
  }), `${label}: an icon button references an empty or missing accessible name`);
  const subtitleDisplayButtons = panelRoot.querySelectorAll('.lp-subtitle-display-toggles .lp-icon-button');
  assert(subtitleDisplayButtons.length === 3, `${label}: subtitle display mode controls are missing`);
  assert(
    [...subtitleDisplayButtons].every((button) => ![...button.querySelectorAll('span:not(.lp-sr-only)')].some((span) => span.textContent.trim())),
    `${label}: subtitle display controls show adjacent text labels`,
  );
  assert(
    [...subtitleDisplayButtons].every((button) => button.getAttribute('aria-pressed') === String(button.classList.contains('lp-ctrl-btn--active'))),
    `${label}: subtitle display icon state does not match its pressed state`,
  );
  const overlayButton = playerRoot.querySelector('.lp-ctrl-btn--overlay');
  assert(overlayButton && overlayButton.querySelector('.lp-ctrl-badge') === null, `${label}: inline subtitle mode still shows a text badge`);
  assert(iconButtons.every((button) => !button.hasAttribute('title') && !button.hasAttribute('data-tooltip')), `${label}: an icon button has a second tooltip source`);
  const visibleIconLabels = iconButtons.filter((button) =>
    [...button.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim())
      || [...button.querySelectorAll('span:not(.lp-sr-only):not(.lp-ctrl-badge):not(.lp-speed-value):not(.lp-rec-dot)')]
        .some((span) => span.textContent.trim()),
  );
  assert(visibleIconLabels.length === 0, `${label}: an icon button still shows an action label`);

  const playerWidth = playerContainer.getBoundingClientRect().width;
  const controlsDisplay = getComputedStyle(controls).display;
  const controlsFit = controls.scrollWidth <= controls.clientWidth + 1;
  const toolbarFit = toolbar.scrollWidth <= toolbar.clientWidth + 1;
  const panelFit = subtitlePanel.scrollWidth <= subtitlePanel.clientWidth + 1;
  const childRects = [...controls.children]
    .filter((element) => getComputedStyle(element).display !== 'none')
    .map((element) => element.getBoundingClientRect());
  const transport = playerRoot.querySelector('.lp-control-group--transport');
  const practice = playerRoot.querySelector('.lp-control-group--practice');
  const view = playerRoot.querySelector('.lp-control-group--view');
  const groupRects = [transport, practice, view].map((element) => element?.getBoundingClientRect());
  const childrenFit = childRects.every((rect) =>
    rect.left >= controls.getBoundingClientRect().left - 1
      && rect.right <= controls.getBoundingClientRect().right + 1,
  );
  const hasOverlap = childRects.some((rect, index) => childRects.slice(index + 1).some((other) =>
    rect.left < other.right - 2
      && rect.right > other.left + 2
      && rect.top < other.bottom - 2
      && rect.bottom > other.top + 2,
  ));
  const subtitleCard = panelRoot.querySelector('.lp-subtitle-card');
  const cardWidth = subtitleCard?.getBoundingClientRect().width ?? 0;
  const cardFits = cardWidth <= Math.min(panelRoot.clientWidth, 940) + 1;
  const videoElement = playerRoot.querySelector('.lp-media-video');

  assert(controlsDisplay === 'grid', `${label}: controls are not using the responsive grid`);
  const controlChildren = [...controls.children].map((element) => ({
    className: element.className,
    width: Math.round(element.getBoundingClientRect().width),
  }));
  assert(
    controlsFit,
    `${label}: player controls overflow (${controls.scrollWidth}/${controls.clientWidth}; ${JSON.stringify(controlChildren)})`,
  );
  assert(childrenFit, `${label}: a player control extends outside its row`);
  assert(!hasOverlap, `${label}: player controls overlap`);
  if (playerWidth <= 840 && playerWidth > 360) {
    const sameRow = (rects) => rects.every((rect) =>
      Math.abs((rect.top + rect.height / 2) - (rects[0].top + rects[0].height / 2)) <= 2,
    );
    assert(sameRow(groupRects[0] ? [...transport.children].map((element) => element.getBoundingClientRect()) : []), `${label}: playback controls split across lines`);
    assert(sameRow(groupRects[1] ? [...practice.children].map((element) => element.getBoundingClientRect()) : []), `${label}: practice controls split across lines`);
    assert(sameRow(groupRects[2] ? [...view.children].map((element) => element.getBoundingClientRect()) : []), `${label}: display controls split across lines`);
    assert(groupRects[1].top > groupRects[0].bottom - 2, `${label}: practice controls are not on their own row`);
    assert(groupRects[2].top > groupRects[1].bottom - 2, `${label}: display controls are not on their own row`);
  }
  assert(toolbarFit, `${label}: subtitle toolbar overflows`);
  if (toolbar.clientWidth <= 620) {
    assert(getComputedStyle(toolbar).display === 'grid', `${label}: compact subtitle toolbar is not using the single-column layout`);
  }
  assert(panelFit, `${label}: subtitle panel overflows`);
  assert(cardFits, `${label}: subtitle line exceeds the reading column width (${cardWidth}px)`);
  if (mediaKind === 'video') {
    assert(videoElement instanceof HTMLVideoElement, `${label}: video element is missing`);
    assert(videoElement.readyState >= HTMLMediaElement.HAVE_METADATA, `${label}: video metadata is not ready`);
    assert(videoElement.videoWidth > 0 && videoElement.videoHeight > 0, `${label}: video dimensions are empty`);
  }

  return {
    label,
    window: { width: bounds.width, height: bounds.height },
    playerWidth: Math.round(playerWidth),
    controlsDisplay,
    controlsFit,
    childrenFit,
    hasOverlap,
    toolbarFit,
    panelFit,
    subtitleCardWidth: Math.round(cardWidth),
    subtitleToolbarDisplay: getComputedStyle(toolbar).display,
    subtitleToolbarWidth: Math.round(toolbar.clientWidth),
    videoReady: mediaKind === 'video' ? videoElement.readyState >= HTMLMediaElement.HAVE_METADATA : undefined,
  };
};

try {
  if (wasMaximized) windowRef.unmaximize();
  if (!sidebars.leftCollapsed) app.workspace.leftSplit.collapse();
  if (!sidebars.rightCollapsed) app.workspace.rightSplit.collapse();
  for (const type of viewTypes) {
    for (const leaf of app.workspace.getLeavesOfType(type)) leaf.detach();
  }
  await sleep(100);
  media = await app.vault.createBinary(mediaPath, createWav());
  subtitle = await app.vault.create(
    subtitlePath,
    '1\n00:00:00,000 --> 00:00:02,000\nResponsive controls keep every action reachable.\n响应式控件会保持所有操作可用。\n',
  );
  videoFile = await waitFor(
    () => app.vault.getAbstractFileByPath(videoPath),
    'synthetic video fixture',
  );
  videoSubtitle = await app.vault.create(
    videoSubtitlePath,
    '1\n00:00:00,000 --> 00:00:02,000\nVideo subtitles load beside the player.\n视频字幕会与播放器一起加载。\n',
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
  await plugin.settingsSaveQueue;

  const landscape = await inspectAtSize(1440, 900, 'landscape');
  const landscapeShot = require('path').join(evidenceDir, 'dashell-player-audio-landscape.png');
  require('fs').writeFileSync(landscapeShot, (await windowRef.webContents.capturePage()).toPNG());
  const toolbarBreakpoint = await inspectAtSize(1760, 900, 'toolbar-breakpoint');
  const toolbarBreakpointShot = require('path').join(evidenceDir, 'dashell-player-toolbar-breakpoint.png');
  require('fs').writeFileSync(toolbarBreakpointShot, (await windowRef.webContents.capturePage()).toPNG());
  const shortLandscape = await inspectAtSize(1200, 540, 'short-landscape');
  const shortLandscapeShot = require('path').join(evidenceDir, 'dashell-player-audio-short-landscape.png');
  require('fs').writeFileSync(shortLandscapeShot, (await windowRef.webContents.capturePage()).toPNG());
  panelLeaf.detach();
  panelLeaf = app.workspace.createLeafBySplit(playerLeaf, 'horizontal', false);
  await panelLeaf.setViewState({ type: 'langplayer-subtitle-panel', active: false });
  await waitFor(
    () => panelLeaf?.view?.containerEl?.querySelector('.lp-subtitle-card'),
    'subtitle card in portrait layout',
  );
  const portrait = await inspectAtSize(840, 1180, 'portrait');
  const portraitShot = require('path').join(evidenceDir, 'dashell-player-audio-portrait.png');
  require('fs').writeFileSync(portraitShot, (await windowRef.webContents.capturePage()).toPNG());
  panelLeaf.detach();
  panelLeaf = app.workspace.createLeafBySplit(playerLeaf, 'vertical', false);
  await panelLeaf.setViewState({ type: 'langplayer-subtitle-panel', active: false });
  await waitFor(
    () => panelLeaf?.view?.containerEl?.querySelector('.lp-subtitle-card'),
    'subtitle card in a narrow split',
  );
  const narrowPane = await inspectAtSize(1000, 850, 'narrow-split');
  assert(narrowPane.playerWidth < 620, 'narrow split did not create a compact media pane');
  const narrowShot = require('path').join(evidenceDir, 'dashell-player-audio-narrow.png');
  require('fs').writeFileSync(narrowShot, (await windowRef.webContents.capturePage()).toPNG());

  panelLeaf.detach();
  playerLeaf.view.setSource(plugin.mediaFileService.createSourceFromFile(videoFile));
  await waitFor(() => playerLeaf.view.containerEl.querySelector('video.lp-media-video'), 'video player');
  await waitFor(
    () => playerLeaf.view.containerEl.querySelector('video.lp-media-video')?.readyState >= HTMLMediaElement.HAVE_METADATA,
    'video metadata',
    12000,
  );
  panelLeaf = app.workspace.createLeafBySplit(playerLeaf, 'vertical', false);
  await panelLeaf.setViewState({ type: 'langplayer-subtitle-panel', active: false });
  await waitFor(
    () => panelLeaf?.view?.containerEl?.querySelector('.lp-subtitle-card')?.textContent.includes('Video subtitles load beside the player.'),
    'automatically loaded same-name video subtitle',
  );
  await plugin.settingsSaveQueue;
  const videoLandscape = await inspectAtSize(1440, 900, 'video-landscape', 'video');
  const videoLandscapeShot = require('path').join(evidenceDir, 'dashell-player-video-landscape.png');
  require('fs').writeFileSync(videoLandscapeShot, (await windowRef.webContents.capturePage()).toPNG());
  panelLeaf.detach();
  panelLeaf = app.workspace.createLeafBySplit(playerLeaf, 'horizontal', false);
  await panelLeaf.setViewState({ type: 'langplayer-subtitle-panel', active: false });
  await waitFor(
    () => panelLeaf?.view?.containerEl?.querySelector('.lp-subtitle-card')?.textContent.includes('Video subtitles load beside the player.'),
    'video subtitle in portrait layout',
  );
  const videoPortrait = await inspectAtSize(840, 1180, 'video-portrait', 'video');
  const videoPortraitShot = require('path').join(evidenceDir, 'dashell-player-video-portrait.png');
  require('fs').writeFileSync(videoPortraitShot, (await windowRef.webContents.capturePage()).toPNG());
  panelLeaf.detach();
  panelLeaf = app.workspace.createLeafBySplit(playerLeaf, 'vertical', false);
  await panelLeaf.setViewState({ type: 'langplayer-subtitle-panel', active: false });
  await waitFor(
    () => panelLeaf?.view?.containerEl?.querySelector('.lp-subtitle-card')?.textContent.includes('Video subtitles load beside the player.'),
    'automatically loaded subtitle in a narrow video split',
  );
  const videoNarrowPane = await inspectAtSize(1000, 850, 'video-narrow-split', 'video');
  assert(videoNarrowPane.playerWidth < 620, 'video narrow split did not create a compact media pane');
  const videoNarrowShot = require('path').join(evidenceDir, 'dashell-player-video-narrow.png');
  require('fs').writeFileSync(videoNarrowShot, (await windowRef.webContents.capturePage()).toPNG());
  return {
    vault: app.vault.adapter.getBasePath(),
    version: plugin.manifest.version,
    audioSubtitleLoaded: true,
    videoSubtitleAutoLoaded: true,
    layouts: [landscape, toolbarBreakpoint, shortLandscape, portrait, narrowPane, videoLandscape, videoPortrait, videoNarrowPane],
    screenshots: [landscapeShot, toolbarBreakpointShot, shortLandscapeShot, narrowShot, portraitShot, videoLandscapeShot, videoPortraitShot, videoNarrowShot],
  };
} finally {
  for (const type of viewTypes) {
    for (const leaf of app.workspace.getLeavesOfType(type)) {
      leaf.detach();
    }
  }
  await sleep(100);
  if (videoSubtitle) await app.vault.delete(videoSubtitle);
  if (videoFile && videoPath.startsWith('__Codex-DashellPlayer-Video-')) await app.vault.delete(videoFile);
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
