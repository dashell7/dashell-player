import { ItemView, WorkspaceLeaf, Notice } from 'obsidian';
import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
import type LinguaFlowPlugin from '../main';
import { useMediaStore, selectCurrentSubtitle } from '../store/mediaStore';
import type { SubtitleCue, PlayerRef } from '../types';
import type { UseRecordingSessionReturn } from '../hooks/useRecordingSession';

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
import { useRecordingSession } from '../hooks/useRecordingSession';
import { SubtitleItem } from '../components/SubtitleItem';
import { AutoHeightVirtualScroll } from '../components/VirtualScroll';
import { useResizeObserver } from '../hooks/useResizeObserver';

const SubtitlePanelContent: React.FC<SubtitlePanelContentProps> = ({ plugin }) => {
	// 创建独立的录音会话
	const recordingSession = useRecordingSession(plugin);
	
	const subtitles = useMediaStore(state => state.subtitles);
	const activeIndex = useMediaStore(state => state.activeIndex);
	const activeWordIndex = useMediaStore(state => state.activeWordIndex);
	const currentSubtitle = useMediaStore(selectCurrentSubtitle);
	
	// 只订阅需要的字段，避免不必要的重渲染
	const showEnglish = useMediaStore(state => state.subtitleConfig.showEnglish);
	const showChinese = useMediaStore(state => state.subtitleConfig.showChinese);
	const showIndexAndTime = useMediaStore(state => state.subtitleConfig.showIndexAndTime);
	const wordByWordHighlight = useMediaStore(state => state.subtitleConfig.wordByWordHighlight);
	
	const segmentLoopEnabled = useMediaStore(state => state.segmentLoopEnabled);
	const segmentLoopCurrent = useMediaStore(state => state.segmentLoopCurrent);
	const segmentLoopTotal = useMediaStore(state => state.segmentLoopTotal);
	const loopStart = useMediaStore(state => state.loopStart);
	const loopEnd = useMediaStore(state => state.loopEnd);
	const setActiveIndex = useMediaStore(state => state.setActiveIndex);
	
	const virtualListRef = React.useRef<any>(null);
	const activeItemRef = React.useRef<HTMLDivElement>(null);
	
	// 使用 ResizeObserver 监听容器高度
	const { ref: resizeRef, height: containerHeight } = useResizeObserver<HTMLDivElement>();

	const [selectedCue, setSelectedCue] = React.useState<SubtitleCue | null>(null);
	const [isManuallyLocked, setIsManuallyLocked] = React.useState(false);
	const [isHovering, setIsHovering] = React.useState(false);
	
	// 监控时间跳跃，自动解锁字幕
	const lastTimeRef = React.useRef<number>(0);
	const currentTime = useMediaStore(state => state.currentTime);
	React.useEffect(() => {
		const timeDiff = Math.abs(currentTime - lastTimeRef.current);
		// 如果时间跳跃超过2秒，认为是用户拖动时间轴，自动解锁
		if (timeDiff > 2 && isManuallyLocked) {
			// console.log('[SubtitlePanel] 🎯 Large time jump detected:', timeDiff, 's - Unlocking');
			setIsManuallyLocked(false);
		}
		lastTimeRef.current = currentTime;
	}, [currentTime, isManuallyLocked]);

	// 智能滚动到当前激活的字幕
	React.useEffect(() => {
		if (isHovering && !segmentLoopEnabled) return;
		
		if (virtualListRef.current && activeIndex >= 0) {
			// 将活动字幕滚动到视图顶部约 30% 的位置
			const offset = containerHeight * 0.3;
			
			virtualListRef.current.scrollToIndex(activeIndex, {
				behavior: 'smooth',
				offset
			});
		}
	}, [activeIndex, isHovering, segmentLoopEnabled, containerHeight]);

	// 自动跟随当前播放的字幕
	React.useEffect(() => {
		if (!isManuallyLocked && currentSubtitle) {
			setSelectedCue(currentSubtitle);
		}
	}, [currentSubtitle, isManuallyLocked]);

	// 处理字幕单击 - 选中字幕
	const handleSubtitleClick = React.useCallback((cue: SubtitleCue) => {
		// 如果点击的是当前选中的字幕，切换播放/暂停
		if (selectedCue?.id === cue.id) {
			const isPlaying = useMediaStore.getState().playing;
			if (isPlaying && plugin.playerRef?.current) {
				// 正在播放 → 暂停
				plugin.playerRef.current.pauseVideo();
				useMediaStore.getState().setPlaying(false);
			} else if (plugin.playerRef?.current) {
				// 已暂停 → 播放
				plugin.playerRef.current.playVideo();
				useMediaStore.getState().setPlaying(true);
			}
			// 保持锁定状态
		} else {
			// 点击其他字幕：锁定并处理播放状态
			setSelectedCue(cue);
			setIsManuallyLocked(true);
			
			// 如果视频正在播放，暂停并跳转到该字幕
			const isPlaying = useMediaStore.getState().playing;
			if (isPlaying && plugin.playerRef?.current) {
				plugin.playerRef.current.pauseVideo();
				useMediaStore.getState().setPlaying(false);
				plugin.playerRef.current.seekTo(cue.start);
			} else if (plugin.playerRef?.current) {
				// 如果已暂停，只跳转不播放
				plugin.playerRef.current.seekTo(cue.start);
			}
		}
	}, [selectedCue, plugin]);

	// 处理字幕双击 - 跳转播放并解锁
	const handleSubtitleDoubleClick = React.useCallback((cue: SubtitleCue) => {
		setSelectedCue(cue);
		setIsManuallyLocked(false); // 双击后解锁，跟随播放
		
		// 跳转到该字幕位置
		if (plugin.playerRef?.current) {
			plugin.playerRef.current.seekTo(cue.start);
			plugin.playerRef.current.playVideo();
			useMediaStore.getState().setPlaying(true);
		}
		
		// 更新activeIndex
		const index = subtitles.findIndex(s => s.id === cue.id);
		if (index >= 0) {
			setActiveIndex(index);
		}
	}, [plugin, subtitles, setActiveIndex]);

	// 处理单句录音
	const handleRecordSegment = React.useCallback(async (cue: SubtitleCue, e?: React.MouseEvent) => {
		e?.stopPropagation();
		if (!recordingSession) return;
		
		const { isRecording, targetSubtitle, startRecording, stopRecording } = recordingSession;
		
		// 如果正在录音且是当前句，则停止
		if (isRecording && targetSubtitle?.id === cue.id) {
			await stopRecording();
		} else {
			// 否则开始录音
			if (plugin.playerRef?.current) {
				plugin.playerRef.current.pauseVideo?.();
			}
			// 停止单句循环（如果正在循环）
			const { segmentLoopEnabled } = useMediaStore.getState();
			if (segmentLoopEnabled) {
				useMediaStore.getState().stopSegmentLoop();
			}
			
			await startRecording(cue);
		}
	}, [recordingSession, plugin]);

	// 处理单词点击查词
	const handleWordClick = React.useCallback(async (word: string, e: React.MouseEvent) => {
		e.stopPropagation();
		
		// 清理单词（去除标点符号）
		const cleanWord = word.replace(/[.,;:!?'"()[\]{}]/g, '').trim();
		if (!cleanWord) return;
		
		const app = (plugin as any).app;
		if (!app) return;
		
		try {
			// 根据设置决定是否复制到剪切板
			if (plugin.settings.autoCopyWordOnLookup && navigator.clipboard) {
				await navigator.clipboard.writeText(cleanWord);
			}
			
			// 查找 obsidian-language-learner 插件
			const installedPlugins = app.plugins?.plugins;
			const languageLearnerPlugin = installedPlugins?.['obsidian-language-learner'];
			
			if (!languageLearnerPlugin) {
				new Notice('未找到 Language Learner 插件');
				return;
			}
			
			// 检查插件是否已启用
			if (!app.plugins?.enabledPlugins?.has?.('obsidian-language-learner')) {
				new Notice('Language Learner 插件未启用');
				return;
			}
			
			// 根据设置决定是否打开录入面板
			const openPanel = plugin.settings.openLanguageLearnerPanel;
			const target = e.target as HTMLElement;
			
			if (typeof languageLearnerPlugin.queryWord === 'function') {
				if (openPanel) {
					// 传递 target 参数，打开录入面板并填充例句
					languageLearnerPlugin.queryWord(cleanWord, target);
				} else {
					// 不传递 target，只查词不打开面板
					languageLearnerPlugin.queryWord(cleanWord);
				}
				new Notice(`🔍 查询: ${cleanWord}`);
			}
		} catch (error) {
			console.error('[SubtitlePanel] Error calling Language Learner:', error);
			new Notice('调用 Language Learner 失败');
		}
	}, [plugin]);

	// 处理字幕导出
	const handleExportSubtitle = React.useCallback((cue: SubtitleCue, e: React.MouseEvent) => {
		e.stopPropagation();
		if (plugin) {
			plugin.insertSubtitleToNote(cue);
		}
	}, [plugin]);
	
	// 处理右键菜单
	const handleSubtitleContextMenu = React.useCallback((cue: SubtitleCue, e: React.MouseEvent) => {
		e.preventDefault();
		const { Menu } = require('obsidian');
		const menu = new Menu();
		
		menu.addItem((item: any) => {
			item
				.setTitle('📝 插入到笔记')
				.setIcon('pencil')
				.onClick(() => {
					if (plugin) {
						plugin.insertSubtitleToNote(cue);
					}
				});
		});

		menu.addSeparator();

		menu.addItem((item: any) => {
			item
				.setTitle('▶️ 跳转播放')
				.setIcon('play')
				.onClick(() => {
					if (plugin.playerRef?.current) {
						plugin.playerRef.current.seekTo(cue.start);
						plugin.playerRef.current.playVideo();
						useMediaStore.getState().setPlaying(true);
					}
				});
		});
		
		menu.showAtMouseEvent(e.nativeEvent);
	}, [plugin]);

	// 渲染单个字幕项
	const renderSubtitleItem = React.useCallback((cue: SubtitleCue, index: number) => {
		const isLoopingThis = segmentLoopEnabled && 
			useMediaStore.getState().loopStart === cue.start && 
			useMediaStore.getState().loopEnd === cue.end;
		const isRecordingThis = recordingSession?.isRecording && recordingSession?.targetSubtitle?.id === cue.id;
		const isSelected = selectedCue?.id === cue.id;

		return (
			<SubtitleItem
				key={cue.id}
				cue={cue}
				index={index}
				isActive={index === activeIndex}
				isLooping={!!isLoopingThis}
				isRecording={!!isRecordingThis}
				isSelected={isSelected}
				showEnglish={showEnglish}
				showChinese={showChinese}
				showIndexAndTime={showIndexAndTime}
				wordByWordHighlight={wordByWordHighlight}
				activeWordIndex={index === activeIndex ? activeWordIndex : -1}
				visibleLanguages={useMediaStore.getState().subtitleConfig.visibleLanguages}
				onSubtitleClick={handleSubtitleClick}
				onSubtitleDblClick={handleSubtitleDoubleClick}
				onSubtitleContextMenu={handleSubtitleContextMenu}
				onWordClick={handleWordClick}
				onExportSubtitle={handleExportSubtitle}
				activeItemRef={index === activeIndex ? activeItemRef : undefined}
			/>
		);
	}, [
		activeIndex, activeWordIndex, segmentLoopEnabled, 
		recordingSession?.isRecording, recordingSession?.targetSubtitle?.id,
		selectedCue?.id, showEnglish, showChinese, showIndexAndTime, wordByWordHighlight,
		handleSubtitleClick, handleSubtitleDoubleClick, handleSubtitleContextMenu, 
		handleWordClick, handleExportSubtitle
	]);

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
			<div 
				className="linguaflow-subtitle-list-scrollable" 
				ref={resizeRef}
				style={{ overflow: 'hidden' }}
				onMouseEnter={() => setIsHovering(true)}
				onMouseLeave={() => setIsHovering(false)}
			>
				{containerHeight > 0 && (
					<AutoHeightVirtualScroll
						ref={virtualListRef}
						items={subtitles}
						estimatedItemHeight={80} // 预估每个字幕项高度
						containerHeight={containerHeight} // 动态容器高度
						overscan={3} // 上下各额外渲染3个项目
						renderItem={renderSubtitleItem}
						getItemKey={(cue) => cue.id}
						className="linguaflow-subtitle-items"
					/>
				)}
			</div>
		</div>
	);
};

