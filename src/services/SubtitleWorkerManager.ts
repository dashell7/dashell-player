/**
 * Subtitle Worker Manager
 * 管理 Web Worker，提供异步字幕解析接口
 */

import type { SubtitleCue, SubtitleFormat } from '../types';

interface ParseRequest {
	type: 'parse';
	text: string;
	format?: SubtitleFormat;
	id: string;
}

interface ParseResponse {
	type: 'result' | 'error' | 'progress';
	id: string;
	data?: SubtitleCue[];
	error?: string;
	progress?: number;
}

interface PendingRequest {
	resolve: (cues: SubtitleCue[]) => void;
	reject: (error: Error) => void;
	onProgress?: (progress: number) => void;
}

/**
 * Web Worker 管理器
 * 单例模式，管理字幕解析 Worker 的生命周期
 */
export class SubtitleWorkerManager {
	private static instance: SubtitleWorkerManager | null = null;
	private worker: Worker | null = null;
	private pendingRequests: Map<string, PendingRequest> = new Map();
	private requestIdCounter: number = 0;
	private isSupported: boolean = false;
	
	private constructor() {
		this.isSupported = typeof Worker !== 'undefined';
		
		if (this.isSupported) {
			this.initWorker();
		} else {
			console.warn('[SubtitleWorker] Web Worker not supported in this environment');
		}
	}
	
	/**
	 * 获取单例实例
	 */
	public static getInstance(): SubtitleWorkerManager {
		if (!SubtitleWorkerManager.instance) {
			SubtitleWorkerManager.instance = new SubtitleWorkerManager();
		}
		return SubtitleWorkerManager.instance;
	}
	
	/**
	 * 初始化 Worker
	 */
	private initWorker(): void {
		try {
			// 使用内联 Worker（避免单独文件加载问题）
			const workerCode = this.getWorkerCode();
			const blob = new Blob([workerCode], { type: 'application/javascript' });
			const workerUrl = URL.createObjectURL(blob);
			
			this.worker = new Worker(workerUrl);
			this.worker.addEventListener('message', this.handleMessage.bind(this));
			this.worker.addEventListener('error', this.handleError.bind(this));
			
			console.log('[SubtitleWorker] Worker initialized');
		} catch (error) {
			console.error('[SubtitleWorker] Failed to initialize worker:', error);
			this.isSupported = false;
		}
	}
	
	/**
	 * 处理 Worker 消息
	 */
	private handleMessage(event: MessageEvent<ParseResponse>): void {
		const { type, id, data, error, progress } = event.data;
		const pending = this.pendingRequests.get(id);
		
		if (!pending) {
			console.warn('[SubtitleWorker] Received response for unknown request:', id);
			return;
		}
		
		switch (type) {
			case 'result':
				if (data) {
					pending.resolve(data);
					this.pendingRequests.delete(id);
				}
				break;
				
			case 'error':
				pending.reject(new Error(error || 'Unknown worker error'));
				this.pendingRequests.delete(id);
				break;
				
			case 'progress':
				if (pending.onProgress && progress !== undefined) {
					pending.onProgress(progress);
				}
				break;
		}
	}
	
	/**
	 * 处理 Worker 错误
	 */
	private handleError(event: ErrorEvent): void {
		console.error('[SubtitleWorker] Worker error:', event.message);
		
		// 拒绝所有待处理的请求
		this.pendingRequests.forEach((pending) => {
			pending.reject(new Error('Worker error: ' + event.message));
		});
		this.pendingRequests.clear();
	}
	
	/**
	 * 异步解析字幕
	 */
	public async parse(
		text: string,
		format?: SubtitleFormat,
		onProgress?: (progress: number) => void
	): Promise<SubtitleCue[]> {
		if (!this.isSupported || !this.worker) {
			// 降级到同步解析
			console.warn('[SubtitleWorker] Falling back to synchronous parsing');
			return this.parseFallback(text, format);
		}
		
		const id = `request-${this.requestIdCounter++}`;
		
		return new Promise((resolve, reject) => {
			this.pendingRequests.set(id, { resolve, reject, onProgress });
			
			const request: ParseRequest = {
				type: 'parse',
				text,
				format,
				id
			};
			
			this.worker!.postMessage(request);
			
			// 超时保护（30秒）
			setTimeout(() => {
				if (this.pendingRequests.has(id)) {
					this.pendingRequests.delete(id);
					reject(new Error('Worker timeout after 30s'));
				}
			}, 30000);
		});
	}
	
	/**
	 * 检查是否支持 Worker
	 */
	public isWorkerSupported(): boolean {
		return this.isSupported && this.worker !== null;
	}
	
	/**
	 * 终止 Worker
	 */
	public terminate(): void {
		if (this.worker) {
			this.worker.terminate();
			this.worker = null;
			console.log('[SubtitleWorker] Worker terminated');
		}
		this.pendingRequests.clear();
	}
	
	/**
	 * 降级方案：同步解析（复制主解析逻辑）
	 */
	private parseFallback(text: string, format?: SubtitleFormat): SubtitleCue[] {
		// 这里需要导入 SubtitleParser 的同步解析方法
		// 为了避免循环依赖，暂时返回空数组，实际应该调用 SubtitleParser.parse
		console.error('[SubtitleWorker] Fallback not implemented, please use SubtitleParser directly');
		return [];
	}
	
