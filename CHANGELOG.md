# Changelog

## 1.9.5

- Simplify the player to a single title row with study modes, vocabulary, notes, and subtitle options; hide the duplicate Obsidian view header.
- Add independent video, current-sentence, and sidebar subtitle switches, plus an optional detached subtitle pane that stays in sync with the sidebar switch.
- Consolidate sentence replay, translation, and saving into a compact toolbar. Refine dictation actions, hints, answer visibility, and collapsible statistics.
- Keep subtitle visibility controls available during playback and pause, and move volume controls into the main playback toolbar.
- Add draggable and keyboard-accessible media/transcript dividers. Remember each study mode's pane sizes and preserve minimum usable sizes.
- Keep development builds in sync with an explicitly configured test vault; production builds and packages remain local.
- Refresh the locked development SDK and its supporting dependencies; dependency audit reports no known vulnerabilities.

Validation: 108 automated tests pass. Desktop playback, subtitles, pane resizing, dictation, and 320–1000 px layouts were checked in Obsidian 1.12.4. See [release verification](docs/releases/1.9.5-verification.md) for coverage and limitations.

## 1.9.4

- Add the redesigned responsive study workspace for audio, video, subtitles, vocabulary, and dictation.
- Improve compact layouts, keyboard handling, subtitle navigation, recording state feedback, and practice controls.
- Add the UI preview documentation and light/dark reference screenshots.

## 1.9.3

- Refine the dictation workspace with a compact progress bar, horizontally scrolling sentence markers, and automatic positioning for the current sentence.
- Improve narrow-pane and mobile layouts so the dictation actions, recovery card, input area, playback bar, and subtitle controls remain usable as the window changes size.
- Reduce visual weight in habit statistics, clarify the replay action, and remove the duplicate replay shortcut hint.
- Improve subtitle and playback controls, settings copy, and the Dashell Player about page.

## 1.9.2

- Renamed the plugin to Dashell Player with ID `dashell-player`; first launch copies settings from the previous `langplayer` data file while keeping the source for rollback.
- Automatically associate same-name local subtitle files and retain manual subtitle associations across restarts, renames, and deletions.
- Add fixed/floating playback bar behavior and configurable top/bottom position.
- Route subtitle word lookup to Dashell Reader and remove the retired sound-pattern and AI-meaning features.
- Improve subtitle interaction, dictation, vocabulary persistence, and audio/video layout behavior.
