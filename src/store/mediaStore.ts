import { create } from 'zustand';
import type { SubtitleCue, SubtitleConfig } from '../types';

/**
 * 媒体播放状态
 */
interface MediaState {
	// 播放器状态
	currentTime: number;
	duration: number;
	playing: boolean;
	volume: number;
	playbackRate: number;
	videoFit: 'contain' | 'cover' | 'fill';
	showInlineSubtitles: boolean;
	
	// 字幕状态
	playerRef: any; // 保存播放器引用
	subtitles: SubtitleCue[];
	activeIndex: number;  // 当前高亮的字幕索引（-1 表示无）
	activeWordIndex: number;  // 当前高亮的单词索引（-1 表示无）
	subtitleConfig: SubtitleConfig;
	
	// 循环状态
	loopEnabled: boolean;
	loopStart: number;
	loopEnd: number;
	
	// 单句播放（播放一次）
	segmentPlayEnabled: boolean;
	segmentPlayEnd: number;
	
	// 单句循环播放
	segmentLoopEnabled: boolean;
	segmentLoopTotal: number; // 目标播放次数（如3次就是播放3遍）
	segmentLoopCurrent: number; // 当前已播放次数
	segmentLoopIndex: number; // 当前循环的字幕索引
	
	// AB 复读状态
	abRepeatEnabled: boolean;
	pointA: number | null;
	pointB: number | null;

	// 影子跟读状态
	shadowingEnabled: boolean;
	shadowingPauseFactor: number; // 暂停时长倍率 (如 1.0, 1.5)
}

/**
 * Store Actions
 */
interface MediaActions {
	// 播放控制
	setCurrentTime: (time: number) => void;
	setDuration: (duration: number) => void;
	setPlaying: (playing: boolean) => void;
	setVolume: (volume: number) => void;
	setPlaybackRate: (rate: number) => void;
	setVideoFit: (fit: 'contain' | 'cover' | 'fill') => void;
	setShowInlineSubtitles: (show: boolean) => void;
	
	// 字幕管理
	setPlayerRef: (ref: any) => void;
	setSubtitles: (subtitles: SubtitleCue[]) => void;
	setActiveIndex: (index: number) => void;
	setActiveWordIndex: (index: number) => void;
	updateSubtitleConfig: (config: Partial<SubtitleConfig>) => void;
	
	// 单句循环
	enableLoop: (start: number, end: number) => void;
	disableLoop: () => void;
	toggleLoop: () => void;

	// 单句播放
	playSegment: (start: number, end: number) => void;

	// 单句循环播放
	startSegmentLoop: (start: number, end: number, count: number, index: number) => void;
	stopSegmentLoop: () => void;
	incrementLoopCount: () => void;
	playNextSegment: () => void;
	playPreviousSegment: () => void;
	
	// AB 复读
	setPointA: (time: number) => void;
	setPointB: (time: number) => void;
	enableABRepeat: () => void;
	disableABRepeat: () => void;
	clearABPoints: () => void;
	
	// 影子跟读
	toggleShadowing: () => void;
	enableShadowing: () => void;
	disableShadowing: () => void;
	setShadowingPauseFactor: (factor: number) => void;

	// 重置
	reset: () => void;
}

/**
 * 初始状态
 */
const initialState: MediaState = {
	currentTime: 0,
	duration: 0,
	playing: false,
	volume: 0.8,
	playbackRate: 1.0,
	videoFit: 'contain',
	showInlineSubtitles: false,
	
	playerRef: null,
	subtitles: [],
	activeIndex: -1,
	activeWordIndex: -1,
	subtitleConfig: {
		fontSize: 16,
		fontColor: '#FFFFFF',
		translationColor: '',
		highlightColor: '',
		backgroundColor: 'rgba(0, 0, 0, 0.7)',
		position: 'bottom',
		showEnglish: true,
		showChinese: true,
		visibleLanguages: ['en', 'zh'], // 默认显示英文和中文
		primaryLanguage: 'en', // 默认主语言为英语
		showIndexAndTime: false, // 默认隐藏编号和时间，仅在设置中开启
		wordByWordHighlight: false, // 默认关闭逐字高亮（整行高亮）
	},
	
	loopEnabled: false,
	loopStart: 0,
	loopEnd: 0,
	
	// 单句播放（播放一次）
	segmentPlayEnabled: false,
	segmentPlayEnd: 0,
	
	// 单句循环播放
	segmentLoopEnabled: false,
	segmentLoopTotal: 3,
	segmentLoopCurrent: 0,
	segmentLoopIndex: -1,
	
	abRepeatEnabled: false,
	pointA: null,
	pointB: null,

	// 影子跟读
	shadowingEnabled: false,
	shadowingPauseFactor: 1.0, // 默认1.0倍时长
};

