import { TFile, Vault, normalizePath } from 'obsidian';

/**
 * 将 Obsidian TFile 转换为 webview 可访问的 resource:// URL
 * @param file - Obsidian 文件对象
 * @param vault - Vault 实例
 * @returns resource:// 协议的 URL
 */
export function getResourceUrl(file: TFile, vault: Vault): string {
	// 使用 Obsidian 的 getResourcePath 方法获取可访问的 URL
	// 这个方法会返回正确的 app://local/ URL
	const resourcePath = vault.adapter.getResourcePath(file.path);
	
	console.log('[fileUtils] Original path:', file.path);
	console.log('[fileUtils] Resource URL:', resourcePath);
	
	return resourcePath;
}

/**
 * 检查文件是否为媒体文件
 * @param file - 文件对象
 * @returns 是否为媒体文件
 */
export function isMediaFile(file: TFile): boolean {
	const mediaExtensions = [
		// 视频格式
		'mp4', 'mkv', 'webm', 'ogv', 'avi', 'mov', 'flv', 'wmv', 'm4v', '3gp',
		// 音频格式
		'mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'wma', 'opus'
	];
	
	return mediaExtensions.includes(file.extension.toLowerCase());
}

/**
 * 检查是否为音频文件
 * @param file - 文件对象或文件名/路径
 * @returns 是否为音频文件
 */
export function isAudioFile(file: TFile | string): boolean {
	const extension = typeof file === 'string' 
		? file.split('.').pop()?.toLowerCase() 
		: file.extension.toLowerCase();
		
	if (!extension) return false;
	
	const audioExtensions = [
		'mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'wma', 'opus'
	];
	
	return audioExtensions.includes(extension);
}

/**
 * 解析时间戳字符串为秒数
 * 支持格式：
 * - 纯秒数: "120"
 * - 分:秒: "2:30"
 * - 时:分:秒: "1:30:45"
 * @param timestamp - 时间戳字符串
 * @returns 秒数
 */
export function parseTimestamp(timestamp: string): number {
	if (!timestamp) return 0;
	
	// 纯数字
	if (/^\d+$/.test(timestamp)) {
		return parseInt(timestamp, 10);
	}
	
	// HH:MM:SS 或 MM:SS
	const parts = timestamp.split(':').map(Number);
	
	if (parts.length === 2) {
		// MM:SS
		const [minutes = 0, seconds = 0] = parts;
		return minutes * 60 + seconds;
	} else if (parts.length === 3) {
		// HH:MM:SS
		const [hours = 0, minutes = 0, seconds = 0] = parts;
		return hours * 3600 + minutes * 60 + seconds;
	}
	
	return 0;
}

/**
 * 格式化秒数为时间字符串
 * @param seconds - 秒数
 * @returns 格式化的时间字符串（HH:MM:SS 或 MM:SS）
 */
export function formatTime(seconds: number): string {
	if (isNaN(seconds) || seconds === 0) return '00:00';
	
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const secs = Math.floor(seconds % 60);
	
	if (hours > 0) {
		return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
	}
	
	return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}