	/**
	 * 获取 Worker 代码（内联）
	 * 注意：这里需要将 Worker 代码作为字符串嵌入
	 */
	private getWorkerCode(): string {
		// 简化版 Worker 代码（完整版应该从 worker 文件编译）
		return `
			// 检测字幕格式
			function detectFormat(text) {
				const trimmed = text.trim();
				if (trimmed.startsWith('WEBVTT')) return 'vtt';
				const firstLine = trimmed.split('\\n')[0];
				if (firstLine && /^\\d+\\s*$/m.test(firstLine)) return 'srt';
				if (trimmed.includes('[Script Info]')) return 'ass';
				return 'unknown';
			}
			
			// 解析时间戳
			function parseTimestamp(timestamp) {
				const normalized = timestamp.replace(',', '.');
				const parts = normalized.split(':');
				if (parts.length === 3) {
					const hours = parseInt(parts[0] || '0', 10);
					const minutes = parseInt(parts[1] || '0', 10);
					const secondsParts = (parts[2] || '0').split('.');
					const seconds = parseInt(secondsParts[0] || '0', 10);
					const milliseconds = parseInt((secondsParts[1] || '0').padEnd(3, '0'), 10);
					return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
				}
				return 0;
			}
			
			// 简单语言分离
			function separateLanguages(text) {
				const lines = text.split('\\n');
				let textEn, textZh;
				for (const line of lines) {
					const trimmed = line.trim();
					if (!trimmed) continue;
					if (/[\\u4e00-\\u9fa5]/.test(trimmed)) {
						textZh = textZh ? textZh + '\\n' + trimmed : trimmed;
					} else {
						textEn = textEn ? textEn + '\\n' + trimmed : trimmed;
					}
				}
				return { textEn, textZh };
			}
			
			// 解析 SRT
			function parseSRT(text) {
				const cues = [];
				const blocks = text.split(/\\n\\s*\\n/).filter(b => b.trim());
				const totalBlocks = blocks.length;
				
				for (let i = 0; i < blocks.length; i++) {
					const block = blocks[i];
					if (!block) continue;
					
					if (i % 50 === 0) {
						self.postMessage({
							type: 'progress',
							progress: Math.floor((i / totalBlocks) * 100)
						});
					}
					
					const lines = block.split('\\n').map(l => l.trim());
					if (lines.length < 3) continue;
					
					const index = parseInt(lines[0], 10);
					if (isNaN(index)) continue;
					
					const timeMatch = lines[1].match(/(\\d{2}:\\d{2}:\\d{2},\\d{3})\\s*-->\\s*(\\d{2}:\\d{2}:\\d{2},\\d{3})/);
					if (!timeMatch) continue;
					
					const start = parseTimestamp(timeMatch[1]);
					const end = parseTimestamp(timeMatch[2]);
					const text = lines.slice(2).join('\\n');
					const { textEn, textZh } = separateLanguages(text);
					
					cues.push({
						id: 'srt-' + index,
						index: i,
						start,
						end,
						text,
						textEn,
						textZh,
						languages: {},
						detectedLanguages: [],
						primaryLanguage: 'en'
					});
				}
				
				return cues;
			}
			
			// 解析 VTT
			function parseVTT(text) {
				text = text.replace(/^WEBVTT.*?\\n/, '');
				text = text.replace(/NOTE.*?\\n\\n/g, '');
				
				const cues = [];
				const blocks = text.split(/\\n\\s*\\n/).filter(b => b.trim());
				const totalBlocks = blocks.length;
				
				for (let i = 0; i < blocks.length; i++) {
					const block = blocks[i];
					if (!block) continue;
					
					if (i % 50 === 0) {
						self.postMessage({
							type: 'progress',
							progress: Math.floor((i / totalBlocks) * 100)
						});
					}
					
					const lines = block.split('\\n').map(l => l.trim());
					if (lines.length === 0) continue;
					
					let timeLineIndex = 0;
					for (let j = 0; j < lines.length; j++) {
						if (lines[j] && lines[j].includes('-->')) {
							timeLineIndex = j;
							break;
						}
					}
					
					const timeLine = lines[timeLineIndex];
					if (!timeLine) continue;
					
					const timeMatch = timeLine.match(/(\\d{2}:\\d{2}:\\d{2}\\.\\d{3})\\s*-->\\s*(\\d{2}:\\d{2}:\\d{2}\\.\\d{3})/);
					if (!timeMatch) continue;
					
					const start = parseTimestamp(timeMatch[1]);
					const end = parseTimestamp(timeMatch[2]);
					const text = lines.slice(timeLineIndex + 1).join('\\n');
					if (!text) continue;
					
					const { textEn, textZh } = separateLanguages(text);
					
					cues.push({
						id: 'vtt-' + i,
						index: i,
						start,
						end,
						text,
						textEn,
						textZh,
						languages: {},
						detectedLanguages: [],
						primaryLanguage: 'en'
					});
				}
				
				return cues;
			}
			
			// 主解析函数
			function parse(text, format) {
				if (!text || !text.trim()) return [];
				const detectedFormat = format || detectFormat(text);
				switch (detectedFormat) {
					case 'srt': return parseSRT(text);
					case 'vtt': return parseVTT(text);
					default: throw new Error('Unknown format');
				}
			}
			
			// 监听消息
			self.addEventListener('message', (event) => {
				const { type, text, format, id } = event.data;
				if (type === 'parse') {
					try {
						const startTime = performance.now();
						const cues = parse(text, format);
						const duration = performance.now() - startTime;
						console.log('[Worker] Parsed ' + cues.length + ' cues in ' + duration.toFixed(2) + 'ms');
						self.postMessage({ type: 'result', id, data: cues });
					} catch (error) {
						self.postMessage({ type: 'error', id, error: error.message });
					}
				}
			});
		`;
	}
}
