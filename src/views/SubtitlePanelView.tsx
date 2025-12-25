import { ItemView, WorkspaceLeaf, Notice } from 'obsidian';
import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
import type LinguaFlowPlugin from '../main';
import { useMediaStore, selectCurrentSubtitle } from '../store/mediaStore';
import type { SubtitleCue, PlayerRef } from '../types';

export const SUBTITLE_PANEL_VIEW_TYPE = 'linguaflow-subtitle-panel';

/**
 * 字幕面板视图 - 可拖动的独立面板
 */
export class SubtitlePanelView extends ItemView {
	plugin: LinguaFlowPlugin;
	root: ReactDOM.Root | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: LinguaFlowPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return SUBTITLE_PANEL_VIEW_TYPE;
	}

	getDisplayText(): string {
		return '字幕列表';
	}

	getIcon(): string {
		return 'subtitles';
	}

	async onOpen() {
		const container = this.containerEl.children[1];
		if (!container) return;
		
		container.empty();
		
		// 创建React根容器
		const rootEl = container.createDiv({ cls: 'linguaflow-subtitle-panel-root' });
		this.root = ReactDOM.createRoot(rootEl);
		
		// 渲染React组件
		this.renderSubtitlePanel();
	}

	async onClose() {
		if (this.root) {
			this.root.unmount();
			this.root = null;
		}
	}

	/**
	 * 渲染字幕面板
	 */
	renderSubtitlePanel() {
		if (!this.root) return;

		this.root.render(
			React.createElement(SubtitlePanelContent, {
				plugin: this.plugin,
			})
		);
	}

	/**
	 * 刷新面板
	 */
	refresh() {
		this.renderSubtitlePanel();
	}
}

/**
 * 字幕面板内容组件
 */
interface SubtitlePanelContentProps {
	plugin: LinguaFlowPlugin;
}

