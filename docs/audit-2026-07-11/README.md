# LangPlayer 上架复审与修复结果（2026-07-11）

结论：P0、P1、P2 的本地代码与发布工程修复已经完成，当前版本已具备创建公开仓库和 GitHub Release 的条件。仍需完成 iOS/Android 真机、最低 Obsidian 版本和跨主题人工测试，这些不能由本机自动化替代。

## 验证结果

- `npm run typecheck`：通过。
- `npm run test`：14 个测试文件、65 个测试全部通过。
- `npm run package`：通过；`release/1.1.0/` 提供三个独立附件，zip 也仅含 `manifest.json`、`main.js`、`styles.css`。
- 完整依赖审计：0 个已知漏洞。
- 开发工具已升级到 `vitest@4.1.10`、`esbuild@0.28.1`、`obsidian@1.13.1`。
- 生产包：`main.js` 349,898 字节，`styles.css` 67,706 字节，zip 119,904 字节。
- 当前官方社区列表未发现 `langplayer` ID 或 `LangPlayer` 名称冲突。

## 修复状态

- [x] P0：manifest 空字段、发布隔离、官方提交说明、MIT 归属和独立附件打包。
- [x] P1：原子文件写入、插件内播放进度、依赖漏洞、卸载清理、内部 API 精简和隐私措辞。
- [x] P2：词库文件夹扫描/ID 索引、状态落盘、闪卡去重、协议异常输入、听写状态点和滑杆数值。
- [x] 实机桌面复核：Obsidian 1.12.7 中插件可重载，播放器、字幕列表、听写恢复卡和 24px 状态点正常渲染。
- [ ] 外部动作：创建公开 GitHub 仓库、创建标签 `1.1.0` 的 Release、上传三个独立附件并提交社区目录。
- [ ] 人工矩阵：iOS、Android、Obsidian 1.7.2、深色主题与至少一个社区主题。

> 下方 P0/P1/P2 条目保留为“修复前发现”的历史记录；其对应代码项均已按上面的修复状态完成。

## P0：提交阻塞

### 1. 尚无可提交的公开仓库与正式 Release

当前项目目录不是 Git 仓库，也没有可核验的公开源码地址。Obsidian 现在要求通过 `community.obsidian.md` 提交公开 GitHub 仓库，并在与 `manifest.json` 版本完全一致的 GitHub Release 中分别上传 `main.js`、`manifest.json`、`styles.css`。仅上传当前 zip 不能代替这些独立附件。

`manifest.json` 的 `authorUrl` 是空字符串。该字段是可选字段，应删除，或替换为真实有效的作者/仓库 URL，不能保留空值。

### 2. 仓库发布隔离不足，存在误提交用户数据的风险

插件目录没有 `.gitignore`，本地存在包含听写进度和学习习惯数据的 `data.json`，同时还有 `node_modules`、构建产物和 zip。当前 zip 已正确排除 `data.json`，但初始化公开仓库时仍可能把本地学习数据误提交。

建议在建立公开仓库前明确忽略 `data.json`、`node_modules/`、`*.zip`、开发缓存，并按当前官方建议只把 `main.js` 放入 GitHub Release，不提交到源码分支。

## P1：上架前应修复

### 3. 后台文件更新仍使用 `Vault.modify`

`FlashcardService`、`NoteService`、`VocabularyDbService` 共 7 处后台写入使用 `vault.modify()`，其中多处是“先读后写”。当 Obsidian、同步插件或用户同时修改同一文件时，旧快照可能覆盖新内容。官方自检清单要求后台编辑优先使用 `Vault.process()`。

涉及位置：

- `src/services/FlashcardService.ts`：98、136、141、195。
- `src/services/NoteService.ts`：93、134。
- `src/services/VocabularyDbService.ts`：97。

### 4. 播放进度绕过插件数据 API

`src/utils/podcastProgress.ts` 使用 `localStorage` 保存播放进度。它不随 Obsidian 插件数据管理、备份和数据迁移一起工作，也与官方“使用 `Plugin.loadData()` / `Plugin.saveData()` 管理插件数据”的要求不一致。调试开关使用 `localStorage` 风险较低，但学习进度应迁移到插件设置或独立的插件数据结构。

### 5. 仍有大量 JSX 行内样式

源码中共有 67 处 `style={{...}}`，分布在 14 个文件，主要集中在词汇表、词汇统计、字幕面板和播放器。官方自检明确要求不要在 JavaScript/HTML 中硬编码样式。动态进度、坐标和动画延迟可改为 CSS 自定义属性，其余布局应迁移到 `styles-base.css`。

代表位置：

- `src/components/vocabulary/VocabularyTable.tsx`：37 起。
- `src/components/vocabulary/VocabularyPanel.tsx`：145 起。
- `src/components/subtitle/SubtitlePanel.tsx`：63 起。
- `src/components/subtitle/SubtitleOverlay.tsx`：46 起。

### 6. 开发工具链有已知漏洞

运行时依赖审计为 0 漏洞，但完整依赖树包含：

- `vite@8.0.13`：高危 Windows 路径绕过公告，经 `vitest@4.1.6` 引入。
- `esbuild@0.27.7`：低危 Windows 开发服务器文件读取公告。

