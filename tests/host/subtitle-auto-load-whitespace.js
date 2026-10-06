const plugin = app.plugins.plugins['dashell-player'] || app.plugins.plugins.langplayer;
if (!plugin || app.vault.adapter.basePath !== 'F:\\qiaomu-reader-english') {
  throw new Error('Run only with Dashell Player enabled in the designated QA vault');
}

const stem = `__Codex-Subtitle-Whitespace-${Date.now()}`;
const mediaPath = `${stem} .wav`;
const subtitlePath = `${stem}.srt`;
const previousLeaf = app.workspace.getMostRecentLeaf();
const previousAutoOpen = plugin.settings.subtitlePanelAutoOpen;
const leaves = [];
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
  if (app.vault.getAbstractFileByPath(mediaPath) || app.vault.getAbstractFileByPath(subtitlePath)) {
    throw new Error('Fixture paths are occupied');
  }
  plugin.settings.subtitlePanelAutoOpen = false;
  media = await app.vault.createBinary(mediaPath, makeWav());
  subtitle = await app.vault.create(subtitlePath,
    '1\n00:00:00,000 --> 00:00:01,000\nWhitespace matching works.\n');

  const playerLeaf = app.workspace.getLeaf('tab');
  leaves.push(playerLeaf);
  await playerLeaf.setViewState({ type: 'langplayer-view', state: { file: media.path }, active: true });
  await app.workspace.revealLeaf(playerLeaf);
  const root = playerLeaf.view.containerEl;
  await waitFor(() => root.querySelector('audio'), 'audio player');

  const panelLeaf = app.workspace.createLeafBySplit(playerLeaf, 'horizontal', false);
  leaves.push(panelLeaf);
  await panelLeaf.setViewState({ type: 'langplayer-subtitle-panel', active: false });
  const panel = panelLeaf.view.containerEl;
  const row = await waitFor(() => panel.querySelector('.lp-subtitle-card'), 'automatically loaded subtitle');
  const result = {
    vault: app.vault.adapter.basePath,
    version: plugin.manifest.version,
    mediaBaseName: media.basename,
    subtitleBaseName: subtitle.basename,
    subtitleText: row.textContent.trim(),
    subtitleRows: panel.querySelectorAll('.lp-subtitle-card').length,
  };
  if (result.subtitleText !== 'Whitespace matching works.') {
    throw new Error(`Unexpected subtitle row: ${JSON.stringify(result)}`);
  }
  return result;
} finally {
  for (const leaf of leaves.reverse()) leaf.detach();
  plugin.settings.subtitlePanelAutoOpen = previousAutoOpen;
  if (subtitle) await app.vault.delete(subtitle);
  if (media) await app.vault.delete(media);
  if (previousLeaf?.view?.containerEl?.isConnected) {
    app.workspace.setActiveLeaf(previousLeaf, { focus: false });
  }
}
