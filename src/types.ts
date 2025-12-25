// 视图类型常量
export const LINGUA_FLOW_VIEW = 'linguaflow-view';

// 媒体源类型
export interface MediaSource {
	type: 'local' | 'youtube' | 'url';
	url: string;
	displayName?: string;
	timestamp?: number; // 起始时间（秒）
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
}

// 字幕条目接口
export interface SubtitleCue {
	id: string;
	index: number;
	start: number;  // 开始时间（秒）
	end: number;    // 结束时间（秒）
	text: string;   // 字幕文本
	textEn?: string; // 英文字幕（双语场景）
	textZh?: string; // 中文字幕（双语场景）
}

// 字幕文件类型
export type SubtitleFormat = 'srt' | 'vtt' | 'ass' | 'unknown';

// 字幕配置
export interface SubtitleConfig {
	fontSize: number;
	fontColor: string;
	backgroundColor: string;
	position: 'top' | 'bottom' | 'center';
	showEnglish: boolean;
	showChinese: boolean;
	showIndexAndTime: boolean; // 是否显示编号和时间
}
