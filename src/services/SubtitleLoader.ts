import { TFile, requestUrl, Notice } from 'obsidian';
import type LangPlayerPlugin from '../main';
import { SubtitleParser } from './SubtitleParser';
import { SubtitleWorkerManager } from './SubtitleWorkerManager';
import type { SubtitleCue } from '../types';

/**
 * 字幕加载结果
 */
export interface LoadedSubtitle {
	cues: SubtitleCue[];
	source: string;
	format: string;
	loadedAt: number;
}

/**
 * 字幕缓存项
 */
interface SubtitleCacheEntry {
	data: LoadedSubtitle;
	timestamp: number;
}

/**
 * 字幕加载器
 * 负责从各种来源加载字幕，并提供缓存机制
 * 借鉴 Media Extended 的 TranscriptLoader 设计
 */
export class SubtitleLoader {
	private cache: Map<string, SubtitleCacheEntry> = new Map();
	private cacheMaxAge: number = 5 * 60 * 1000; // 5分钟缓存
	private maxCacheSize: number = 50; // 最多缓存50个字幕
	private workerManager: SubtitleWorkerManager;
	private readonly WORKER_THRESHOLD = 100 * 1024; // 100KB 以上使用 Worker

	constructor(private plugin: LangPlayerPlugin) {
		this.workerManager = SubtitleWorkerManager.getInstance();
	}

	/**
	 * 从 Vault 文件加载字幕
	 */
	async loadFromVaultFile(file: TFile): Promise<LoadedSubtitle | null> {
		const cacheKey = `vault:${file.path}`;
		
		// 检查缓存
		const cached = this.getFromCache(cacheKey);
		if (cached) {
			console.log('[SubtitleLoader] Using cached subtitle:', file.path);
			return cached;
		}

		try {
			console.log('[SubtitleLoader] Loading subtitle from vault:', file.path);
			const content = await this.plugin.app.vault.cachedRead(file);
			
			if (!content || content.trim().length === 0) {
				new Notice('字幕文件为空');
				return null;
			}

			// 使用 Worker 异步解析大文件
			const cues = await this.parseContent(content, file.path);
			
			if (cues.length === 0) {
				new Notice('无法解析字幕文件');
				return null;
			}

			const result: LoadedSubtitle = {
				cues,
				source: file.path,
				format: SubtitleParser.detectFormat(content),
				loadedAt: Date.now()
			};

			// 存入缓存
			this.setCache(cacheKey, result);

			console.log(`[SubtitleLoader] Loaded ${cues.length} subtitles from vault`);
			return result;

		} catch (error) {
			console.error('[SubtitleLoader] Error loading vault file:', error);
			new Notice('加载字幕文件失败');
			return null;
		}
	}

	/**
	 * 从本地文件路径加载字幕
	 */
	async loadFromLocalPath(filePath: string): Promise<LoadedSubtitle | null> {
		const cacheKey = `local:${filePath}`;
		
		// 检查缓存
		const cached = this.getFromCache(cacheKey);
		if (cached) {
			console.log('[SubtitleLoader] Using cached subtitle:', filePath);
			return cached;
		}

		try {
			console.log('[SubtitleLoader] Loading subtitle from local path:', filePath);
			
			// 使用 Electron 的 fs 模块读取本地文件
			// @ts-ignore
			const fs = require('fs').promises;
			const content = await fs.readFile(filePath, 'utf-8');

			if (!content || content.trim().length === 0) {
				new Notice('字幕文件为空');
				return null;
			}

			// 使用 Worker 异步解析大文件
			const cues = await this.parseContent(content, filePath);
			
			if (cues.length === 0) {
				new Notice('无法解析字幕文件');
				return null;
			}

			const result: LoadedSubtitle = {
				cues,
				source: filePath,
				format: SubtitleParser.detectFormat(content),
				loadedAt: Date.now()
			};

			// 存入缓存
			this.setCache(cacheKey, result);

			console.log(`[SubtitleLoader] Loaded ${cues.length} subtitles from local file`);
			return result;

		} catch (error) {
			console.error('[SubtitleLoader] Error loading local file:', error);
			new Notice('加载本地字幕文件失败');
			return null;
		}
	}

	/**
	 * 从 URL 加载字幕
	 */
	async loadFromURL(url: string): Promise<LoadedSubtitle | null> {
		const cacheKey = `url:${url}`;
		
		// 检查缓存
		const cached = this.getFromCache(cacheKey);
		if (cached) {
			console.log('[SubtitleLoader] Using cached subtitle:', url);
			return cached;
		}

		try {
			console.log('[SubtitleLoader] Loading subtitle from URL:', url);
			
			const response = await requestUrl({
				url: url,
				method: 'GET',
			});

			const content = response.text;

			if (!content || content.trim().length === 0) {
				new Notice('字幕内容为空');
				return null;
			}

			// 使用 Worker 异步解析大文件
			const cues = await this.parseContent(content, url);
			
			if (cues.length === 0) {
				new Notice('无法解析字幕');
				return null;
			}

			const result: LoadedSubtitle = {
				cues,
				source: url,
				format: SubtitleParser.detectFormat(content),
				loadedAt: Date.now()
			};

			// 存入缓存
			this.setCache(cacheKey, result);

			console.log(`[SubtitleLoader] Loaded ${cues.length} subtitles from URL`);
			return result;

		} catch (error) {
			console.error('[SubtitleLoader] Error loading from URL:', error);
			const errorMessage = error instanceof Error ? error.message : '网络错误';
			new Notice(`加载在线字幕失败: ${errorMessage}`);
			return null;
		}
	}

