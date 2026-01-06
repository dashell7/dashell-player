/**
 * Web Worker for Subtitle Parsing
 * 异步解析字幕文件，避免阻塞主线程
 */

import type { SubtitleCue, SubtitleFormat } from '../types';
import { separateLanguages, detectLanguage, type SupportedLanguage } from '../utils/languageUtils';

// Worker 消息类型
interface ParseRequest {
	type: 'parse';
	text: string;
	format?: SubtitleFormat;
	id: string; // 请求 ID
}

interface ParseResponse {
	type: 'result' | 'error' | 'progress';
	id: string;
	data?: SubtitleCue[];
	error?: string;
	progress?: number; // 0-100
}

/**
 * 检测字幕格式
 */
function detectFormat(text: string): SubtitleFormat {
	const trimmed = text.trim();
	
	if (trimmed.startsWith('WEBVTT')) {
		return 'vtt';
	}
	
	// SRT 格式：数字开头
	const firstLine = trimmed.split('\n')[0];
	if (firstLine && /^\d+\s*$/m.test(firstLine)) {
		return 'srt';
	}
	
	// ASS/SSA 格式
	if (trimmed.includes('[Script Info]')) {
		return 'ass';
	}
	
	return 'unknown';
}

/**
 * 解析时间戳
 */
function parseTimestamp(timestamp: string): number {
	// SRT: 00:00:01,000
	// VTT: 00:00:01.000
	const normalized = timestamp.replace(',', '.');
	const parts = normalized.split(':');
	
	if (parts.length === 3) {
		const hours = parseInt(parts[0] || '0', 10);
		const minutes = parseInt(parts[1] || '0', 10);
		const secondsParts = (parts[2] || '0').split('.');
		const seconds = parseInt(secondsParts[0] || '0', 10);
		const milliseconds = parseInt(secondsParts[1]?.padEnd(3, '0') || '0', 10);
		
		return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
	}
	
	return 0;
}

/**
 * 分离双语字幕（向后兼容）
 */
function separateLanguagesLegacy(text: string): { textEn?: string; textZh?: string } {
	const lines = text.split('\n');
	let textEn: string | undefined;
	let textZh: string | undefined;
	
	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		
		// 简单检测：包含中文字符
		if (/[\u4e00-\u9fa5]/.test(trimmed)) {
			textZh = textZh ? `${textZh}\n${trimmed}` : trimmed;
		} else {
			textEn = textEn ? `${textEn}\n${trimmed}` : trimmed;
		}
	}
	
	return { textEn, textZh };
}

/**
 * 解析 SRT 格式
 */
