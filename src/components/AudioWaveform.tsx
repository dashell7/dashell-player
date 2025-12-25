import React, { useEffect, useRef } from 'react';
import type { PlayerRef } from '../types';

interface AudioWaveformProps {
	playerRef: React.RefObject<PlayerRef>;
	isPlaying: boolean;
}

/**
 * 音频波形可视化组件
 * 实时显示音频的频谱
 */
export const AudioWaveform: React.FC<AudioWaveformProps> = ({ playerRef, isPlaying }) => {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const audioContextRef = useRef<AudioContext | null>(null);
	const analyserRef = useRef<AnalyserNode | null>(null);
	const dataArrayRef = useRef<Uint8Array | null>(null);
	const animationIdRef = useRef<number | null>(null);
	const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		// 初始化音频上下文
		const initAudio = async () => {
			try {
				console.log('[AudioWaveform] Initializing audio...');
				
				// 获取视频或音频元素
				const playerElement = playerRef.current;
				if (!playerElement) {
					console.log('[AudioWaveform] No player element');
					return;
				}

				// 尝试从播放器获取媒体元素
				let mediaElement: HTMLMediaElement | null = null;
				
				// 方法1: 尝试 getInternalPlayer 方法
				if ('getInternalPlayer' in playerElement && typeof playerElement.getInternalPlayer === 'function') {
					mediaElement = playerElement.getInternalPlayer();
					console.log('[AudioWaveform] Got media element from getInternalPlayer:', mediaElement);
				}
				
				// 方法2: 直接查找 DOM 中的 video/audio 元素
				if (!mediaElement) {
					const videoElements = document.querySelectorAll('video');
					const audioElements = document.querySelectorAll('audio');
					
					if (videoElements.length > 0) {
						mediaElement = videoElements[0] as HTMLVideoElement;
						console.log('[AudioWaveform] Found video element in DOM');
					} else if (audioElements.length > 0) {
						mediaElement = audioElements[0] as HTMLAudioElement;
						console.log('[AudioWaveform] Found audio element in DOM');
					}
				}
				
				if (!mediaElement) {
					console.log('[AudioWaveform] No media element found');
					return;
				}

				console.log('[AudioWaveform] Media element:', mediaElement.tagName);

				// 创建音频上下文
				if (!audioContextRef.current) {
					audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
					console.log('[AudioWaveform] Created AudioContext');
				}

				const audioContext = audioContextRef.current;

				// 创建分析器节点
				if (!analyserRef.current) {
					analyserRef.current = audioContext.createAnalyser();
					analyserRef.current.fftSize = 512; // 增加FFT大小以获得更多的柱状条（256个频率柱）
					analyserRef.current.smoothingTimeConstant = 0.8; // 平滑处理
				}

				const analyser = analyserRef.current;
				const bufferLength = analyser.frequencyBinCount;
				dataArrayRef.current = new Uint8Array(bufferLength) as Uint8Array;
				console.log('[AudioWaveform] Buffer length:', bufferLength);

				// 创建音频源（注意：一个媒体元素只能连接一次）
				if (!sourceRef.current) {
					try {
						sourceRef.current = audioContext.createMediaElementSource(mediaElement);
						sourceRef.current.connect(analyser);
						analyser.connect(audioContext.destination);
						console.log('[AudioWaveform] Audio source connected successfully');
					} catch (error: any) {
						// 如果已经连接过，可能会抛出错误
						if (error.name === 'InvalidStateError') {
							console.log('[AudioWaveform] Media element already connected to another source');
						} else {
							console.error('[AudioWaveform] Failed to create media source:', error);
						}
					}
				} else {
					console.log('[AudioWaveform] Audio source already exists');
				}

			} catch (error) {
				console.error('[AudioWaveform] Failed to initialize audio:', error);
			}
		};

		// 绘制测试图案（验证canvas可见）
		ctx.fillStyle = 'rgba(34, 197, 94, 0.3)';
		ctx.fillRect(0, canvas.height - 20, canvas.width, 20);
		console.log('[AudioWaveform] Drew test pattern');

		initAudio();

		// 绘制波形
		const draw = () => {
			const canvas = canvasRef.current;
			const analyser = analyserRef.current;
			const dataArray = dataArrayRef.current;
			
			if (!ctx || !canvas || !analyser || !dataArray) {
				console.log('[AudioWaveform] Draw skipped - missing:', {
					ctx: !!ctx,
					canvas: !!canvas,
					analyser: !!analyser,
					dataArray: !!dataArray
				});
				return;
			}

			// 获取频率数据
			// @ts-ignore - Web Audio API类型定义不完全匹配
			analyser.getByteFrequencyData(dataArray);

			// 清空画布
			ctx.clearRect(0, 0, canvas.width, canvas.height);

			// 设置样式 - 使用Obsidian主题强调色
			const barWidth = canvas.width / dataArray.length;
		
			// 从Obsidian主题获取强调色
			const accentColor = getComputedStyle(document.body).getPropertyValue('--interactive-accent').trim();
		
			// 将CSS颜色转换为rgba格式
			const getRgbaFromColor = (color: string, alpha: number): string => {
				if (!color) return `rgba(99, 102, 241, ${alpha})`;
			
				// 如果已经是rgb/rgba格式
				if (color.startsWith('rgb')) {
					const match = color.match(/(\d+),\s*(\d+),\s*(\d+)/);
					if (match) {
						return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${alpha})`;
					}
				}
			
				// 如果是hex格式 (#RRGGBB)
				if (color.startsWith('#')) {
					const hex = color.replace('#', '');
					const r = parseInt(hex.substring(0, 2), 16);
					const g = parseInt(hex.substring(2, 4), 16);
					const b = parseInt(hex.substring(4, 6), 16);
					return `rgba(${r}, ${g}, ${b}, ${alpha})`;
				}
			
				// 默认回退颜色
				return `rgba(99, 102, 241, ${alpha})`;
			};
		
			const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
			// 使用主题色创建渐变，提高不透明度让波形更明显
			gradient.addColorStop(0, getRgbaFromColor(accentColor, 0.4)); // 底部：40%透明度（更亮）
			gradient.addColorStop(0.5, getRgbaFromColor(accentColor, 0.8)); // 中部：80%透明度（更亮）
			gradient.addColorStop(1, getRgbaFromColor(accentColor, 1.0)); // 顶部：100%不透明

			// 绘制柱状图 - 更细的柱子
			for (let i = 0; i < dataArray.length; i++) {
				const value = dataArray[i];
				if (value === undefined) continue;
				
				const barHeight = (value / 255) * canvas.height; // 使用全高度
				const x = i * barWidth;
				const y = canvas.height - barHeight;

				ctx.fillStyle = gradient;
				ctx.fillRect(x, y, barWidth - 1, barHeight); // 更细的柱子间隙
			}

			// 继续动画
			if (isPlaying) {
				animationIdRef.current = requestAnimationFrame(draw);
			}
		};

		// 开始绘制
		if (isPlaying) {
			console.log('[AudioWaveform] Starting draw loop, isPlaying:', isPlaying);
			if (audioContextRef.current?.state === 'suspended') {
				console.log('[AudioWaveform] Resuming suspended AudioContext');
				audioContextRef.current.resume();
			}
			draw();
		} else {
			console.log('[AudioWaveform] Stopping draw loop, isPlaying:', isPlaying);
			// 停止动画并清空画布
			if (animationIdRef.current !== null) {
				cancelAnimationFrame(animationIdRef.current);
			}
			ctx.clearRect(0, 0, canvas.width, canvas.height);
		}

		// 清理
		return () => {
			if (animationIdRef.current !== null) {
				cancelAnimationFrame(animationIdRef.current);
			}
		};
	}, [playerRef, isPlaying]);

	// 使用更大的尺寸以覆盖整个控制栏
	return (
		<canvas
			ref={canvasRef}
			className="linguaflow-audio-waveform"
			width={1200}
			height={60}
		/>
	);
};