	/**
	 * 从文本内容直接加载字幕
	 */
	loadFromText(content: string, source: string = 'text'): LoadedSubtitle | null {
		const cacheKey = `text:${this.hashString(content)}`;
		
		// 检查缓存
		const cached = this.getFromCache(cacheKey);
		if (cached) {
			console.log('[SubtitleLoader] Using cached subtitle from text');
			return cached;
		}

		try {
			if (!content || content.trim().length === 0) {
				return null;
			}

			const cues = SubtitleParser.parse(content);
			
			if (cues.length === 0) {
				return null;
			}

			const result: LoadedSubtitle = {
				cues,
				source,
				format: SubtitleParser.detectFormat(content),
				loadedAt: Date.now()
			};

			// 存入缓存
			this.setCache(cacheKey, result);

			console.log(`[SubtitleLoader] Loaded ${cues.length} subtitles from text`);
			return result;

		} catch (error) {
			console.error('[SubtitleLoader] Error loading from text:', error);
			return null;
		}
	}

	/**
	 * 从缓存获取字幕
	 */
	private getFromCache(key: string): LoadedSubtitle | null {
		const entry = this.cache.get(key);
		
		if (!entry) {
			return null;
		}

		// 检查是否过期
		const now = Date.now();
		if (now - entry.timestamp > this.cacheMaxAge) {
			console.log('[SubtitleLoader] Cache expired:', key);
			this.cache.delete(key);
			return null;
		}

		return entry.data;
	}

	/**
	 * 存入缓存
	 */
	private setCache(key: string, data: LoadedSubtitle): void {
		// 如果缓存已满，删除最旧的条目
		if (this.cache.size >= this.maxCacheSize) {
			const oldestKey = this.cache.keys().next().value;
			if (oldestKey) {
				this.cache.delete(oldestKey);
				console.log('[SubtitleLoader] Cache full, removed oldest:', oldestKey);
			}
		}

		this.cache.set(key, {
			data,
			timestamp: Date.now()
		});

		console.log(`[SubtitleLoader] Cached subtitle (${this.cache.size}/${this.maxCacheSize}):`, key);
	}

	/**
	 * 清除缓存
	 */
	clearCache(): void {
		const size = this.cache.size;
		this.cache.clear();
		console.log(`[SubtitleLoader] Cache cleared (${size} entries removed)`);
	}

	/**
	 * 清除特定字幕的缓存
	 */
	clearCacheForSource(source: string): void {
		const keysToDelete: string[] = [];
		
		for (const key of this.cache.keys()) {
			if (key.includes(source)) {
				keysToDelete.push(key);
			}
		}

		keysToDelete.forEach(key => this.cache.delete(key));
		
		if (keysToDelete.length > 0) {
			console.log(`[SubtitleLoader] Cleared ${keysToDelete.length} cache entries for:`, source);
		}
	}

	/**
	 * 获取缓存统计信息
	 */
	getCacheStats(): { size: number; maxSize: number; keys: string[] } {
		return {
			size: this.cache.size,
			maxSize: this.maxCacheSize,
			keys: Array.from(this.cache.keys())
		};
	}

	/**
	 * 智能解析内容（自动选择同步/异步）
	 * @param content 字幕内容
	 * @param source 来源标识（用于日志）
	 */
	private async parseContent(content: string, source: string): Promise<SubtitleCue[]> {
		const contentSize = new Blob([content]).size;
		const format = SubtitleParser.detectFormat(content);
		
		// 大文件使用 Worker 异步解析
		if (contentSize > this.WORKER_THRESHOLD && this.workerManager.isWorkerSupported()) {
			console.log(`[SubtitleLoader] Using Worker for large file (${(contentSize / 1024).toFixed(1)}KB):`, source);
			
			try {
				const startTime = performance.now();
				const cues = await this.workerManager.parse(content, format, (progress) => {
					// 可选：显示进度
					if (progress % 25 === 0) {
						console.log(`[SubtitleLoader] Parsing progress: ${progress}%`);
					}
				});
				const duration = performance.now() - startTime;
				console.log(`[SubtitleLoader] Worker parsed ${cues.length} cues in ${duration.toFixed(2)}ms`);
				return cues;
			} catch (error) {
				console.warn('[SubtitleLoader] Worker failed, falling back to sync:', error);
				// 降级到同步解析
				return SubtitleParser.parse(content, format);
			}
		} else {
			// 小文件使用同步解析
			console.log(`[SubtitleLoader] Using sync parsing (${(contentSize / 1024).toFixed(1)}KB):`, source);
			return SubtitleParser.parse(content, format);
		}
	}

	/**
	 * 简单的字符串哈希函数
	 */
	private hashString(str: string): string {
		let hash = 0;
		for (let i = 0; i < str.length; i++) {
			const char = str.charCodeAt(i);
			hash = ((hash << 5) - hash) + char;
			hash = hash & hash; // Convert to 32bit integer
		}
		return hash.toString(36);
	}
	
	/**
	 * 清理资源（插件卸载时调用）
	 */
	destroy(): void {
		this.clearCache();
		this.workerManager.terminate();
		console.log('[SubtitleLoader] Destroyed');
	}
}
