# Dashell Player — Privacy & Network Disclosure

_Last updated: 2026-10-05_

Dashell Player is a local-first Obsidian plugin. It stores everything in your vault
and makes **no telemetry or analytics calls of any kind**. This document lists
every situation in which the plugin touches the network or third parties, so you
can make an informed decision.

## Local data and settings

- **Settings** — `data.json` in the plugin folder (player/subtitle/dictation
  preferences, vocab/database paths, hotkeys, and playback progress).
- **Vocabulary & databases** — Markdown files in the folders you configure
  (`vocabFolder`, `wordDatabase`, `reviewDatabase`).
- **Recordings** — audio clips you record are saved to your configured
  `audioFolder` inside the vault.
- **Notes** — sentence/subtitle notes written to your `notePath` folder.

The plugin does **not** upload, sync, or transmit these local files or settings.

## Network requests

The plugin only makes network requests in these explicit cases:

1. **Remote media you open.** If you open an `http(s)` media URL, your media
   player fetches that URL directly from the host you chose. The plugin does not
   proxy or inspect it. No URL is sent anywhere else.

**Word pronunciation uses the Web Speech API.** Dashell Player does not send the
word to a TTS endpoint itself. The selected voice is provided by the operating
system or browser and may be local or may use an online speech service,
depending on the user's device and voice configuration. Pronunciation can be
turned off in Settings → *Word pronunciation*.

These are the plugin's direct network requests. The plugin:

- does **not** include client-side telemetry or analytics;
- does **not** auto-update itself;
- does **not** access files outside the Obsidian vault on its own (on desktop it
  reads subtitle files next to local media via the filesystem to support UTF-16
  encodings — only for media inside your vault);
- does **not** send notes, vocabulary databases, recordings, or the settings
  file.

## Third parties

- **Media hosts** — whatever host serves a remote media URL you choose to open.
- **OS/browser speech provider** — only when word pronunciation is enabled and
  the selected system voice is implemented as an online service. Dashell Player
  does not choose or contact a speech provider directly.

## Contact

For privacy questions, open an issue on the plugin's repository.
