/*
 * LangPlayer
 * Copyright (c) 2025 LinguaFlow Team. All rights reserved.
 * 
 * This software is licensed under the terms of the EULA found in the LICENSE file.
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */

import { Plugin, WorkspaceLeaf, Notice, TFile, MarkdownView } from 'obsidian';
import { LinguaFlowView } from './views/LinguaFlowView';
import { SubtitlePanelView, SUBTITLE_PANEL_VIEW_TYPE } from './views/SubtitlePanelView';
import { LINGUA_FLOW_VIEW, type MediaSource, type ProtocolParams, type PlayerRef, type SubtitleCue } from './types';
import { parseTimestamp, formatTime } from './utils/fileUtils';
import { useMediaStore } from './store/mediaStore';
import { LinguaFlowSettings, DEFAULT_SETTINGS, LinguaFlowSettingTab } from './settings';
import { MediaInputModal } from './modals/MediaInputModal';
import { SubtitleLoader } from './services/SubtitleLoader';
import { TextProcessor } from './components/OptimizedWord';
import * as React from 'react';
import { ActivationService } from './services/ActivationService';
import { logger, LogLevel } from './utils/logger';

/**
 * LangPlayer 插件主类
 * 提供媒体播放、字幕同步、语言学习功能
 */
export default class LinguaFlowPlugin extends Plugin {
	settings: LinguaFlowSettings;
	playerRef: React.RefObject<PlayerRef> = React.createRef();
	subtitleLoader: SubtitleLoader;