/**
 * Media Store - 全局媒体状态管理
 * 使用 Zustand 实现高性能状态管理
 */
export const useMediaStore = create<MediaState & MediaActions>((set, get) => ({
	...initialState,
	
	// ===== 播放控制 =====
	setCurrentTime: (time: number) => {
		set({ currentTime: time });
	},
	
	setDuration: (duration: number) => {
		set({ duration });
	},
	
	setPlaying: (playing: boolean) => {
		set({ playing });
	},
	
	setVolume: (volume: number) => {
		set({ volume: Math.max(0, Math.min(1, volume)) });
	},
	
	setPlaybackRate: (rate: number) => {
		set({ playbackRate: Math.max(0.25, Math.min(2, rate)) });
	},
	
	setVideoFit: (fit: 'contain' | 'cover' | 'fill') => {
		set({ videoFit: fit });
	},

	setShowInlineSubtitles: (show: boolean) => {
		set({ showInlineSubtitles: show });
	},
	
	// ===== 字幕管理 =====
	setPlayerRef: (ref: any) => {
		set({ playerRef: ref });
	},
	
	setSubtitles: (subtitles: SubtitleCue[]) => {
		console.log('[MediaStore] Loading subtitles:', subtitles.length);
		set({ subtitles, activeIndex: -1 });
	},
	
	setActiveIndex: (index: number) => {
		const state = get();
		
		// 避免不必要的更新 - 早期返回
		if (state.activeIndex === index) return;
		
		// 验证索引有效性
		if (index >= 0 && index < state.subtitles.length) {
			set({ activeIndex: index, activeWordIndex: -1 }); // 切换字幕时重置单词索引
		} else if (index === -1) {
			// 只有在当前不是 -1 时才更新
			if (state.activeIndex !== -1 || state.activeWordIndex !== -1) {
				set({ activeIndex: -1, activeWordIndex: -1 });
			}
		}
	},
	
	setActiveWordIndex: (index: number) => {
		const state = get();
		// 避免不必要的更新
		if (state.activeWordIndex === index) return;
		set({ activeWordIndex: index });
	},
	
	updateSubtitleConfig: (config: Partial<SubtitleConfig>) => {
		set((state) => ({
			subtitleConfig: { ...state.subtitleConfig, ...config },
		}));
	},
	
	// ===== 单句循环 =====
	enableLoop: (start: number, end: number) => {
		console.log('[MediaStore] Enable loop:', start, '-', end);
		
		// 互斥：关闭其他模式
		if (get().segmentLoopEnabled) get().stopSegmentLoop();
		if (get().abRepeatEnabled) get().disableABRepeat();
		if (get().shadowingEnabled) get().disableShadowing();
		
		set({
			loopEnabled: true,
			loopStart: start,
			loopEnd: end,
		});
	},
	
	disableLoop: () => {
		console.log('[MediaStore] Disable loop');
		set({
			loopEnabled: false,
			loopStart: 0,
			loopEnd: 0,
		});
	},
	
	toggleLoop: () => {
		const { loopEnabled } = get();
		if (loopEnabled) {
			get().disableLoop();
		} else {
			// 如果有当前字幕，启用当前字幕的循环
			const { activeIndex, subtitles } = get();
			if (activeIndex >= 0 && activeIndex < subtitles.length) {
				const cue = subtitles[activeIndex];
				if (cue) {
					get().enableLoop(cue.start, cue.end);
				}
			}
		}
	},
	
	// 单句播放
	playSegment: (start: number, end: number) => {
		console.log('[MediaStore] Play segment:', start, '-', end);
		// 1. 如果正在循环，先停止循环
		if (get().loopEnabled) get().disableLoop();
		if (get().segmentLoopEnabled) get().stopSegmentLoop();
		if (get().abRepeatEnabled) get().disableABRepeat();
		if (get().shadowingEnabled) get().disableShadowing();
		
		// 2. 设置单句播放状态
		set({
			segmentPlayEnabled: true,
			segmentPlayEnd: end,
			currentTime: start, // 设置开始时间（UI可能会用）
			playing: true,      // 确保开始播放
		});
	},

	// 单句循环播放
	startSegmentLoop: (start: number, end: number, count: number, index: number = -1) => {
		console.log('[MediaStore] Start segment loop:', start, '-', end, 'Count:', count, 'Index:', index);
		
		// 强制跳转到开始时间 (新增逻辑)
		const player = get().playerRef;
		if (player) {
			console.log('[MediaStore] startSegmentLoop seeking to:', start);
			player.seekTo(start);
		} else {
			console.warn('[MediaStore] startSegmentLoop: Player ref is null!');
		}

		// 1. 停止其他模式
		if (get().loopEnabled) get().disableLoop();
		if (get().segmentPlayEnabled) set({ segmentPlayEnabled: false });
		if (get().abRepeatEnabled) get().disableABRepeat();
		if (get().shadowingEnabled) get().disableShadowing();
		
		// 获取当前播放状态
		const { playing } = get();

		// 2. 设置状态
		set({
			segmentLoopEnabled: true,
			segmentLoopTotal: count,
			segmentLoopCurrent: 0,
			segmentLoopIndex: index,
			// 复用 loopStart/loopEnd 作为循环区间
			loopStart: start,
			loopEnd: end,
			currentTime: start,
			// 保持当前的播放状态：如果原来在播则继续播，如果原来暂停则保持暂停（待播放状态）
			playing: playing,
		});
	},
	
	stopSegmentLoop: () => {
		console.log('[MediaStore] Stop segment loop');
		set({
			segmentLoopEnabled: false,
			segmentLoopTotal: 3,
			segmentLoopCurrent: 0,
			segmentLoopIndex: -1,
			// 清除循环区间
			loopStart: 0,
			loopEnd: 0,
		});
	},
	
	incrementLoopCount: () => {
		const { segmentLoopCurrent } = get();
		set({ segmentLoopCurrent: segmentLoopCurrent + 1 });
	},
	
	playNextSegment: () => {
		const { subtitles, segmentLoopIndex, segmentLoopTotal, activeIndex } = get();
		
		if (!subtitles || subtitles.length === 0) {
			console.warn('[MediaStore] Cannot play next: No subtitles');
			return;
		}
		
		// 使用当前索引（如果在循环模式则用 segmentLoopIndex，否则用 activeIndex）
		const currentIndex = segmentLoopIndex !== -1 ? segmentLoopIndex : activeIndex;
		const nextIndex = currentIndex + 1;
		
		if (nextIndex >= subtitles.length) {
			console.log('[MediaStore] Reached end of subtitles');
			return;
		}
		
		const nextCue = subtitles[nextIndex];
		if (!nextCue) {
			console.warn('[MediaStore] Next cue not found');
			return;
		}
		
		console.log('[MediaStore] Playing next segment:', nextCue.text);
		
		// 如果在循环模式，停止当前循环并启动新的循环
		if (segmentLoopIndex !== -1) {
			console.log('[MediaStore] Stopping current loop and starting new one');
			
			// 1. 先设置播放状态为 true（关键修复！）
			set({ playing: true });
			
			// 2. 强制跳转到新位置并播放
			const player = get().playerRef;
			if (player) {
				console.log('[MediaStore] Seeking to next segment (loop mode):', nextCue.start);
				player.seekTo(nextCue.start);
				player.playVideo(); // 确保继续播放
			}
			
			// 3. 然后停止旧循环并启动新循环
			set({
				segmentLoopEnabled: false,
				segmentLoopCurrent: 0,
			});
			get().startSegmentLoop(nextCue.start, nextCue.end, segmentLoopTotal, nextIndex);
		} else {
			// 否则直接跳转并更新 activeIndex
			console.log('[MediaStore] Not in loop mode, jumping directly to nextIndex:', nextIndex);
			set({ activeIndex: nextIndex });
			// 需要 playerRef 来 seekTo，这里通过 plugin.playerRef 访问
			const player = get().playerRef;
			if (player) {
				console.log('[MediaStore] Seeking to:', nextCue.start);
				player.seekTo(nextCue.start);
			} else {
				console.warn('[MediaStore] Player not available!');
			}
		}
	},
	
	playPreviousSegment: () => {
		const { subtitles, segmentLoopIndex, segmentLoopTotal, activeIndex } = get();
		
		console.log('[MediaStore] playPreviousSegment called. activeIndex:', activeIndex, 'segmentLoopIndex:', segmentLoopIndex, 'subtitles.length:', subtitles?.length);
		
		if (!subtitles || subtitles.length === 0) {
			console.warn('[MediaStore] Cannot play previous: No subtitles');
			return;
		}
		
		// 使用当前索引（如果在循环模式则用 segmentLoopIndex，否则用 activeIndex）
		const currentIndex = segmentLoopIndex !== -1 ? segmentLoopIndex : activeIndex;
		const prevIndex = currentIndex - 1;
		
		console.log('[MediaStore] currentIndex:', currentIndex, '→ prevIndex:', prevIndex);
		
		if (prevIndex < 0) {
			console.log('[MediaStore] Reached beginning of subtitles');
			return;
		}
		
		const prevCue = subtitles[prevIndex];
		if (!prevCue) {
			console.warn('[MediaStore] Previous cue not found');
			return;
		}
		
		console.log('[MediaStore] Playing previous segment:', prevCue.text);
		
		// 如果在循环模式，停止当前循环并启动新的循环
		if (segmentLoopIndex !== -1) {
			console.log('[MediaStore] Stopping current loop and starting new one');
			
			// 1. 先强制跳转到新位置
			const player = get().playerRef;
			if (player) {
				console.log('[MediaStore] Seeking to previous segment (loop mode):', prevCue.start);
				player.seekTo(prevCue.start);
				player.playVideo(); // 确保继续播放
				get().setPlaying(true);
			}
			
			// 2. 然后停止旧循环并启动新循环
			set({
				segmentLoopEnabled: false,
				segmentLoopCurrent: 0,
			});
			get().startSegmentLoop(prevCue.start, prevCue.end, segmentLoopTotal, prevIndex);
		} else {
			// 否则直接跳转并更新 activeIndex
			console.log('[MediaStore] Not in loop mode, jumping directly to prevIndex:', prevIndex);
			set({ activeIndex: prevIndex });
			// 需要 playerRef 来 seekTo，这里通过 plugin.playerRef 访问
			const player = get().playerRef;
			if (player) {
				console.log('[MediaStore] Seeking to:', prevCue.start);
				player.seekTo(prevCue.start);
			} else {
				console.warn('[MediaStore] Player not available!');
			}
		}
	},

	// ===== AB 复读 =====
	setPointA: (time: number) => {
		if (typeof time !== 'number' || isNaN(time) || time < 0) {
			console.warn('[MediaStore] Invalid time for Point A:', time);
			return;
		}
		console.log('[MediaStore] Set Point A:', time);
		set({ pointA: time });
	},
	
	setPointB: (time: number) => {
		if (typeof time !== 'number' || isNaN(time) || time < 0) {
			console.warn('[MediaStore] Invalid time for Point B:', time);
			return;
		}
		console.log('[MediaStore] Set Point B:', time);
		const { pointA } = get();
		
		// 确保 B 点在 A 点之后
		if (pointA !== null && time > pointA) {
			set({ pointB: time });
		} else {
			console.warn('[MediaStore] Point B must be greater than Point A');
		}
	},
	
	enableABRepeat: () => {
		const { pointA, pointB } = get();
		
		if (pointA !== null && pointB !== null && pointB > pointA) {
			console.log('[MediaStore] Enable AB Repeat:', pointA, '-', pointB);
			
			// 互斥：关闭其他模式
			if (get().segmentLoopEnabled) get().stopSegmentLoop();
			if (get().loopEnabled) get().disableLoop();
			if (get().shadowingEnabled) get().disableShadowing();
			
			set({ abRepeatEnabled: true });
		}
	},
	
	disableABRepeat: () => {
		console.log('[MediaStore] Disable AB Repeat');
		set({ abRepeatEnabled: false });
	},
	
	clearABPoints: () => {
		console.log('[MediaStore] Clear AB Points');
		set({
			pointA: null,
			pointB: null,
			abRepeatEnabled: false,
		});
	},
	
	// ===== 影子跟读 =====
	toggleShadowing: () => {
		const { shadowingEnabled } = get();
		if (shadowingEnabled) {
			get().disableShadowing();
		} else {
			get().enableShadowing();
		}
	},
	
	enableShadowing: () => {
		console.log('[MediaStore] Enable Shadowing');
		// 互斥：关闭循环播放
		if (get().segmentLoopEnabled) get().stopSegmentLoop();
		if (get().loopEnabled) get().disableLoop();
		if (get().abRepeatEnabled) get().disableABRepeat();
		
		set({ shadowingEnabled: true });
	},
	
	disableShadowing: () => {
		console.log('[MediaStore] Disable Shadowing');
		set({ shadowingEnabled: false });
	},
	
	setShadowingPauseFactor: (factor: number) => {
		set({ shadowingPauseFactor: factor });
	},

	// ===== 重置 =====
	reset: () => {
		console.log('[MediaStore] Reset state');
		// 保留用户配置（字幕设置、视频填充模式、内嵌字幕开关、音量）
		const { subtitleConfig, videoFit, showInlineSubtitles, volume } = get();
		
		set({
			...initialState,
			subtitleConfig,
			videoFit,
			showInlineSubtitles,
			volume // 音量也保留，符合用户习惯
		});
	},

}));

/**
 * 选择器 - 用于性能优化
 */
export const selectCurrentSubtitle = (state: MediaState & MediaActions): SubtitleCue | null => {
	const { subtitles, activeIndex } = state;
	if (activeIndex >= 0 && activeIndex < subtitles.length) {
		return subtitles[activeIndex] || null;
	}
	return null;
};

export const selectIsLooping = (state: MediaState & MediaActions): boolean => {
	return state.loopEnabled;
};

export const selectIsABRepeating = (state: MediaState & MediaActions): boolean => {
	return state.abRepeatEnabled && state.pointA !== null && state.pointB !== null;
};
