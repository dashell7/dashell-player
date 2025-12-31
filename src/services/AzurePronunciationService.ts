/**
 * Azure 发音评估服务
 * 
 * 使用 Azure Speech Services 的 Pronunciation Assessment API
 * 提供专业的多维度发音评分
 */

import { requestUrl, arrayBufferToBase64 } from 'obsidian';

/**
 * Azure 发音评估结果
 */
export interface AzurePronunciationResult {
	// 综合评分
	pronunciationScore: number;     // 0-100，综合发音分数
	accuracyScore: number;          // 0-100，准确度分数
	fluencyScore: number;           // 0-100，流利度分数
	completenessScore: number;      // 0-100，完整度分数
	
	// 转录文本
	text: string;
	
	// 词级别详情
	words: WordAssessment[];
	
	// 原始响应
	raw?: any;
}

/**
 * 单词评估
 */
export interface WordAssessment {
	word: string;
	accuracyScore: number;
	errorType: 'None' | 'Omission' | 'Insertion' | 'Mispronunciation' | 'UnexpectedBreak' | 'MissingBreak';
	offset?: number;
	duration?: number;
}

/**
 * 评估选项
 */
export interface PronunciationAssessmentOptions {
	referenceText: string;          // 参考文本（原文）
	language?: string;              // 语言代码，默认 'en-US'
	granularity?: 'Phoneme' | 'Word' | 'FullText';  // 评估粒度
	dimension?: 'Comprehensive' | 'Basic';           // 评估维度
	enableMiscue?: boolean;         // 是否检测误读
	enableProsody?: boolean;        // 是否评估韵律
}

/**
 * Azure 发音评估服务
 */
export class AzurePronunciationService {
	/**
	 * 转换音频为 WAV PCM 格式
	 * Azure Speech Services 只支持 WAV PCM 格式
	 */
	private static async convertToWav(audioBlob: Blob): Promise<Blob> {
		try {
			console.log('[AzurePronunciation] Converting audio to WAV PCM...');
			
			// 创建 AudioContext (16kHz 是 Azure 推荐的采样率)
			const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
				sampleRate: 16000,
			});

			// 读取音频数据
			const arrayBuffer = await audioBlob.arrayBuffer();
			const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

			// 使用 AudioContext 的采样率（确保是 16kHz）
			const targetSampleRate = 16000;
			const sourceSampleRate = audioBuffer.sampleRate || 48000; // 默认 48kHz
			
			console.log(`[AzurePronunciation] Source sample rate: ${sourceSampleRate}Hz`);
			
			// 如果原始采样率不是 16kHz，需要重采样
			let channelData: Float32Array;
			if (sourceSampleRate !== targetSampleRate) {
				console.log(`[AzurePronunciation] Resampling from ${sourceSampleRate}Hz to ${targetSampleRate}Hz`);
				channelData = this.resampleAudio(audioBuffer.getChannelData(0), sourceSampleRate, targetSampleRate);
			} else {
				channelData = audioBuffer.getChannelData(0);
			}
			
			// 转换为 16-bit PCM
			const pcmData = new Int16Array(channelData.length);
			for (let i = 0; i < channelData.length; i++) {
				// 转换浮点数 [-1, 1] 到 16-bit 整数
				const sample = channelData[i] ?? 0;
				const s = Math.max(-1, Math.min(1, sample));
				pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
			}

			// 创建 WAV 文件头
			const wavHeader = this.createWavHeader(pcmData.length * 2, targetSampleRate, 1, 16);
			
			// 合并头部和数据
			const wavBlob = new Blob([wavHeader, pcmData], { type: 'audio/wav' });
			
			console.log('[AzurePronunciation] Converted to WAV:', wavBlob.size, 'bytes');
			
			// 关闭 AudioContext
			await audioContext.close();
			
