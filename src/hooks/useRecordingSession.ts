import { useState, useCallback, useEffect } from 'react';
import { useAudioRecorder } from './useAudioRecorder';
import { OpenAIService } from '../services/OpenAIService';
import { SpeechEvaluator, type EvaluationResult } from '../services/SpeechEvaluator';
import { AzurePronunciationService } from '../services/AzurePronunciationService';
import type LinguaFlowPlugin from '../main';
import type { SubtitleCue } from '../types';
import { useMediaStore } from '../store/mediaStore';

export interface UseRecordingSessionReturn {
	// 录音器状态
	isRecording: boolean;
	isPaused: boolean;
	duration: number;
	recorderError: any;
	
	// 会话状态
	isTranscribing: boolean;
	transcriptionResult: string | null;
	evaluation: EvaluationResult | null;
	sessionError: string | null;
	recordingBlobUrl: string | null;
	targetSubtitle: SubtitleCue | null;
	
	// 操作
	startRecording: (subtitle?: SubtitleCue) => Promise<void>;
	stopRecording: () => Promise<void>;
	pauseRecording: () => void;
	resumeRecording: () => void;
}

export function useRecordingSession(plugin: LinguaFlowPlugin): UseRecordingSessionReturn {
	const { start, stop, pause, resume, isRecording, isPaused, duration, error: recorderError } = useAudioRecorder();
	
	const [isTranscribing, setIsTranscribing] = useState(false);
	const [transcriptionResult, setTranscriptionResult] = useState<string | null>(null);
	const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);
	const [sessionError, setSessionError] = useState<string | null>(null);
	const [recordingBlobUrl, setRecordingBlobUrl] = useState<string | null>(null);
	const [targetSubtitle, setTargetSubtitle] = useState<SubtitleCue | null>(null);

	// 内存清理：组件卸载或 URL 更新时清理 Blob URL
	useEffect(() => {
		return () => {
			if (recordingBlobUrl) {
				console.debug('[useRecordingSession] Revoking Blob URL');
				URL.revokeObjectURL(recordingBlobUrl);
			}
		};
	}, [recordingBlobUrl]);
	
	// 获取 Store 中的当前字幕（如果未指定 target）
	const activeIndex = useMediaStore(state => state.activeIndex);
	const subtitles = useMediaStore(state => state.subtitles);

	const startRecording = useCallback(async (subtitle?: SubtitleCue) => {
		setSessionError(null);
		setTranscriptionResult(null);
		setEvaluation(null);
		
		// 确定目标字幕
		let currentTarget: SubtitleCue | undefined = subtitle;
		if (!currentTarget) {
			if (activeIndex >= 0 && activeIndex < subtitles.length) {
				currentTarget = subtitles[activeIndex];
			}
		}
		setTargetSubtitle(currentTarget || null);
		
		// 如果没有目标字幕，提示用户
		if (!currentTarget) {
			setSessionError('请先选择一个字幕项');
			return;
		}
		
		// 清理旧的录音 URL
		if (recordingBlobUrl) {
			URL.revokeObjectURL(recordingBlobUrl);
			setRecordingBlobUrl(null);
		}
		
		const success = await start();
		if (!success) {
			setSessionError('Failed to start recording');
		}
	}, [start, recordingBlobUrl, activeIndex, subtitles]);

	const transcribeAndEvaluate = useCallback(async (audioBlob: Blob, referenceSubtitle: SubtitleCue) => {
		console.log('[RecordingSession] transcribeAndEvaluate started');
		setIsTranscribing(true);
		setSessionError(null);
		const apiKey = plugin.settings.sttApiKey || plugin.settings.openaiApiKey;

		try {
			if (!audioBlob || audioBlob.size === 0) {
				throw new Error('Invalid audio data');
			}
			
			if (!referenceSubtitle || !referenceSubtitle.text) {
				throw new Error('Reference subtitle is missing or invalid');
			}
			
			console.log('[RecordingSession] Audio blob size:', audioBlob.size);
			console.log('[RecordingSession] Reference text:', referenceSubtitle.text);
			// 根据服务提供商选择不同的处理流程
			if (plugin.settings.speechProvider === 'azure') {
				// ===== Azure 模式 =====
				const azureKey = plugin.settings.sttApiKey || plugin.settings.azureSubscriptionKey;
				const azureRegion = plugin.settings.sttBaseUrl || plugin.settings.azureRegion;
				
				if (!azureKey || !azureRegion) {
					throw new Error('请在插件设置中配置 Azure Subscription Key 和 Region');
				}

				console.log('[RecordingSession] Using Azure Speech Services...');
				
				const azureResult = await AzurePronunciationService.assessPronunciation(
					audioBlob,
					azureKey,
					azureRegion,
					{
						referenceText: referenceSubtitle.text,
						language: 'en-US',
						granularity: 'Word',
						dimension: 'Comprehensive',
					}
				);

				console.log('[RecordingSession] Azure result:', azureResult);
				setTranscriptionResult(azureResult.text);

				const evalResult: EvaluationResult = {
					score: azureResult.pronunciationScore,
					accuracy: azureResult.accuracyScore / 100,
					totalWords: azureResult.words.length,
					correctWords: azureResult.words.filter(w => w.errorType === 'None').length,
					insertedWords: azureResult.words.filter(w => w.errorType === 'Insertion').length,
					deletedWords: azureResult.words.filter(w => w.errorType === 'Omission').length,
					diffHtml: '', 
					details: {
						original: referenceSubtitle.text,
						transcribed: azureResult.text,
						normalizedOriginal: referenceSubtitle.text.toLowerCase(),
						normalizedTranscribed: azureResult.text.toLowerCase(),
					},
					azureAssessment: {
						pronunciationScore: azureResult.pronunciationScore,
						accuracyScore: azureResult.accuracyScore,
						fluencyScore: azureResult.fluencyScore,
						completenessScore: azureResult.completenessScore,
						wordDetails: azureResult.words.map(w => ({
							word: w.word,
							score: w.accuracyScore,
							errorType: w.errorType,
						})),
					},
					finalScore: azureResult.pronunciationScore,
				};

				console.log('[RecordingSession] Setting evaluation result (Azure):', evalResult);
				setEvaluation(evalResult);
				console.log('[RecordingSession] ✅ Evaluation state updated (Azure)');

			} else {
				// ===== OpenAI 模式 =====
				if (!apiKey || !apiKey.trim()) {
					throw new Error('请在插件设置中配置 OpenAI API Key');
				}

				console.log('[RecordingSession] Using OpenAI Whisper...');
				
				const result = await OpenAIService.transcribe(audioBlob, apiKey, {
					language: 'en',
					prompt: referenceSubtitle.text,
				});

				console.log('[RecordingSession] Transcription result:', result.text);
				setTranscriptionResult(result.text);

				console.log('[RecordingSession] Evaluating speech...');
				const evalResult = SpeechEvaluator.evaluate(
					referenceSubtitle.text,
					result.text
				);

				console.log('[RecordingSession] Evaluation score:', evalResult.score);
				console.log('[RecordingSession] Setting evaluation result (OpenAI):', evalResult);
				setEvaluation(evalResult);
				console.log('[RecordingSession] ✅ Evaluation state updated (OpenAI)');
			}

		} catch (err: any) {
			console.error('[RecordingSession] ❌ Error in transcribeAndEvaluate:', err);
			setSessionError(err.message || 'Processing failed');
		} finally {
			console.log('[RecordingSession] Setting isTranscribing to false');
			setIsTranscribing(false);
			console.log('[RecordingSession] ✅ transcribeAndEvaluate completed');
		}
	}, [plugin.settings]);

	const stopRecording = useCallback(async () => {
		console.log('[RecordingSession] Stopping recording...');
		
		try {
			const audioBlob = await stop();
			
			if (!audioBlob) {
				console.error('[RecordingSession] No audio blob received');
				setSessionError('No audio recorded');
				return;
			}

			console.log('[RecordingSession] Audio blob size:', audioBlob.size, 'bytes');
			const blobUrl = URL.createObjectURL(audioBlob);
			
			// 自动转录
			const canTranscribe = 
				(plugin.settings.speechProvider === 'openai' || plugin.settings.speechProvider === 'custom') ||
				(plugin.settings.speechProvider === 'azure');
			
			console.log('[RecordingSession] Speech provider:', plugin.settings.speechProvider);
			console.log('[RecordingSession] Can transcribe:', canTranscribe);
			console.log('[RecordingSession] Target subtitle:', targetSubtitle ? targetSubtitle.text : 'None');
			
			// 关键修复：先设置转录状态，再设置 Blob URL
			// 这样当 UI 监听到 Blob URL 更新并尝试显示弹窗时，isTranscribing 已经是 true 了
			// 避免弹窗因为 !evaluation && !isTranscribing 而直接返回 null
			if (canTranscribe && targetSubtitle) {
				console.log('[RecordingSession] Setting isTranscribing = true BEFORE setting blobUrl');
				setIsTranscribing(true);
			}

			console.log('[RecordingSession] Setting recordingBlobUrl:', blobUrl.substring(0, 50) + '...');
			setRecordingBlobUrl(blobUrl);
			
			if (canTranscribe && targetSubtitle) {
				console.log('[RecordingSession] Starting transcription and evaluation...');
				await transcribeAndEvaluate(audioBlob, targetSubtitle);
				console.log('[RecordingSession] Transcription and evaluation completed');
			} else if (!targetSubtitle) {
				console.error('[RecordingSession] No reference subtitle for evaluation');
				setSessionError('No reference subtitle selected for evaluation');
			} else {
				console.error('[RecordingSession] Cannot transcribe with current provider');
				setSessionError(`Speech provider "${plugin.settings.speechProvider}" not supported for transcription`);
			}
		} catch (error) {
			console.error('[RecordingSession] Error in stopRecording:', error);
			setSessionError(error instanceof Error ? error.message : 'Failed to stop recording');
		}
	}, [stop, plugin.settings, targetSubtitle, transcribeAndEvaluate]);

	return {
		isRecording,
		isPaused,
		duration,
		recorderError,
		isTranscribing,
		transcriptionResult,
		evaluation,
		sessionError,
		recordingBlobUrl,
		targetSubtitle,
		startRecording,
		stopRecording,
		pauseRecording: pause,
		resumeRecording: resume,
	};
}
