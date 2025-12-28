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
	
	// 调试：监控activeIndex变化
	React.useEffect(() => {
		console.log('[SubtitlePanel] activeIndex changed:', activeIndex, 'wordIndex:', activeWordIndex);
	}, [activeIndex, activeWordIndex]);
	
	const listRef = React.useRef<HTMLDivElement>(null);
	const activeItemRef = React.useRef<HTMLDivElement>(null);
	
	const [selectedCue, setSelectedCue] = React.useState<SubtitleCue | null>(null);
	const [isManuallyLocked, setIsManuallyLocked] = React.useState(false);
	
	// 监控时间跳跃，自动解锁字幕
	const lastTimeRef = React.useRef<number>(0);
	const currentTime = useMediaStore(state => state.currentTime);
	React.useEffect(() => {
		const timeDiff = Math.abs(currentTime - lastTimeRef.current);
		// 如果时间跳跃超过2秒，认为是用户拖动时间轴，自动解锁
		if (timeDiff > 2 && isManuallyLocked) {
			console.log('[SubtitlePanel] 🎯 Large time jump detected:', timeDiff, 's - Unlocking');
			setIsManuallyLocked(false);
		}
		lastTimeRef.current = currentTime;
	}, [currentTime, isManuallyLocked]);

	// 智能滚动到当前激活的字幕 - 始终保持在第二行位置
	React.useEffect(() => {
		console.log('[SubtitlePanel] Scroll Effect Triggered', {
			activeIndex,
			isManuallyLocked,
			hasActiveItemRef: !!activeItemRef.current,
			hasListRef: !!listRef.current
		});
		
		// 移除 !isManuallyLocked 条件，让滚动始终生效
		if (activeItemRef.current && listRef.current) {
			const container = listRef.current;
			const item = activeItemRef.current;
			
			// 获取单个字幕项的高度和容器高度
			const itemHeight = item.offsetHeight;
			const containerHeight = container.clientHeight;
			
			// 计算目标滚动位置：将当前字幕置于容器高度的 40% 处
			// 这样上方留有空间显示前一条字幕，下方有更多空间预读后文
			let targetScrollTop = item.offsetTop - (containerHeight * 0.4);
			
			// 确保不越界
			if (targetScrollTop < 0) targetScrollTop = 0;
			
			// 平滑滚动到目标位置
			container.scrollTo({
				top: targetScrollTop,
				behavior: 'smooth'
			});
		}
	}, [activeIndex]); // 移除 isManuallyLocked 依赖

	// 自动跟随当前播放的字幕
	React.useEffect(() => {
		if (!isManuallyLocked && currentSubtitle) {
			setSelectedCue(currentSubtitle);
		}
	}, [currentSubtitle, isManuallyLocked]);

	// 处理字幕单击 - 选中字幕
	const handleSubtitleClick = (cue: SubtitleCue) => {
		console.log('[SubtitlePanel] Click - Select:', cue.start);
		
		// 如果点击的是当前选中的字幕，切换播放/暂停
		if (selectedCue?.id === cue.id) {
			const isPlaying = useMediaStore.getState().playing;
			if (isPlaying && plugin.playerRef?.current) {
				// 正在播放 → 暂停
				plugin.playerRef.current.pauseVideo();
				useMediaStore.getState().setPlaying(false);
				console.log('[SubtitlePanel] Toggled to pause');
			} else if (plugin.playerRef?.current) {
				// 已暂停 → 播放
				plugin.playerRef.current.playVideo();
				useMediaStore.getState().setPlaying(true);
				console.log('[SubtitlePanel] Toggled to play');
			}
			// 保持锁定状态
		} else {
			// 点击其他字幕：锁定并处理播放状态
			setSelectedCue(cue);
			setIsManuallyLocked(true);
			console.log('[SubtitlePanel] Locked to:', cue.start);
			
			// 如果视频正在播放，暂停并跳转到该字幕
			const isPlaying = useMediaStore.getState().playing;
			if (isPlaying && plugin.playerRef?.current) {
				plugin.playerRef.current.pauseVideo();
				useMediaStore.getState().setPlaying(false);
				plugin.playerRef.current.seekTo(cue.start);
				console.log('[SubtitlePanel] Paused and seeked to:', cue.start);
			} else if (plugin.playerRef?.current) {
				// 如果已暂停，只跳转不播放
				plugin.playerRef.current.seekTo(cue.start);
				console.log('[SubtitlePanel] Seeked to (paused):', cue.start);
			}
		}
	};

	// 处理字幕双击 - 跳转播放并解锁
	const handleSubtitleDoubleClick = (cue: SubtitleCue) => {
		console.log('[SubtitlePanel] Double Click - Jump and play:', cue.start);
		setSelectedCue(cue);
		setIsManuallyLocked(false); // 双击后解锁，跟随播放
		
		// 跳转到该字幕位置
		if (plugin.playerRef?.current) {
			plugin.playerRef.current.seekTo(cue.start);
			plugin.playerRef.current.playVideo(); // ✅ 添加播放
			useMediaStore.getState().setPlaying(true); // ✅ 更新状态
			console.log('[SubtitlePanel] Seeked to:', cue.start, 'and playing');
		} else {
			console.warn('[SubtitlePanel] Player ref is null');
		}
		
		// 更新activeIndex
		const index = subtitles.findIndex(s => s.id === cue.id);
		if (index >= 0) {
			setActiveIndex(index);
		}
	};

	// 处理单句播放
	const handlePlaySegment = (cue: SubtitleCue, e?: React.MouseEvent) => {
		e?.stopPropagation();
		console.log('[SubtitlePanel] Play segment:', cue.text);
		
		if (plugin.playerRef?.current) {
			plugin.playerRef.current.seekTo(cue.start);
			plugin.playerRef.current.playVideo?.();
			useMediaStore.getState().playSegment(cue.start, cue.end);
		}
	};

	// 处理单句循环播放
	const handleSegmentLoop = (cue: SubtitleCue, e?: React.MouseEvent) => {
		e?.stopPropagation();
		
		const loopCount = plugin.settings.loopCount ?? -1;
		console.log('[SubtitlePanel] Start segment loop:', cue.text, 'Count:', loopCount, 'Index:', cue.index);
		
		if (plugin.playerRef?.current) {
			plugin.playerRef.current.seekTo(cue.start);
			plugin.playerRef.current.playVideo?.();
			useMediaStore.getState().startSegmentLoop(cue.start, cue.end, loopCount, cue.index);
		}
	};

	// 处理单句录音
	const handleRecordSegment = async (cue: SubtitleCue, e?: React.MouseEvent) => {
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
	};

	// 退出循环
	const handleStopLoop = (e?: React.MouseEvent) => {
		e?.stopPropagation();
		useMediaStore.getState().stopSegmentLoop();
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
			// 根据设置决定是否复制到剪切板
			if (plugin.settings.autoCopyWordOnLookup && navigator.clipboard) {
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

	// 处理字幕导出
	const handleExportSubtitle = (cue: SubtitleCue, e: React.MouseEvent) => {
		e.stopPropagation();
		if (plugin) {
			plugin.insertSubtitleToNote(cue);
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
						const isRecordingThis = recordingSession?.isRecording && recordingSession?.targetSubtitle?.id === cue.id;

						return (
							<div
								key={cue.id}
								ref={index === activeIndex ? activeItemRef : null}
								className={`linguaflow-subtitle-item ${
									index === activeIndex ? 'active' : ''
								} ${isLoopingThis ? 'looping' : ''} ${isRecordingThis ? 'recording' : ''} ${isSelected ? 'selected' : ''}`}
								onClick={() => handleSubtitleClick(cue)}
								onDoubleClick={() => handleSubtitleDoubleClick(cue)}
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
										<div className={`linguaflow-subtitle-item-en ${index === activeIndex && !wordByWordHighlight ? 'linguaflow-line-highlight' : ''}`}>
											<ClickableText
												text={cue.textEn}
												isActive={index === activeIndex && wordByWordHighlight}
												activeWordIndex={activeWordIndex}
												onWordClick={handleWordClick}
											/>
										</div>
									)}
									{cue.textZh && showChinese && (
										<div className="linguaflow-subtitle-item-zh">{cue.textZh}</div>
									)}
									{!cue.textEn && !cue.textZh && (
										<div className={`linguaflow-subtitle-item-main ${index === activeIndex && !wordByWordHighlight ? 'linguaflow-line-highlight' : ''}`}>
											<ClickableText
												text={cue.text}
												isActive={index === activeIndex && wordByWordHighlight}
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
