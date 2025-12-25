import { Plugin, WorkspaceLeaf, Notice, TFile } from 'obsidian';
import { LinguaFlowView } from './views/LinguaFlowView';
import { SubtitlePanelView, SUBTITLE_PANEL_VIEW_TYPE } from './views/SubtitlePanelView';
import { LINGUA_FLOW_VIEW, type MediaSource, type ProtocolParams, type PlayerRef } from './types';
import { parseTimestamp, isYouTubeUrl } from './utils/fileUtils';
import { useMediaStore } from './store/mediaStore';
import { LinguaFlowSettings, DEFAULT_SETTINGS, LinguaFlowSettingTab } from './settings';
import { MediaInputModal } from './modals/MediaInputModal';
import { SubtitleLoader } from './services/SubtitleLoader';
import { TextProcessor } from './components/OptimizedWord';
import * as React from 'react';

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
		this.addRibbonIcon('play-circle', 'Open LinguaFlow Player', () => {
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
							.setTitle('Play in LinguaFlow')
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
			// 创建新面板（在右侧边栏打开）
			leaf = workspace.getRightLeaf(false);
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
	 * 打开 URL（YouTube 或其他）
	 * @param url - 媒体 URL
	 * @param timestamp - 起始时间（秒）
	 * @param title - 标题
	 */
	async openUrl(url: string, timestamp?: number, title?: string) {
		try {
			const view = await this.activateView();
			
			const source: MediaSource = {
				type: isYouTubeUrl(url) ? 'youtube' : 'url',
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
			// URL（YouTube 或其他）
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
	 * 检查文件是否为媒体文件
	 */
	private isMediaFile(file: TFile): boolean {
		const mediaExtensions = ['mp4', 'webm', 'ogv', 'mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'];
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
