# LangPlayer release checklist

Legend: `[x]` complete in the repository, `[ ]` requires manual or account action.

## P0: submission blockers

- [x] `manifest.json` has a unique ID/name, a supported minimum app version, and no empty optional fields.
- [x] Runtime data and generated assets are excluded by `.gitignore`.
- [x] `npm run package` creates `release/<version>/manifest.json`, `main.js`, and `styles.css` as individual assets.
- [x] The convenience zip contains the same three files only.
- [x] The locally supplied LangFlow upstream uses MIT; its copyright notice remains in `LICENSE`.
- [x] Privacy and network behavior are documented in `PRIVACY.md`.
- [ ] Create a public GitHub repository. Do not commit `data.json`, `main.js`, `styles.css`, release zips, or `node_modules`.
- [ ] Create a GitHub release whose tag exactly matches `manifest.json.version`.
- [ ] Upload the three individual files from `release/<version>/` to that release. A zip by itself is not sufficient.
- [ ] Submit the public repository through the Obsidian community-plugin submission site.

## P1: code and security

- [x] No default hotkeys.
- [x] No telemetry, analytics, remote code loading, `eval`, or `innerHTML` sinks.
- [x] Settings use Obsidian `loadData` / `saveData`.
- [x] AI API keys use Obsidian SecretStorage and legacy keys migrate before plugin settings are saved.
- [x] AI sentence transmission is disclosed in README and privacy documentation.
- [x] Vault background edits use atomic `Vault.process()`.
- [x] Vault deletion uses `FileManager.trashFile()`.
- [x] Playback progress is stored in plugin data instead of global `localStorage`.
- [x] Timers and injected style variables are disposed on unload.
- [x] Static UI styling is kept in `styles.css`; runtime styles are limited to data-driven positioning or sizing.
- [x] Runtime and development dependencies pass `npm audit`.

## P2: quality and UX

- [x] Dictation progress dots retain 8 px visuals with at least 24 x 24 px interaction targets and keyboard focus.
- [x] Correct, incorrect, active, hinted, and pending dictation states remain theme-aware.
- [x] Settings sliders show a persistent numeric value in addition to the dynamic tooltip.
- [x] Vocabulary folder reads are scoped to the configured folder and ID lookups are cached.
- [x] Malformed protocol parameters fail safely instead of throwing.
- [x] TypeScript, unit tests, production build, package contents, and dependency audit pass.
- [ ] Test light theme, dark theme, and one popular community theme in Obsidian.
- [ ] Test recording, dictation, UTF-16 subtitles, remote media, and fallback fullscreen on physical iOS and Android devices.
- [ ] Test the minimum supported Obsidian version and the current stable version.

## Release commands

```bash
npm ci
npm run typecheck
npm test
npm run package
npm audit
```

Before publishing, verify that the GitHub tag equals the version in `manifest.json` and that the release exposes each required file separately.
