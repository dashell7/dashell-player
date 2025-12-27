import { Plugin, WorkspaceLeaf, Notice, TFile } from 'obsidian';
import { LinguaFlowView } from './views/LinguaFlowView';
import { SubtitlePanelView, SUBTITLE_PANEL_VIEW_TYPE } from './views/SubtitlePanelView';
import { LINGUA_FLOW_VIEW, type MediaSource, type ProtocolParams, type PlayerRef } from './types';
import { parseTimestamp } from './utils/fileUtils';
import { useMediaStore } from './store/mediaStore';
import { LinguaFlowSettings, DEFAULT_SETTINGS, LinguaFlowSettingTab } from './settings';
import { MediaInputModal } from './modals/MediaInputModal';
import { SubtitleLoader } from './services/SubtitleLoader';
import { TextProcessor } from './components/OptimizedWord';
import * as React from 'react';
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

		// 注册命令：设置 A 点（AB 循环起点）
		this.addCommand({
			id: 'set-point-a',
			name: 'Set point A (AB repeat)',
			hotkeys: [{ modifiers: [], key: 'A' }],
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
			hotkeys: [{ modifiers: [], key: 'B' }],
			callback: () => {
				const currentTime = useMediaStore.getState().currentTime;
				const pointA = useMediaStore.getState().pointA;
				if (pointA === null || currentTime <= pointA) {
					new Notice('⚠️ B点必须在A点之后');
					return;
				}
				useMediaStore.getState().setPointB(currentTime);
				new Notice(`🅱️ B点已设置: ${currentTime.toFixed(2)}s`);
			},
		});

		// 注册命令：启用/关闭 AB 循环
		this.addCommand({
			id: 'toggle-ab-repeat',
			name: 'Toggle AB repeat',
			hotkeys: [{ modifiers: [], key: 'R' }],
			callback: () => {
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
	 */
	async openFile(file: TFile) {
		try {
			const view = await this.activateView();
			await view.loadFile(file);
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
		console.log('[LinguaFlow] Protocol called:', params);

		if (!params.src) {
			new Notice('LinguaFlow: Missing src parameter');
			return;
		}

		// 解析时间戳
		const timestamp = params.t ? parseTimestamp(params.t) : undefined;

		// 判断是本地文件还是 URL
		if (params.src.startsWith('http://') || params.src.startsWith('https://')) {
			// 远程 URL
			await this.openUrl(params.src, timestamp, params.title);
		} else {
			// 本地文件路径
			const file = this.app.vault.getAbstractFileByPath(params.src);
			if (file instanceof TFile) {
				await this.openFile(file);
				
				// 跳转到指定时间
				if (timestamp && timestamp > 0) {
					const view = await this.activateView();
					setTimeout(() => {
						view.seekTo(timestamp);
					}, 1000);
				}
			} else {
				new Notice(`File not found: ${params.src}`);
			}
		}
	}

	/**
	 * 加载外部字幕文件
	 */
	async loadExternalSubtitle() {
		// 创建文件选择器
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.srt,.vtt,.ass,text/srt,text/vtt,text/ass';
		
		input.addEventListener('change', async (e) => {
			const files = (e.target as HTMLInputElement).files;
			if (files && files.length > 0) {
				const file = files[0];
				if (file) {
					try {
						// 读取文件内容
						const text = await file.text();
						
						// 使用 SubtitleLoader 的 loadFromText 方法
						const result = await this.subtitleLoader.loadFromText(text, file.name);
						
						if (result && result.cues.length > 0) {
							// 将字幕加载到状态管理
							useMediaStore.getState().setSubtitles(result.cues);
							new Notice(`已加载 ${result.cues.length} 条字幕`);
						} else {
							new Notice('无法解析字幕文件');
						}
					} catch (error) {
						console.error('[LinguaFlow] Error loading subtitle:', error);
						const errorMsg = error instanceof Error ? error.message : String(error);
						new Notice('加载字幕失败: ' + errorMsg);
					}
				}
			}
		});
		
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
