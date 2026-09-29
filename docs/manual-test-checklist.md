# LangPlayer 手动测试清单

> 自动化只能保证 `tsc` + `npm run build` 通过。下面这些必须你手动在 Obsidian 内点一遍。每项标 ☐ 通过 / ✗ 不通过 / N/A 不适用。

## 优化后回归重点（2026-05-17）

经过一轮全面修复 + 优化，需要特别测试这些**新行为/已修 bug**：

- [ ] **设置 → 通用 → 听写 → 显示答案的失败次数阈值** 调到 15 或更高（>10），失败时确实在阈值到达后才解锁（之前 P0 bug 截断到 10）
- [ ] **设置 → 通用 → 录音格式** 改成 mp3/wav 后录一段，生成的文件后缀正确（之前硬编码 .webm）
- [ ] **设置文件检查**：禁用插件，编辑器打开 `.obsidian/plugins/langplayer/data.json`，应**看不到** `deepgramApiKey` / `translationApiKey` / `freeSpeechPrompts` / `ytdlpPath` 等旧字段（v3 迁移已删）
- [ ] **闪卡 vault 路径**：装了 Language Learner 时，闪卡写到 LL 配置的复习库路径（之前直接绕过 LL 配置）
- [ ] **录音麦克风按钮发光**：录音时按钮外圈随声音强度有红色光晕（音量表 UI）
- [ ] **生词列表加载**：打开词汇视图时短暂显示"加载中..."而不是空表
- [ ] **所有 Notice 弹窗都是当前 UI 语言**（设置 → English 时所有错误提示是英文）
- [ ] **快捷键提示**：字幕面板偏移按钮、字符格子按钮悬停时显示翻译后的 title
- [ ] **键盘可达**：字幕列表用 Tab 能聚焦每一行，回车/空格触发跳转
- [ ] **触控目标**：在窄屏/手机上字幕面板工具栏所有按钮 ≥36px 可点

## 0. 首次启用

- [ ] 设置 → 第三方插件 → 在已安装插件里找到 **LangPlayer**（不是 LangFlow）
- [ ] 点击启用，左下角无报错弹窗
- [ ] 开发者工具 Console（Ctrl+Shift+I）应该看到 `[LangPlayer] === onload() START ===`，无 `Cannot find ...` / `is not a function` / 红字
- [ ] 同时启用 LangFlow，两个插件应共存——侧边栏会有两个 ▶ play-circle ribbon 图标，命令面板里有 `LangFlow:` 和 `LangPlayer:` 两套命令

## 1. 播放器

- [ ] 在文件浏览器右键一个 mp4/mp3 → 看到 **Open in LangPlayer**（注意是 LangPlayer 不是 LangFlow）
- [ ] 点击后视频/音频在 LangPlayer 视图打开，有播放控制条
- [ ] 视频可以播放、暂停、拖进度条、调音量、改速度（0.5x/0.75x/1.0x/1.25x/1.5x/2.0x）
- [ ] 全屏按钮可用、退出可用
- [ ] **不应**看到的按钮：影子跟读（耳机图标）、下载（向下箭头）

## 2. 字幕面板

- [ ] 字幕面板自动打开（如果设置开启）
- [ ] 字幕列表正常显示，行数与字幕匹配
- [ ] 点击任意字幕行 → 视频跳到该时间
- [ ] 工具栏按钮：偏移调整 (-/+) 、英/中/时间显示切换、听写图标 T、导入到笔记
- [ ] 字幕偏移调整能影响显示
- [ ] 双语切换正常

## 3. 视频上字幕悬浮 + 点击查词

需要 Language Learner 插件已启用。

- [ ] 视频底部应有字幕悬浮（按设置 overlay mode）
- [ ] 鼠标悬浮在英文单词上 200ms → 弹出 Language Learner 查词卡
- [ ] 点击单词 → 打开 Language Learner 查词面板
- [ ] 设置 → 词汇 → 关闭"视频字幕悬浮查词" → 悬浮不再弹出，点击仍可查

## 4. 听写功能（重点）

- [ ] 字幕面板工具栏 T 图标点击 → 打开听写视图
- [ ] 字幕字符格子正确渲染（每个词分开，标点正确显示）
- [ ] 视频自动从当前句句首播放，到句尾自动暂停
- [ ] 输入字母 → 对的绿、错的红
- [ ] 全部正确 → 350ms 绿色闪烁 → 自动下一句
- [ ] **Tab** 提示当前光标处一个字母（蓝色）
- [ ] **Space** 重听本句
- [ ] **Backspace** 退格
- [ ] **←/→** 移动光标
- [ ] 累计错 5 次（默认）→ 出现"我放弃了 — 显示答案 (Esc)"
- [ ] **Esc** 显示全句答案，主按钮变"下一句"，Enter 前进
- [ ] 错题进队列；点错题重练能循环错题
- [ ] **跳过一句后键盘还能正常输入**（之前的 bug）
- [ ] 设置 → 通用 → 听写 → 阈值滑杆能调

