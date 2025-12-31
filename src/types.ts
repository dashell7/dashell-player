import { TFile } from 'obsidian';

// 视图类型常量
export const LINGUA_FLOW_VIEW = 'linguaflow-view';

// 媒体源类型
export interface MediaSource {
	type: 'local' | 'url';
	url: string;
	displayName?: string;
	timestamp?: number; // 起始时间（秒）
	file?: TFile; // 本地文件对象
}

// 播放器状态
export interface PlayerState {
	playing: boolean;
	currentTime: number;
	duration: number;
	loaded: number;
	volume: number;
	playbackRate: number;
}

// Protocol Handler 参数
export interface ProtocolParams {
	src?: string;      // 视频源
	t?: string;       // 时间戳（秒）
	title?: string;   // 标题
	[key: string]: any; // 其他参数
}

// 播放器引用接口
export interface PlayerRef {
	seekTo: (seconds: number, type?: 'seconds' | 'fraction') => void;
	getCurrentTime: () => number;
	getDuration: () => number;
	getSecondsLoaded: () => number;
	playVideo: () => void;
	pauseVideo: () => void;
	setPlaybackRate: (rate: number) => void;
	getInternalPlayer?: () => HTMLMediaElement | null;
}

import type { SupportedLanguage } from './utils/languageUtils';

// 字幕 Cue
export interface SubtitleCue {
	id: string;
	index: number;
	start: number;  // 开始时间（秒）
	end: number;    // 结束时间（秒）
	text: string;   // 字幕文本（主要语言或原始文本）
	
	// 向后兼容字段
	textEn?: string; // 英文字幕（双语场景）
	textZh?: string; // 中文字幕（双语场景）
	
	// 多语言支持
	languages?: Partial<Record<SupportedLanguage, string>>; // 多语言文本映射
	detectedLanguages?: SupportedLanguage[]; // 检测到的语言列表
	primaryLanguage?: SupportedLanguage; // 主要语言
}

// 字幕文件类型
export type SubtitleFormat = 'srt' | 'vtt' | 'ass' | 'unknown';

// 字幕配置
export interface SubtitleConfig {
	fontSize: number;
	fontColor: string;
	translationColor?: string; // 翻译字幕颜色
	highlightColor?: string; // 高亮颜色
	backgroundColor: string;
	position: 'top' | 'center' | 'bottom';
	
	// 向后兼容字段
	showEnglish: boolean;
	showChinese: boolean;
	
	// 多语言支持
	visibleLanguages: SupportedLanguage[]; // 要显示的语言列表
	primaryLanguage?: SupportedLanguage; // 主要语言（用于查词等）
	
	showIndexAndTime: boolean; // 显示序号和时间
	wordByWordHighlight: boolean; // 逐字高亮（true）或整行高亮（false）
}
