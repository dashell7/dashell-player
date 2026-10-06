# Dashell Player

Maintained by [dashell](https://github.com/dashell7). [Source](https://github.com/dashell7/dashell-player) · [Issues](https://github.com/dashell7/dashell-player/issues) · [Latest release 1.9.2](https://github.com/dashell7/dashell-player/releases/latest).

An Obsidian audio and video player for language study. Browse subtitles, practice dictation, record pronunciation, manage vocabulary, and send word lookups to Dashell Reader.

## The Dashell English-learning suite

[Dashell Reader](https://github.com/dashell7/dashell-reader) handles text reading, dictionary lookup, and vocabulary capture. Dashell Player handles local and remote audio/video, subtitles, and listening practice. [Dashell RSS](https://github.com/dashell7/dashell-rss) helps discover, preview, and save learning materials. The plugins can be installed separately; Player delegates word lookup to Reader.

Previously named LangPlayer. The plugin now uses ID `dashell-player`; on first
launch it copies settings from the old `langplayer` data file and keeps that
source file for rollback. Existing `langplayer` note links, view types, and
hotkeys remain compatible. Word lookup is provided by **Dashell Reader**
(plugin ID `dashell-reader`, with support for the previous Reader ID).

## Features

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
