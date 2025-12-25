# LangPlayer 1.5.0 Release Notes

## 🎉 New Features

- **Advanced AB Repeat**: 
  - Redesigned AB Repeat button with a new, intuitive menu interface.
  - Supports setting Point A and Point B independently.
  - Clear visual feedback and precise time controls.
  - Ability to update Point A without clearing the entire session.
- **Enhanced UI/UX**:
  - **Modern Button Design**: All controls now use consistent, high-quality SVG icons with unified stroke width and sizing.
  - **Grouped Controls**: Buttons are now logically grouped (Navigation, Repeat, Recording, Settings) with optimized spacing for better usability.
  - **Visual Polish**: Improved hover states, active indicators, and transitions.
- **Robust State Management**:
  - Implemented strict mutual exclusion for loop modes (AB Repeat, Segment Loop, Infinite Loop, Shadowing) to prevent logical conflicts.
  - Optimized `useMediaSync` hook for smoother playback control.

## ⚡ Improvements

- **Performance**:
  - Optimized `SubtitleControls` rendering with proper state subscriptions.
  - Reduced unnecessary re-renders in core components.
- **Code Quality**:
  - Refactored `mediaStore` for better state isolation and validation.
  - Cleaned up CSS animations and removed redundancies.
  - Fixed various edge cases in subtitle synchronization.

## 🐛 Bug Fixes

- Fixed an issue where the AB Repeat button would not update visually after setting points.
- Fixed potential conflicts between Shadowing mode and other loop modes.
- Fixed CSS syntax errors and animation glitches.

---

**How to install:**
1. Download `main.js`, `manifest.json`, and `styles.css` from the release assets.
2. Place them in your vault's `.obsidian/plugins/langplayer/` folder.
3. Reload Obsidian.
