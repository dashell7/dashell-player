import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.js';
import { useMediaStore } from '../store/mediaStore';
import type { SubtitleCue } from '../types';

interface WaveformManagerProps {
	audioUrl?: string;         // 原声音频 URL
	userAudioUrl?: string;     // 用户录音 URL
	showRegions?: boolean;     // 是否显示区域标记
}

/**
 * 波形可视化管理器
 * 
 * 功能：
 * 1. 双轨波形显示（原声 + 录音）
 * 2. RegionsPlugin 动态区域标记
 * 3. 当前字幕高亮
 * 4. 点击跳转播放
 * 
 * @example
 * ```tsx
 * <WaveformManager
 *   audioUrl="path/to/audio.mp3"
 *   userAudioUrl="path/to/recording.webm"
 *   showRegions={true}
 * />
 * ```
 */
export function WaveformManager({
	audioUrl,
	userAudioUrl,
	showRegions = true,
}: WaveformManagerProps) {
	const masterWaveContainerRef = useRef<HTMLDivElement>(null);
	const userWaveContainerRef = useRef<HTMLDivElement>(null);
	
	const masterWaveRef = useRef<WaveSurfer | null>(null);
	const userWaveRef = useRef<WaveSurfer | null>(null);
	const regionsPluginRef = useRef<RegionsPlugin | null>(null);
	
	const [masterReady, setMasterReady] = useState(false);
	const [userReady, setUserReady] = useState(false);
	const [error, setError] = useState<string | null>(null);
	
	// 从 Store 获取字幕信息
	const subtitles = useMediaStore(state => state.subtitles);
	const activeIndex = useMediaStore(state => state.activeIndex);
	const currentTime = useMediaStore(state => state.currentTime);

	/**
	 * 初始化原声波形
	 */
	useEffect(() => {
		if (!masterWaveContainerRef.current || !audioUrl) return;

		console.log('[WaveformManager] Initializing master waveform:', audioUrl);

		try {
			// 创建 RegionsPlugin
			const regions = RegionsPlugin.create();
			regionsPluginRef.current = regions;

			// 创建 WaveSurfer 实例
			const wavesurfer = WaveSurfer.create({
				container: masterWaveContainerRef.current,
				waveColor: '#4A9EFF',
				progressColor: '#1E40AF',
				cursorColor: '#FF6B6B',
				barWidth: 2,
				barGap: 1,
				barRadius: 3,
				height: 80,
				normalize: true,
				plugins: [regions],
			});

			masterWaveRef.current = wavesurfer;

			// 加载音频
			wavesurfer.load(audioUrl);

			// 监听事件
			wavesurfer.on('ready', () => {
				console.log('[WaveformManager] Master waveform ready');
				setMasterReady(true);
			});

			wavesurfer.on('error', (err: any) => {
				console.error('[WaveformManager] Master waveform error:', err);
				setError('Failed to load audio');
			});

			wavesurfer.on('click', () => {
				console.log('[WaveformManager] Waveform clicked');
			});

			// 清理
			return () => {
				console.log('[WaveformManager] Cleaning up master waveform');
				wavesurfer.destroy();
				masterWaveRef.current = null;
				regionsPluginRef.current = null;
			};
		} catch (err) {
			console.error('[WaveformManager] Failed to initialize master waveform:', err);
			setError('Failed to initialize waveform');
			return; // 添加返回值
		}
	}, [audioUrl]);

	/**
	 * 初始化用户录音波形
	 */
	useEffect(() => {
		if (!userWaveContainerRef.current || !userAudioUrl) {
			// 清理旧的波形
			if (userWaveRef.current) {
				userWaveRef.current.destroy();
				userWaveRef.current = null;
				setUserReady(false);
			}
			return;
		}

		console.log('[WaveformManager] Initializing user waveform:', userAudioUrl);

		try {
			// 创建 WaveSurfer 实例（不需要 regions）
			const wavesurfer = WaveSurfer.create({
				container: userWaveContainerRef.current,
				waveColor: '#10B981',
				progressColor: '#059669',
				cursorColor: '#F59E0B',
				barWidth: 2,
				barGap: 1,
				barRadius: 3,
				height: 80,
				normalize: true,
			});

			userWaveRef.current = wavesurfer;

			// 加载音频
			wavesurfer.load(userAudioUrl);

			// 监听事件
			wavesurfer.on('ready', () => {
				console.log('[WaveformManager] User waveform ready');
				setUserReady(true);
			});

			wavesurfer.on('error', (err: any) => {
				console.error('[WaveformManager] User waveform error:', err);
			});

			// 清理
			return () => {
				console.log('[WaveformManager] Cleaning up user waveform');
				wavesurfer.destroy();
				userWaveRef.current = null;
			};
		} catch (err) {
			console.error('[WaveformManager] Failed to initialize user waveform:', err);
			return; // 添加返回值
		}
	}, [userAudioUrl]);

	/**
	 * 动态更新区域标记
	 * 当 activeIndex 变化时，清除旧区域并绘制新区域
	 */
	useEffect(() => {
		if (!showRegions || !masterReady || !regionsPluginRef.current) return;
		if (subtitles.length === 0 || activeIndex < 0) return;

		const regions = regionsPluginRef.current;
		const currentSubtitle = subtitles[activeIndex];
		
		if (!currentSubtitle) return;

		console.log('[WaveformManager] Updating region for subtitle:', activeIndex, currentSubtitle);

		// 清除所有旧区域
		regions.clearRegions();

		// 添加当前字幕的区域
		regions.addRegion({
			start: currentSubtitle.start,
			end: currentSubtitle.end,
			color: 'rgba(74, 158, 255, 0.3)',
			drag: false,
			resize: false,
		});

		// 可选：滚动到该区域
		if (masterWaveRef.current) {
			const duration = masterWaveRef.current.getDuration();
			if (duration > 0) {
				const progress = currentSubtitle.start / duration;
				// 不自动跳转，避免干扰播放
				// masterWaveRef.current.seekTo(progress);
			}
		}

	}, [activeIndex, subtitles, showRegions, masterReady]);

	/**
	 * 同步播放进度
	 */
	useEffect(() => {
		if (!masterWaveRef.current || !masterReady) return;
		
		const duration = masterWaveRef.current.getDuration();
		if (duration > 0 && currentTime >= 0) {
			const progress = currentTime / duration;
			masterWaveRef.current.seekTo(progress);
		}
	}, [currentTime, masterReady]);

	return (
		<div className="linguaflow-waveform-manager">
			{error && (
				<div className="linguaflow-waveform-error">
					⚠️ {error}
				</div>
			)}

			{/* 原声波形 */}
			<div className="linguaflow-waveform-section">
				<div className="linguaflow-waveform-header">
					<h4>🎵 Original Audio</h4>
					{masterReady && (
						<span className="linguaflow-waveform-status">Ready</span>
					)}
				</div>
				<div 
					ref={masterWaveContainerRef} 
					className="linguaflow-waveform-container master-wave"
				/>
				{!audioUrl && (
					<div className="linguaflow-waveform-placeholder">
						No audio loaded
					</div>
				)}
			</div>

			{/* 用户录音波形 */}
			<div className="linguaflow-waveform-section">
				<div className="linguaflow-waveform-header">
					<h4>🎤 Your Recording</h4>
					{userReady && (
						<span className="linguaflow-waveform-status user">Ready</span>
					)}
				</div>
				<div 
					ref={userWaveContainerRef} 
					className="linguaflow-waveform-container user-wave"
				/>
				{!userAudioUrl && (
					<div className="linguaflow-waveform-placeholder">
						No recording yet. Start recording to see waveform.
					</div>
				)}
			</div>

			{/* 提示信息 */}
			{showRegions && masterReady && subtitles.length > 0 && (
				<div className="linguaflow-waveform-hint">
					💡 <strong>Tip:</strong> The highlighted region shows the current subtitle
				</div>
			)}
		</div>
	);
}
