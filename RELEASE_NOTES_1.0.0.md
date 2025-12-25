# LinguaFlow v1.0.0 - Release Notes

**Release Date**: December 25, 2024

## 🎉 Initial Release

LinguaFlow v1.0.0 is the first official release of our advanced language learning media player for Obsidian!

## ✨ Core Features

### Media Playback
- ✅ YouTube video support with automatic subtitle loading
- ✅ Local media file playback (MP4, MP3, WAV, etc.)
- ✅ Subtitle synchronization (SRT, VTT formats)
- ✅ Real-time word-level highlighting
- ✅ Playback speed control (0.5x - 2x)

### Learning Tools
- ✅ Sentence loop practice with configurable repeat count
- ✅ Auto-play next sentence option
- ✅ AB repeat functionality
- ✅ One-click sentence navigation
- ✅ Previous/Next sentence buttons

### Pronunciation Assessment
- ✅ Voice recording with one-click
- ✅ Multiple STT providers:
  - OpenAI Whisper (text matching scoring)
  - Azure Speech Services (professional pronunciation assessment)
  - AssemblyAI support
- ✅ Detailed scoring metrics:
  - Overall pronunciation score
  - Accuracy, fluency, completeness
  - Word-level error detection
  - Visual diff comparison

### Vocabulary Management
- ✅ Click-to-lookup dictionary integration
- ✅ Language Learner plugin integration
- ✅ Auto-fill example sentences

### User Interface
- ✅ Modern, clean design
- ✅ Draggable independent subtitle panel
- ✅ Customizable subtitle styling
- ✅ Theme-compatible (light/dark mode)
- ✅ Responsive layout

## 📦 Installation

### Method 1: Manual Installation
1. Download `linguaflow-1.0.0.zip`
2. Extract the contents
3. Copy files to: `YourVault/.obsidian/plugins/linguaflow/`
4. Reload Obsidian
5. Enable LinguaFlow in Community Plugins settings

### Method 2: Direct File Installation
Download these files from the release:
- `main.js` (343 KB)
- `manifest.json`
- `styles.css` (46 KB)

Place them in: `YourVault/.obsidian/plugins/linguaflow/`

## ⚙️ Quick Setup

### For OpenAI Users
1. Get API key from https://platform.openai.com/api-keys
2. Settings → LinguaFlow → Speech Provider → OpenAI
3. Enter API key
4. Click "Test Connection"

### For Azure Users
1. Create Speech Services resource at https://portal.azure.com
2. Settings → LinguaFlow → Speech Provider → Azure
3. Enter Subscription Key and Region
4. Click "Test Connection"

## 📊 Package Information

- **Plugin Size**: ~109 KB (compressed)
- **main.js**: 343,520 bytes
- **styles.css**: 46,096 bytes
- **Minimum Obsidian Version**: 0.15.0

## 🔧 Configuration

All settings are available in: **Settings → LinguaFlow**

Key settings to configure:
- **Speech Provider**: Choose your preferred STT service
- **Loop Count**: Set default repeat count (1-10)
- **Auto-Play Next**: Enable/disable automatic progression
- **Subtitle Styling**: Customize font size, weight, line height

## 🐛 Known Issues

None reported yet! This is a stable v1.0.0 release.

## 📝 Requirements

- Obsidian v0.15.0 or higher
- For voice features: OpenAI API key or Azure Speech Services account
- For YouTube playback: Active internet connection

## 🙏 Acknowledgments

Special thanks to:
- All beta testers who provided feedback
- The Obsidian community for inspiration
- Open source projects we build upon

## 📧 Support & Feedback

- **Issues**: Report bugs on GitHub Issues
- **Feature Requests**: Submit via GitHub Discussions
- **Documentation**: Check the README.md

## 🚀 What's Next?

We're already planning v1.1.0 with:
- Additional STT provider options
- Enhanced subtitle editing features
- Batch processing capabilities
- Performance optimizations

---

**Enjoy learning with LinguaFlow! 🎓**

*For detailed usage instructions, see README.md*
