const reader = app.plugins.plugins['dashell-reader'] || app.plugins.plugins['qiaomu-reader-english'];
const player = app.plugins.plugins['dashell-player'] || app.plugins.plugins.langplayer;
if (!reader || !player) throw new Error('Both plugins must be enabled');

const stem = '__Codex-LangPlayer-Qiaomu-Lookup-20260930';
const mediaPath = `${stem}.wav`;
const subtitlePath = `${stem}.srt`;
if (app.vault.getAbstractFileByPath(mediaPath) || app.vault.getAbstractFileByPath(subtitlePath)) {
  throw new Error('Test fixture path already exists');
}

const viewTypes = ['langplayer-view', 'langplayer-subtitle-panel', 'qiaomu-english-search-panel', 'qiaomu-english-learn-panel'];
const existingLeaves = new Set(viewTypes.flatMap((type) => app.workspace.getLeavesOfType(type)));
const waitFor = async (getValue, label) => {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const value = getValue();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw new Error(`Timed out waiting for ${label}`);
};

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

let originalOpen;
let originalHover;
let media;
let subtitle;
const observed = { click: null, hover: null };
try {
  media = await app.vault.createBinary(mediaPath, wav);
  subtitle = await app.vault.create(subtitlePath,
    '1\n00:00:00,000 --> 00:00:02,000\nSerendipity makes learning memorable.\n偶然的发现让学习更难忘。\n');
  await player.openMediaFile(media);
  const subtitleLeaf = await waitFor(() => app.workspace.getLeavesOfType('langplayer-subtitle-panel')[0], 'subtitle panel');
  await app.workspace.revealLeaf(subtitleLeaf);
  const word = await waitFor(() => [...document.querySelectorAll('.lp-word')]
    .find((element) => element.textContent === 'Serendipity'), 'LangPlayer subtitle word').catch((error) => {
    const views = viewTypes.map((type) => ({
      type,
      leaves: app.workspace.getLeavesOfType(type).length,
      text: app.workspace.getLeavesOfType(type)[0]?.view?.containerEl?.innerText?.slice(0, 200),
    }));
    const panel = app.workspace.getLeavesOfType('langplayer-subtitle-panel')[0]?.view?.containerEl;
    throw new Error(`${error.message}; views=${JSON.stringify(views)}; cards=${panel?.querySelectorAll('.lp-subtitle-card').length}; toggles=${[...panel.querySelectorAll('.lp-ctrl-btn--label')].map((el) => [el.textContent, el.getAttribute('aria-pressed')])}; words=${[...document.querySelectorAll('.lp-word')].map((el) => el.textContent).slice(0, 12)}`);
  });

  originalOpen = reader.openEnglishDictionary;
  originalHover = reader.hoverEnglishDictionary;
  reader.openEnglishDictionary = (value, context) => { observed.click = { value, context }; };
  reader.hoverEnglishDictionary = (value, context) => { observed.hover = { value, context }; };

  word.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 100, clientY: 120 }));
  await waitFor(() => observed.click, 'click lookup call');
  word.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: word.parentElement }));
  await waitFor(() => observed.hover, 'hover lookup call');

  if (observed.click.value !== 'Serendipity'
    || observed.click.context.sentence !== 'Serendipity makes learning memorable.'
    || observed.click.context.bookTitle !== stem) {
    throw new Error('Click lookup lost the word, sentence, or media source');
  }
  if (observed.hover.value !== 'Serendipity'
    || observed.hover.context.sentence !== observed.click.context.sentence
    || !observed.hover.context.hoverOwner) {
    throw new Error('Hover lookup lost its word, sentence, or owner');
  }

  reader.openEnglishDictionary = originalOpen;
  reader.hoverEnglishDictionary = originalHover;
  reader.hoverEnglishDictionary('Serendipity', observed.hover.context);
  const hoverCard = await waitFor(() => document.querySelector('.langr-subtitle-popup'), 'Qiaomu hover card');
  reader.closeEnglishDictionaryHover?.(observed.hover.context.hoverOwner);

  word.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 100, clientY: 120 }));
  const searchInput = await waitFor(() => {
    const input = document.querySelector('#qiaomu-english-search .search-input');
    return input?.value.toLowerCase() === 'serendipity' ? input : null;
  }, 'Qiaomu dictionary search input');
  return {
    vault: app.vault.adapter.basePath,
    click: observed.click.value,
    sentence: observed.click.context.sentence,
    source: observed.click.context.bookTitle,
    hover: observed.hover.value,
    searchInput: searchInput.value,
    hoverCardVisible: !!hoverCard,
  };
} finally {
  if (originalOpen) reader.openEnglishDictionary = originalOpen;
  if (originalHover) reader.hoverEnglishDictionary = originalHover;
  reader.closeEnglishDictionaryHover?.(observed.hover?.context.hoverOwner);
  for (const type of viewTypes) {
    for (const leaf of app.workspace.getLeavesOfType(type)) {
      if (!existingLeaves.has(leaf)) leaf.detach();
    }
  }
  const progress = player.settings.playbackProgressByMedia || {};
  let changed = false;
  for (const key of Object.keys(progress)) {
    if (key.includes(stem)) { delete progress[key]; changed = true; }
  }
  if (changed) await player.saveSettings();
  if (subtitle) await app.vault.delete(subtitle);
  if (media) await app.vault.delete(media);
}
