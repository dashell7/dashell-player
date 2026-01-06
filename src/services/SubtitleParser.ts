import type { SubtitleCue, SubtitleFormat } from '../types';
import { separateLanguages, detectLanguage } from '../utils/languageUtils';
import type { SupportedLanguage } from '../utils/languageUtils';

/**
 * 字幕解析服务
 * 支持 SRT, VTT, ASS/SSA 等格式
 * 支持多语言识别和分离
 */
export class SubtitleParser {
	/**
	 * 缓存正则表达式（性能优化）
	 * 避免在每次调用 cleanVTTText 时重新创建
	 */
	private static readonly INLINE_TIMESTAMP_REGEX = /<\d{2}:\d{2}:\d{2}\.\d{3}>/g;
	private static readonly STYLE_TAG_REGEX = /<\/?[cibu]>/g;
	private static readonly CLASS_STYLE_REGEX = /<c\.[^>]+>/g;
	private static readonly VOICE_TAG_REGEX = /<v\s+[^>]+>/g;
	private static readonly VOICE_CLOSE_REGEX = /<\/v>/g;
	private static readonly ANY_TAG_REGEX = /<[^>]+>/g;
	private static readonly WHITESPACE_REGEX = /\s+/g;
	/**
	 * 检测字幕格式
	 */
	static detectFormat(text: string): SubtitleFormat {
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
	 * 解析字幕文本
	 */
	static parse(text: string, format?: SubtitleFormat): SubtitleCue[] {
		if (!text || text.trim().length === 0) {
			return [];
		}
		
		const detectedFormat = format || this.detectFormat(text);
		
		switch (detectedFormat) {
			case 'srt':
				return this.parseSRT(text);
			case 'vtt':
				return this.parseVTT(text);
			case 'ass':
				console.warn('[SubtitleParser] ASS format not fully supported yet');
				return [];
			default:
				console.error('[SubtitleParser] Unknown subtitle format');
				return [];
		}
	}
	
	/**
	 * 解析 SRT 格式字幕
	 * 格式示例：
	 * 1
	 * 00:00:01,000 --> 00:00:04,000
	 * This is the first subtitle
	 */
	static parseSRT(text: string): SubtitleCue[] {
		const cues: SubtitleCue[] = [];
		
		// 按空行分割字幕块
		const blocks = text.split(/\n\s*\n/).filter(block => block.trim());
		
		for (let i = 0; i < blocks.length; i++) {
			const block = blocks[i];
			if (!block) continue;
			
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
			
			const start = this.parseTimestamp(timeMatch[1]);
			const end = this.parseTimestamp(timeMatch[2]);
			
			// 第三行及之后：字幕文本
			const text = lines.slice(2).join('\n');
			
			// 多语言支持（只调用一次，性能优化）
			const languages = separateLanguages(text);
			const detectedLangs = Object.keys(languages) as SupportedLanguage[];
			const primaryLang = detectedLangs[0] || detectLanguage(text);
			
			// 向后兼容：从 languages 对象中提取 textEn/textZh
			const textEn = languages.en;
			const textZh = languages.zh;
			
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
	 * 解析 VTT 格式字幕
	 * 格式示例：
	 * WEBVTT
	 * 
	 * 00:00:01.000 --> 00:00:04.000
	 * This is the first subtitle
	 */
	static parseVTT(text: string): SubtitleCue[] {
		const cues: SubtitleCue[] = [];
		
		// 移除 WEBVTT 头部和注释
		text = text.replace(/^WEBVTT.*?\n/, '');
		text = text.replace(/NOTE.*?\n\n/g, '');
		
		// 按空行分割字幕块
		const blocks = text.split(/\n\s*\n/).filter(block => block.trim());
		
		for (let i = 0; i < blocks.length; i++) {
			const block = blocks[i];
			if (!block) continue;
			
			const lines = block.split('\n').map(line => line.trim());
			
			// 跳过空行
			if (lines.length === 0) continue;
			
			// 查找时间行
			let timeLineIndex = -1;
			for (let j = 0; j < lines.length; j++) {
				const line = lines[j];
				if (line && line.includes('-->')) {
					timeLineIndex = j;
					break;
				}
			}
			
			if (timeLineIndex === -1) continue;
			
			// 解析时间
			const timeLine = lines[timeLineIndex];
			if (!timeLine) continue;
			const timeMatch = timeLine.match(/(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})/);
			if (!timeMatch || !timeMatch[1] || !timeMatch[2]) continue;
			
			const start = this.parseTimestamp(timeMatch[1]);
			const end = this.parseTimestamp(timeMatch[2]);
			
			// 字幕文本（时间行之后的所有行）
			const textLines = lines.slice(timeLineIndex + 1);
			let text = textLines.join('\n');
			
			// 清理 VTT 特有的标记
			text = this.cleanVTTText(text);
			
			// 多语言支持（只调用一次，性能优化）
			const languages = separateLanguages(text);
			const detectedLangs = Object.keys(languages) as SupportedLanguage[];
			const primaryLang = detectedLangs[0] || detectLanguage(text);
			
			// 向后兼容：从 languages 对象中提取 textEn/textZh
			const textEn = languages.en;
			const textZh = languages.zh;
			
			// ID（时间行之前的内容，如果有）
			const id = timeLineIndex > 0 ? (lines[timeLineIndex - 1] || `vtt-${i}`) : `vtt-${i}`;
			
			cues.push({
				id,
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
	 * 清理 VTT 文本中的标记
	 * 移除：
	 * - 内联时间戳：<00:00:00.000>
	 * - 样式标签：<c>, </c>, <v>, </v>, <i>, </i>, <b>, </b>, <u>, </u>
	 * - 语音标签：<v speaker>
	 */
	private static cleanVTTText(text: string): string {
		return text
			// 移除内联时间戳 <00:00:00.000>
			.replace(SubtitleParser.INLINE_TIMESTAMP_REGEX, '')
			// 移除样式标签 <c>, </c>, <i>, </i>, <b>, </b>, <u>, </u>
			.replace(SubtitleParser.STYLE_TAG_REGEX, '')
			// 移除带类名的样式标签 <c.classname>
			.replace(SubtitleParser.CLASS_STYLE_REGEX, '')
			// 移除语音标签 <v speaker>, </v>
			.replace(SubtitleParser.VOICE_TAG_REGEX, '')
			.replace(SubtitleParser.VOICE_CLOSE_REGEX, '')
			// 移除其他可能的标签
			.replace(SubtitleParser.ANY_TAG_REGEX, '')
			// 清理多余空格
			.replace(SubtitleParser.WHITESPACE_REGEX, ' ')
			.trim();
	}
	
	/**
	 * 解析时间戳为秒数
	 * 支持格式：
	 * - SRT: 00:00:01,000 (HH:MM:SS,mmm)
	 * - VTT: 00:00:01.000 (HH:MM:SS.mmm)
	 */
	private static parseTimestamp(timestamp: string): number {
		// 统一格式：替换逗号为点号
		timestamp = timestamp.replace(',', '.');
		
		// 解析 HH:MM:SS.mmm
		const match = timestamp.match(/(\d{2}):(\d{2}):(\d{2})\.(\d{3})/);
		if (!match || !match[1] || !match[2] || !match[3] || !match[4]) return 0;
		
		const hours = parseInt(match[1], 10);
		const minutes = parseInt(match[2], 10);
		const seconds = parseInt(match[3], 10);
		const milliseconds = parseInt(match[4], 10);
		
		return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
	}
	
	/**
	 * 格式化秒数为时间戳
	 */
	static formatTimestamp(seconds: number, format: 'srt' | 'vtt' = 'srt'): string {
		const hours = Math.floor(seconds / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);
		const secs = Math.floor(seconds % 60);
		const ms = Math.floor((seconds % 1) * 1000);
		
		const separator = format === 'srt' ? ',' : '.';
		
		return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}${separator}${ms.toString().padStart(3, '0')}`;
	}
	
	/**
	 * 验证字幕是否有效
	 */
	static validate(cues: SubtitleCue[]): boolean {
		if (!cues || cues.length === 0) return false;
		
		for (const cue of cues) {
			// 检查基本字段
			if (!cue.id || cue.start < 0 || cue.end <= cue.start || !cue.text) {
				return false;
			}
		}
		
		return true;
	}
	
	/**
	 * 查找指定时间的字幕索引（支持优化查找）
	 * @param hintIndex - 上一次的索引，用于优化顺序查找
	 */
	static findIndexAtTime(cues: SubtitleCue[], time: number, hintIndex: number = -1): number {
		if (!cues || cues.length === 0) return -1;
		
		// 优化：检查 hintIndex 及其后一个
		if (hintIndex >= 0 && hintIndex < cues.length) {
			const current = cues[hintIndex];
			// 检查当前字幕
			if (current && time >= current.start && time < current.end) {
				return hintIndex;
			}
			
			// 检查下一个字幕（顺序播放最常见情况）
			const nextIndex = hintIndex + 1;
			if (nextIndex < cues.length) {
				const next = cues[nextIndex];
				if (next && time >= next.start && time < next.end) {
					return nextIndex;
				}
				// 检查是否在两个字幕之间的空隙（当前结束之后，下一个开始之前）
				if (current && next && time >= current.end && time < next.start) {
					// 这种情况下，没有激活的字幕
					return -1; 
				}
			}
		}
		
		// 二分查找
		let left = 0;
		let right = cues.length - 1;
		let result = -1;
		
		while (left <= right) {
			const mid = Math.floor((left + right) / 2);
			const cue = cues[mid];
			
			if (!cue) break;
			
			if (time >= cue.start && time < cue.end) {
				// 找到匹配的字幕
				return mid;
			} else if (time < cue.start) {
				// 在左侧
				right = mid - 1;
			} else {
				// 在右侧
				left = mid + 1;
				// 记录最后一个开始时间小于当前时间的索引
				if (time >= cue.start) {
					result = mid;
				}
			}
		}
		
		// 如果没有完全匹配，返回最接近的
		return result;
	}
	
	/**
	 * 合并双语字幕
	 * 将英文和中文字幕合并为一个数组
	 */
	static mergeBilingual(
		enCues: SubtitleCue[],
		zhCues: SubtitleCue[]
	): SubtitleCue[] {
		const merged: SubtitleCue[] = [];
		
		// 使用英文字幕为基准
		for (const enCue of enCues) {
			// 查找对应的中文字幕（时间最接近的）
			const zhCue = zhCues.find(
				zh => Math.abs(zh.start - enCue.start) < 0.5  // 允许 0.5 秒误差
			);
			
			merged.push({
				...enCue,
				textEn: enCue.text,
				textZh: zhCue?.text,
				text: enCue.text, // 默认显示英文
			});
		}
		
		return merged;
	}
}
