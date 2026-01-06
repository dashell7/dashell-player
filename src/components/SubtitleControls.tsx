import React, { useCallback, useState, useMemo, useRef, useEffect } from 'react';
import { Menu, MenuItem } from 'obsidian';
import { useMediaStore } from '../store/mediaStore';
import type { SubtitleCue } from '../types';
import type { SupportedLanguage } from '../utils/languageUtils';
import { LANGUAGE_CONFIG } from '../utils/languageUtils';
import LinguaFlowPlugin from '../main';

// Modern Lucide Icons SVG - High Quality Player Icons
const Icons = {
	// 播放器核心控制
	Play: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>,
	Pause: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="4" height="16" rx="1"></rect><rect x="14" y="4" width="4" height="16" rx="1"></rect></svg>,
	SkipBack: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="19 20 9 12 19 4 19 20"></polygon><line x1="5" y1="19" x2="5" y2="5"></line></svg>,
	SkipForward: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 4 15 12 5 20 5 4"></polygon><line x1="19" y1="5" x2="19" y2="19"></line></svg>,
	
	// 循环和录音
	Repeat: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>,
	RepeatOne: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/><path d="M11 10h2v6"/></svg>,
	Square: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>,
	Mic: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>,
	User: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
	Circle: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/></svg>,
	ABRepeat: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
		<text x="5.5" y="17" fontSize="13" fontWeight="700" fontFamily="sans-serif" fill="currentColor" stroke="none" textAnchor="middle">A</text>
		<line x1="12" y1="5" x2="12" y2="19" /> {/* 竖线 */}
		<text x="18.5" y="17" fontSize="13" fontWeight="700" fontFamily="sans-serif" fill="currentColor" stroke="none" textAnchor="middle">B</text>
	</svg>,
	
	// 速度和设置
	Zap: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>,
	Gauge: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/></svg>,
	
	// 字幕和语言
	Languages: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/></svg>,
	Globe: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
	Type: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" x2="15" y1="20" y2="20"/><line x1="12" x2="12" y1="4" y2="20"/></svg>,
	Captions: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M7 10h4"/><path d="M13 10h4"/><path d="M7 14h4"/><path d="M13 14h4"/></svg>,
	
	// 视图和显示
	Eye: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>,
	EyeOff: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>,
	Hash: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="9" y2="9"/><line x1="4" x2="20" y1="15" y2="15"/><line x1="10" x2="8" y1="3" y2="21"/><line x1="16" x2="14" y1="3" y2="21"/></svg>,
	Lock: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
	FileText: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
	Edit: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>,
	ExternalLink: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" x2="21" y1="14" y2="3"/></svg>,
	// 布局图标
	LayoutBottom: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="8" rx="2"/><rect x="3" y="13" width="18" height="8" rx="2"/></svg>,
	LayoutRight: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="8" height="18" rx="2"/><rect x="13" y="3" width="8" height="18" rx="2"/></svg>,
};

interface SubtitleControlsProps {
	currentCue: SubtitleCue | null;
	plugin: LinguaFlowPlugin;
	playerRef: React.RefObject<any>; // 播放器引用
	isPlaying: boolean; // 视频是否正在播放
	isLooping: boolean;
	isRecording: boolean;
	isManuallyLocked: boolean; // 是否手动锁定
	playbackRate: number; // 当前播放速度
	onTogglePlay: () => void; // 切换播放/暂停
	onToggleLoop: () => void;
	onExitLoop: () => void;
	onRecord: () => void;
	onRateChange: (rate: number) => void; // 改变播放速度
	onUnlock?: () => void; // 解锁回调
}

/**
 * 字幕控制栏组件
 * 固定显示在播放器下方，控制当前选中的字幕
 */
