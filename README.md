# LangPlayer

Language-learning media player for Obsidian with subtitle browsing, sentence dictation, vocabulary management, and recording.

## Features

- Open local media files from your vault.
- Play remote `http/https` media links.
- Browse subtitles and jump by sentence.
- Run sentence dictation with retry and hint flow.
- Generate Chinese meanings for subtitles through a configured AI endpoint on request.
- Save sentence notes and import full subtitle blocks into notes.
- Maintain vocabulary entries and spaced-repetition databases.
- Record pronunciation clips into the vault.

## Installation

Manual install:

1. Run `npm run package`.
2. Copy `release/<version>/manifest.json`, `main.js`, and `styles.css` to:
   `.obsidian/plugins/langplayer/`
3. Enable **LangPlayer** in **Community plugins**.

## Compatibility

- Desktop and mobile (`isDesktopOnly: false`). Before a public community-store
  release, run the real-device mobile QA checklist in `RELEASE_CHECKLIST.md`.
- Minimum Obsidian version: `1.11.4`.
- Note: subtitle auto-loading reads UTF-8 and UTF-16 (LE/BE) files on both
  desktop and mobile; element fullscreen may be unavailable on some mobile
  platforms.

## Release package

`npm run package` builds production assets and recreates `release/<version>/`
with the three individual files required for an Obsidian GitHub release:
`manifest.json`, `main.js`, and `styles.css`. It also creates a convenience
zip containing the same three files. `versions.json` stays in the repository
root for Obsidian's version compatibility mapping.
Most UI CSS ships as static `styles.css`; LangPlayer injects only a small set of
CSS variables for user-configurable subtitle/player styling.

## Privacy and network disclosure

See [PRIVACY.md](PRIVACY.md) for the full disclosure. In short:

- LangPlayer requests remote media you open and sends a subtitle sentence to
  your configured AI endpoint only when you explicitly request a meaning.
  Word pronunciation uses the Web Speech API; see [PRIVACY.md](PRIVACY.md).
- No telemetry / analytics. No auto-update. No access to files outside the vault
  on its own.

## Attribution

LangPlayer is a fork of **LangFlow**. Its current version includes a
user-triggered AI sentence-meaning feature. The locally supplied upstream
project includes an MIT license, whose copyright notice is preserved in this
repository's `LICENSE`. Components, control-bar interaction, and the
subtitle/dictation flows derive from that project.

## License

MIT — see [LICENSE](LICENSE).