## 5. 单句循环 / AB 复读

- [ ] 字幕控制条上单句循环按钮可用，右键能改循环次数
- [ ] AB 设置 A 点 → 设置 B 点 → 自动循环 A→B
- [ ] 听写中开启单句循环 → 音频在本句循环，能正常打字
- [ ] 听写中答对一句 → 自动跳下一句，循环跟着到新句

## 6. 录音（极简版）

- [ ] 字幕控制条上麦克风图标可点击
- [ ] 第一次点击 → 浏览器请求麦克风权限（同意）
- [ ] 麦克风按钮变红、出现红点 → 说话
- [ ] 再点 → 停止 → 在 vault 的 `LangPlayer/recordings/` 文件夹（或设置里指定的路径）下生成 webm/mp3/wav 音频文件
- [ ] **不应**有任何"转录中..."、"评估中..."、AI 反馈弹窗

## 7. 词汇 / 闪卡

- [ ] 命令面板执行 `LangPlayer: Open Vocabulary` → 词汇视图打开
- [ ] 词汇表正常渲染（如果之前 LangFlow 用过会共享存储，因为 Language Learner 集成）
- [ ] 状态过滤、搜索可用
- [ ] 导出 CSV 文件名以 `langplayer-vocab-` 开头（不是 langflow）
- [ ] Spaced Repetition：生成卡片到 review.md 可用

## 8. 设置

- [ ] 设置 → LangPlayer 标签下应**只有**：通用、字幕、词汇 三个 tab
- [ ] **不应**看到：录音 tab、下载 tab、AI Provider、Deepgram、Whisper、TTS、自由说提示词、跟读相关
- [ ] 通用 tab 末尾有"听写"小节 + "显示答案的失败次数阈值"滑杆
- [ ] 词汇 tab 有"视频字幕悬浮查词"开关

## 9. 命令面板（Ctrl+P）

可用：
- LangPlayer: Open Player
- LangPlayer: Open Subtitle Panel
- LangPlayer: Open Vocabulary
- LangPlayer: Open Media File
- LangPlayer: Start Spaced Repetition Review
- 播放器: 播放 / 暂停、上一句、下一句、后退 5s、前进 5s、重播当前句、音量±、静音、加/减/重置速度、字幕显示、单句循环、AB 复读、全屏

应该**没有**的：
- 任何带"转录"、"翻译"、"AI"、"跟读"、"录音"、"下载"字样的命令

## 10. 插件并存验证

- [ ] 同时启用 LangFlow 和 LangPlayer，**两者状态不互相干扰**：
  - LangFlow 的 view 用 `langflow-*` 类型，LangPlayer 用 `langplayer-*`
  - 两者各自独立的 data.json
  - 协议链接 `obsidian-langplayer://...` 触发 LangPlayer，`obsidian-langflow://...` 触发 LangFlow
- [ ] 两个插件的设置都能独立修改，互不覆盖
- [ ] 关掉 LangFlow，LangPlayer 仍正常工作（所有功能都不依赖 LangFlow）

## 11. 卸载/禁用

- [ ] 禁用 LangPlayer → 视图自动关闭，无残留
- [ ] 重启 Obsidian → 无报错
- [ ] 重新启用 → 之前的设置保留

---

## 自动化已通过
- TypeScript: `npx tsc -noEmit -skipLibCheck` → exit 0
- Production build: `npm run build` -> exit 0
- Release package: `npm run package` -> `release/<version>/` contains the three individual release files and a zip containing only `manifest.json`, `main.js`, `styles.css`
- 静态依赖：grep 残留搜索 0 命中（TranscriptionService / TranslationService / AzurePronunciation / SpeechRecognition / SpeechEvaluator / DownloadService / EvaluationModal / shadowing / freeSpeechPrompts / deepgram / whisperCpp / ttsModel / ttsVoice）
- Vitest: `npm test` -> 全部单元测试通过

## 已知遗漏 / 未做

- 公开 GitHub 仓库 URL 建立后，可选择在 `manifest.json` 增加真实 `authorUrl`。
- 上游 LangFlow 的本地副本为 MIT，发布时继续保留当前 `LICENSE` 版权声明。
- iOS/Android 真机 QA 仍需完成：录音、A/B 对比、全屏 fallback、UTF-16 字幕解码。
- 本地开发环境可能存在 `data.json`，但 release zip 不应包含它。
