import { Platform } from 'obsidian';

/**
 * 平台检测工具类
 * 提供跨平台兼容的设备检测和适配逻辑
 */

/**
 * 检测是否为移动设备（手机或平板）
 */
export function isMobileDevice(): boolean {
	return Platform.isMobile || Platform.isMobileApp;
}

/**
 * 检测是否为手机（小屏幕移动设备）
 */
export function isPhone(): boolean {
	if (!isMobileDevice()) return false;
	// 手机通常宽度 < 768px
	return window.innerWidth < 768;
}

/**
 * 检测是否为平板（大屏幕移动设备）
 */
export function isTablet(): boolean {
	if (!isMobileDevice()) return false;
	// 平板通常宽度 >= 768px
	return window.innerWidth >= 768;
}

/**
 * 检测是否为桌面设备
 */
export function isDesktop(): boolean {
	return !isMobileDevice();
}

/**
 * 检测是否支持触摸操作
 */
export function isTouchDevice(): boolean {
	return (
		'ontouchstart' in window ||
		navigator.maxTouchPoints > 0 ||
		(navigator as any).msMaxTouchPoints > 0
	);
}

/**
 * 获取设备类型字符串
 */
export function getDeviceType(): 'phone' | 'tablet' | 'desktop' {
	if (isPhone()) return 'phone';
	if (isTablet()) return 'tablet';
	return 'desktop';
}

/**
 * 获取屏幕尺寸分类
 */
export function getScreenSize(): 'small' | 'medium' | 'large' {
	const width = window.innerWidth;
	if (width < 768) return 'small';   // 手机
	if (width < 1024) return 'medium'; // 平板
	return 'large';                     // 桌面
}

/**
 * 获取推荐的控制栏按钮尺寸（px）
 */
export function getControlButtonSize(): number {
	const deviceType = getDeviceType();
	switch (deviceType) {
		case 'phone':
			return 40; // 手机：40px
		case 'tablet':
			return 44; // 平板：44px
		default:
			return 48; // 桌面：48px
	}
}

/**
 * 获取推荐的字体大小（px）
 */
export function getFontSize(baseSize: number): number {
	const deviceType = getDeviceType();
	switch (deviceType) {
		case 'phone':
			return Math.max(12, baseSize - 2); // 手机略小
		case 'tablet':
			return baseSize; // 平板正常
		default:
			return baseSize; // 桌面正常
	}
}

/**
 * 获取推荐的播放器高度（px）
 */
export function getPlayerHeight(defaultHeight: number): number {
	const deviceType = getDeviceType();
	const screenHeight = window.innerHeight;
	
	switch (deviceType) {
		case 'phone':
			// 手机：占屏幕高度的 40%，最小 200px
			return Math.max(200, Math.floor(screenHeight * 0.4));
		case 'tablet':
			// 平板：占屏幕高度的 50%，最小 300px
			return Math.max(300, Math.floor(screenHeight * 0.5));
		default:
			// 桌面：使用默认值
			return defaultHeight;
	}
}

/**
 * 判断是否应该使用紧凑布局
 */
export function shouldUseCompactLayout(): boolean {
	return getScreenSize() === 'small';
}

/**
 * 判断是否应该自动隐藏控制栏
 */
export function shouldAutoHideControls(): boolean {
	return isPhone();
}

/**
 * 获取推荐的字幕布局
 */
export function getRecommendedSubtitleLayout(): 'bottom' | 'right' {
	return shouldUseCompactLayout() ? 'bottom' : 'bottom';
}

/**
 * 监听屏幕尺寸变化
 */
export function onScreenSizeChange(callback: () => void): () => void {
	const handler = () => callback();
	window.addEventListener('resize', handler);
	window.addEventListener('orientationchange', handler);
	
	// 返回清理函数
	return () => {
		window.removeEventListener('resize', handler);
		window.removeEventListener('orientationchange', handler);
	};
}

/**
 * 获取触摸事件兼容的坐标
 */
export function getTouchCoordinates(e: TouchEvent | MouseEvent): { x: number; y: number } {
	if ('touches' in e && e.touches.length > 0 && e.touches[0]) {
		return {
			x: e.touches[0].clientX,
			y: e.touches[0].clientY
		};
	}
	if ('clientX' in e) {
		return {
			x: e.clientX,
			y: e.clientY
		};
	}
	return { x: 0, y: 0 };
}

/**
 * 防抖函数（移动端优化）
 */
export function debounce<T extends (...args: any[]) => any>(
	func: T,
	wait: number
): (...args: Parameters<T>) => void {
	let timeout: ReturnType<typeof setTimeout> | null = null;
	return function(this: any, ...args: Parameters<T>) {
		if (timeout !== null) clearTimeout(timeout);
		timeout = setTimeout(() => func.apply(this, args), wait);
	};
}

/**
 * 节流函数（移动端优化）
 */
export function throttle<T extends (...args: any[]) => any>(
	func: T,
	limit: number
): (...args: Parameters<T>) => void {
	let inThrottle: boolean = false;
	return function(this: any, ...args: Parameters<T>) {
		if (!inThrottle) {
			func.apply(this, args);
			inThrottle = true;
			setTimeout(() => (inThrottle = false), limit);
		}
	};
}
