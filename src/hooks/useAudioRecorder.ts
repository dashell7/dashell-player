import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * 录音状态
 */
export type RecordingState = 'idle' | 'recording' | 'paused' | 'error';

/**
 * 录音错误类型
 */
export interface RecordingError {
	type: 'permission_denied' | 'not_supported' | 'unknown';
	message: string;
}

/**
 * 录音 Hook 返回值
 */
export interface UseAudioRecorderReturn {
	state: RecordingState;
	error: RecordingError | null;
	duration: number;
	start: () => Promise<boolean>;
	stop: () => Promise<Blob | null>;
	pause: () => void;
	resume: () => void;
	isRecording: boolean;
	isPaused: boolean;
}

/**
 * 音频录音 Hook
 * 
 * 封装 MediaRecorder API，提供：
 * - 权限请求和错误处理
 * - 录音控制（开始、停止、暂停、恢复）
 * - 时长统计
 * - Blob 数据返回
 * 
 * @example
 * ```typescript
 * const { start, stop, isRecording, error } = useAudioRecorder();
 * 
 * // 开始录音
 * const success = await start();
 * if (!success) {
 *   console.error('Failed to start:', error);
 * }
 * 
 * // 停止录音并获取音频数据
 * const audioBlob = await stop();
 * ```
 */
