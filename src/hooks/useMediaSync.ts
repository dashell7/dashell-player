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
 */
export function useMediaSync(
	playerRef: React.RefObject<PlayerRef>,
	enabled: boolean = true,
	plugin?: LinguaFlowPlugin
) {
	const rafIdRef = useRef<number | null>(null);
	const lastTimeRef = useRef<number>(-1);
	
	const {
		setCurrentTime,
		subtitles,
		setActiveIndex,
		setActiveWordIndex,
		loopEnabled,
		loopStart,
		loopEnd,
		abRepeatEnabled,
		pointA,
		pointB,
	} = useMediaStore();
	
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
				
				// 更新 Store 中的当前时间
				setCurrentTime(currentTime);
				
				// ===== 字幕同步（使用二分查找） =====
				if (subtitles.length > 0) {
					const newIndex = SubtitleParser.findIndexAtTime(subtitles, currentTime);
					setActiveIndex(newIndex);
					
					// ===== 单词级高亮（仅对当前激活的字幕） =====
					if (newIndex >= 0 && newIndex < subtitles.length) {
						const currentCue = subtitles[newIndex];
						if (currentCue) {
							// 前瞻补偿：让高亮稍微提前一点 (0.35s)，抵消视觉延迟
							// 这会让跟随感觉更"跟手"
							const SYNC_LOOKAHEAD = 0.35;
							
							// 计算字幕内的相对时间（应用补偿）
							const relativeTime = (currentTime + SYNC_LOOKAHEAD) - currentCue.start;
							const duration = currentCue.end - currentCue.start;
							
							// 获取英文字幕文本（如果有）
							const textForHighlight = currentCue.textEn || currentCue.text || '';
							
							// 分割单词（简单分割，与 renderClickableText 逻辑一致）
							const tokens = textForHighlight.split(/(\s+|[.,;:!?'"()[\]{}])/);
							const words = tokens.filter(token => 
								token.trim() && !/^\s+$/.test(token) && !/^[.,;:!?'"()[\]{}]$/.test(token)
							);
							
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
				
				// ===== 循环控制 (有限循环优先) =====
				const { 
					segmentLoopEnabled, 
					segmentLoopTotal, 
					segmentLoopCurrent,
					loopStart: segStart, 
					loopEnd: segEnd 
				} = useMediaStore.getState();

				// 有限循环优先检查（单句循环播放）
				if (segmentLoopEnabled && currentTime >= segEnd) {
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
				// 无限循环检查 (只在没有有限循环时才执行)
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
				
				// ===== AB 复读控制 =====
				if (abRepeatEnabled && pointA !== null && pointB !== null) {
					if (currentTime >= pointB) {
						console.log('[useMediaSync] AB Repeat: jumping to A', pointA);
						player.seekTo(pointA, 'seconds');
					}
					
					// 如果播放位置在 AB 区间外，跳回 A 点
					if (currentTime < pointA) {
						player.seekTo(pointA, 'seconds');
					}
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
			if (rafIdRef.current !== null) {
				cancelAnimationFrame(rafIdRef.current);
				rafIdRef.current = null;
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
