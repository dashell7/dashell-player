const plugin = app.plugins.plugins['dashell-player'] || app.plugins.plugins.langplayer;
if (!plugin || app.vault.adapter.basePath !== 'F:\\qiaomu-reader-english') {
  throw new Error('Run only with Dashell Player enabled in the designated QA vault');
}

const commandId = 'langplayer:start-sound-pattern-training';
const commandRegistered = Boolean(app.commands.commands?.[commandId]);
const existingLeaves = new Set(app.workspace.getLeavesOfType('langplayer-dictation'));
const previousLeaf = app.workspace.getMostRecentLeaf();
let openedLeaf;

try {
  if (commandRegistered) throw new Error('Sound-pattern command remains registered');
  if (app.workspace.getLeavesOfType('langplayer-sound-pattern').length) {
    throw new Error('A removed sound-pattern view remains open');
  }

  if (!existingLeaves.size) {
    await plugin.activateDictationView();
    openedLeaf = app.workspace.getLeavesOfType('langplayer-dictation')[0];
  } else {
    openedLeaf = [...existingLeaves][0];
  }

  const deadline = Date.now() + 5000;
  while (Date.now() < deadline && !openedLeaf?.view?.containerEl?.querySelector('.lp-dictation-panel')) {
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  const dictationPanelMounted = Boolean(openedLeaf?.view?.containerEl?.querySelector('.lp-dictation-panel'));
  if (!dictationPanelMounted) throw new Error('Dictation panel did not mount');

  return {
    vault: app.vault.adapter.basePath,
    version: plugin.manifest.version,
    settingsVersion: plugin.settings.settingsVersion,
    trainingCommandRemoved: true,
    trainingViewRemoved: true,
    dictationPanelMounted,
  };
} finally {
  for (const leaf of app.workspace.getLeavesOfType('langplayer-dictation')) {
    if (!existingLeaves.has(leaf)) leaf.detach();
  }
  if (previousLeaf?.view?.containerEl?.isConnected) {
    app.workspace.setActiveLeaf(previousLeaf, { focus: false });
  }
}