			return wavBlob;
		} catch (error) {
			console.error('[AzurePronunciation] Audio conversion failed:', error);
			throw new Error('Failed to convert audio format. Please try recording again.');
		}
	}

	/**
	 * 音频重采样（简单的线性插值）
	 */
	private static resampleAudio(
		audioData: Float32Array,
		sourceSampleRate: number,
		targetSampleRate: number
	): Float32Array {
		if (sourceSampleRate === targetSampleRate) {
			return audioData;
		}

		const ratio = sourceSampleRate / targetSampleRate;
		const targetLength = Math.round(audioData.length / ratio);
		const resampled = new Float32Array(targetLength);

		for (let i = 0; i < targetLength; i++) {
			const sourceIndex = i * ratio;
			const index = Math.floor(sourceIndex);
			const fraction = sourceIndex - index;

			if (index + 1 < audioData.length) {
				// 线性插值
				const sample1 = audioData[index] ?? 0;
				const sample2 = audioData[index + 1] ?? 0;
				resampled[i] = sample1 * (1 - fraction) + sample2 * fraction;
			} else {
				resampled[i] = audioData[index] ?? 0;
			}
		}

		return resampled;
	}

	/**
	 * 创建 WAV 文件头
	 */
	private static createWavHeader(
		dataLength: number,
		sampleRate: number,
		numChannels: number,
		bitsPerSample: number
	): ArrayBuffer {
		const buffer = new ArrayBuffer(44);
		const view = new DataView(buffer);

		// RIFF chunk descriptor
		this.writeString(view, 0, 'RIFF');
		view.setUint32(4, 36 + dataLength, true);
		this.writeString(view, 8, 'WAVE');

		// fmt sub-chunk
		this.writeString(view, 12, 'fmt ');
		view.setUint32(16, 16, true); // fmt chunk size
		view.setUint16(20, 1, true); // audio format (1 = PCM)
		view.setUint16(22, numChannels, true);
		view.setUint32(24, sampleRate, true);
		view.setUint32(28, sampleRate * numChannels * bitsPerSample / 8, true); // byte rate
		view.setUint16(32, numChannels * bitsPerSample / 8, true); // block align
		view.setUint16(34, bitsPerSample, true);

		// data sub-chunk
		this.writeString(view, 36, 'data');
		view.setUint32(40, dataLength, true);

		return buffer;
	}

	/**
	 * 写入字符串到 DataView
	 */
	private static writeString(view: DataView, offset: number, string: string): void {
		for (let i = 0; i < string.length; i++) {
			view.setUint8(offset + i, string.charCodeAt(i));
		}
	}

	/**
	 * 评估发音
	 * 
	 * @param audioBlob 音频 Blob
	 * @param subscriptionKey Azure Subscription Key
	 * @param region Azure 区域（如 'eastus'）
	 * @param options 评估选项
	 * @returns 发音评估结果
	 */
	static async assessPronunciation(
		audioBlob: Blob,
		subscriptionKey: string,
		region: string,
		options: PronunciationAssessmentOptions
	): Promise<AzurePronunciationResult> {
		
		if (!subscriptionKey || !subscriptionKey.trim()) {
			throw new Error('Azure Subscription Key is required');
		}

		if (!region || !region.trim()) {
			throw new Error('Azure region is required');
		}

		if (!options.referenceText || !options.referenceText.trim()) {
			throw new Error('Reference text is required');
		}

		console.log('[AzurePronunciation] Starting assessment...');
		console.log('[AzurePronunciation] Reference text:', options.referenceText);
		console.log('[AzurePronunciation] Audio size:', audioBlob.size, 'bytes');
		console.log('[AzurePronunciation] Audio type:', audioBlob.type);

		// 预检查音频质量
		if (audioBlob.size < 1000) {
			throw new Error('录音文件太小（< 1KB），可能录音时间太短或没有录到声音。请确保：\n1. 录音时间 > 2秒\n2. 麦克风权限已开启\n3. 说话音量足够大');
		}
		
		if (audioBlob.size > 10 * 1024 * 1024) {
			throw new Error('录音文件太大（> 10MB），可能录音时间过长。建议单句录音时长控制在 10 秒以内。');
		}

		try {
			// 转换音频为 WAV PCM 格式
			const wavBlob = await this.convertToWav(audioBlob);
			
			// 构建 API 端点
			const endpoint = `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1`;

			// 构建查询参数
			const params = new URLSearchParams({
				language: options.language || 'en-US',
				format: 'detailed',
			});

			// 构建 Pronunciation Assessment 配置
			// 注意：Azure API 要求使用 PascalCase（首字母大写）
			// 只包含最基本的必需字段，避免可选字段导致问题
			const pronunciationConfig = {
				ReferenceText: options.referenceText,
				GradingSystem: 'HundredMark',
				Granularity: 'Phoneme',
				Dimension: 'Comprehensive',
			};

			const configJson = JSON.stringify(pronunciationConfig);
			
			// 关键修复：使用 Obsidian API 进行 Base64 编码（兼容移动端）
			// 移动端没有 Node.js Buffer 对象，必须使用 TextEncoder + arrayBufferToBase64
			const configBytes = new TextEncoder().encode(configJson);
			const configBase64 = arrayBufferToBase64(configBytes.buffer);

			// 使用 WAV PCM 格式
			const contentType = 'audio/wav; codecs=audio/pcm; samplerate=16000';

			console.log('[AzurePronunciation] Content-Type:', contentType);
			console.log('[AzurePronunciation] Pronunciation Config (JSON):', configJson);
			console.log('[AzurePronunciation] Pronunciation Config (Base64):', configBase64);
			console.log('[AzurePronunciation] Request URL:', `${endpoint}?${params.toString()}`);
			console.log('[AzurePronunciation] WAV Blob size:', wavBlob.size, 'type:', wavBlob.type);

			// 转换 Blob 为 ArrayBuffer（requestUrl 需要）
			const wavArrayBuffer = await wavBlob.arrayBuffer();
			console.log('[AzurePronunciation] WAV ArrayBuffer size:', wavArrayBuffer.byteLength);

			// 发送请求（使用 Obsidian 的 requestUrl）
			const response = await requestUrl({
				url: `${endpoint}?${params.toString()}`,
				method: 'POST',
				headers: {
					'Ocp-Apim-Subscription-Key': subscriptionKey,
					'Content-Type': contentType,
					'Pronunciation-Assessment': configBase64, // 发送 Base64 编码的配置
				},
				body: wavArrayBuffer,
			});
			
			console.log('[AzurePronunciation] Response status:', response.status);

			if (response.status !== 200) {
				const errorText = response.text || JSON.stringify(response.json);
				console.error('[AzurePronunciation] API Error:', response.status, errorText);
				
				// 处理常见错误
				if (response.status === 401) {
					throw new Error('Azure authentication failed. Please check your Subscription Key.');
				} else if (response.status === 400) {
					throw new Error('Invalid request. Please check audio format and reference text.');
				} else if (response.status === 403) {
					throw new Error('Access denied. Please check your Azure subscription status.');
				}
				
				throw new Error(`Azure API error: ${response.status}`);
			}

			const result = response.json;
			console.log('[AzurePronunciation] Raw result:', result);

			// 解析结果
			return this.parseResult(result);

		} catch (error) {
			console.error('[AzurePronunciation] Assessment failed:', error);
			
			if (error instanceof Error) {
				throw error;
			}
			
			throw new Error('Pronunciation assessment failed. Please check your network connection and API credentials.');
		}
	}

	/**
	 * 解析 Azure API 响应
	 */
	private static parseResult(result: any): AzurePronunciationResult {
		// Azure 返回的结果在 NBest 数组中
		if (!result || typeof result !== 'object') {
			throw new Error('Invalid response structure from Azure API');
		}
		
		const best = result.NBest?.[0];
		
		if (!best) {
			console.error('[AzurePronunciation] Invalid response:', result);
			console.error('[AzurePronunciation] Full response structure:', JSON.stringify(result, null, 2));
			
			// 检查常见问题
			const errorMessages: string[] = [];
			errorMessages.push('Azure 无法识别您的录音');
			
			if (result.RecognitionStatus === 'NoMatch') {
				errorMessages.push('- 可能原因：录音内容与参考文本不匹配');
			}
			if (result.RecognitionStatus === 'InitialSilenceTimeout') {
				errorMessages.push('- 可能原因：录音时间太短或开始时太安静');
			}
			if (result.RecognitionStatus === 'BabbleTimeout') {
				errorMessages.push('- 可能原因：背景噪音太大');
			}
			if (result.RecognitionStatus === 'Error') {
				errorMessages.push('- 可能原因：音频格式或质量问题');
			}
			
			// 添加通用建议
			errorMessages.push('\n请检查：');
			errorMessages.push('1. 录音时间是否足够（建议 > 2秒）');
			errorMessages.push('2. 音量是否足够大且清晰');
			errorMessages.push('3. 是否按照参考文本朗读');
			errorMessages.push('4. 周围环境是否安静');
			
			throw new Error(errorMessages.join('\n'));
		}

		const assessment = best.PronunciationAssessment || best; // 关键修复：如果找不到嵌套对象，就直接用 best 对象
		
		if (!assessment.PronScore && !assessment.AccuracyScore) {
			console.warn('[AzurePronunciation] Warning: Could not find scores in response.');
			console.warn('[AzurePronunciation] Response structure:', JSON.stringify(best));
		}

		const scores = assessment || {};
		const words: WordAssessment[] = [];

		// 解析词级别评估
		if (best.Words && Array.isArray(best.Words)) {
			for (const wordData of best.Words) {
				// 关键修复：同样检查直接属性
				const wordAssessment = wordData.PronunciationAssessment || wordData;
				words.push({
					word: wordData.Word || '',
					accuracyScore: wordAssessment.AccuracyScore || 0,
					errorType: wordAssessment.ErrorType || 'None',
					offset: wordData.Offset,
					duration: wordData.Duration,
				});
			}
		}

		return {
			pronunciationScore: scores.PronScore || 0,
			accuracyScore: scores.AccuracyScore || 0,
			fluencyScore: scores.FluencyScore || 0,
			completenessScore: scores.CompletenessScore || 0,
			text: best.Display || best.Lexical || '',
			words,
			raw: result,
		};
	}

	/**
	 * 获取评分等级
	 */
	static getGrade(score: number): {
		grade: string;
		color: string;
		message: string;
	} {
		if (score >= 90) {
			return {
				grade: 'A',
				color: '#28a745',
				message: 'Excellent! Nearly native-like pronunciation!',
			};
		} else if (score >= 80) {
			return {
				grade: 'B',
				color: '#007bff',
				message: 'Very good! Clear and understandable pronunciation.',
			};
		} else if (score >= 70) {
			return {
				grade: 'C',
				color: '#ffc107',
				message: 'Good! Some pronunciation improvements needed.',
			};
		} else if (score >= 60) {
			return {
				grade: 'D',
				color: '#fd7e14',
				message: 'Fair. Consider practicing more on problem areas.',
			};
		} else {
			return {
				grade: 'F',
				color: '#dc3545',
				message: 'Keep practicing! Focus on accuracy and clarity.',
			};
		}
	}

	/**
	 * 格式化评分详情
	 */
	static formatScoreDetails(result: AzurePronunciationResult): string {
		const details: string[] = [];
		
		details.push(`Overall: ${result.pronunciationScore.toFixed(1)}/100`);
		details.push(`Accuracy: ${result.accuracyScore.toFixed(1)}/100`);
		details.push(`Fluency: ${result.fluencyScore.toFixed(1)}/100`);
		details.push(`Completeness: ${result.completenessScore.toFixed(1)}/100`);
		
		// 统计错误词
		const errors = result.words.filter(w => w.errorType !== 'None');
		if (errors.length > 0) {
			details.push(`\nErrors found in ${errors.length} word(s):`);
			errors.forEach(err => {
				details.push(`  - ${err.word}: ${err.errorType}`);
			});
		}
		
		return details.join('\n');
	}
}