const SubtitleControlsBase: React.FC<SubtitleControlsProps> = ({
	currentCue,
	plugin,
	playerRef,
	isPlaying,
	isLooping,
	isRecording,
	isManuallyLocked,
	playbackRate,
	onTogglePlay,
	onToggleLoop,
	onExitLoop,
	onRecord,
	onRateChange,
	onUnlock,
}) => {
	// 获取字幕列表和当前索引
	const subtitles = useMediaStore(state => state.subtitles);
	const activeIndex = useMediaStore(state => state.activeIndex);
	const playNextSegment = useMediaStore(state => state.playNextSegment);
	const playPreviousSegment = useMediaStore(state => state.playPreviousSegment);
	const setActiveIndex = useMediaStore(state => state.setActiveIndex);
	const shadowingEnabled = useMediaStore(state => state.shadowingEnabled);
	const toggleShadowing = useMediaStore(state => state.toggleShadowing);
	const shadowingPauseFactor = useMediaStore(state => state.shadowingPauseFactor);
	const setShadowingPauseFactor = useMediaStore(state => state.setShadowingPauseFactor);
	const enableShadowing = useMediaStore(state => state.enableShadowing);
	const disableShadowing = useMediaStore(state => state.disableShadowing);
	
	// AB复读状态订阅
	const abRepeatEnabled = useMediaStore(state => state.abRepeatEnabled);
	const pointA = useMediaStore(state => state.pointA);
	const pointB = useMediaStore(state => state.pointB);

	// 组件挂载时的初始化（如果需要可以在这里添加逻辑）

	// 跳转到上一句
		const handlePrevious = () => {
		playPreviousSegment();
	};

	// 跳转到下一句
		const handleNext = () => {
		playNextSegment();
	};

	// 安全获取循环次数
	const safeLoopCount = (() => {
		try {
			const count = plugin?.settings?.loopCount;
			return typeof count === 'number' && !isNaN(count) ? count : 3;
		} catch {
			return 3;
		}
	})();

	// 安全获取播放速度显示
	const safePlaybackRateDisplay = (() => {
		try {
			if (!playbackRate || typeof playbackRate !== 'number' || isNaN(playbackRate)) {
				return '1x';
			}
			if (playbackRate === 1.0 || playbackRate === 1.25 || playbackRate === 1.5 || playbackRate === 0.75) {
				return `${playbackRate}x`;
			}
			return `${playbackRate.toFixed(2)}x`;
		} catch {
			return '1x';
		}
	})();

	return (
		<div className="linguaflow-subtitle-controls">
			{/* 1. 核心控制组 (导航+播放) */}
			<div className="linguaflow-controls-group linguaflow-group-main">
				{/* 上一句 */}
				<button
					className="linguaflow-control-btn linguaflow-control-btn-previous"
					onClick={handlePrevious}
					disabled={activeIndex === 0}
					title="上一句 (快捷键: ←)"
				>
					<span className="linguaflow-control-icon">{Icons.SkipBack}</span>
				</button>

				{/* 播放/暂停 - 居中大按钮 */}
				<button
					className={`linguaflow-control-btn linguaflow-control-btn-playpause ${
						isPlaying ? 'playing' : 'paused'
					}`}
					onClick={onTogglePlay}
					title={isPlaying ? '暂停视频 (空格)' : '播放视频 (空格)'}
				>
					<span className="linguaflow-control-icon">
						{isPlaying ? Icons.Pause : Icons.Play}
					</span>
				</button>

				{/* 下一句 */}
				<button
					className="linguaflow-control-btn linguaflow-control-btn-next"
					onClick={handleNext}
					disabled={activeIndex === subtitles.length - 1}
					title="下一句 (快捷键: →)"
				>
					<span className="linguaflow-control-icon">{Icons.SkipForward}</span>
				</button>
			</div>

			{/* 2. 学习工具组 */}
			<div className="linguaflow-controls-group linguaflow-group-learning">
				{/* 循环播放 */}
				{isLooping ? (
					<button
						className="linguaflow-control-btn linguaflow-control-btn-loop active"
						onClick={onExitLoop}
						title="退出循环"
						disabled={!currentCue}
					>
						<span className="linguaflow-control-icon">{Icons.Square}</span>
					</button>
				) : (
					<button
						className="linguaflow-control-btn linguaflow-control-btn-loop"
						onClick={(e) => {
							// 左键点击：开始循环
							if (e.button === 0 && !e.ctrlKey && !e.metaKey) {
								onToggleLoop();
							}
						}}
						onContextMenu={(e) => {
							// 右键点击：显示循环次数菜单
							e.preventDefault();
							const menu = new Menu();
							const loopCounts = [1, 2, 3, 5, 10, 20, 50, 100];
							
							loopCounts.forEach(count => {
								menu.addItem((item: MenuItem) => {
									item
										.setTitle(`${count} 次`)
										.setChecked(plugin.settings.loopCount === count)
										.onClick(async () => {
											plugin.settings.loopCount = count;
											await plugin.saveSettings();
										});
								});
							});
							
							menu.showAtMouseEvent(e.nativeEvent);
						}}
						title={!currentCue ? "请先选择字幕以启用循环" : `循环播放 ${String(safeLoopCount)} 次 (双击字幕)`}
						disabled={!currentCue}
					>
						<span className="linguaflow-control-icon">{Icons.RepeatOne}</span>
					</button>
				)}

				{/* AB复读 */}
				<button
					className={`linguaflow-control-btn linguaflow-control-btn-ab ${
						abRepeatEnabled || pointA !== null ? 'active' : ''
					}`}
					onClick={(e) => {
						const store = useMediaStore.getState();
						const currentTime = store.currentTime;
						const menu = new Menu();

						const formatTime = (seconds: number | null) => {
							if (seconds === null || seconds === undefined) return '未设置';
							const mins = Math.floor(seconds / 60);
							const secs = Math.floor(seconds % 60);
							return `${mins}:${secs.toString().padStart(2, '0')}`;
						};

						// 1. 设置 A 点
						menu.addItem((item: MenuItem) => {
							item
								.setTitle(`设置 A 点 (当前: ${formatTime(store.pointA)})`)
								.setIcon('map-pin')
								.onClick(() => {
									store.setPointA(currentTime);
									new (require('obsidian')).Notice(`🅰️ A点已设置: ${formatTime(currentTime)}`);
									if (store.pointB && store.pointB > currentTime) {
										store.enableABRepeat();
										new (require('obsidian')).Notice('🔁 AB循环已自动启动');
									}
								});
						});

						// 2. 设置 B 点（设置后自动启动）
						menu.addItem((item: MenuItem) => {
							item
								.setTitle(`设置 B 点 (当前: ${formatTime(store.pointB)})`)
								.setIcon('flag')
								.setDisabled(!store.pointA && currentTime === 0)
								.onClick(() => {
									store.setPointB(currentTime);
									new (require('obsidian')).Notice(`🅱️ B点已设置: ${formatTime(currentTime)}`);
									if (store.pointA) {
										store.enableABRepeat();
										new (require('obsidian')).Notice('🔁 AB循环已自动启动');
									}
								});
						});

						menu.addSeparator();

						// 3. 循环开关（用于暂停/恢复）
						menu.addItem((item: MenuItem) => {
							item
								.setTitle(store.abRepeatEnabled ? '关闭 AB 复读' : '启用 AB 复读')
								.setChecked(store.abRepeatEnabled)
								.setDisabled(!store.pointA || !store.pointB)
								.onClick(() => {
									if (store.abRepeatEnabled) {
										store.disableABRepeat();
										new (require('obsidian')).Notice('⏹️ AB循环已关闭');
									} else {
										store.enableABRepeat();
										new (require('obsidian')).Notice('🔁 AB循环已启用');
									}
								});
						});

						// 4. 清除设置
						menu.addItem((item: MenuItem) => {
							item
								.setTitle('清除 AB 点')
								.setIcon('trash')
								.setDisabled(!store.pointA && !store.pointB)
								.onClick(() => {
									store.clearABPoints();
								});
						});

						menu.showAtMouseEvent(e.nativeEvent);
					}}
					title="AB复读 (快捷键: A/B 设置端点)"
				>
					<span className="linguaflow-control-icon">{Icons.ABRepeat}</span>
				</button>

				{/* 跟读录音 */}
				<button
					className={`linguaflow-control-btn linguaflow-control-btn-record ${
						isRecording ? 'active' : ''
					}`}
					onClick={onRecord}
					title={
						shadowingEnabled 
							? "影子跟读模式下不可录音" 
							: (!currentCue ? "请先选择字幕以启用录音" : (isRecording ? '停止录音 (R)' : '跟读录音 (R)'))
					}
					disabled={!currentCue || shadowingEnabled}
				>
					<span className="linguaflow-control-icon">
						{isRecording ? Icons.Circle : Icons.Mic}
					</span>
				</button>

				{/* 影子跟读 */}
				<button
					className={`linguaflow-control-btn linguaflow-control-btn-shadowing ${
						shadowingEnabled ? 'active' : ''
					}`}
					onClick={(e) => {
						const menu = new Menu();
						
						// 1. 智能适应 (推荐)
						menu.addItem((item: MenuItem) => {
							item
								.setTitle('智能适应 (推荐)')
								.setChecked(shadowingEnabled && shadowingPauseFactor === 1.1)
								.onClick(() => {
									setShadowingPauseFactor(1.1);
									if (!shadowingEnabled) enableShadowing();
									new (require('obsidian')).Notice('已切换至智能适应模式：时长 + 1秒缓冲');
								});
						});

						// 2. 紧凑模式
						menu.addItem((item: MenuItem) => {
							item
								.setTitle('紧凑模式 (1.0x)')
								.setChecked(shadowingEnabled && shadowingPauseFactor === 1.0)
								.onClick(() => {
									setShadowingPauseFactor(1.0);
									if (!shadowingEnabled) enableShadowing();
									new (require('obsidian')).Notice('已切换至紧凑模式');
								});
						});

						// 3. 宽松模式
						menu.addItem((item: MenuItem) => {
							item
								.setTitle('宽松模式 (1.5x)')
								.setChecked(shadowingEnabled && shadowingPauseFactor === 1.5)
								.onClick(() => {
									setShadowingPauseFactor(1.5);
									if (!shadowingEnabled) enableShadowing();
									new (require('obsidian')).Notice('已切换至宽松模式');
								});
						});

						menu.addSeparator();

						menu.addItem((item: MenuItem) => {
							item
								.setTitle('关闭影子跟读')
								.setChecked(!shadowingEnabled)
								.onClick(() => {
									disableShadowing();
								});
						});
						
						menu.showAtMouseEvent(e.nativeEvent);
					}}
					title={!currentCue ? "请先选择字幕以启用影子跟读" : (shadowingEnabled ? `影子跟读已开启` : '点击选择跟读模式')}
					disabled={!currentCue}
				>
					<span className="linguaflow-control-icon">{Icons.User}</span>
				</button>
			</div>

			{/* 4. 设置与工具组 */}
			<div className="linguaflow-controls-group linguaflow-group-settings">
				{/* 播放速度 */}
				<button
					className="linguaflow-control-btn linguaflow-control-btn-speed"
					onClick={(e) => {
						const menu = new Menu();
						const rates = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
						rates.forEach(rate => {
							menu.addItem((item: MenuItem) => {
								item
									.setTitle(`${rate}x`)
									.setChecked(playbackRate === rate)
									.onClick(() => onRateChange(rate));
							});
						});
						menu.showAtMouseEvent(e.nativeEvent);
					}}
					title={`当前速度: ${safePlaybackRateDisplay}`}
				>
					<span className="linguaflow-control-icon">{Icons.Gauge}</span>
				</button>

				{/* 字幕显示控制 */}
				<SubtitleDisplayControl />

				{/* 布局切换 */}
				<button
					className="linguaflow-control-btn linguaflow-control-btn-layout"
					onClick={async () => {
						const currentLayout = plugin.settings.subtitleLayout;
						const newLayout = currentLayout === 'bottom' ? 'right' : 'bottom';
						plugin.settings.subtitleLayout = newLayout;
						await plugin.saveSettings();
						
						const view = await plugin.activateView();
						if (view) view.refresh?.();
						
						const layoutText = newLayout === 'bottom' ? '底部' : '右侧';
						new (require('obsidian')).Notice(`✅ 字幕布局：${layoutText}`);
					}}
					title={plugin.settings.subtitleLayout === 'bottom' ? '切换为右侧布局' : '切换为底部布局'}
				>
					<span className="linguaflow-control-icon">
						{plugin.settings.subtitleLayout === 'bottom' ? Icons.LayoutBottom : Icons.LayoutRight}
					</span>
				</button>

				{/* 加载字幕 */}
				<button
					className="linguaflow-control-btn linguaflow-control-btn-load-subtitle"
					onClick={() => plugin.loadExternalSubtitle()}
					title="加载外部字幕文件"
				>
					<span className="linguaflow-control-icon">{Icons.FileText}</span>
				</button>

				{/* 打开学习笔记 */}
				<button
					className="linguaflow-control-btn linguaflow-control-btn-note"
					onClick={() => plugin.openStudyNote()}
					title="打开学习笔记 (右侧分屏)"
				>
					<span className="linguaflow-control-icon">{Icons.Edit}</span>
				</button>
			</div>

			{/* 状态指示器 */}
			{isManuallyLocked && currentCue && (
				<div className="linguaflow-controls-status-bar">
					<div className="linguaflow-status-badge linguaflow-status-locked" title="点击字幕解锁">
						<span className="linguaflow-status-icon">{Icons.Lock}</span>
						<span className="linguaflow-status-text">
							#{typeof currentCue.index === 'number' ? currentCue.index + 1 : '?'}
						</span>
					</div>
				</div>
			)}
		</div>
	);
};

