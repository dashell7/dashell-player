const plugin = app.plugins.plugins['dashell-player'] || app.plugins.plugins.langplayer;
if (!plugin || app.vault.adapter.basePath !== 'F:\\qiaomu-reader-english') {
  throw new Error('Run only with Dashell Player enabled in the designated QA vault');
}

const stem = `__Codex-Subtitle-Association-${Date.now()}`;
let mediaPath = `${stem}-media.wav`;
let subtitlePath = `${stem}-selected.srt`;
const renamedMediaPath = `${stem}-renamed.wav`;
const renamedSubtitlePath = `${stem}-renamed.srt`;
const previousLeaf = app.workspace.getMostRecentLeaf();
const existingLeaves = new Set([
  ...app.workspace.getLeavesOfType('langplayer-view'),
  ...app.workspace.getLeavesOfType('langplayer-subtitle-panel'),
]);
let media;
let subtitle;

const waitFor = async (check, label) => {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const value = check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${label}`);
};

const makeWav = () => {
  const buffer = new ArrayBuffer(44 + 8000 * 2);
  const view = new DataView(buffer);
  const write = (offset, value) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  write(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true);
  write(8, 'WAVE'); write(12, 'fmt '); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true); view.setUint32(28, 16000, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  write(36, 'data'); view.setUint32(40, 8000 * 2, true);
  return buffer;
};

try {
  media = await app.vault.createBinary(mediaPath, makeWav());
  subtitle = await app.vault.create(subtitlePath,
    '1\n00:00:00,000 --> 00:00:01,000\nStored association works.\n');

  const firstLeaf = app.workspace.getLeaf('tab');
  await firstLeaf.setViewState({ type: 'langplayer-view', state: { file: media.path }, active: true });
  await app.workspace.revealLeaf(firstLeaf);
  const firstView = await waitFor(
    () => firstLeaf.view?.getCurrentSource?.(),
    'first player source',
  );

  await plugin.rememberSubtitleAssociation(firstView, subtitle);
  const firstKey = `file:${mediaPath}`;
  await waitFor(
    () => plugin.settings.subtitleFileByMedia?.[firstKey] === subtitlePath,
    'persisted manual association',
  );

  await app.fileManager.renameFile(subtitle, renamedSubtitlePath);
  subtitlePath = renamedSubtitlePath;
  await waitFor(
    () => plugin.settings.subtitleFileByMedia?.[firstKey] === renamedSubtitlePath,
    'subtitle rename association update',
  );

  await app.fileManager.renameFile(media, renamedMediaPath);
  mediaPath = renamedMediaPath;
  const renamedKey = `file:${renamedMediaPath}`;
  await waitFor(
    () => plugin.settings.subtitleFileByMedia?.[renamedKey] === renamedSubtitlePath
      && !plugin.settings.subtitleFileByMedia?.[firstKey],
    'media rename association update',
  );

  // Keep a tab group alive while closing the original player. On a minimal
  // workspace, detaching the only tab removes its tab group and getLeaf('tab')
  // then fails before the reopening path can be tested.
  const reopenLeaf = app.workspace.createLeafBySplit(firstLeaf, 'vertical', false);
  firstLeaf.detach();
  await reopenLeaf.setViewState({ type: 'langplayer-view', state: { file: media.path }, active: true });
  await app.workspace.revealLeaf(reopenLeaf);
  await waitFor(() => reopenLeaf.view?.containerEl?.querySelector('audio'), 'reopened audio player');

  const panelLeaf = app.workspace.createLeafBySplit(reopenLeaf, 'horizontal', false);
  await panelLeaf.setViewState({ type: 'langplayer-subtitle-panel', active: false });
  const subtitleRow = await waitFor(
    () => panelLeaf.view?.containerEl?.querySelector('.lp-subtitle-card'),
    'subtitle from stored association',
  );
  if (!subtitleRow.textContent.includes('Stored association works.')) {
    throw new Error(`Unexpected stored subtitle: ${subtitleRow.textContent}`);
  }

  await app.vault.delete(subtitle);
  subtitle = null;
  await waitFor(
    () => !plugin.settings.subtitleFileByMedia?.[renamedKey],
    'association cleanup after subtitle deletion',
  );

  return {
    vault: app.vault.adapter.basePath,
    settingsVersion: plugin.settings.settingsVersion,
    storedAssociation: true,
    subtitleRenameUpdated: true,
    mediaRenameUpdated: true,
    reopenedWithStoredSubtitle: true,
    deletedSubtitleClearedAssociation: true,
  };
} finally {
  for (const viewType of ['langplayer-view', 'langplayer-subtitle-panel']) {
    for (const leaf of app.workspace.getLeavesOfType(viewType)) {
      if (!existingLeaves.has(leaf)) leaf.detach();
    }
  }
  if (subtitle) await app.vault.delete(subtitle);
  if (media) await app.vault.delete(media);
  if (previousLeaf?.view?.containerEl?.isConnected) {
    app.workspace.setActiveLeaf(previousLeaf, { focus: false });
  }
}
