import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import ReactPlayer from 'react-player';
import { PlayerRef, PlayerState } from '../types';
import { formatTime } from '../utils/fileUtils';

interface MediaPlayerProps {
	url: string;
	onReady?: () => void;
	onError?: (error: any) => void;
	onProgress?: (state: PlayerState) => void;
	autoPlay?: boolean;
	startTime?: number;
}

/**
 * 媒体播放器组件
 * 使用 react-player 库，支持本地文件和 YouTube 链接
 * 通过 ref 暴露控制方法给父组件
 */
export const MediaPlayer = forwardRef<PlayerRef, MediaPlayerProps>(
	({ url, onReady, onError, onProgress, autoPlay = false, startTime = 0 }, ref) => {
		const playerRef = useRef<ReactPlayer>(null);
		const [playing, setPlaying] = useState(autoPlay);
		const [volume, setVolume] = useState(0.8);
		const [playbackRate, setPlaybackRate] = useState(1.0);
		const [playerState, setPlayerState] = useState<PlayerState>({
			playing: false,
			currentTime: 0,
			duration: 0,
			loaded: 0,
			volume: 0.8,
			playbackRate: 1.0,
		});

		// 暴露控制方法给父组件
		useImperativeHandle(ref, () => ({
			seekTo: (seconds: number, type: 'seconds' | 'fraction' = 'seconds') => {
				if (playerRef.current) {
					playerRef.current.seekTo(seconds, type);
				}
			},
			getCurrentTime: () => {
				return playerRef.current?.getCurrentTime() || 0;
			},
			getDuration: () => {
				return playerRef.current?.getDuration() || 0;
			},
			getSecondsLoaded: () => {
				return playerRef.current?.getSecondsLoaded() || 0;
			},
			playVideo: () => {
				setPlaying(true);
			},
			pauseVideo: () => {
				setPlaying(false);
			},
			setPlaybackRate: (rate: number) => {
				setPlaybackRate(rate);
			},
		}));

		// 播放器就绪
		const handleReady = () => {
			console.log('[MediaPlayer] Player ready');
			
			// 跳转到起始时间
			if (startTime > 0 && playerRef.current) {
				playerRef.current.seekTo(startTime, 'seconds');
			}
			
			onReady?.();
		};

		// 播放进度更新
		const handleProgress = (state: {
			played: number;
			playedSeconds: number;
			loaded: number;
			loadedSeconds: number;
		}) => {
			const newState: PlayerState = {
				playing,
				currentTime: state.playedSeconds,
				duration: playerRef.current?.getDuration() || 0,
				loaded: state.loaded,
				volume,
				playbackRate,
			};
			
			setPlayerState(newState);
			onProgress?.(newState);
		};

		// 错误处理
		const handleError = (error: any) => {
			console.error('[MediaPlayer] Error:', error);
			onError?.(error);
		};

		// 切换播放/暂停
		const togglePlay = () => {
			setPlaying(!playing);
		};

		// 调整音量
		const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
			const newVolume = parseFloat(e.target.value);
			setVolume(newVolume);
		};

		// 调整播放速度
		const handleRateChange = (rate: number) => {
			setPlaybackRate(rate);
		};

		return (
			<div className="linguaflow-player-container">
				{/* 播放器 */}
				<div className="linguaflow-player-wrapper">
					<ReactPlayer
						ref={playerRef}
						url={url}
						playing={playing}
						volume={volume}
						playbackRate={playbackRate}
						controls={true}
						width="100%"
						height="100%"
						onReady={handleReady}
						onProgress={handleProgress}
						onError={handleError}
						config={{
							file: {
								attributes: {
									controlsList: 'nodownload',
									crossOrigin: 'anonymous',
								},
							},
							youtube: {
								playerVars: {
									showinfo: 1,
									modestbranding: 1,
								},
							},
						}}
					/>
				</div>

				{/* 自定义控制栏 */}
				<div className="linguaflow-controls">
					<div className="linguaflow-controls-left">
						<button
							className="linguaflow-btn"
							onClick={togglePlay}
							aria-label={playing ? 'Pause' : 'Play'}
						>
							{playing ? '⏸️' : '▶️'}
						</button>
						
						<span className="linguaflow-time">
							{formatTime(playerState.currentTime)} / {formatTime(playerState.duration)}
						</span>
					</div>

					<div className="linguaflow-controls-center">
						{/* 播放速度 */}
						<div className="linguaflow-rate-control">
							<label>速度: </label>
							{[0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map((rate) => (
								<button
									key={String(rate)}
									className={`linguaflow-rate-btn ${
										playbackRate === rate ? 'active' : ''
									}`}
									onClick={() => handleRateChange(rate)}
								>
									{String(rate)}x
								</button>
							))}
						</div>
					</div>

					<div className="linguaflow-controls-right">
						{/* 音量控制 */}
						<div className="linguaflow-volume-control">
							<label>🔊</label>
							<input
								type="range"
								min="0"
								max="1"
								step="0.1"
								value={volume}
								onChange={handleVolumeChange}
							/>
							<span>{Math.round(volume * 100)}%</span>
						</div>
					</div>
				</div>
			</div>
		);
	}
);

MediaPlayer.displayName = 'MediaPlayer';
