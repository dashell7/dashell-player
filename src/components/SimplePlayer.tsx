import * as React from 'react';
import { forwardRef, useImperativeHandle, useRef } from 'react';
import type { PlayerRef, PlayerState } from '../types';

interface SimplePlayerProps {
	url: string;
	onReady?: () => void;
	onError?: (error: any) => void;
	onProgress?: (state: PlayerState) => void;
	autoPlay?: boolean;
	startTime?: number;
	videoFit?: 'contain' | 'cover' | 'fill';
}

/**
 * 简化版播放器 - 使用原生 HTML5 video 元素
 * 用于测试基本功能
 */
export const SimplePlayer = forwardRef<PlayerRef, SimplePlayerProps>(
	({ url, onReady, onError, onProgress, autoPlay = false, startTime = 0, videoFit = 'cover' }, ref) => {
		const videoRef = useRef<HTMLVideoElement>(null);

		// 暴露控制方法
		useImperativeHandle(ref, () => ({
			seekTo: (seconds: number) => {
				console.log('[SimplePlayer] seekTo called:', seconds);
				if (videoRef.current) {
					videoRef.current.currentTime = seconds;
					console.log('[SimplePlayer] currentTime set to:', videoRef.current.currentTime);
				} else {
					console.warn('[SimplePlayer] Video ref is null');
				}
			},
			getCurrentTime: () => {
				return videoRef.current?.currentTime || 0;
			},
			getDuration: () => {
				return videoRef.current?.duration || 0;
			},
			getSecondsLoaded: () => {
				if (videoRef.current) {
					const buffered = videoRef.current.buffered;
					if (buffered.length > 0) {
						return buffered.end(buffered.length - 1);
					}
				}
				return 0;
			},
			playVideo: () => {
				videoRef.current?.play().catch(e => console.error('[SimplePlayer] Play failed:', e));
			},
			pauseVideo: () => {
				videoRef.current?.pause();
			},
			setPlaybackRate: (rate: number) => {
				if (videoRef.current) {
					videoRef.current.playbackRate = rate;
					console.log('[SimplePlayer] playbackRate set to:', rate);
				}
			},
			getInternalPlayer: () => {
				return videoRef.current;
			}
		}));

		// 视频加载完成
		const handleLoadedData = () => {
			console.log('[SimplePlayer] Video loaded');
			if (startTime > 0 && videoRef.current) {
				videoRef.current.currentTime = startTime;
			}
			onReady?.();
		};

		// 播放进度更新
		const handleTimeUpdate = () => {
			if (videoRef.current && onProgress) {
				const state: PlayerState = {
					playing: !videoRef.current.paused,
					currentTime: videoRef.current.currentTime,
					duration: videoRef.current.duration,
					loaded: 1,
					volume: videoRef.current.volume,
					playbackRate: videoRef.current.playbackRate,
				};
				onProgress(state);
			}
		};

		// 播放事件 - 立即同步状态
		const handlePlay = () => {
			console.log('[SimplePlayer] Play event triggered');
			if (videoRef.current && onProgress) {
				const state: PlayerState = {
					playing: true,
					currentTime: videoRef.current.currentTime,
					duration: videoRef.current.duration,
					loaded: 1,
					volume: videoRef.current.volume,
					playbackRate: videoRef.current.playbackRate,
				};
				onProgress(state);
			}
		};

		// 暂停事件 - 立即同步状态
		const handlePause = () => {
			console.log('[SimplePlayer] Pause event triggered');
			if (videoRef.current && onProgress) {
				const state: PlayerState = {
					playing: false,
					currentTime: videoRef.current.currentTime,
					duration: videoRef.current.duration,
					loaded: 1,
					volume: videoRef.current.volume,
					playbackRate: videoRef.current.playbackRate,
				};
				onProgress(state);
			}
		};

		// 错误处理
		const handleError = (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
			console.error('[SimplePlayer] Error:', e);
			const error = videoRef.current?.error;
			onError?.(error || new Error('Video load failed'));
		};

		return (
			<div className="linguaflow-simple-player">
				<video
					ref={videoRef}
					src={url}
					controls
					autoPlay={autoPlay}
					onLoadedData={handleLoadedData}
					onTimeUpdate={handleTimeUpdate}
					onPlay={handlePlay}
					onPause={handlePause}
					onError={handleError}
					style={{
						width: '100%',
						height: '100%',
						objectFit: videoFit,
						backgroundColor: '#000',
					}}
				>
					Your browser does not support video playback.
				</video>
			</div>
		);
	}
);

SimplePlayer.displayName = 'SimplePlayer';
