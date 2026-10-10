# Dashell Player

Maintained by [dashell](https://github.com/dashell7). [Source](https://github.com/dashell7/dashell-player) · [Issues](https://github.com/dashell7/dashell-player/issues) · [Latest release 1.9.5](https://github.com/dashell7/dashell-player/releases/latest).

An Obsidian audio and video player for language study. Browse subtitles, practice dictation, record pronunciation, manage vocabulary, and send word lookups to Dashell Reader.

## The Dashell English-learning suite

[Dashell Reader](https://github.com/dashell7/dashell-reader) handles text reading, dictionary lookup, and vocabulary capture. Dashell Player handles local and remote audio/video, subtitles, and listening practice. [Dashell RSS](https://github.com/dashell7/dashell-rss) helps discover, preview, and save learning materials. The plugins can be installed separately; Player delegates word lookup to Reader.

Previously named LangPlayer. The plugin now uses ID `dashell-player`; on first
launch it copies settings from the old `langplayer` data file and keeps that
source file for rollback. Existing `langplayer` note links, view types, and
hotkeys remain compatible. Word lookup is provided by **Dashell Reader**
(plugin ID `dashell-reader`, with support for the previous Reader ID).

## Features

- Use one responsive study workspace with listening, dictation, recording, and a collapsible transcript.
- Open local media files from your vault.
- Play remote `http/https` media links.
- Automatically load a same-name subtitle beside local media, or keep a manual subtitle association.
- Browse subtitles and jump between sentences while playback stays synchronized.
- Choose fixed or floating playback controls and place them at the top or bottom.
- Select a subtitle word to open its dictionary lookup in Dashell Reader.
- Run sentence dictation with retry and hint flow.
- Save sentence notes and import full subtitle blocks into notes.
- Maintain vocabulary entries and spaced-repetition databases.
- Record pronunciation clips into the vault.

## Installation

Install **Dashell Player** from its [latest GitHub release](https://github.com/dashell7/dashell-player/releases/latest), either with BRAT or by copying the release assets into your vault.

### BRAT

1. Install and enable **BRAT** from Obsidian Community Plugins.
2. In BRAT, choose **Add beta plugin** and enter `dashell7/dashell-player`.
3. Install and enable **Dashell Player** in Community plugins.

### Manual install

1. Download `manifest.json`, `main.js`, and `styles.css` from the [latest release](https://github.com/dashell7/dashell-player/releases/latest).
2. Copy them to `.obsidian/plugins/dashell-player/`.
3. Disable the old `langplayer` plugin and keep its folder in place for settings migration.
4. Reload Obsidian and enable **Dashell Player** in **Community plugins**.

## Compatibility

- Desktop and mobile (`isDesktopOnly: false`). Before a public community-store
  release, run the real-device mobile QA checklist in `RELEASE_CHECKLIST.md`.
- Minimum Obsidian version: `1.11.4`.
- Subtitle auto-loading reads UTF-8 and UTF-16 (LE/BE) files on both
  desktop and mobile; element fullscreen may be unavailable on some mobile
  platforms.

## Live development in Obsidian

Run `npm install` once, then `npm run dev`. The watcher rebuilds TypeScript,
React components, imported CSS, `styles-base.css`, and `manifest.json` changes.
After each successful build it generates `styles.css` and copies only
`main.js`, `styles.css`, and `manifest.json` into the test vault's
`.obsidian/plugins/dashell-player/` directory. Existing `data.json` settings
are preserved. Failed builds are not copied.

By default, the test vault is `../Obsidian-dashell-player-Dev` relative to the
project root. To use another vault:

```sh
OBSIDIAN_VAULT="/absolute/path/to/test-vault" npm run dev
```

If the default vault is absent, dev builds stay local. An explicitly specified
vault must already contain a `.obsidian` directory.

Install and enable [Hot Reload](https://github.com/pjeby/hot-reload) in the test
vault, and enable Dashell Player. The dev script creates the `.hotreload`
marker automatically. Saving code then reloads the plugin in Obsidian; this is
a full plugin restart, so playback and other temporary UI state can reset.
If Hot Reload was just installed, reload Obsidian once and enable it in
Community plugins. Stop the watcher with Ctrl+C.

`npm run build` and `npm run package` produce release assets locally and never
sync them to a vault.

## Build a release package

For development or packaging from source, `npm run package` builds production assets and recreates `release/<version>/`
with the three individual files required for an Obsidian GitHub release:
`manifest.json`, `main.js`, and `styles.css`. It also creates a convenience
zip containing the same three files. `versions.json` stays in the repository
root for Obsidian's version compatibility mapping.
Most UI CSS ships as static `styles.css`; Dashell Player injects only a small set of
CSS variables for user-configurable subtitle/player styling.

## Privacy and network disclosure

See [PRIVACY.md](PRIVACY.md) for the full disclosure. In short:

- Dashell Player requests remote media you open. Word pronunciation uses the
  Web Speech API; see [PRIVACY.md](PRIVACY.md).
- No telemetry / analytics. No auto-update. No access to files outside the vault
  on its own.

## Attribution

Dashell Player is a fork of **LangFlow**. The locally supplied upstream
project includes an MIT license, whose copyright notice is preserved in this
repository's `LICENSE`. Components, control-bar interaction, and the
subtitle/dictation flows derive from that project.

## License

MIT — see [LICENSE](LICENSE).
