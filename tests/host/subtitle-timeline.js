const plugin = app.plugins.plugins['dashell-player'] || app.plugins.plugins.langplayer;
if (!plugin || app.vault.adapter.basePath !== 'F:\\qiaomu-reader-english') {
  throw new Error('Run only with Dashell Player enabled in the designated QA vault');
}
const stem = `__Codex-Player-Subtitle-Timeline-${Date.now()}`;
const mediaPath = `${stem}.wav`;
const subtitlePath = `${stem}.srt`;
const previousLeaf = app.workspace.getMostRecentLeaf();
const autoOpen = plugin.settings.subtitlePanelAutoOpen;
const loopCount = plugin.settings.loopCount;
const autoPlayNext = plugin.settings.autoPlayNext;
const leaves = [];
window.__codexSubtitleTimeline = { status: 'running', stage: 'starting' };
const hostWindow = require('electron').remote.getCurrentWindow();
hostWindow.show();
hostWindow.focus();
let media;
let subtitle;
let audio;
const waitFor = async (check, label) => {
  window.__codexSubtitleTimeline.stage = label;
  const deadline = Date.now() + 6000;
  while (Date.now() < deadline) {
    const value = check();
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  throw new Error(`Timed out waiting for ${label} (media time: ${audio?.currentTime}, paused: ${audio?.paused})`);
};
const seekPaused = async (time) => {
  audio.pause();
  audio.currentTime = time;
  await waitFor(() => !audio.seeking && Math.abs(audio.currentTime - time) < 0.1, `seek ${time}`);
};
const command = id => {
  if (!app.commands.executeCommandById(`${plugin.manifest.id}:${id}`)) throw new Error(`Command unavailable: ${id}`);
};
const makeWav = () => {
  const buffer = new ArrayBuffer(44 + 8000 * 2 * 4);
  const header = new DataView(buffer);
  const ascii = (position, text) => [...text].forEach((c, i) => header.setUint8(position + i, c.charCodeAt(0)));
  ascii(0, 'RIFF'); header.setUint32(4, buffer.byteLength - 8, true);
  ascii(8, 'WAVE'); ascii(12, 'fmt '); header.setUint32(16, 16, true);
  header.setUint16(20, 1, true); header.setUint16(22, 1, true);
  header.setUint32(24, 8000, true); header.setUint32(28, 16000, true);
  header.setUint16(32, 2, true); header.setUint16(34, 16, true);
  ascii(36, 'data'); header.setUint32(40, buffer.byteLength - 44, true);
  return buffer;
};
try {
  if (app.vault.getAbstractFileByPath(mediaPath) || app.vault.getAbstractFileByPath(subtitlePath)) {
    throw new Error('Fixture paths are occupied');
  }
  plugin.settings.subtitlePanelAutoOpen = false;
  plugin.settings.loopCount = 2;
  plugin.settings.autoPlayNext = false;
  media = await app.vault.createBinary(mediaPath, makeWav());
  subtitle = await app.vault.create(subtitlePath,
    '1\n00:00:00,500 --> 00:00:01,000\nFirst sentence.\n第一句。\n\n'
    + '2\n00:00:01,500 --> 00:00:02,000\nSecond sentence.\n第二句。\n\n'
    + '3\n00:00:02,500 --> 00:00:03,000\nThird sentence.\n第三句。\n');
  const playerLeaf = app.workspace.getLeaf('tab'); leaves.push(playerLeaf);
  await playerLeaf.setViewState({ type: 'langplayer-view', state: { file: media.path }, active: true });
  await app.workspace.revealLeaf(playerLeaf);
  const root = playerLeaf.view.containerEl;
  audio = await waitFor(() => root.querySelector('audio'), 'audio element');
  await waitFor(() => audio.readyState >= 2 && audio.duration === 4, 'audio loaded');
  if (root.querySelector('.lp-study-flow')) throw new Error('Study-flow step bar remains in the player');
  const hasSoundPatternControl = [...root.querySelectorAll('.lp-ctrl-btn')]
    .some(button => /sound pattern|声音句型训练/i.test(button.textContent ?? ''));
  if (hasSoundPatternControl) throw new Error('Sound-pattern control remains in the player toolbar');
  const panelLeaf = app.workspace.createLeafBySplit(playerLeaf, 'horizontal', false); leaves.push(panelLeaf);
  await panelLeaf.setViewState({ type: 'langplayer-subtitle-panel', active: false });
  const panel = panelLeaf.view.containerEl;
  await waitFor(() => panel.querySelectorAll('.lp-subtitle-card').length === 3, 'subtitle rows');
  const labels = [...panel.querySelectorAll('button')].map(b => b.getAttribute('aria-label') ?? b.textContent);
  if (panel.querySelector('[class*="lp-offset"]') || labels.some(s => /offset|偏移|提前|延后/i.test(s))) {
    throw new Error('Subtitle offset controls remain');
  }
  const activeRow = index => panel.querySelectorAll('.lp-subtitle-card')[index]?.classList.contains('lp-subtitle-card-active');
  panel.querySelectorAll('.lp-subtitle-card')[1].click();
  audio.pause();
  await waitFor(() => Math.abs(audio.currentTime - 1.5) < 0.15 && activeRow(1), 'click sentence at 1.5');
  const sentenceClick = audio.currentTime;
  command('player-prev-subtitle');
  await waitFor(() => Math.abs(audio.currentTime - 0.5) < 0.1 && activeRow(0), 'previous sentence');
  const previous = audio.currentTime;
  command('player-next-subtitle');
  await waitFor(() => Math.abs(audio.currentTime - 1.5) < 0.1 && activeRow(1), 'next sentence');
  const next = audio.currentTime;
  await seekPaused(1.7);
  command('player-replay-current');
  await waitFor(() => Math.abs(audio.currentTime - 1.5) < 0.1, 'replay sentence');
  const replay = audio.currentTime;

  await seekPaused(0.7);
  command('player-ab-repeat');
  await seekPaused(1.8);
  command('player-ab-repeat');
  audio.pause();
  await waitFor(() => Math.abs(audio.currentTime - 0.7) < 0.15, 'A/B initial seek');
  audio.currentTime = 1.9;
  await waitFor(() => Math.abs(audio.currentTime - 0.7) < 0.15, 'A/B repeat at B');
  const abRepeat = audio.currentTime;
  command('player-ab-repeat');

  await seekPaused(1.6);
  await waitFor(() => activeRow(1), 'current subtitle before looping');
  command('player-toggle-loop');
  audio.pause();
  await waitFor(() => Math.abs(audio.currentTime - 1.5) < 0.1, 'segment loop start');
  audio.currentTime = 2.05;
  await waitFor(() => Math.abs(audio.currentTime - 1.5) < 0.15, 'segment loop repeats');
  const segmentRepeat = audio.currentTime;
  command('player-toggle-loop');

  const result = { vault: app.vault.adapter.basePath, version: plugin.manifest.version,
    offsetControlsRemoved: true, soundPatternControlRemoved: true, studyFlowRemoved: true, subtitleCount: 3,
    sentenceClick, previous, next, replay, abRepeat, segmentRepeat };
  window.__codexSubtitleTimeline = { status: 'passed', result };
  return result;
} catch (error) {
  window.__codexSubtitleTimeline = { ...window.__codexSubtitleTimeline, status: 'failed', error: String(error) };
  throw error;
} finally {
  audio?.pause();
  for (const leaf of leaves.reverse()) leaf.detach();
  plugin.settings.subtitlePanelAutoOpen = autoOpen;
  plugin.settings.loopCount = loopCount;
  plugin.settings.autoPlayNext = autoPlayNext;
  await plugin.saveSettings();
  if (subtitle) await app.vault.delete(subtitle);
  if (media) await app.vault.delete(media);
  if (previousLeaf?.view?.containerEl?.isConnected) app.workspace.setActiveLeaf(previousLeaf, { focus: false });
}