	async onload() {
		console.log('[LangPlayer] Loading plugin');

		// 加载设置
		await this.loadSettings();

		// [试用期初始化] 如果是首次运行，记录安装时间
		if (!this.settings.installDate || this.settings.installDate <= 0) {
			this.settings.installDate = Date.now();
			await this.saveSettings();
			console.log('[LangPlayer] First run detected. Trial started.');
		}

		// [激活检查] 验证激活码
		const activationService = ActivationService.getInstance();
		const isActivated = activationService.validateCode(this.settings.activationCode);
		
		if (!isActivated) {
			// 检查试用状态
			const trialStatus = activationService.checkTrialStatus(this.settings.installDate);
			
			if (trialStatus.isExpired) {
				// 已过期 -> 基础模式 (不拦截加载，但提示受限)
				console.log('[LangPlayer] Trial expired. Running in Basic Mode.');
				new Notice('⚠️ LinguaFlow 试用期已结束 (基础模式)。\n高级功能已锁定。', 5000);
			} else {
				// 试用期内 -> 允许使用
				console.log(`[LangPlayer] Trial active. ${trialStatus.daysRemaining} days remaining.`);
				new Notice(`⏳ LinguaFlow 试用模式 (剩余 ${trialStatus.daysRemaining} 天)`, 10000);
			}
		}

		// 初始化日志系统
		if (this.settings.debugMode) {
			logger.enableDebug();
			logger.info('Main', 'Debug mode enabled');
		} else {
			logger.disableAll();
		}

		// 初始化字幕加载器（带缓存功能）
		this.subtitleLoader = new SubtitleLoader(this);
		console.log('[LangPlayer] Subtitle loader initialized');

		// 注册自定义视图
		this.registerView(
			LINGUA_FLOW_VIEW,
			(leaf) => new LinguaFlowView(leaf, this)
		);

		// 注册字幕面板视图
		this.registerView(
			SUBTITLE_PANEL_VIEW_TYPE,
			(leaf) => new SubtitlePanelView(leaf, this)
		);

		// 注册 Ribbon 图标
		this.addRibbonIcon('play-circle', 'Open LangPlayer', () => {
			// 打开媒体输入对话框
			new MediaInputModal(this.app, this).open();
		});

		// 注册命令：打开播放器
		this.addCommand({
			id: 'open-player',
			name: 'Open Media Player',
			callback: () => {
				this.activateView();
			},
		});

		// 注册命令：打开当前文件
		this.addCommand({
			id: 'open-current-file',
			name: 'Play current file',
			checkCallback: (checking: boolean) => {
				const file = this.app.workspace.getActiveFile();
				if (file && this.isMediaFile(file)) {
					if (!checking) {
						this.openFile(file);
					}
					return true;
				}
				return false;
			},
		});

		// 注册命令：切换循环
		this.addCommand({
			id: 'toggle-loop',
			name: 'Toggle sentence loop',
			callback: () => {
				useMediaStore.getState().toggleLoop();
				const loopEnabled = useMediaStore.getState().loopEnabled;
				new Notice(loopEnabled ? '🔁 循环已启用' : '⏹️ 循环已关闭');
			},
		});

		// 注册命令：退出循环
		this.addCommand({
			id: 'exit-loop',
			name: 'Exit loop',
			callback: () => {
				useMediaStore.getState().disableLoop();
				new Notice('⏹️ 已退出循环');
			},
		});

		// 注册命令：上一句字幕
		this.addCommand({
			id: 'previous-subtitle',
			name: 'Previous subtitle',
			hotkeys: [{ modifiers: [], key: 'ArrowLeft' }],
			callback: () => {
				useMediaStore.getState().playPreviousSegment();
			},
		});

		// 注册命令：下一句字幕
		this.addCommand({
			id: 'next-subtitle',
			name: 'Next subtitle',
			hotkeys: [{ modifiers: [], key: 'ArrowRight' }],
			callback: () => {
				useMediaStore.getState().playNextSegment();
			},
		});

		// 注册命令：开启/关闭复读（句子循环）
		this.addCommand({
			id: 'toggle-sentence-repeat',
			name: 'Toggle sentence repeat',
			hotkeys: [{ modifiers: [], key: 'ArrowDown' }],
			callback: () => {
				const store = useMediaStore.getState();
				if (store.segmentLoopEnabled) {
					store.stopSegmentLoop();
					new Notice('⏹️ 复读已关闭');
				} else {
					const { activeIndex, subtitles } = store;
					if (activeIndex >= 0 && activeIndex < subtitles.length) {
						const currentCue = subtitles[activeIndex];
						if (currentCue) {
							store.startSegmentLoop(currentCue.start, currentCue.end, 3, activeIndex);
							new Notice('🔁 复读已启用');
						}
					} else {
						new Notice('⚠️ 请先选择字幕');
					}
				}
			},
		});

		// 注册命令：插入当前字幕到笔记
		this.addCommand({
			id: 'insert-subtitle-to-note',
			name: 'Insert current subtitle to note',
			hotkeys: [{ modifiers: ['Mod'], key: 'i' }],
			callback: () => {
				const store = useMediaStore.getState();
				const { activeIndex, subtitles } = store;
				
				if (activeIndex >= 0 && activeIndex < subtitles.length) {
					const currentCue = subtitles[activeIndex];
					if (currentCue) {
						this.insertSubtitleToNote(currentCue);
					}
				} else {
					new Notice('⚠️ 请先播放视频并选择字幕');
				}
			},
		});

		// 注册命令：设置 A 点（AB 循环起点）
		this.addCommand({
			id: 'set-point-a',
			name: 'Set point A (AB repeat)',
			// hotkeys: [{ modifiers: [], key: 'A' }], // Removed to avoid global conflict
			callback: () => {
				const currentTime = useMediaStore.getState().currentTime;
				useMediaStore.getState().setPointA(currentTime);
				new Notice(`🅰️ A点已设置: ${currentTime.toFixed(2)}s`);
			},
		});

		// 注册命令：设置 B 点（AB 循环终点）
		this.addCommand({
			id: 'set-point-b',
			name: 'Set point B (AB repeat)',
			// hotkeys: [{ modifiers: [], key: 'B' }], // Removed to avoid global conflict
			callback: () => {
				const currentTime = useMediaStore.getState().currentTime;
				const pointA = useMediaStore.getState().pointA;
				if (pointA === null || currentTime <= pointA) {
					new Notice('⚠️ B点必须在A点之后');
					return;
				}
				const store = useMediaStore.getState();
				store.setPointB(currentTime);
				// 设置 B 点后自动启用 AB 循环
				store.enableABRepeat();
				new Notice(`🅱️ B点已设置: ${currentTime.toFixed(2)}s - AB循环已启动`);
			},
		});

		// 注册命令：启用/关闭 AB 循环
		this.addCommand({
			id: 'toggle-ab-repeat',
			name: 'Toggle AB repeat',
			// hotkeys: [{ modifiers: [], key: 'R' }], // Removed to avoid conflict with Record (r)
			callback: () => {
				// [Pro Check] 仅限 Pro 用户
				if (!ActivationService.getInstance().isProAccess(this.settings.installDate)) {
					new Notice('🔒 AB循环是 Pro 功能。请激活插件以解锁。');
					return;
				}

				const store = useMediaStore.getState();
				if (store.abRepeatEnabled) {
					store.disableABRepeat();
					new Notice('⏹️ AB循环已关闭');
				} else {
					if (store.pointA !== null && store.pointB !== null) {
						store.enableABRepeat();
						new Notice('🔁 AB循环已启用');
					} else {
						new Notice('⚠️ 请先设置A点和B点');
					}
				}
			},
		});

		// 注册命令：打开字幕面板
		this.addCommand({
			id: 'open-subtitle-panel',
			name: 'Open Subtitle Panel',
			callback: () => {
				this.activateSubtitlePanel();
			},
		});

		// 注册 Protocol Handler
		this.registerObsidianProtocolHandler('linguaflow', this.handleProtocol.bind(this));

		// 注册文件菜单
		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => {
				if (file instanceof TFile && this.isMediaFile(file)) {
					menu.addItem((item) => {
						item
							.setTitle('Play in LinguaFlow')
							.setIcon('play-circle')
							.onClick(() => {
								this.openFile(file);
							});
					});
				}
			})
		);

		// 注册编辑器菜单（右键菜单）
		this.registerEvent(
			this.app.workspace.on('editor-menu', (menu, editor, view) => {
				// 获取选中的文本或光标下的链接
				const selection = editor.getSelection();
				let url = selection.trim();

				// 如果没有选中文本，尝试获取光标下的链接
				if (!url) {
					const cursor = editor.getCursor();
					const line = editor.getLine(cursor.line);
					
					// 简单的 URL 匹配
					const urlRegex = /https?:\/\/[^\s)]+/g;
					let match;
					while ((match = urlRegex.exec(line)) !== null) {
						if (cursor.ch >= match.index && cursor.ch <= match.index + match[0].length) {
							url = match[0];
							break;
						}
					}
					
					// 如果还在 Markdown 链接中 [Title](Url)
					if (!url) {
						const mdLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
						while ((match = mdLinkRegex.exec(line)) !== null) {
							if (cursor.ch >= match.index && cursor.ch <= match.index + match[0].length) {
								url = match[2] || '';
								break;
							}
						}
					}
				}

				// 如果找到了 URL，添加播放菜单
				if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
					menu.addItem((item) => {
						item
							.setTitle('Play in LangPlayer')
							.setIcon('play-circle')
							.onClick(() => {
								this.openUrl(url);
							});
					});
				}
			})
		);

		// 注册设置选项卡
		this.addSettingTab(new LinguaFlowSettingTab(this.app, this));

		// 初始化字幕样式
		this.initSubtitleStyles();

		console.log('[LinguaFlow] Plugin loaded');
	}

	onunload() {
		console.log('[LinguaFlow] Unloading plugin');
		
		// 关闭所有 LinguaFlow 视图
		this.app.workspace.detachLeavesOfType(LINGUA_FLOW_VIEW);
		
		// 清理缓存
		TextProcessor.clearCache();
	}

	/**
	 * 加载设置
	 */
	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		
		// 同步设置到 Store
		const store = useMediaStore.getState();
		store.setVideoFit(this.settings.videoFit);
		store.setShowInlineSubtitles(this.settings.showInlineSubtitles);
		store.updateSubtitleConfig({
			fontColor: this.settings.subtitleColor,
			translationColor: this.settings.subtitleTranslationColor,
			highlightColor: this.settings.subtitleHighlightColor,
			backgroundColor: this.settings.subtitleBackgroundColor
		});
	}

	/**
	 * 保存设置
	 */
	async saveSettings() {
		await this.saveData(this.settings);
	}

	/**
	 * 激活视图（如果不存在则创建）
	 */
	async activateView(): Promise<LinguaFlowView> {
		const { workspace } = this.app;

		// 查找已存在的视图
		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(LINGUA_FLOW_VIEW);

		if (leaves.length > 0) {
			// 使用已存在的视图
			leaf = leaves[0] || null;
		} else {
			// 创建新视图（在新标签页中打开）
			leaf = workspace.getLeaf('tab');
			if (leaf) {
				await leaf.setViewState({
					type: LINGUA_FLOW_VIEW,
					active: true,
				});
			}
		}

		// 显示视图
		if (leaf) {
			workspace.revealLeaf(leaf);
			return leaf.view as LinguaFlowView;
		}

		throw new Error('Failed to create view');
	}

	/**
	 * 激活字幕面板（如果不存在则创建）
	 */
	async activateSubtitlePanel(): Promise<SubtitlePanelView> {
		const { workspace } = this.app;

		// 查找已存在的字幕面板
		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(SUBTITLE_PANEL_VIEW_TYPE);

		if (leaves.length > 0) {
			// 使用已存在的面板
			leaf = leaves[0] || null;
		} else {
			// 根据设置选择打开位置
			const location = this.settings.subtitlePanelLocation || 'tab'; // 默认使用 tab
			console.log('[LangPlayer] Opening subtitle panel in location:', location);
			
			switch (location) {
				case 'right':
					// 右侧边栏
					leaf = workspace.getRightLeaf(false);
					break;
				case 'left':
					// 左侧边栏
					leaf = workspace.getLeftLeaf(false);
					break;
				case 'tab':
					// 新标签页（可自由拖动）
					leaf = workspace.getLeaf('tab');
					break;
				case 'split':
					// 分割视图
					leaf = workspace.getLeaf('split', 'vertical');
					break;
				default:
					// 默认：新标签页
					leaf = workspace.getLeaf('tab');
			}
			
			if (leaf) {
				await leaf.setViewState({
					type: SUBTITLE_PANEL_VIEW_TYPE,
					active: true,
				});
			}
		}

		// 显示面板
		if (leaf) {
			workspace.revealLeaf(leaf);
			return leaf.view as SubtitlePanelView;
		}

		throw new Error('Failed to create subtitle panel');
	}

	/**
	 * 打开本地文件
	 * @param file - 文件对象
	 * @param timestamp - 起始时间（秒）
	 */
	async openFile(file: TFile, timestamp?: number) {
		try {
			const view = await this.activateView();
			await view.loadFile(file, timestamp);
			new Notice(`Playing: ${file.name}`);
		} catch (error) {
			console.error('[LinguaFlow] Error opening file:', error);
			const msg = error instanceof Error ? error.message : 'Unknown error';
			new Notice(`Failed to open file: ${msg}`);
		}
	}

	/**
	 * 打开 URL（远程媒体）
	 * @param url - 媒体 URL
	 * @param timestamp - 起始时间（秒）
	 * @param title - 标题
	 */
	async openUrl(url: string, timestamp?: number, title?: string) {
		try {
			const view = await this.activateView();
			
			const source: MediaSource = {
				type: 'url',
				url,
				displayName: title || url,
				timestamp,
			};
			
			await view.loadMedia(source);
			new Notice(`Loading: ${title || 'Media'}`);
		} catch (error) {
			console.error('[LinguaFlow] Error opening URL:', error);
			const msg = error instanceof Error ? error.message : 'Unknown error';
			new Notice(`Failed to open URL: ${msg}`);
		}
	}

	/**
	 * 处理 Protocol Handler
	 * obsidian://linguaflow?src=...&t=...&title=...
	 */
	private async handleProtocol(params: ProtocolParams) {
		console.log('[LangPlayer] Protocol called:', params);

		if (!params.src) {
			new Notice('LangPlayer: Missing src parameter');
			return;
		}

		// 解析时间戳
		const timestamp = params.t ? parseTimestamp(params.t) : undefined;
		// 解码路径 (因为在生成链接时进行了 encodeURIComponent)
		const srcPath = decodeURIComponent(params.src);
		
		console.log(`[LangPlayer] Protocol Action: src=${srcPath}, t=${timestamp}`);

		// 判断是本地文件还是 URL
		if (srcPath.startsWith('http://') || srcPath.startsWith('https://')) {
			// 远程 URL
			await this.openUrl(srcPath, timestamp, params.title);
		} else {
			// 本地文件路径
			const file = this.app.vault.getAbstractFileByPath(srcPath);
			if (file instanceof TFile) {
				// 直接传递 timestamp 给 openFile，让其在加载时处理跳转
				await this.openFile(file, timestamp);
				
				// 如果视图已经存在且是同一个文件，openFile 可能不会重新触发加载
				// 所以这里保留一个额外的 seekTo 作为保险，但加长延迟
				if (timestamp !== undefined && timestamp >= 0) {
					const leaves = this.app.workspace.getLeavesOfType(LINGUA_FLOW_VIEW);
					const view = leaves[0]?.view as LinguaFlowView;
					if (view) {
						setTimeout(() => {
							// 只有当当前播放时间差距较大时才跳转，避免干扰
							if (Math.abs(view.getCurrentTime() - timestamp) > 1) {
								console.log(`[LangPlayer] Seeking to ${timestamp}s (backup)`);
								view.seekTo(timestamp);
							}
						}, 1000);
					}
				}
			} else {
				console.warn(`[LangPlayer] File not found: ${srcPath}`);
				new Notice(`File not found: ${srcPath}`);
			}
		}
	}
	
	/**
	 * 打开关联的学习笔记
	 * 如果不存在则创建，并在分割视图中打开
	 */
	async openStudyNote() {
		// 1. 获取当前正在播放的视频文件
		const view = this.app.workspace.getLeavesOfType(LINGUA_FLOW_VIEW)[0]?.view as LinguaFlowView;
		if (!view || !view.currentSource) {
			new Notice('❌ 请先播放一个视频');
			return;
		}

		// 使用局部变量以确保类型收窄
		const source = view.currentSource;
		const mediaName = source.displayName || 'Untitled Video';
		let noteName = mediaName;
		
		// 移除扩展名
		if (noteName && noteName.lastIndexOf('.') > -1) {
			noteName = noteName.substring(0, noteName.lastIndexOf('.'));
		}
		
		// 添加后缀
		noteName = `${noteName}_Study.md`;
		
		// 2. 确定笔记路径
		let notePath = noteName;
		let sourceFile: TFile | null = null;
		
		// 检查类型是否为 local
		if (source.type === 'local' && source.file) {
			sourceFile = source.file;
			if (sourceFile.parent) {
				notePath = `${sourceFile.parent.path}/${noteName}`;
			}
		}

		console.log(`[LangPlayer] Opening study note: ${notePath}`);

		// 3. 检查笔记是否存在
		let noteFile = this.app.vault.getAbstractFileByPath(notePath);
		
		if (!noteFile) {
			// 4. 不存在则创建
			try {
				// 获取用户自定义模板或使用默认模板
				// @ts-ignore - 忽略类型检查，确保 noteTemplate 已添加
				const templateRaw = this.settings.noteTemplate || '';
				
				// 准备变量
				const now = new Date();
				// YYYY-MM-DD HH:mm
				const dateStr = now.getFullYear() + '-' + 
					String(now.getMonth() + 1).padStart(2, '0') + '-' + 
					String(now.getDate()).padStart(2, '0') + ' ' + 
					String(now.getHours()).padStart(2, '0') + ':' + 
					String(now.getMinutes()).padStart(2, '0');
					
				const videoLink = `[[${source.type === 'local' ? sourceFile?.name : source.url}]]`;
				const videoUrl = source.url;

				// 执行替换
				const content = templateRaw
					.replace(/{{title}}/g, mediaName)
					.replace(/{{date}}/g, dateStr)
					.replace(/{{link}}/g, videoLink)
					.replace(/{{url}}/g, videoUrl);

				noteFile = await this.app.vault.create(notePath, content);
				new Notice('✅ 已创建学习笔记');
			} catch (error) {
				console.error('Failed to create study note:', error);
				new Notice('❌ 创建笔记失败');
				return;
			}
		}

		// 5. 在新分割视图中打开 (Split Right)
		if (noteFile instanceof TFile) {
			const leaves = this.app.workspace.getLeavesOfType('markdown');
			const existingLeaf = leaves.find(leaf => (leaf.view as any).file === noteFile);
			
			// 如果笔记已经打开，先关闭它（以便移动到右侧）
			if (existingLeaf) {
				existingLeaf.detach();
			}
			
			// 总是尝试在右侧分屏打开
			const leaf = this.app.workspace.getLeaf('split', 'vertical');
			await leaf.openFile(noteFile);
			this.app.workspace.setActiveLeaf(leaf, { focus: true });
		}
	}

	/**
	 * 加载外部字幕文件
	 */
	async loadExternalSubtitle() {
		// 创建文件选择器
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.srt,.vtt';
		
		input.onchange = async (e: Event) => {
			const target = e.target as HTMLInputElement;
			const file = target.files?.[0];
			
			if (file) {
				// 读取文件内容
				const reader = new FileReader();
				reader.onload = async (e: ProgressEvent<FileReader>) => {
					const content = e.target?.result as string;
					
					try {
						// 解析字幕
						const result = this.subtitleLoader.loadFromText(content, file.name);
						if (result && result.cues.length > 0) {
							// 将字幕加载到状态管理
							useMediaStore.getState().setSubtitles(result.cues);
							new Notice(`✅ 已加载 ${result.cues.length} 条字幕`);
						} else {
							new Notice('❌ 无法解析字幕文件');
						}
					} catch (error) {
						console.error('[LinguaFlow] Error loading subtitle:', error);
						const errorMsg = error instanceof Error ? error.message : String(error);
						new Notice('❌ 加载字幕失败: ' + errorMsg);
					}
				}
				
				reader.readAsText(file);
			}
		};
		
		input.click();
	}
	
	/**
	 * 检查文件是否为媒体文件
	 */
	private isMediaFile(file: TFile): boolean {
		const mediaExtensions = [
			// 视频格式
			'mp4', 'mkv', 'webm', 'ogv', 'avi', 'mov', 'flv', 'wmv', 'm4v', '3gp',
			// 音频格式
			'mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'wma', 'opus'
		];
		return mediaExtensions.includes(file.extension.toLowerCase());
	}

	/**
	 * 将字幕插入到当前笔记
	 * @param cue - 字幕对象
	 */
	async insertSubtitleToNote(cue: SubtitleCue) {
		const view = this.app.workspace.getLeavesOfType(LINGUA_FLOW_VIEW)[0]?.view as LinguaFlowView;
		if (!view || !view.currentSource) {
			new Notice('❌ 请先播放视频');
			return;
		}

		// 1. 尝试获取 Markdown 视图
		let targetView: MarkdownView | null = null;
		let activeLeaf = this.app.workspace.activeLeaf;

		// 情况A: 当前聚焦的就是 Markdown
		if (activeLeaf?.view.getViewType() === 'markdown') {
			targetView = activeLeaf.view as MarkdownView;
		} else {
			// 情况B: 查找最近使用的 Markdown 视图
			const leaves = this.app.workspace.getLeavesOfType('markdown');
			const visibleLeaves = leaves.filter(leaf => (leaf.view as any).containerEl.isShown?.() || leaf.view.containerEl.offsetParent !== null);
			
			if (visibleLeaves.length > 0 && visibleLeaves[0]) {
				targetView = visibleLeaves[0].view as MarkdownView;
			}
		}

		// 2. 如果还没找到视图，尝试自动打开学习笔记
		if (!targetView) {
			new Notice('未找到笔记，正在打开学习笔记...');
			await this.openStudyNote();
			
			// 等待一点时间让视图加载
			await new Promise(resolve => setTimeout(resolve, 500));
			
			// 再次尝试获取
			activeLeaf = this.app.workspace.activeLeaf;
			if (activeLeaf?.view.getViewType() === 'markdown') {
				targetView = activeLeaf.view as MarkdownView;
			}
		}

		if (targetView) {
			// 自动切换到编辑模式
			if (targetView.getMode() === 'preview') {
				await targetView.setState({ ...targetView.getState(), mode: 'source' }, { history: false });
				// 等待切换完成
				await new Promise(resolve => setTimeout(resolve, 100));
			}

			const editor = targetView.editor;
			if (!editor) {
				new Notice('❌ 无法获取编辑器实例');
				return;
			}

			// 3. 格式化内容
			const timeStr = formatTime(cue.start);
			const sourceUrl = view.currentSource.type === 'local' && view.currentSource.file 
				? view.currentSource.file.path 
				: view.currentSource.url;
				
			const link = `[${timeStr}](obsidian://linguaflow?src=${encodeURIComponent(sourceUrl)}&t=${Math.floor(cue.start)})`;
			
			// 获取当前显示的语言
			const { visibleLanguages } = useMediaStore.getState().subtitleConfig;
			const textsToExport: string[] = [];

			// 1. 优先使用多语言数据
			if (cue.languages && Object.keys(cue.languages).length > 0) {
				// 按照 visibleLanguages 的顺序导出
				visibleLanguages.forEach(lang => {
					const text = cue.languages?.[lang];
					if (text) {
						textsToExport.push(text);
					}
				});
			} else {
				// 2. 向后兼容逻辑
				// 如果 visibleLanguages 包含 'en' 且有英文文本
				if (visibleLanguages.includes('en') && cue.textEn) {
					textsToExport.push(cue.textEn);
				}
				// 如果 visibleLanguages 包含 'zh' 且有中文文本
				if (visibleLanguages.includes('zh') && cue.textZh) {
					textsToExport.push(cue.textZh);
				}
				
				// 如果没有命中任何特定语言，但有基础文本（单语字幕），且至少有一种语言可见
				if (textsToExport.length === 0 && visibleLanguages.length > 0 && cue.text) {
					// 避免重复：如果 text 等于 textEn 或 textZh 且已被添加，则不添加
					if (cue.text !== cue.textEn && cue.text !== cue.textZh) {
						textsToExport.push(cue.text);
					}
				}
			}

			// 如果没有选中文本（例如全部隐藏），为了防止插入空行，默认插入所有可用文本？
			// 不，用户说“只显示一种语言...就是显示的语言”。
			// 如果全隐藏，那就插入空文本（只带时间戳），或者用户根本不应该点击导出。
			// 但既然点了，我们还是保留时间戳。
			
			const contentText = textsToExport.join(' ');
			
			// 纯文本格式（带时间戳链接）：- [00:00] 文本
			let content = `- ${link}`;
			if (contentText) {
				content += ` ${contentText}`;
			}
			content += '\n';

			// 4. 插入到文档末尾（如果不在光标处）或者光标处
			// 如果编辑器刚打开，光标可能在开头。我们希望追加到末尾或特定位置。
			// 简单起见，插入到当前光标位置。
			
			// 检查光标是否在文件头且没有选区，如果是，移动到文件末尾
			const cursor = editor.getCursor();
			if (cursor.line === 0 && cursor.ch === 0 && !editor.somethingSelected() && editor.lineCount() > 1) {
				const lastLine = editor.lineCount() - 1;
				const lastLineLen = editor.getLine(lastLine).length;
				editor.setCursor({ line: lastLine, ch: lastLineLen });
				// 加个换行
				content = '\n' + content;
			}

			editor.replaceSelection(content);
			new Notice('✅ 字幕已插入笔记');
		} else {
			new Notice('❌ 无法找到或打开笔记视图');
		}
	}

	/**
	 * 初始化字幕样式
	 */
	private initSubtitleStyles(): void {
		const settings = this.settings;
		
		// 创建自定义样式
		const styleEl = document.createElement('style');
		styleEl.id = 'linguaflow-custom-subtitle-style';
		document.head.appendChild(styleEl);

		styleEl.textContent = `
			.linguaflow-subtitle-item-en,
			.linguaflow-subtitle-item-zh,
			.linguaflow-subtitle-item-main {
				font-size: ${settings.subtitleFontSize}px;
				font-weight: ${settings.subtitleFontWeight};
				line-height: ${settings.subtitleLineHeight};
			}
		`;
	}
}