export function useAudioRecorder(): UseAudioRecorderReturn {
	const [state, setState] = useState<RecordingState>('idle');
	const [error, setError] = useState<RecordingError | null>(null);
	const [duration, setDuration] = useState<number>(0);
	
	const mediaRecorderRef = useRef<MediaRecorder | null>(null);
	const audioChunksRef = useRef<Blob[]>([]);
	const streamRef = useRef<MediaStream | null>(null);
	const startTimeRef = useRef<number>(0);
	const durationIntervalRef = useRef<number | null>(null);

	/**
	 * 清理资源
	 */
	const cleanup = useCallback(() => {
		// 停止定时器
		if (durationIntervalRef.current) {
			clearInterval(durationIntervalRef.current);
			durationIntervalRef.current = null;
		}
		
		// 停止媒体流
		if (streamRef.current) {
			streamRef.current.getTracks().forEach(track => track.stop());
			streamRef.current = null;
		}
		
		// 清空录音数据
		audioChunksRef.current = [];
		mediaRecorderRef.current = null;
		setDuration(0);
	}, []);

	/**
	 * 开始录音
	 */
	const start = useCallback(async (): Promise<boolean> => {
		// 🚨 强制清理，防止多实例运行
		if (mediaRecorderRef.current || streamRef.current) {
			console.warn('[useAudioRecorder] ⚠️ Found active recorder/stream before start, forcing cleanup');
			cleanup();
		}

		try {
			// 检查浏览器支持
			if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
				setError({
					type: 'not_supported',
					message: 'Your browser does not support audio recording',
				});
				setState('error');
				return false;
			}

			// 检查可用的麦克风设备
			console.log('[useAudioRecorder] Checking available devices...');
			try {
				const devices = await navigator.mediaDevices.enumerateDevices();
				const audioInputs = devices.filter(device => device.kind === 'audioinput');
				console.log('[useAudioRecorder] Available audio inputs:', audioInputs.length);
				
				if (audioInputs.length === 0) {
					setError({
						type: 'unknown',
						message: 'No microphone device found. Please connect a microphone and try again.',
					});
					setState('error');
					return false;
				}
				
				audioInputs.forEach((device, index) => {
					console.log(`  [${index}] ${device.label || 'Unnamed device'} (${device.deviceId})`);
				});
			} catch (devErr) {
				console.warn('[useAudioRecorder] Could not enumerate devices:', devErr);
			}

			console.log('[useAudioRecorder] Requesting microphone permission...');

			// 请求麦克风权限
			let stream: MediaStream;
			try {
				// 尝试使用理想的音频设置
				stream = await navigator.mediaDevices.getUserMedia({ 
					audio: {
						echoCancellation: true,
						noiseSuppression: true,
						autoGainControl: true,
					}
				});
			} catch (err) {
				console.warn('[useAudioRecorder] Failed with constraints, trying basic audio...');
				// 如果失败，使用最基本的音频设置
				try {
					stream = await navigator.mediaDevices.getUserMedia({ audio: true });
				} catch (basicErr) {
					throw basicErr; // 重新抛出，让外层 catch 处理
				}
			}

			console.log('[useAudioRecorder] Permission granted');
			streamRef.current = stream;

			// 检测浏览器类型
			const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
			console.log('[useAudioRecorder] Browser detection:', { isSafari, userAgent: navigator.userAgent });

			// 选择 MIME 类型
			let mimeType = '';
			if (isSafari) {
				// Safari/iOS 优先使用 mp4
				if (MediaRecorder.isTypeSupported('audio/mp4')) {
					mimeType = 'audio/mp4';
				} else if (MediaRecorder.isTypeSupported('audio/aac')) {
					mimeType = 'audio/aac';
				} else if (MediaRecorder.isTypeSupported('audio/webm')) {
					mimeType = 'audio/webm'; // 只有当 mp4 不支持时才尝试 webm
				} else {
					console.warn('[useAudioRecorder] No supported MIME type found for Safari, trying default');
					mimeType = ''; // 让浏览器使用默认值
				}
			} else {
				// Chrome/Firefox 优先使用 webm
				if (MediaRecorder.isTypeSupported('audio/webm')) {
					mimeType = 'audio/webm';
				} else if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
					mimeType = 'audio/webm;codecs=opus';
				} else if (MediaRecorder.isTypeSupported('audio/mp4')) {
					mimeType = 'audio/mp4';
				}
			}

			console.log('[useAudioRecorder] Selected MIME type:', mimeType || 'default');
			
			const options: MediaRecorderOptions = {
				audioBitsPerSecond: 128000,
			};
			if (mimeType) {
				options.mimeType = mimeType;
			}

			const mediaRecorder = new MediaRecorder(stream, options);

			mediaRecorderRef.current = mediaRecorder;
			audioChunksRef.current = [];

			// 监听数据
			mediaRecorder.ondataavailable = (event) => {
				if (event.data.size > 0) {
					audioChunksRef.current.push(event.data);
					console.log('[useAudioRecorder] Chunk received:', event.data.size, 'bytes');
				}
			};

			// 监听错误
			mediaRecorder.onerror = (event) => {
				console.error('[useAudioRecorder] MediaRecorder error:', event);
				setError({
					type: 'unknown',
					message: 'Recording error occurred',
				});
				setState('error');
			};

			// 开始录音
			mediaRecorder.start(100); // 每 100ms 收集一次数据
			startTimeRef.current = Date.now();
			setState('recording');
			setError(null);

			// 启动时长统计
			durationIntervalRef.current = window.setInterval(() => {
				const elapsed = (Date.now() - startTimeRef.current) / 1000;
				setDuration(elapsed);
			}, 100);

			console.log('[useAudioRecorder] Recording started');
			return true;

		} catch (err) {
			console.error('[useAudioRecorder] Failed to start recording:', err);

			// 处理不同类型的错误
			if (err instanceof DOMException) {
				switch (err.name) {
					case 'NotAllowedError':
						setError({
							type: 'permission_denied',
							message: 'Microphone permission denied. Please allow microphone access in your browser settings.',
						});
						break;
					
					case 'NotFoundError':
						setError({
							type: 'unknown',
							message: 'No microphone found. Please:\n1. Connect a microphone\n2. Check Windows Sound settings\n3. Ensure microphone is not disabled',
						});
						break;
					
					case 'NotReadableError':
						setError({
							type: 'unknown',
							message: 'Microphone is being used by another application. Please close other apps using the microphone.',
						});
						break;
					
					case 'OverconstrainedError':
						setError({
							type: 'unknown',
							message: 'Microphone does not meet requirements. Trying with different settings...',
						});
						break;
					
					default:
						setError({
							type: 'unknown',
							message: `Microphone error: ${err.message || err.name}`,
						});
				}
			} else {
				setError({
					type: 'unknown',
					message: err instanceof Error ? err.message : 'Failed to start recording',
				});
			}

			setState('error');
			cleanup();
			return false;
		}
	}, [cleanup]);

	/**
	 * 停止录音
	 * @returns 录音的 Blob 对象，失败返回 null
	 */
	const stop = useCallback(async (): Promise<Blob | null> => {
		return new Promise((resolve) => {
			const recorder = mediaRecorderRef.current;
			
			console.log('[useAudioRecorder] ⏹️ Stop requested, recorder:', {
				exists: !!recorder,
				state: recorder?.state,
				chunks: audioChunksRef.current.length
			});
			
			if (!recorder || recorder.state === 'inactive') {
				console.warn('[useAudioRecorder] No active recording');
				cleanup();
				setState('idle');
				resolve(null);
				return;
			}

			// 状态标志，防止多次 resolve（关键：防止异步竞态）
			let isResolved = false;
			const stopRequested = true; // 标记停止已被请求

			// 统一的完成处理函数
			const finalize = () => {
				if (isResolved) return;
				isResolved = true;

				console.log('[useAudioRecorder] ✅ Finalizing recording...');
				
				// 再次确保所有轨道停止（双重保险）
				if (streamRef.current) {
					streamRef.current.getTracks().forEach(t => t.stop());
				}

				if (audioChunksRef.current.length === 0) {
					console.warn('[useAudioRecorder] No audio data recorded');
					cleanup();
					setState('idle');
					resolve(null);
					return;
				}

				// 合并数据
				const mimeType = recorder.mimeType;
				const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
				
				console.log('[useAudioRecorder] 📦 Recording complete:', {
					size: audioBlob.size,
					type: audioBlob.type,
					duration: duration.toFixed(2) + 's',
					chunks: audioChunksRef.current.length,
				});

				cleanup();
				setState('idle');
				resolve(audioBlob);
			};
			
			// 监听停止事件
			recorder.onstop = () => {
				console.log('[useAudioRecorder] 🔔 MediaRecorder onstop fired');
				finalize();
			};

			// 替换 ondataavailable，停止后忽略数据
			recorder.ondataavailable = (event) => {
				if (!stopRequested && event.data.size > 0) {
					audioChunksRef.current.push(event.data);
					console.log('[useAudioRecorder] Chunk received:', event.data.size, 'bytes');
				} else if (stopRequested) {
					console.log('[useAudioRecorder] ⚠️ Ignoring chunk after stop:', event.data.size, 'bytes');
				}
			};

			// 停止录音
			try {
				console.log('[useAudioRecorder] 🛑 Stopping recorder state:', recorder.state);
				
				if (recorder.state === 'recording' || recorder.state === 'paused') {
					recorder.stop();
				}
				
				// 立即停止轨道
				if (streamRef.current) {
					console.log('[useAudioRecorder] 🎤 Stopping media tracks...');
					streamRef.current.getTracks().forEach(track => track.stop());
				} else {
					// 尝试从 recorder 获取 stream (备用)
					// @ts-ignore
					const recStream = recorder.stream;
					if (recStream && typeof recStream.getTracks === 'function') {
						console.log('[useAudioRecorder] 🎤 Stopping tracks from recorder.stream...');
						recStream.getTracks().forEach((t: any) => t.stop());
					}
				}
				
				// 设置超时保护 (1秒)
				setTimeout(() => {
					if (!isResolved) {
						console.warn('[useAudioRecorder] ⏰ Stop timeout triggered, forcing finalize');
						finalize();
					}
				}, 1000);
				
			} catch (error) {
				console.error('[useAudioRecorder] ❌ Error stopping recorder:', error);
				finalize(); // 出错也强制完成
			}
		});
	}, [cleanup, duration]);

	/**
	 * 暂停录音
	 */
	const pause = useCallback(() => {
		const recorder = mediaRecorderRef.current;
		if (recorder && recorder.state === 'recording') {
			recorder.pause();
			setState('paused');
			
			// 停止时长统计
			if (durationIntervalRef.current) {
				clearInterval(durationIntervalRef.current);
				durationIntervalRef.current = null;
			}
			
			console.log('[useAudioRecorder] Recording paused');
		}
	}, []);

	/**
	 * 恢复录音
	 */
	const resume = useCallback(() => {
		const recorder = mediaRecorderRef.current;
		if (recorder && recorder.state === 'paused') {
			recorder.resume();
			setState('recording');
			
			// 恢复时长统计
			const pausedDuration = duration;
			startTimeRef.current = Date.now() - pausedDuration * 1000;
			durationIntervalRef.current = window.setInterval(() => {
				const elapsed = (Date.now() - startTimeRef.current) / 1000;
				setDuration(elapsed);
			}, 100);
			
			console.log('[useAudioRecorder] Recording resumed');
		}
	}, [duration]);

	// 组件卸载时清理资源（防止内存泄漏）
	useEffect(() => {
		return () => {
			console.log('[useAudioRecorder] Component unmounting, cleaning up...');
			cleanup();
		};
	}, [cleanup]);

	return {
		state,
		error,
		duration,
		start,
		stop,
		pause,
		resume,
		isRecording: state === 'recording',
		isPaused: state === 'paused',
	};
}