const SubtitlePanelContent: React.FC<SubtitlePanelContentProps> = ({ plugin }) => {
	const subtitles = useMediaStore(state => state.subtitles);
	const activeIndex = useMediaStore(state => state.activeIndex);
	const activeWordIndex = useMediaStore(state => state.activeWordIndex);
	const currentSubtitle = useMediaStore(selectCurrentSubtitle);
	
	// 只订阅需要的字段，避免不必要的重渲染
	const showEnglish = useMediaStore(state => state.subtitleConfig.showEnglish);
	const showChinese = useMediaStore(state => state.subtitleConfig.showChinese);
	const showIndexAndTime = useMediaStore(state => state.subtitleConfig.showIndexAndTime);
	
	const segmentLoopEnabled = useMediaStore(state => state.segmentLoopEnabled);
	const setActiveIndex = useMediaStore(state => state.setActiveIndex);
	
	const listRef = React.useRef<HTMLDivElement>(null);
	const activeItemRef = React.useRef<HTMLDivElement>(null);
	
	const [selectedCue, setSelectedCue] = React.useState<SubtitleCue | null>(null);
	const [isManuallyLocked, setIsManuallyLocked] = React.useState(false);

	// 智能滚动到当前激活的字幕（优化版）
	React.useEffect(() => {
		if (!isManuallyLocked && activeItemRef.current && listRef.current) {
			const container = listRef.current;
			const item = activeItemRef.current;
			
			const containerRect = container.getBoundingClientRect();
			const itemRect = item.getBoundingClientRect();
			
			// 定义安全区域（顶部和底部各留 20% 的缓冲空间）
			const bufferTop = containerRect.top + containerRect.height * 0.2;
			const bufferBottom = containerRect.bottom - containerRect.height * 0.2;
			
			// 只在字幕即将离开可视区域时才滚动
			if (itemRect.top < bufferTop) {
				item.scrollIntoView({ behavior: 'smooth', block: 'start' });
			} else if (itemRect.bottom > bufferBottom) {
				item.scrollIntoView({ behavior: 'smooth', block: 'end' });
			}
		}
	}, [activeIndex, isManuallyLocked]);

	// 自动跟随当前播放的字幕
	React.useEffect(() => {
		if (!isManuallyLocked && currentSubtitle) {
			setSelectedCue(currentSubtitle);
		}
	}, [currentSubtitle, isManuallyLocked]);

	// 处理字幕点击
	const handleSubtitleClick = (cue: SubtitleCue) => {
		setSelectedCue(cue);
		setIsManuallyLocked(true);
		
		// 跳转到该字幕位置
		if (plugin.playerRef?.current) {
			plugin.playerRef.current.seekTo(cue.start);
		}
		
		// 更新activeIndex
		const index = subtitles.findIndex(s => s.id === cue.id);
		if (index >= 0) {
			setActiveIndex(index);
		}
	};

	// 格式化时间
	const formatTime = (seconds: number): string => {
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	};

	// 处理单词点击查词
	const handleWordClick = async (word: string, e: React.MouseEvent) => {
		e.stopPropagation();
		
		// 清理单词（去除标点符号）
		const cleanWord = word.replace(/[.,;:!?'"()[\]{}]/g, '').trim();
		if (!cleanWord) return;
		
		console.log('[SubtitlePanel] Word clicked:', cleanWord);
		
		const app = (plugin as any).app;
		if (!app) {
			new Notice('无法访问 Obsidian App');
			return;
		}
		
		try {
			// 将单词复制到剪贴板（始终执行，作为后备）
			if (navigator.clipboard) {
				await navigator.clipboard.writeText(cleanWord);
				console.log('[SubtitlePanel] Word copied to clipboard:', cleanWord);
			}
			
			// 查找 obsidian-language-learner 插件
			const installedPlugins = app.plugins?.plugins;
			const languageLearnerPlugin = installedPlugins?.['obsidian-language-learner'];
			
			if (!languageLearnerPlugin) {
				new Notice('未找到 Language Learner 插件，请确保已安装并启用');
				console.warn('[SubtitlePanel] obsidian-language-learner plugin not found');
				console.log('[SubtitlePanel] Available plugins:', Object.keys(installedPlugins || {}));
				return;
			}
			
			console.log('[SubtitlePanel] Found obsidian-language-learner plugin');
			
			// 检查插件是否已启用
			if (!app.plugins?.enabledPlugins?.has?.('obsidian-language-learner')) {
				new Notice('Language Learner 插件未启用，请在设置中启用该插件');
				return;
			}
			
			// 根据设置决定是否打开录入面板
			const openPanel = plugin.settings.openLanguageLearnerPanel;
			const target = e.target as HTMLElement;
			
			console.log('[SubtitlePanel] Calling queryWord, openPanel:', openPanel);
			
			if (typeof languageLearnerPlugin.queryWord === 'function') {
				if (openPanel) {
					// 传递 target 参数，打开录入面板并填充例句
					languageLearnerPlugin.queryWord(cleanWord, target);
					console.log('[SubtitlePanel] Called queryWord with panel');
				} else {
					// 不传递 target，只查词不打开面板
					languageLearnerPlugin.queryWord(cleanWord);
					console.log('[SubtitlePanel] Called queryWord without panel');
				}
				new Notice(`🔍 查询: ${cleanWord}`);
			} else {
				new Notice('Language Learner 插件版本不兼容');
				console.error('[SubtitlePanel] queryWord method not found');
			}
		} catch (error) {
			console.error('[SubtitlePanel] Error calling Language Learner:', error);
			new Notice('调用 Language Learner 失败，单词已复制到剪贴板');
		}
	};

	// 渲染可点击的文本（支持逐词高亮和单词查询）
	const renderClickableText = (text: string, isActive: boolean, wordIndex: number) => {
		// 使用正则分割，保留空格和标点符号
		const tokens = text.split(/(\s+)/);
		
		let wordCount = 0;
		
		return (
			<span className="stns">
				{tokens.map((token, index) => {
					// 如果是空白字符，直接返回
					if (/^\s+$/.test(token)) {
						return <React.Fragment key={index}>{token}</React.Fragment>;
					}
					
					// 这是一个单词
					const shouldHighlight = isActive && wordCount === wordIndex;
					const currentWordIndex = wordCount;
					wordCount++;
					
					return (
						<React.Fragment key={index}>
							<span
								className={`linguaflow-clickable-word ${shouldHighlight ? 'linguaflow-word-highlight' : ''}`}
								onClick={(e) => handleWordClick(token, e)}
								title={`查询: ${token}`}
							>
								{token}
							</span>
						</React.Fragment>
					);
				})}
			</span>
		);
	};

	if (subtitles.length === 0) {
		return (
			<div className="linguaflow-subtitle-panel-empty">
				<div className="linguaflow-empty-icon">📝</div>
				<p>暂无字幕</p>
				<p className="linguaflow-empty-hint">播放带有字幕的视频后，字幕会显示在这里</p>
			</div>
		);
	}

	return (
		<div className="linguaflow-subtitle-panel-content">
			{/* 字幕列表 */}
			<div className="linguaflow-subtitle-list-scrollable" ref={listRef}>
				<div className="linguaflow-subtitle-list-header">
					<h3>字幕列表</h3>
					<span className="linguaflow-subtitle-count">
						{subtitles.length} 条字幕
					</span>
				</div>

				<div className="linguaflow-subtitle-items">
					{subtitles.map((cue, index) => {
						const isLoopingThis = segmentLoopEnabled && 
							useMediaStore.getState().loopStart === cue.start && 
							useMediaStore.getState().loopEnd === cue.end;
						const isSelected = selectedCue?.id === cue.id;

						return (
							<div
								key={cue.id}
								ref={index === activeIndex ? activeItemRef : null}
								className={`linguaflow-subtitle-item ${
									index === activeIndex ? 'active' : ''
								} ${isLoopingThis ? 'looping' : ''} ${isSelected ? 'selected' : ''}`}
								onClick={() => handleSubtitleClick(cue)}
							>
								<div className="linguaflow-subtitle-item-header">
									{showIndexAndTime && (
										<>
											<span className="linguaflow-subtitle-index">
												#{index + 1}
											</span>
											<span className="linguaflow-subtitle-time">
												{formatTime(cue.start)} → {formatTime(cue.end)}
											</span>
										</>
									)}
									{isSelected && (
										<span className="linguaflow-selected-indicator" title="已选中">
											●
										</span>
									)}
									{isLoopingThis && (
										<span className="linguaflow-loop-badge">循环中</span>
									)}
								</div>

								<div className="linguaflow-subtitle-item-text">
									{cue.textEn && showEnglish && (
										<div className="linguaflow-subtitle-item-en">
											{renderClickableText(cue.textEn, index === activeIndex, activeWordIndex)}
										</div>
									)}
									{cue.textZh && showChinese && (
										<div className="linguaflow-subtitle-item-zh">{cue.textZh}</div>
									)}
									{!cue.textEn && !cue.textZh && (
										<div className="linguaflow-subtitle-item-main">
											{renderClickableText(cue.text, index === activeIndex, activeWordIndex)}
										</div>
									)}
								</div>
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);
};