export const SubtitleControls = React.memo(SubtitleControlsBase);

/**
 * 编号和时间显示控制组件
 */
const IndexTimeControl: React.FC = () => {
	const subtitleConfig = useMediaStore(state => state.subtitleConfig);
	const updateSubtitleConfig = useMediaStore(state => state.updateSubtitleConfig);

	const toggleIndexTime = () => {
		updateSubtitleConfig({ showIndexAndTime: !subtitleConfig.showIndexAndTime });
	};

	const { showIndexAndTime } = subtitleConfig;

	return (
		<button
			className="linguaflow-control-btn linguaflow-control-btn-indextime"
			onClick={toggleIndexTime}
			title={showIndexAndTime ? '隐藏编号和时间' : '显示编号和时间'}
		>
			<span className="linguaflow-control-icon">{showIndexAndTime ? '🔢' : '🚫'}</span>
			<span className="linguaflow-control-label">{showIndexAndTime ? '编号' : '隐藏'}</span>
		</button>
	);
};

/**
 * 字幕显示控制组件
 * 支持多语言选择（使用Obsidian原生Menu）
 */
const SubtitleDisplayControl: React.FC = () => {
	const subtitles = useMediaStore(state => state.subtitles);
	const subtitleConfig = useMediaStore(state => state.subtitleConfig);
	const updateSubtitleConfig = useMediaStore(state => state.updateSubtitleConfig);

	// 检测字幕中可用的语言
	const availableLanguages = useMemo(() => {
		const langsSet = new Set<SupportedLanguage>();
		subtitles.forEach(cue => {
			if (cue.detectedLanguages) {
				cue.detectedLanguages.forEach(lang => langsSet.add(lang));
			}
			// 向后兼容
			if (cue.textEn) langsSet.add('en');
			if (cue.textZh) langsSet.add('zh');
		});
		return Array.from(langsSet);
	}, [subtitles]);

	const visibleLanguages = subtitleConfig.visibleLanguages;

	// 生成按钮显示内容
	const getButtonDisplay = () => {
		const count = visibleLanguages.length;
		if (count === 0) {
			return { icon: Icons.EyeOff, label: '隐藏' };
		} else if (count === 1 && visibleLanguages[0]) {
			const lang = visibleLanguages[0];
			const langConfig = LANGUAGE_CONFIG[lang];
			return { 
				icon: <span style={{ fontSize: '16px', fontWeight: 600 }}>{langConfig.nativeName.slice(0, 2)}</span>,
				label: langConfig.nativeName.slice(0, 2)
			};
		} else {
			return { icon: Icons.Languages, label: `${count}种` };
		}
	};

	const { icon, label } = getButtonDisplay();

	if (availableLanguages.length === 0) {
		return null; // 没有字幕时不显示
	}

	return (
		<button
			className="linguaflow-control-btn linguaflow-control-btn-subtitle"
			onClick={(e) => {
				const menu = new Menu();
				
				menu.setNoIcon();
				
				// 添加快捷操作
				menu.addItem((item: MenuItem) => {
					item
						.setTitle('✨ 全部显示')
						.onClick(() => {
							updateSubtitleConfig({ 
								visibleLanguages: availableLanguages,
								showEnglish: availableLanguages.includes('en'),
								showChinese: availableLanguages.includes('zh')
							});
						});
				});
				
				menu.addItem((item: MenuItem) => {
					item
						.setTitle('👁️‍🗨️ 全部隐藏')
						.onClick(() => {
							updateSubtitleConfig({ 
								visibleLanguages: [],
								showEnglish: false,
								showChinese: false
							});
						});
				});
				
				menu.addSeparator();
				
				// 单个语言选项
				availableLanguages.forEach(lang => {
					const langInfo = LANGUAGE_CONFIG[lang];
					const isVisible = visibleLanguages.includes(lang);
					
					menu.addItem((item: MenuItem) => {
						item
							.setTitle(`${langInfo.nativeName} (${langInfo.name})`)
							.setChecked(isVisible)
							.onClick(() => {
								const newVisibleLangs = isVisible
									? visibleLanguages.filter(l => l !== lang)
									: [...visibleLanguages, lang];
								
								// 允许全部取消（显示空白）
								updateSubtitleConfig({ 
									visibleLanguages: newVisibleLangs,
									// 同步更新旧字段以保持兼容
									showEnglish: newVisibleLangs.includes('en'),
									showChinese: newVisibleLangs.includes('zh')
								});
							});
					});
				});
				
				menu.showAtMouseEvent(e.nativeEvent);
			}}
			title="选择显示的字幕语言"
		>
			<span className="linguaflow-control-icon">{icon}</span>
			<span className="linguaflow-control-label">{label}</span>
		</button>
	);
};
