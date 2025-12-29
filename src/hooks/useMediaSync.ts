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
 * 为什么不使用 timeupdate 事件？
 * - timeupdate 频率太低（约 250ms 触发一次）
 * - 会导致字幕高亮延迟和不精确
 * - RAF 可以达到 60fps（约 16ms 一次），更流畅
 * 
 * @param playerRef - 播放器引用
 * @param enabled - 是否启用同步（默认 true）
 * @param plugin - 插件实例（用于访问设置）
 * @param isBlocked - 是否阻塞自动化逻辑（如正在录音或显示弹窗时）
 */
export function useMediaSync(
	playerRef: React.RefObject<PlayerRef>,
	enabled: boolean = true,
	plugin?: LinguaFlowPlugin,
	isBlocked: boolean = false
) {
	const rafIdRef = useRef<number | null>(null);
	const lastTimeRef = useRef<number>(-1);
	const lastStoreUpdateTimeRef = useRef<number>(0);
	
	// 缓存解析后的单词，避免每帧重复 split
	const lastSubtitleIdRef = useRef<string | null>(null);
	const cachedWordsRef = useRef<string[]>([]);
	
	// 影子跟读状态引用
	const isShadowingWaitingRef = useRef<boolean>(false);
	const lastShadowingSubtitleIndexRef = useRef<number>(-1);
	const shadowingTimeoutRef = useRef<number | null>(null);

	// 当被阻塞时（如开始录音），清理定时器并重置等待状态
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

	const setCurrentTime = useMediaStore(s => s.setCurrentTime);
	const setActiveIndex = useMediaStore(s => s.setActiveIndex);
	const setActiveWordIndex = useMediaStore(s => s.setActiveWordIndex);
	
	// 只订阅 effect 需要的配置状态，避免 currentTime 变化导致重渲染
	const subtitles = useMediaStore(s => s.subtitles);
	const loopEnabled = useMediaStore(s => s.loopEnabled);
	const loopStart = useMediaStore(s => s.loopStart);
	const loopEnd = useMediaStore(s => s.loopEnd);
	const abRepeatEnabled = useMediaStore(s => s.abRepeatEnabled);
	const pointA = useMediaStore(s => s.pointA);
	const pointB = useMediaStore(s => s.pointB);
	
	useEffect(() => {
		if (!enabled || !playerRef.current) {
			return;
		}
		
		/**
		 * 同步循环 - 每帧执行
		 */
		const syncLoop = () => {
			const player = playerRef.current;
			if (!player) return;
			
			try {
				// 获取当前播放时间
				const currentTime = player.getCurrentTime();
				
				// 避免重复处理相同时间（性能优化）
				if (Math.abs(currentTime - lastTimeRef.current) < 0.01) {
					rafIdRef.current = requestAnimationFrame(syncLoop);
					return;
				}
				
				lastTimeRef.current = currentTime;
				
				// 【性能优化】一次性获取所有需要的 state，避免每帧多次调用 getState()
				const state = useMediaStore.getState();
				
				// 更新 Store 中的当前时间（节流到 ~10fps，减少 React 重渲染开销）
				const now = Date.now();
				if (now - lastStoreUpdateTimeRef.current > 100) {
					setCurrentTime(currentTime);
					lastStoreUpdateTimeRef.current = now;
				}
				
				// ===== 字幕同步（使用二分查找 + 顺序优化） =====
				if (subtitles.length > 0) {
					// 使用已获取的 state，不再调用 getState()
					const currentIndex = state.activeIndex;
					const newIndex = SubtitleParser.findIndexAtTime(subtitles, currentTime, currentIndex);
					setActiveIndex(newIndex);
					
					// ===== 单词级高亮（仅对当前激活的字幕） =====
					if (newIndex >= 0 && newIndex < subtitles.length) {
						const currentCue = subtitles[newIndex];
						if (currentCue) {
							// 计算字幕内的相对时间（无前瞻补偿）
							const relativeTime = currentTime - currentCue.start;
							const duration = currentCue.end - currentCue.start;
							
							// 优化：使用缓存的单词列表，避免每帧执行 split
							if (lastSubtitleIdRef.current !== currentCue.id) {
								// 获取英文字幕文本（如果有）
								const textForHighlight = currentCue.textEn || currentCue.text || '';
								
								// 分割单词
								const tokens = textForHighlight.split(/(\s+|[.,;:!?'"()[\]{}])/);
								cachedWordsRef.current = tokens.filter(token => 
									token.trim() && !/^\s+$/.test(token) && !/^[.,;:!?'"()[\]{}]$/.test(token)
								);
								lastSubtitleIdRef.current = currentCue.id;
							}
							
							const words = cachedWordsRef.current;
							
							if (words.length > 0 && duration > 0) {
								// 平均分配每个单词的时间
								const timePerWord = duration / words.length;
								const wordIndex = Math.floor(relativeTime / timePerWord);
								
								// 确保索引在有效范围内
								const safeWordIndex = Math.min(Math.max(0, wordIndex), words.length - 1);
								setActiveWordIndex(safeWordIndex);
							} else {
								setActiveWordIndex(-1);
							}
						}
					} else {
						setActiveWordIndex(-1);
					}
				}
				
				// ===== 影子跟读 (Shadowing) =====
				// 【性能优化】使用已获取的 state
				const { shadowingEnabled, shadowingPauseFactor, activeIndex } = state;
				
				// 关键修复：如果被阻塞（录音中/弹窗中），跳过跟读逻辑
				if (!isBlocked && shadowingEnabled && activeIndex >= 0 && activeIndex < subtitles.length) {
					const currentCue = subtitles[activeIndex];
					// 只有当：
					// 1. 还没在等待中
					// 2. 当前字幕不是刚刚完成的那一句（避免在刚跳转时重复触发）
					// 3. 播放时间到达结尾
					if (currentCue && !isShadowingWaitingRef.current && 
						lastShadowingSubtitleIndexRef.current !== activeIndex &&
						currentTime >= currentCue.end - 0.1) { // 提前0.1秒触发，更平滑
						
						console.log(`[useMediaSync] 🗣️ Shadowing: End of sentence detected (${activeIndex})`);
						
						// 1. 暂停播放
						player.pauseVideo();
						useMediaStore.getState().setPlaying(false);
						
						// 2. 设置等待状态
						isShadowingWaitingRef.current = true;
						lastShadowingSubtitleIndexRef.current = activeIndex;
						
						// 动态计算暂停时长 (科学设置)
						const sentenceDuration = currentCue.end - currentCue.start;
						let dynamicPauseDuration = 0;

						// 检查浮点数相等 (1.1 为智能适应模式)
						if (Math.abs(shadowingPauseFactor - 1.1) < 0.01) {
							// 🧠 智能适应模式: 1.1倍语速 + 1秒认知反应缓冲
							// 理由: 学习者语速稍慢(1.1)，大脑切换需要反应时间(+1s)
							dynamicPauseDuration = (sentenceDuration * 1000 * 1.1) + 1000;
						} else if (shadowingPauseFactor <= 1.0) {
							// ⚡ 紧凑模式: 1.0倍时长 (最少1秒)
							// 理由: 适合高阶训练，强迫语速同步
							dynamicPauseDuration = Math.max(1000, sentenceDuration * 1000 * shadowingPauseFactor);
						} else {
							// ☕ 宽松模式: N倍时长 (最少1.5秒)
							// 理由: 适合初学者，给予充足时间
							dynamicPauseDuration = Math.max(1500, sentenceDuration * 1000 * shadowingPauseFactor);
						}
						
						console.log(`[useMediaSync] 🗣️ Shadowing: Waiting ${dynamicPauseDuration.toFixed(0)}ms (Sentence: ${sentenceDuration.toFixed(1)}s, Factor: ${shadowingPauseFactor})`);
						
						// 3. 设置定时器播放下一句
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
							
							// 重置等待状态
							isShadowingWaitingRef.current = false;
							shadowingTimeoutRef.current = null;
						}, dynamicPauseDuration);
					}
				} else if (!shadowingEnabled) {
					// 如果关闭了影子跟读，重置相关状态
					if (isShadowingWaitingRef.current) {
						isShadowingWaitingRef.current = false;
						if (shadowingTimeoutRef.current) {
							window.clearTimeout(shadowingTimeoutRef.current);
							shadowingTimeoutRef.current = null;
						}
					}
				}

				// ===== 循环控制 (互斥) =====
				// 【性能优化】从已获取的 state 解构，避免重复调用
				const { 
					segmentLoopEnabled, 
					segmentLoopTotal, 
					segmentLoopCurrent,
					loopStart: segStart, 
					loopEnd: segEnd,
					loopEnabled,
					loopStart,
					loopEnd,
					abRepeatEnabled,
					pointA,
					pointB
				} = state;

				// 1. AB 复读 (优先级最高)
				if (abRepeatEnabled && pointA !== null && pointB !== null) {
					if (currentTime >= pointB) {
						console.log('[useMediaSync] AB Repeat: jumping to A', pointA);
						player.seekTo(pointA, 'seconds');
					}
					// 如果播放位置在 AB 区间外，跳回 A 点
					else if (currentTime < pointA) {
						player.seekTo(pointA, 'seconds');
					}
				}
				// 2. 有限循环优先检查（单句循环播放）
				else if (segmentLoopEnabled && currentTime >= segEnd) {
					/**
					 * 循环逻辑说明：
					 * - segmentLoopTotal: 目标播放总次数（如 3 次）
					 * - segmentLoopCurrent: 当前已完成的循环次数（0-based）
					 * - 第1次播放：current=0，结束后 current++ → 1
					 * - 第2次播放：current=1，结束后 current++ → 2  
					 * - 第3次播放：current=2，2 >= 3-1，不再跳回，循环结束
					 */
					if (segmentLoopCurrent < segmentLoopTotal - 1) {
						// 跳回开始位置，继续循环
						console.log(`[useMediaSync] 🔁 Segment Loop: jumping to start (${segmentLoopCurrent + 1}/${segmentLoopTotal})`);
						player.seekTo(segStart, 'seconds');
						useMediaStore.getState().incrementLoopCount(); // current++
					} else {
						// 循环完成
						const autoPlayNext = plugin?.settings.autoPlayNext ?? false;
						
						if (autoPlayNext) {
							// 自动播放下一句
							console.log('[useMediaSync] ✅ Segment Loop finished: auto-playing next segment');
							useMediaStore.getState().playNextSegment();
						} else {
							// 暂停播放
							console.log('[useMediaSync] ✅ Segment Loop finished: pausing');
							player.pauseVideo();
							useMediaStore.getState().stopSegmentLoop();
						}
					}
				}
				// 3. 无限循环检查 (只在没有 AB 和有限循环时才执行)
				else if (loopEnabled && currentTime >= loopEnd) {
					console.log('[useMediaSync] ♾️ Infinite Loop: jumping to start', loopStart);
					player.seekTo(loopStart, 'seconds');
				}
				
				// ===== 单句播放控制 (播放一次后停止) =====
				const { segmentPlayEnabled, segmentPlayEnd } = useMediaStore.getState();
				if (segmentPlayEnabled && currentTime >= segmentPlayEnd) {
					console.log('[useMediaSync] Segment end: pausing');
					player.pauseVideo();
					// 关闭单句播放状态
					useMediaStore.setState({ segmentPlayEnabled: false });
				}
				
			} catch (error) {
				console.error('[useMediaSync] Error in sync loop:', error);
			}
			
			// 继续下一帧
			rafIdRef.current = requestAnimationFrame(syncLoop);
		};
		
		// 启动同步循环
		rafIdRef.current = requestAnimationFrame(syncLoop);
		
		// 清理函数
		return () => {
			console.log('[useMediaSync] Cleaning up sync loop and timers');
			if (rafIdRef.current !== null) {
				cancelAnimationFrame(rafIdRef.current);
				rafIdRef.current = null;
			}
			// 清理影子跟读定时器
			if (shadowingTimeoutRef.current) {
				window.clearTimeout(shadowingTimeoutRef.current);
				shadowingTimeoutRef.current = null;
			}
		};
	}, [
		enabled,
		playerRef,
		setCurrentTime,
		subtitles,
		setActiveIndex,
		loopEnabled,
		loopStart,
		loopEnd,
		abRepeatEnabled,
		pointA,
		pointB,
		isBlocked
	]);
}

/**
 * 性能监控 Hook（可选）
 * 用于调试和性能分析
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
			
			// 每秒输出一次性能信息
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
