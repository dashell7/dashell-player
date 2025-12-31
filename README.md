# LangPlayer - Advanced Language Learning Media Player for Obsidian

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/langplayer/langplayer)
[![License](https://img.shields.io/badge/license-0--BSD-green.svg)](LICENSE)

English | [简体中文](README_CN.md)

LangPlayer is a powerful Obsidian plugin designed for language learners, providing advanced media playback with subtitle synchronization, pronunciation assessment, and vocabulary management features.

## ✨ Features

### 🎬 Advanced Media Player
- **Local Media Support**: Play local media files (MP4, MP3, WAV, OGG, etc.)
- **Remote Media Support**: Play media files from remote URLs
- **Subtitle Sync**: Manual subtitle loading and synchronization (SRT, VTT formats)
- **Word-Level Highlighting**: Real-time word highlighting synced with audio playback
- **Playback Speed Control**: Adjust playback speed (0.5x - 2x) for comfortable learning

### 🔄 Learning-Optimized Playback
- **Sentence Loop**: Repeat individual sentences for focused practice
  - Configurable loop count (1-10 times)
  - Auto-play next sentence option
- **AB Repeat**: Set custom loop points for any section
- **One-Click Sentence Play**: Click any subtitle to jump and play that sentence
- **Previous/Next Navigation**: Easily navigate between sentences

### 🎤 Pronunciation Practice
- **Voice Recording**: Record your pronunciation with one click
- **Multiple STT Providers**: 
  - OpenAI Whisper (text matching)
  - Azure Speech Services (professional pronunciation assessment)
  - AssemblyAI support
- **Detailed Scoring**:
  - Overall pronunciation score
  - Accuracy, fluency, and completeness metrics
  - Word-level error detection
  - Visual diff comparison

### 📚 Vocabulary Management
- **Click-to-Lookup**: Click any word in subtitles to look it up
- **Language Learner Integration**: Seamlessly integrates with obsidian-language-learner plugin
- **Auto-Fill Examples**: Automatically fills example sentences from current subtitle

### 🎨 Modern UI
- **Draggable Subtitle Panel**: Flexible layout with draggable subtitle panel
- **Customizable Styling**: Adjust font size, weight, and line height
- **Theme Compatible**: Adapts to your Obsidian theme (light/dark mode)
- **Responsive Design**: Clean, modern interface optimized for learning

## 🚀 Installation

### From Obsidian Community Plugins (Recommended)
1. Open Obsidian Settings
2. Go to Community Plugins → Browse
3. Search for "LangPlayer"
4. Click Install
5. Enable the plugin

### Manual Installation
1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/langplayer/langplayer/releases)
2. Create folder: `YourVault/.obsidian/plugins/langplayer/`
3. Copy downloaded files to the folder
4. Reload Obsidian
5. Enable LangPlayer in Settings → Community Plugins

## ⚙️ Setup

### Basic Setup
1. **Open LangPlayer**: Click the play icon in the left ribbon or use command palette
2. **Load Media**: Enter a local file path or remote media URL
3. **Load Subtitles**: Load a local SRT/VTT subtitle file

### Voice Recording Setup (Optional)
To use pronunciation assessment features:

#### Option 1: OpenAI (Recommended for beginners)
1. Get API key from [OpenAI Platform](https://platform.openai.com/api-keys)
2. Settings → LangPlayer → Speech Provider → OpenAI
3. Enter your API key
4. Click "Test Connection"

#### Option 2: Azure (Professional pronunciation assessment)
1. Create Azure Speech Services resource at [Azure Portal](https://portal.azure.com)
2. Get your Subscription Key and Region
3. Settings → LangPlayer → Speech Provider → Azure
4. Enter credentials and select voice
5. Click "Test Connection"

**Cost**: 
- OpenAI: ~$0.006/minute
- Azure: $1/1000 requests (5000 free/month)

## 📖 Usage

### Playing Media
1. **Open Player**: Click ribbon icon or use command "Open Media Player"
2. **Load Content**: 
   - Enter local file path (e.g., videos/lesson.mp4), or
   - Enter remote media URL, or
   - Click "Browse Local File"
3. **Load Subtitles**: Select local SRT/VTT file

### Learning with Subtitles
- **Click Subtitle**: Jump to that sentence and start playing
- **Loop Practice**: Click 🔁 button to repeat current sentence
- **Navigate**: Use ⬅️ Previous / Next ➡️ buttons
- **Lookup Words**: Click any word in subtitles for dictionary lookup

### Recording Pronunciation
1. **Select Sentence**: Click or navigate to a subtitle
2. **Start Recording**: Click 🎤 microphone button
3. **Speak**: Read the sentence aloud
4. **Stop & Evaluate**: Get instant feedback with detailed scoring

### Using Independent Subtitle Panel
1. Command Palette → "Open Subtitle Panel"
2. Drag panel to your preferred location (sidebar, bottom, etc.)
3. Keep subtitles visible while viewing media in main editor

## ⌨️ Keyboard Shortcuts

You can configure these in Obsidian Settings → Hotkeys:

- **Toggle Play/Pause**: Space (when player is focused)
- **Previous Sentence**: Left Arrow
- **Next Sentence**: Right Arrow
- **Toggle Loop**: L
- **Exit Loop**: Escape
- **Start Recording**: R

## 🎯 Tips & Best Practices

### For Effective Learning
1. **Use Loop Practice**: Set loop count to 3-5 times for difficult sentences
2. **Enable Auto-Play Next**: Continuously practice multiple sentences
3. **Record Yourself**: Compare your pronunciation with the original
4. **Slow Down**: Reduce playback speed for challenging content
5. **Build Vocabulary**: Click unknown words to create vocabulary notes

### For Better Performance
1. **Use Local Files**: Faster loading than remote streaming
2. **Match Subtitle Timing**: Ensure subtitles match audio for accurate sync
3. **Close Other Panels**: Focus mode for distraction-free learning

## 🔧 Settings Reference

### Player Settings
- **Loop Count**: Number of times to repeat each sentence (1-10)
- **Auto-Play Next**: Automatically play next sentence after loop finishes
- **Video Fit Mode**: How video fills the player (contain/cover/fill)
- **Show Inline Subtitles**: Display subtitle list below video (or use independent panel)

### Subtitle Styling
- **Font Size**: 12-24px (default: 15px)
- **Font Weight**: Normal to Bold (default: 500)
- **Line Height**: 1.0-2.5 (default: 1.6)

### Voice Recording
- **Speech Provider**: Choose OpenAI, Azure, or AssemblyAI
- **Audio Format**: WAV, WebM, or MP3
- **Save Audio**: Optionally save recordings to vault
- **Record Only Mode**: Skip transcription (for practice without feedback)

## 🤝 Integration with Other Plugins

### Language Learner Plugin
LangPlayer seamlessly integrates with [obsidian-language-learner](https://github.com/guopenghui/obsidian-language-learner):
- Auto-fill example sentences when looking up words
- Automatically open word entry panel
- Sync vocabulary to your language learning database

## 📝 Supported Formats

### Media Files
- **Video**: **MP4** (H.264/AAC Recommended), WebM, OGV
  - ⚠️ **Note**: **MKV** files with AC3/DTS audio are **NOT supported** (video plays without sound) due to underlying Chromium limitations. Please convert audio to **AAC** for best compatibility.
- **Audio**: MP3, WAV, OGG, M4A, FLAC, AAC
- **Remote**: Any accessible media URL

### Subtitle Files
- SRT (SubRip)
- VTT (WebVTT)
- Bilingual subtitles supported (EN/ZH, etc.)

## 🐛 Troubleshooting

### Microphone Not Found
See Settings → Enable Voice2Text for diagnostic steps

### Subtitles Out of Sync
1. Check if subtitle file matches the media
2. Adjust subtitle offset in player controls
3. Ensure subtitle file encoding is UTF-8

### Remote Media Playback Issues
1. Check internet connection
2. Verify the media URL is accessible
3. Ensure the media format is supported
4. Try downloading and using a local copy

### API Errors
1. Verify API key is correct
2. Check account has sufficient credits/quota
3. Test connection in settings

## 📄 License

This project is licensed under the 0-BSD License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built on [Obsidian](https://obsidian.md) plugin API
- Uses [React Player](https://github.com/cookpete/react-player) for media playback
- Powered by [Zustand](https://github.com/pmndrs/zustand) for state management
- Thanks to all contributors and testers!

## 📧 Support

- Report issues: [GitHub Issues](https://github.com/langplayer/langplayer/issues)
- Documentation: [GitHub Wiki](https://github.com/langplayer/langplayer/wiki)

---

**Happy Learning! 🎓**