这些不进入插件运行时包，但公开仓库的开发者和 CI 会使用它们。上架前应升级到已修复版本并重新生成锁文件、重跑测试和构建。

## P2：质量与性能风险

### 7. 生词更新在大词库中会退化为全量串行扫描

`VocabularyDbService.getVocabFiles()` 每次从整个 vault 的 Markdown 文件中过滤词库文件；`findFileById()` 随后逐个读取，未命中时还会再解析一遍。词库达到数千项后，编辑或删除一个词可能产生明显延迟。应直接读取目标文件夹的 children，并建立 `id -> TFile` 索引或复用缓存。

涉及位置：`src/services/VocabularyDbService.ts` 156、163、169、174。

### 8. 闪卡刷新定时器未在卸载时取消

`FlashcardService.scheduleRefresh()` 创建 500ms 定时器，但服务没有 `dispose()`，`main.ts` 的 `onunload()` 也没有清理它。若用户在保存生词后立刻禁用/重载插件，延迟任务仍可能继续写数据库。发布清单中“onunload cleanup complete”的表述目前不准确。

### 9. 内部 Obsidian API 仍可能触发审核意见

源码仍使用 `app.plugins`、`app.commands.executeCommandById`、`leaf.updateHeader()`、`leaf.parent` 等非正式接口。它们用于 Language Learner / Spaced Repetition 集成和标题刷新，但会增加版本兼容风险。至少应在 README 中披露依赖关系和降级行为；能移除的装饰性调用应移除。

### 10. TTS 隐私表述过于绝对

插件本身没有发起词语发音网络请求，这是好的。但 README 和 `PRIVACY.md` 声称系统语音“完全本地、什么也不会发送”，无法替所有操作系统和已安装语音实现作保证。更稳妥的描述是：插件只调用 Web Speech API，不直接把文字发送给 LangPlayer 服务器或第三方；具体语音是否本地由操作系统/浏览器语音实现决定。

### 11. 移动端仍缺真实设备证据

代码已正确把 `fs/path` 动态加载放在 `Platform.isDesktopApp` 和 `FileSystemAdapter instanceof` 保护后，移动端静态兼容处理合理。但 `isDesktopOnly: false` 仍需要至少一台 iOS 和一台 Android 真机验证录音权限、录音容器、字幕加载、听写键盘、A/B 循环、后台恢复和旋转布局。

## UI 与可访问性

### 12. 听写状态逻辑存在，但进度点点击区域过小

红/绿状态未丢失：`DictationPanel.tsx` 会生成 `active-ok`、`active-wrong`、`ok`、`wrong` 状态，`styles-base.css` 也分别使用主题绿色和红色。当前截图处于恢复提示/未判题状态，因此只显示 pending 点，不应出现红绿。

不过 `.lp-dot` 实际点击区域只有 8x8px，相邻间距 4px；hover 放大不能改善触屏首次命中。它不满足 WCAG 2.2 的 24x24px 目标尺寸或间距规则。建议保留 8px 视觉圆点，但给每个点增加至少 24x24px 的透明按钮容器。

### 13. 窄栏布局可用，但信息密度偏高

在约 260px 宽叶片中，播放器、听写恢复卡、进度点和字幕面板都能渲染，没有明显溢出或裁切。优点是功能完整；问题是听写恢复卡四个操作与统计区竞争空间，pending 点对比度较低，用户不容易一眼区分“尚未开始”和“不可用”。可通过更清晰的状态图例、增大命中区域和减少恢复卡次要文案改善。

设置页分组清楚，使用了 Obsidian 原生 Setting 控件；命令面板命令也能正常显示。滑杆当前值只在悬停动态提示中显示，移动端调整时反馈偏弱，建议增加可见数值。

## 文档与法律状态

- 本机直接上游 `langflow/LICENSE` 明确为 MIT，LangPlayer 当前 LICENSE 保留了同一版权声明，原先“许可证未知”的阻塞可以解除。
- 仍需在公开 README 中写明真实上游仓库 URL、派生关系和主要改动。当前 `https://github.com/langflow` 很可能不是这个 Obsidian 插件的可核验源码地址，不能当作来源证明。
- `RELEASE_CHECKLIST.md` 仍写“提交 PR 到 obsidian-releases”，已不符合当前官方提交流程。
- `docs/manual-test-checklist.md` 同时写“tests 文件夹未带过来”，但当前已有 12 个测试文件，应更新。

## 实际界面步骤

1. `01-player-dictation-subtitles.png`：播放器、听写恢复状态、字幕面板。健康度：可用，窄栏密度和小目标需改进。
2. `02-command-palette.png`：LangPlayer 命令列表。健康度：正常，无默认热键冲突。
3. `03-settings-navigation.png`：第三方插件设置入口。健康度：正常。
4. `04-langplayer-settings.png`：通用与听写设置。健康度：正常，滑杆数值反馈可增强。

## 未覆盖范围

- 为避免改变现有学习记录，本次没有实际提交一条正确/错误听写答案，也没有新建录音。
- 没有 iOS/Android 真机、深色主题、社区主题和 Obsidian 1.7.2 最低版本实测。
- 现有 60 个测试均为 Node 环境逻辑测试，没有 React DOM、录音、视图生命周期或端到端测试。
