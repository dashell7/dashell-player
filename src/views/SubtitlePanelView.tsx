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

import { ClickableText } from '../components/OptimizedWord';

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

	// 智能滚动到当前激活的字幕 - 始终保持在第二行位置
	React.useEffect(() => {
		console.log('[SubtitlePanel] Scroll Effect Triggered', {
			activeIndex,
			isManuallyLocked,
			hasActiveItemRef: !!activeItemRef.current,
			hasListRef: !!listRef.current
		});
		
		if (!isManuallyLocked && activeItemRef.current && listRef.current) {
			const container = listRef.current;
			const item = activeItemRef.current;
			
			// 获取单个字幕项的高度
			const itemHeight = item.offsetHeight;
			
			// 修正：要显示在第二行，意味着我们需要滚动到"上一条字幕"的顶部位置
			// 如果没有上一条（第一句），就滚动到0
			
			let targetScrollTop = 0;
			
			// 尝试获取上一条字幕元素
			const prevItem = item.previousElementSibling as HTMLElement;
			
			if (prevItem) {
				// 如果有上一条，滚动到上一条的顶部
				// 这样上一条会在第一行，当前条就在第二行
				targetScrollTop = prevItem.offsetTop;
			} else {
				// 如果是第一条，滚动到顶部
				targetScrollTop = 0;
			}
			
			console.log('[SubtitlePanel] 🎯 Scrolling to Second Line:', {
				activeIndex,
				itemHeight,
				itemOffsetTop: item.offsetTop,
				prevItemOffsetTop: prevItem?.offsetTop,
				targetScrollTop,
				currentScrollTop: container.scrollTop
			});
			
			// 平滑滚动到目标位置
			container.scrollTo({
				top: targetScrollTop,
				behavior: 'smooth'
			});
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
			<div className="linguaflow-subtitle-list-scrollable">
				<div className="linguaflow-subtitle-items" ref={listRef}>
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
											<ClickableText
												text={cue.textEn}
												isActive={index === activeIndex}
												activeWordIndex={activeWordIndex}
												onWordClick={handleWordClick}
											/>
										</div>
									)}
									{cue.textZh && showChinese && (
										<div className="linguaflow-subtitle-item-zh">{cue.textZh}</div>
									)}
									{!cue.textEn && !cue.textZh && (
										<div className="linguaflow-subtitle-item-main">
											<ClickableText
												text={cue.text}
												isActive={index === activeIndex}
												activeWordIndex={activeWordIndex}
												onWordClick={handleWordClick}
											/>
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
