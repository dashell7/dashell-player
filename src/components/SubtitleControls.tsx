import React from 'react';
import { Menu } from 'obsidian';
import { SubtitleCue } from '../types';
import LinguaFlowPlugin from '../main';
import { useMediaStore } from '../store/mediaStore';

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
export const SubtitleControls: React.FC<SubtitleControlsProps> = ({
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
		if (activeIndex > 0) {
			const prevIndex = activeIndex - 1;
			setActiveIndex(prevIndex);
			// 如果有对应的字幕，跳转播放位置
			const prevCue = subtitles[prevIndex];
			if (prevCue && playerRef?.current) {
				playerRef.current.seekTo(prevCue.start);
			}
		}
	};

	// 跳转到下一句
	const handleNext = () => {
		if (activeIndex < subtitles.length - 1) {
			const nextIndex = activeIndex + 1;
			setActiveIndex(nextIndex);
			// 如果有对应的字幕，跳转播放位置
			const nextCue = subtitles[nextIndex];
			if (nextCue && playerRef?.current) {
				playerRef.current.seekTo(nextCue.start);
			}
		}
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
			{/* 控制按钮组 - 精简设计 */}
			<div className="linguaflow-controls-buttons">
				{/* 上一句 */}
				<button
					className="linguaflow-control-btn linguaflow-control-btn-previous"
					onClick={handlePrevious}
					disabled={activeIndex === 0}
					title="上一句 (快捷键: ←)"
				>
					<span className="linguaflow-control-icon">
						{Icons.SkipBack}
					</span>
					<span className="linguaflow-control-label">上一句</span>
				</button>

				{/* 播放/暂停 - 醒目大按钮 */}
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
					<span className="linguaflow-control-label">
						{isPlaying ? '暂停' : '播放'}
					</span>
				</button>

				{/* 下一句 */}
				<button
					className="linguaflow-control-btn linguaflow-control-btn-next"
					onClick={handleNext}
					disabled={activeIndex === subtitles.length - 1}
					title="下一句 (快捷键: →)"
				>
					<span className="linguaflow-control-icon">
						{Icons.SkipForward}
					</span>
					<span className="linguaflow-control-label">下一句</span>
				</button>

				{/* 循环播放 - 如果没有选中字幕则禁用 */}
				{isLooping ? (
					<button
						className="linguaflow-control-btn linguaflow-control-btn-loop active"
						onClick={onExitLoop}
						title="退出循环"
						disabled={!currentCue}
					>
						<span className="linguaflow-control-icon">{Icons.Square}</span>
						<span className="linguaflow-control-label">
							退出循环 ({String(safeLoopCount)}次)
						</span>
					</button>
				) : (
					<button
						className="linguaflow-control-btn linguaflow-control-btn-loop"
						onClick={onToggleLoop}
						title={!currentCue ? "请先选择字幕以启用循环" : `循环播放 ${String(safeLoopCount)} 次`}
						disabled={!currentCue}
					>
						<span className="linguaflow-control-icon">{Icons.RepeatOne}</span>
						<span className="linguaflow-control-label">
							循环播放 ({safeLoopCount}次)
						</span>
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
						menu.addItem((item) => {
							item
								.setTitle(`设置 A 点 (当前: ${formatTime(store.pointA)})`)
								.setIcon('map-pin')
								.onClick(() => {
									store.setPointA(currentTime);
									// 如果 B 已经设置且 B > A，自动开启
									if (store.pointB && store.pointB > currentTime) {
										store.enableABRepeat();
									}
								});
						});

						// 2. 设置 B 点
						menu.addItem((item) => {
							item
								.setTitle(`设置 B 点 (当前: ${formatTime(store.pointB)})`)
								.setIcon('flag')
								.setDisabled(!store.pointA && currentTime === 0) // 如果没有A且时间为0，通常不建议直接设B
								.onClick(() => {
									store.setPointB(currentTime);
									// 如果 A 已经设置，自动开启
									if (store.pointA) {
										store.enableABRepeat();
									}
								});
						});

						menu.addSeparator();

						// 3. 启用/关闭开关
						menu.addItem((item) => {
							item
								.setTitle('启用 AB 复读')
								.setChecked(store.abRepeatEnabled)
								.setDisabled(!store.pointA || !store.pointB)
								.onClick(() => {
									if (store.abRepeatEnabled) {
										store.disableABRepeat();
									} else {
										store.enableABRepeat();
									}
								});
						});

						// 4. 清除设置
						menu.addItem((item) => {
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
					title="点击打开 AB 复读菜单"
				>
					<span className="linguaflow-control-icon">
						{Icons.ABRepeat}
					</span>
					<span className="linguaflow-control-label">AB复读</span>
				</button>

				{/* 跟读录音 - 如果没有选中字幕则禁用，或者影子跟读开启时禁用 */}
				<button
					className={`linguaflow-control-btn linguaflow-control-btn-record ${
						isRecording ? 'active' : ''
					}`}
					onClick={onRecord}
					title={
						shadowingEnabled 
							? "影子跟读模式下不可录音 (请先关闭影子跟读)" 
							: (!currentCue ? "请先选择字幕以启用录音" : (isRecording ? '停止录音' : '跟读录音'))
					}
					disabled={!currentCue || shadowingEnabled}
				>
					<span className="linguaflow-control-icon">
						{isRecording ? Icons.Circle : Icons.Mic}
					</span>
					<span className="linguaflow-control-label">
						{isRecording ? '停止录音' : '跟读录音'}
					</span>
				</button>

				{/* 影子跟读 - 带菜单 */}
				<button
					className={`linguaflow-control-btn linguaflow-control-btn-shadowing ${
						shadowingEnabled ? 'active' : ''
					}`}
					onClick={(e) => {
						const menu = new Menu();
						
						// 1.0倍选项
						menu.addItem((item) => {
							item
								.setTitle('开启 (1.0倍时长)')
								.setChecked(shadowingEnabled && shadowingPauseFactor === 1.0)
								.onClick(() => {
									setShadowingPauseFactor(1.0);
									if (!shadowingEnabled) enableShadowing();
								});
						});

						// 1.5倍选项
						menu.addItem((item) => {
							item
								.setTitle('开启 (1.5倍时长)')
								.setChecked(shadowingEnabled && shadowingPauseFactor === 1.5)
								.onClick(() => {
									setShadowingPauseFactor(1.5);
									if (!shadowingEnabled) enableShadowing();
								});
						});

						menu.addSeparator();

						// 关闭选项
						menu.addItem((item) => {
							item
								.setTitle('关闭影子跟读')
								.setChecked(!shadowingEnabled)
								.onClick(() => {
									disableShadowing();
								});
						});
						
						menu.showAtMouseEvent(e.nativeEvent);
					}}
					title={!currentCue ? "请先选择字幕以启用影子跟读" : (shadowingEnabled ? `影子跟读已开启 (${shadowingPauseFactor}倍时长)` : '点击选择跟读模式')}
					disabled={!currentCue}
				>
					<span className="linguaflow-control-icon">
						{Icons.User}
					</span>
					<span className="linguaflow-control-label">
						{shadowingEnabled ? `${shadowingPauseFactor}x` : '跟读'}
					</span>
				</button>

				{/* 播放速度 */}
				<button
					className="linguaflow-control-btn linguaflow-control-btn-speed"
					onClick={(e) => {
						const menu = new Menu();
						const rates = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
						
						rates.forEach(rate => {
							menu.addItem((item) => {
								item
									.setTitle(`${rate}x`)
									.setChecked(playbackRate === rate)
									.onClick(() => {
										onRateChange(rate);
									});
							});
						});
						
						menu.showAtMouseEvent(e.nativeEvent);
					}}
					title={`当前速度: ${safePlaybackRateDisplay}（点击选择）`}
				>
					<span className="linguaflow-control-icon">{Icons.Gauge}</span>
					<span className="linguaflow-control-label">
						{safePlaybackRateDisplay}
					</span>
				</button>

				{/* 字幕显示控制 */}
				<SubtitleDisplayControl />
			</div>

			{/* 状态指示器 - 只显示锁定状态 */}
			{isManuallyLocked && currentCue && (
				<div className="linguaflow-controls-status-bar">
					<div className="linguaflow-status-badge linguaflow-status-locked" title="点击字幕解锁">
						<span className="linguaflow-status-icon">{Icons.Lock}</span>
						<span className="linguaflow-status-text">
							已锁定 #{typeof currentCue.index === 'number' ? currentCue.index + 1 : '?'}
						</span>
					</div>
				</div>
			)}
		</div>
	);
};

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
 * 支持三种模式切换：全部显示、仅英文、仅中文
 */
const SubtitleDisplayControl: React.FC = () => {
	const subtitleConfig = useMediaStore(state => state.subtitleConfig);
	const updateSubtitleConfig = useMediaStore(state => state.updateSubtitleConfig);

	// 计算当前显示模式
	const getDisplayMode = () => {
		const { showEnglish, showChinese } = subtitleConfig;
		if (showEnglish && showChinese) return 'both';
		if (showEnglish && !showChinese) return 'en';
		if (!showEnglish && showChinese) return 'zh';
		return 'none';
	};

	// 切换显示模式：全部 → 仅英文 → 仅中文 → 隐藏全部 → 全部
	const toggleDisplayMode = () => {
		const mode = getDisplayMode();
		switch (mode) {
			case 'both':
				// 全部 → 仅英文
				updateSubtitleConfig({ showEnglish: true, showChinese: false });
				break;
			case 'en':
				// 仅英文 → 仅中文
				updateSubtitleConfig({ showEnglish: false, showChinese: true });
				break;
			case 'zh':
				// 仅中文 → 隐藏全部
				updateSubtitleConfig({ showEnglish: false, showChinese: false });
				break;
			case 'none':
				// 隐藏全部 → 全部
				updateSubtitleConfig({ showEnglish: true, showChinese: true });
				break;
		}
	};

	const mode = getDisplayMode();
	const modeConfig = {
		both: { icon: Icons.Languages, label: '中英', title: '显示中英文（点击切换为仅英文）' },
		en: { 
			icon: <span style={{ fontSize: '18px', fontWeight: 700 }}>E</span>, 
			label: '英文', 
			title: '仅显示英文（点击切换为仅中文）' 
		},
		zh: { 
			icon: <span style={{ fontSize: '18px', fontWeight: 600 }}>中</span>, 
			label: '中文', 
			title: '仅显示中文（点击切换为隐藏全部）' 
		},
		none: { icon: Icons.EyeOff, label: '隐藏', title: '字幕已隐藏（点击显示全部）' },
	};

	const config = modeConfig[mode];

	return (
		<button
			className="linguaflow-control-btn linguaflow-control-btn-subtitle"
			onClick={toggleDisplayMode}
			title={config.title}
		>
			<span className="linguaflow-control-icon">{config.icon}</span>
			<span className="linguaflow-control-label">{config.label}</span>
		</button>
	);
};