function parseSRT(text: string): SubtitleCue[] {
	const cues: SubtitleCue[] = [];
	const blocks = text.split(/\n\s*\n/).filter(block => block.trim());
	const totalBlocks = blocks.length;
	
	for (let i = 0; i < blocks.length; i++) {
		const block = blocks[i];
		if (!block) continue;
		
		// 发送进度更新（每 50 条）
		if (i % 50 === 0) {
			self.postMessage({
				type: 'progress',
				progress: Math.floor((i / totalBlocks) * 100)
			} as ParseResponse);
		}
		
		const lines = block.split('\n').map(line => line.trim());
		
		if (lines.length < 3) continue;
		
		// 第一行：序号
		const firstLine = lines[0];
		if (!firstLine) continue;
		const index = parseInt(firstLine, 10);
		if (isNaN(index)) continue;
		
		// 第二行：时间范围
		const secondLine = lines[1];
		if (!secondLine) continue;
		const timeMatch = secondLine.match(/(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/);
		if (!timeMatch || !timeMatch[1] || !timeMatch[2]) continue;
		
		const start = parseTimestamp(timeMatch[1]);
		const end = parseTimestamp(timeMatch[2]);
		
		// 第三行及之后：字幕文本
		const text = lines.slice(2).join('\n');
		
		// 向后兼容：保留原有的textEn/textZh字段
		const { textEn, textZh } = separateLanguagesLegacy(text);
		
		// 新的多语言支持
		const languages = separateLanguages(text);
		const detectedLangs = Object.keys(languages) as SupportedLanguage[];
		const primaryLang = detectedLangs[0] || detectLanguage(text);
		
		cues.push({
			id: `srt-${index}`,
			index: i,
			start,
			end,
			text,
			// 向后兼容
			textEn,
			textZh,
			// 多语言支持
			languages,
			detectedLanguages: detectedLangs,
			primaryLanguage: primaryLang
		});
	}
	
	return cues;
}

/**
 * 解析 VTT 格式
 */
function parseVTT(text: string): SubtitleCue[] {
	const cues: SubtitleCue[] = [];
	
	// 移除 WEBVTT 头部和注释
	text = text.replace(/^WEBVTT.*?\n/, '');
	text = text.replace(/NOTE.*?\n\n/g, '');
	
	// 按空行分割字幕块
	const blocks = text.split(/\n\s*\n/).filter(block => block.trim());
	const totalBlocks = blocks.length;
	
	for (let i = 0; i < blocks.length; i++) {
		const block = blocks[i];
		if (!block) continue;
		
		// 发送进度更新
		if (i % 50 === 0) {
			self.postMessage({
				type: 'progress',
				progress: Math.floor((i / totalBlocks) * 100)
			} as ParseResponse);
		}
		
		const lines = block.split('\n').map(line => line.trim());
		
		if (lines.length === 0) continue;
		
		// 查找时间行
		let timeLineIndex = 0;
		for (let j = 0; j < lines.length; j++) {
			const line = lines[j];
			if (line && line.includes('-->')) {
				timeLineIndex = j;
				break;
			}
		}
		
		const timeLine = lines[timeLineIndex];
		if (!timeLine) continue;
		
		// 解析时间范围 (VTT 使用 . 而不是 ,)
		const timeMatch = timeLine.match(/(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})/);
		if (!timeMatch || !timeMatch[1] || !timeMatch[2]) continue;
		
		const start = parseTimestamp(timeMatch[1]);
		const end = parseTimestamp(timeMatch[2]);
		
		// 时间行之后的所有行都是文本
		const text = lines.slice(timeLineIndex + 1).join('\n');
		if (!text) continue;
		
		// 向后兼容
		const { textEn, textZh } = separateLanguagesLegacy(text);
		
		// 多语言支持
		const languages = separateLanguages(text);
		const detectedLangs = Object.keys(languages) as SupportedLanguage[];
		const primaryLang = detectedLangs[0] || detectLanguage(text);
		
		cues.push({
			id: `vtt-${i}`,
			index: i,
			start,
			end,
			text,
			// 向后兼容
			textEn,
			textZh,
			// 多语言支持
			languages,
			detectedLanguages: detectedLangs,
			primaryLanguage: primaryLang
		});
	}
	
	return cues;
}

/**
 * 主解析函数
 */
function parse(text: string, format?: SubtitleFormat): SubtitleCue[] {
	if (!text || text.trim().length === 0) {
		return [];
	}
	
	const detectedFormat = format || detectFormat(text);
	
	switch (detectedFormat) {
		case 'srt':
			return parseSRT(text);
		case 'vtt':
			return parseVTT(text);
		case 'ass':
			console.warn('[SubtitleWorker] ASS format not fully supported yet');
			return [];
		default:
			throw new Error('Unknown subtitle format');
	}
}

// 监听主线程消息
self.addEventListener('message', (event: MessageEvent<ParseRequest>) => {
	const { type, text, format, id } = event.data;
	
	if (type === 'parse') {
		try {
			const startTime = performance.now();
			const cues = parse(text, format);
			const duration = performance.now() - startTime;
			
			console.log(`[SubtitleWorker] Parsed ${cues.length} cues in ${duration.toFixed(2)}ms`);
			
			self.postMessage({
				type: 'result',
				id,
				data: cues
			} as ParseResponse);
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			self.postMessage({
				type: 'error',
				id,
				error: errorMsg
			} as ParseResponse);
		}
	}
});

// 导出类型供主线程使用
export type { ParseRequest, ParseResponse };
