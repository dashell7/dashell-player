import { useEffect, useRef } from 'react';
import { useMediaStore } from '../store/mediaStore';
import { SubtitleParser } from '../services/SubtitleParser';
import type { PlayerRef } from '../types';
import type LinguaFlowPlugin from '../main';

/**
 * 高性能媒体同步 Hook
 * 
 * 使用 requestAnimationFrame 实现高帧率同步
 * 使用二分查找算法高效定位字幕
 * 
 * 特性：
 * 1. 智能 RAF 休眠：视频暂停时停止循环，播放时启动，节省 CPU
 * 2. 条件化高亮：仅当开启逐字高亮时才计算单词索引
 * 3. 状态复用：每帧仅调用一次 getState()，减少 React 开销
 */
export function useMediaSync(
	playerRef: React.RefObject<PlayerRef>,
	enabled: boolean = true,
	plugin?: LinguaFlowPlugin,
	isBlocked: boolean = false
) {
	// RAF 控制
	const rafIdRef = useRef<number | null>(null);
	
	// 时间戳缓存
	const lastTimeRef = useRef<number>(-1);
	const lastStoreUpdateTimeRef = useRef<number>(0);
	
	// 单词缓存
	const lastSubtitleIdRef = useRef<string | null>(null);
	const cachedWordsRef = useRef<string[]>([]);
	
	// 影子跟读状态
	const isShadowingWaitingRef = useRef<boolean>(false);
	const lastShadowingSubtitleIndexRef = useRef<number>(-1);
	const shadowingTimeoutRef = useRef<number | null>(null);
	
	// RAF 循环状态控制
	const isPlayingRef = useRef<boolean>(false);
	
	// Store Actions
	const setCurrentTime = useMediaStore(s => s.setCurrentTime);
	const setActiveIndex = useMediaStore(s => s.setActiveIndex);
	const setActiveWordIndex = useMediaStore(s => s.setActiveWordIndex);
	
	// 订阅需要的状态（避免在 loop 中频繁订阅）
	const subtitles = useMediaStore(s => s.subtitles);
	const loopEnabled = useMediaStore(s => s.loopEnabled);
	const loopStart = useMediaStore(s => s.loopStart);
	const loopEnd = useMediaStore(s => s.loopEnd);
	const abRepeatEnabled = useMediaStore(s => s.abRepeatEnabled);
	const pointA = useMediaStore(s => s.pointA);
	const pointB = useMediaStore(s => s.pointB);
	
	/**
	 * 启动 RAF 循环
	 */
	const startLoop = () => {
		if (rafIdRef.current === null) {
			rafIdRef.current = requestAnimationFrame(syncLoop);
		}
	};
	
	/**
	 * 停止 RAF 循环
	 */
	const stopLoop = () => {
		if (rafIdRef.current !== null) {
			cancelAnimationFrame(rafIdRef.current);
			rafIdRef.current = null;
		}
	};
	
	/**
	 * 同步循环核心
	 */
	const syncLoop = () => {
		const player = playerRef.current;
		if (!player) return;
		
		try {
			const currentTime = player.getCurrentTime();
			
			// 避免重复处理相同时间
			if (Math.abs(currentTime - lastTimeRef.current) < 0.01) {
				rafIdRef.current = requestAnimationFrame(syncLoop);
				return;
			}
			
			lastTimeRef.current = currentTime;
			
			// 一次性获取所有需要的 state
			const state = useMediaStore.getState();
			
			// 更新当前时间（节流到 10fps）
			const now = Date.now();
			if (now - lastStoreUpdateTimeRef.current > 100) {
				setCurrentTime(currentTime);
				lastStoreUpdateTimeRef.current = now;
			}
			
			// ===== 字幕同步 =====
			if (subtitles.length > 0) {
				const currentIndex = state.activeIndex;
				const newIndex = SubtitleParser.findIndexAtTime(subtitles, currentTime, currentIndex);
				
				if (newIndex !== currentIndex) {
					setActiveIndex(newIndex);
				}
				
				// ===== 逐字高亮（条件化执行） =====
				// 【性能优化】仅当配置开启时才计算单词索引
				if (state.subtitleConfig.wordByWordHighlight && newIndex >= 0 && newIndex < subtitles.length) {
					const currentCue = subtitles[newIndex];
					if (currentCue) {
						const relativeTime = currentTime - currentCue.start;
						const duration = currentCue.end - currentCue.start;
						
						// 缓存单词列表
						if (lastSubtitleIdRef.current !== currentCue.id) {
							const textForHighlight = currentCue.textEn || currentCue.text || '';
							const tokens = textForHighlight.split(/(\s+|[.,;:!?'"()[\]{}])/);
							cachedWordsRef.current = tokens.filter(token => 
								token.trim() && !/^\s+$/.test(token) && !/^[.,;:!?'"()[\]{}]$/.test(token)
							);
							lastSubtitleIdRef.current = currentCue.id;
						}
						
						const words = cachedWordsRef.current;
						
						if (words.length > 0 && duration > 0) {
							const timePerWord = duration / words.length;
							const wordIndex = Math.floor(relativeTime / timePerWord);
							const safeWordIndex = Math.min(Math.max(0, wordIndex), words.length - 1);
							
							if (safeWordIndex !== state.activeWordIndex) {
								setActiveWordIndex(safeWordIndex);
							}
						} else if (state.activeWordIndex !== -1) {
							setActiveWordIndex(-1);
						}
					}
				} else if (state.activeWordIndex !== -1) {
					// 关闭或无激活字幕时重置
					setActiveWordIndex(-1);
				}
			} else if (state.activeWordIndex !== -1) {
				setActiveWordIndex(-1);
			}
			
			// ===== 影子跟读 =====
			const { shadowingEnabled, shadowingPauseFactor, activeIndex } = state;
			
			if (!isBlocked && shadowingEnabled && activeIndex >= 0 && activeIndex < subtitles.length) {
				const currentCue = subtitles[activeIndex];
				if (currentCue && !isShadowingWaitingRef.current && 
					lastShadowingSubtitleIndexRef.current !== activeIndex &&
					currentTime >= currentCue.end - 0.1) {
					
					console.log(`[useMediaSync] 🗣️ Shadowing: End of sentence detected (${activeIndex})`);
					
					player.pauseVideo();
					useMediaStore.getState().setPlaying(false);
					isShadowingWaitingRef.current = true;
					lastShadowingSubtitleIndexRef.current = activeIndex;
					
					const sentenceDuration = currentCue.end - currentCue.start;
					let dynamicPauseDuration = 0;

					if (Math.abs(shadowingPauseFactor - 1.1) < 0.01) {
						dynamicPauseDuration = (sentenceDuration * 1000 * 1.1) + 1000;
					} else if (shadowingPauseFactor <= 1.0) {
						dynamicPauseDuration = Math.max(1000, sentenceDuration * 1000 * shadowingPauseFactor);
					} else {
						dynamicPauseDuration = Math.max(1500, sentenceDuration * 1000 * shadowingPauseFactor);
					}
					
					console.log(`[useMediaSync] 🗣️ Shadowing: Waiting ${dynamicPauseDuration.toFixed(0)}ms`);
					
					if (shadowingTimeoutRef.current) window.clearTimeout(shadowingTimeoutRef.current);
					
					shadowingTimeoutRef.current = window.setTimeout(() => {
						console.log('[useMediaSync] 🗣️ Shadowing: Playing next');
						const nextIndex = activeIndex + 1;
						
						if (nextIndex < subtitles.length) {
							const nextCue = subtitles[nextIndex];
							if (nextCue && playerRef.current) {
								playerRef.current.seekTo(nextCue.start, 'seconds');
								playerRef.current.playVideo();
								useMediaStore.getState().setPlaying(true);
							}
						} else {
							console.log('[useMediaSync] 🗣️ Shadowing: End of all subtitles');
						}
						
						isShadowingWaitingRef.current = false;
						shadowingTimeoutRef.current = null;
					}, dynamicPauseDuration);
				}
			} else if (!shadowingEnabled && isShadowingWaitingRef.current) {
				isShadowingWaitingRef.current = false;
				if (shadowingTimeoutRef.current) {
					window.clearTimeout(shadowingTimeoutRef.current);
					shadowingTimeoutRef.current = null;
				}
			}

			// ===== 循环控制 =====
			const { 
				segmentLoopEnabled, 
				segmentLoopTotal, 
				segmentLoopCurrent,
				loopStart: segStart, 
				loopEnd: segEnd,
				loopEnabled,
				loopStart,
				abRepeatEnabled,
				pointA,
				pointB
			} = state;

			if (abRepeatEnabled && pointA !== null && pointB !== null) {
				if (currentTime >= pointB) {
					console.log('[useMediaSync] AB Repeat: jumping to A', pointA);
					player.seekTo(pointA, 'seconds');
				} else if (currentTime < pointA) {
					player.seekTo(pointA, 'seconds');
				}
			}
			else if (segmentLoopEnabled && currentTime >= segEnd) {
				if (segmentLoopCurrent < segmentLoopTotal - 1) {
					console.log(`[useMediaSync] 🔁 Segment Loop: jumping to start (${segmentLoopCurrent + 1}/${segmentLoopTotal})`);
					player.seekTo(segStart, 'seconds');
					useMediaStore.getState().incrementLoopCount();
				} else {
					const autoPlayNext = plugin?.settings.autoPlayNext ?? false;
					
					if (autoPlayNext) {
						console.log('[useMediaSync] ✅ Segment Loop finished: auto-playing next segment');
						useMediaStore.getState().playNextSegment();
					} else {
						console.log('[useMediaSync] ✅ Segment Loop finished: pausing');
						player.pauseVideo();
						useMediaStore.getState().stopSegmentLoop();
					}
				}
			}
			else if (loopEnabled && currentTime >= loopEnd) {
				console.log('[useMediaSync] ♾️ Infinite Loop: jumping to start', loopStart);
				player.seekTo(loopStart, 'seconds');
			}
			
			// ===== 单句播放控制 =====
			const { segmentPlayEnabled, segmentPlayEnd } = useMediaStore.getState();
			if (segmentPlayEnabled && currentTime >= segmentPlayEnd) {
				console.log('[useMediaSync] Segment end: pausing');
				player.pauseVideo();
				useMediaStore.setState({ segmentPlayEnabled: false });
			}
			
		} catch (error) {
			console.error('[useMediaSync] Error in sync loop:', error);
		}
		
		// 继续下一帧
		rafIdRef.current = requestAnimationFrame(syncLoop);
	};
	
	// 阻塞时清理
	useEffect(() => {
		if (isBlocked) {
			if (shadowingTimeoutRef.current) {
				console.log('[useMediaSync] 🚫 Blocked: Clearing shadowing timeout');
				window.clearTimeout(shadowingTimeoutRef.current);
				shadowingTimeoutRef.current = null;
			}
			isShadowingWaitingRef.current = false;
		}
	}, [isBlocked]);
	
	// 智能 RAF 控制
	useEffect(() => {
		if (!enabled || !playerRef.current) {
			stopLoop();
			return;
		}
		
		// 监听 playing 状态变化
		const unsubscribe = useMediaStore.subscribe((state) => {
			if (state.playing && !isPlayingRef.current) {
				// 开始播放
				isPlayingRef.current = true;
				console.log('[useMediaSync] ▶️ Resuming sync loop');
				startLoop();
			} else if (!state.playing && isPlayingRef.current) {
				// 暂停播放
				isPlayingRef.current = false;
				console.log('[useMediaSync] ⏸️ Pausing sync loop to save CPU');
				stopLoop();
				lastTimeRef.current = -1;
			}
		});
		
		// 初始状态检查
		const initialPlaying = useMediaStore.getState().playing;
		if (initialPlaying && !isPlayingRef.current) {
			isPlayingRef.current = true;
			startLoop();
		}
		
		return () => {
			unsubscribe();
			stopLoop();
		};
	}, [enabled, playerRef]);
	
	// 暂停状态下的字幕同步（低频轮询）
	useEffect(() => {
		if (!enabled || !playerRef.current) return;
		
		let intervalId: number | null = null;
		
		// 当暂停时，每100ms检查一次currentTime并更新activeIndex
		const checkPausedSubtitle = () => {
			const player = playerRef.current;
			const state = useMediaStore.getState();
			
			if (!state.playing && player && subtitles.length > 0) {
				try {
					const currentTime = player.getCurrentTime();
					const currentIndex = state.activeIndex;
					const newIndex = SubtitleParser.findIndexAtTime(subtitles, currentTime, currentIndex);
					
					if (newIndex !== currentIndex) {
						setActiveIndex(newIndex);
					}
					
					// 同时更新 currentTime
					setCurrentTime(currentTime);
				} catch (error) {
					// Ignore errors during pause
				}
			}
		};
		
		// 启动低频轮询
		intervalId = window.setInterval(checkPausedSubtitle, 100);
		
		return () => {
			if (intervalId !== null) {
				clearInterval(intervalId);
			}
		};
	}, [enabled, playerRef, subtitles]);
}

/**
 * 性能监控 Hook
 */
export function useMediaSyncPerformance(enabled: boolean = false) {
	const frameCountRef = useRef<number>(0);
	const lastLogTimeRef = useRef<number>(Date.now());
	
	useEffect(() => {
		if (!enabled) return;
		
		const monitorLoop = () => {
			frameCountRef.current++;
			
			const now = Date.now();
			const elapsed = now - lastLogTimeRef.current;
			
			if (elapsed >= 1000) {
				const fps = frameCountRef.current / (elapsed / 1000);
				console.log(`[MediaSync Performance] FPS: ${fps.toFixed(1)}, Frames: ${frameCountRef.current}`);
				
				frameCountRef.current = 0;
				lastLogTimeRef.current = now;
			}
			
			requestAnimationFrame(monitorLoop);
		};
		
		const rafId = requestAnimationFrame(monitorLoop);
		
		return () => {
			cancelAnimationFrame(rafId);
		};
	}, [enabled]);
}
