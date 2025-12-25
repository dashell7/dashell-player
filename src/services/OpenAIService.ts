/**
 * OpenAI Whisper API 转录结果
 */
export interface TranscriptionResult {
	text: string;
	language?: string;
	duration?: number;
}

/**
 * OpenAI API 错误
 */
export class OpenAIError extends Error {
	constructor(
		message: string,
		public code?: string,
		public status?: number
	) {
		super(message);
		this.name = 'OpenAIError';
	}
}

/**
 * OpenAI 服务
 * 
 * 提供语音转文本（Whisper API）功能
 */
export class OpenAIService {
	private static readonly API_BASE = 'https://api.openai.com/v1';
	private static readonly WHISPER_ENDPOINT = '/audio/transcriptions';

	/**
	 * 语音转文本（使用 Whisper API）
	 * 
	 * @param audioBlob - 音频数据（支持 mp3, mp4, webm, wav 等格式）
	 * @param apiKey - OpenAI API Key
	 * @param options - 转录选项
	 * @returns 转录结果
	 * 
	 * @example
	 * ```typescript
	 * const result = await OpenAIService.transcribe(audioBlob, apiKey, {
	 *   language: 'en',
	 *   prompt: 'This is a conversation about technology.',
	 * });
	 * console.log('Transcribed:', result.text);
	 * ```
	 */
	static async transcribe(
		audioBlob: Blob,
		apiKey: string,
		options?: {
			language?: string;        // 语言代码（如 'en', 'zh'）
			prompt?: string;          // 提示文本（用于引导转录）
			temperature?: number;     // 采样温度 (0-1)
			model?: string;           // 模型名称（默认 whisper-1）
		}
	): Promise<TranscriptionResult> {
		console.log('[OpenAIService] Starting transcription...', {
			blobSize: audioBlob.size,
			blobType: audioBlob.type,
			options,
		});

		// 验证参数
		if (!apiKey || !apiKey.trim()) {
			throw new OpenAIError('API key is required', 'MISSING_API_KEY');
		}

		if (audioBlob.size === 0) {
			throw new OpenAIError('Audio blob is empty', 'EMPTY_AUDIO');
		}

		// 检查文件大小（Whisper API 限制 25MB）
		const MAX_SIZE = 25 * 1024 * 1024; // 25MB
		if (audioBlob.size > MAX_SIZE) {
			throw new OpenAIError(
				`Audio file too large: ${(audioBlob.size / 1024 / 1024).toFixed(2)}MB (max 25MB)`,
				'FILE_TOO_LARGE'
			);
		}

		try {
			// 准备 FormData
			const formData = new FormData();
			
			// 音频文件
			const fileName = `recording.${this.getFileExtension(audioBlob.type)}`;
			formData.append('file', audioBlob, fileName);
			
			// 模型
			formData.append('model', options?.model || 'whisper-1');
			
			// 语言（可选）
			if (options?.language) {
				formData.append('language', options.language);
			}
			
			// 提示（可选）
			if (options?.prompt) {
				formData.append('prompt', options.prompt);
			}
			
			// 温度（可选）
			if (options?.temperature !== undefined) {
				formData.append('temperature', options.temperature.toString());
			}
			
			// 响应格式
			formData.append('response_format', 'json');

			console.log('[OpenAIService] Sending request to Whisper API...');

			// 发送请求
			const response = await fetch(this.API_BASE + this.WHISPER_ENDPOINT, {
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${apiKey}`,
				},
				body: formData,
			});

			console.log('[OpenAIService] Response status:', response.status);

			// 处理错误响应
			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				const errorMessage = errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`;
				
				// 特定错误处理
				if (response.status === 401) {
					throw new OpenAIError(
						'Invalid API key. Please check your OpenAI API key.',
						'INVALID_API_KEY',
						401
					);
				} else if (response.status === 429) {
					throw new OpenAIError(
						'Rate limit exceeded. Please try again later.',
						'RATE_LIMIT',
						429
					);
				} else if (response.status === 413) {
					throw new OpenAIError(
						'Audio file too large for the API.',
						'PAYLOAD_TOO_LARGE',
						413
					);
				}
				
				throw new OpenAIError(errorMessage, errorData.error?.code, response.status);
			}

			// 解析成功响应
			const data = await response.json();
			
			const result: TranscriptionResult = {
				text: data.text || '',
				language: data.language,
				duration: data.duration,
			};

			console.log('[OpenAIService] Transcription successful:', {
				textLength: result.text.length,
				language: result.language,
			});

			return result;

		} catch (error) {
			console.error('[OpenAIService] Transcription failed:', error);
			
			// 重新抛出已知错误
			if (error instanceof OpenAIError) {
				throw error;
			}
			
			// 网络错误
			if (error instanceof TypeError && error.message.includes('fetch')) {
				throw new OpenAIError(
					'Network error. Please check your internet connection.',
					'NETWORK_ERROR'
				);
			}
			
			// 未知错误
			const message = error instanceof Error ? error.message : 'Unknown error';
			throw new OpenAIError(`Transcription failed: ${message}`, 'UNKNOWN_ERROR');
		}
	}

	/**
	 * 根据 MIME 类型获取文件扩展名
	 */
	private static getFileExtension(mimeType: string): string {
		const mimeToExt: Record<string, string> = {
			'audio/webm': 'webm',
			'audio/mp4': 'mp4',
			'audio/mpeg': 'mp3',
			'audio/wav': 'wav',
			'audio/ogg': 'ogg',
			'audio/flac': 'flac',
		};
		
		return mimeToExt[mimeType] || 'webm';
	}

	/**
	 * 验证 API Key 格式
	 */
	static isValidApiKey(apiKey: string): boolean {
		// OpenAI API key 格式：sk-...
		return /^sk-[a-zA-Z0-9]{32,}$/.test(apiKey.trim());
	}

	/**
	 * 估算音频转录成本（美元）
	 * Whisper API: $0.006 / 分钟
	 */
	static estimateCost(durationSeconds: number): number {
		const minutes = durationSeconds / 60;
		return minutes * 0.006;
	}
}
