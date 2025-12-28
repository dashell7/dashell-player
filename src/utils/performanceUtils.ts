import { isMobileDevice, isPhone } from './platformUtils';

/**
 * 性能监测和优化工具
 */

/**
 * 检测设备性能等级
 */
export function detectDevicePerformance(): 'high' | 'medium' | 'low' {
	// 桌面设备默认高性能
	if (!isMobileDevice()) {
		return 'high';
	}
	
	// 检测硬件并发数（CPU 核心数）
	const cores = navigator.hardwareConcurrency || 2;
	
	// 检测内存（如果可用）
	const memory = (navigator as any).deviceMemory;
	
	// 手机设备性能判断
	if (isPhone()) {
		if (memory && memory < 2) return 'low';
		if (cores < 4) return 'low';
		if (cores < 6) return 'medium';
		return 'high';
	}
	
	// 平板设备性能判断
	if (memory && memory < 3) return 'medium';
	if (cores < 4) return 'medium';
	return 'high';
}

/**
 * 获取推荐的性能设置
 */
export interface PerformanceSettings {
	enableAnimations: boolean;
	enableWaveform: boolean;
	enableVisualizer: boolean;
	maxSubtitlesInView: number;
	useVirtualScroll: boolean;
	reducedMotion: boolean;
}

export function getRecommendedPerformanceSettings(): PerformanceSettings {
	const performance = detectDevicePerformance();
	const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	
	switch (performance) {
		case 'high':
			return {
				enableAnimations: !prefersReducedMotion,
				enableWaveform: true,
				enableVisualizer: true,
				maxSubtitlesInView: 100,
				useVirtualScroll: false,
				reducedMotion: prefersReducedMotion
			};
			
		case 'medium':
			return {
				enableAnimations: !prefersReducedMotion,
				enableWaveform: false,
				enableVisualizer: false,
				maxSubtitlesInView: 50,
				useVirtualScroll: true,
				reducedMotion: prefersReducedMotion
			};
			
		case 'low':
			return {
				enableAnimations: false,
				enableWaveform: false,
				enableVisualizer: false,
				maxSubtitlesInView: 30,
				useVirtualScroll: true,
				reducedMotion: true
			};
	}
}

/**
 * FPS 监测器
 */
export class FPSMonitor {
	private frames: number = 0;
	private lastTime: number = performance.now();
	private fps: number = 60;
	private rafId: number | null = null;
	
	start(callback?: (fps: number) => void) {
		const measure = () => {
			this.frames++;
			const currentTime = performance.now();
			
			if (currentTime >= this.lastTime + 1000) {
				this.fps = Math.round((this.frames * 1000) / (currentTime - this.lastTime));
				this.frames = 0;
				this.lastTime = currentTime;
				
				if (callback) callback(this.fps);
			}
			
			this.rafId = requestAnimationFrame(measure);
		};
		
		this.rafId = requestAnimationFrame(measure);
	}
	
	stop() {
		if (this.rafId !== null) {
			cancelAnimationFrame(this.rafId);
			this.rafId = null;
		}
	}
	
	getFPS(): number {
		return this.fps;
	}
}

/**
 * 内存使用监测（如果支持）
 */
export function getMemoryInfo(): { used: number; limit: number } | null {
	if ('memory' in performance && (performance as any).memory) {
		const memory = (performance as any).memory;
		return {
			used: memory.usedJSHeapSize / 1048576, // MB
			limit: memory.jsHeapSizeLimit / 1048576 // MB
		};
	}
	return null;
}

/**
 * 判断是否应该启用性能优化模式
 */
export function shouldEnablePerformanceMode(): boolean {
	const performance = detectDevicePerformance();
	const memoryInfo = getMemoryInfo();
	
	// 低性能设备
	if (performance === 'low') return true;
	
	// 内存不足
	if (memoryInfo && memoryInfo.used / memoryInfo.limit > 0.8) {
		return true;
	}
	
	return false;
}

/**
 * 节流函数（性能优化版）
 * 用于滚动、resize 等高频事件
 */
export function performanceThrottle<T extends (...args: any[]) => any>(
	func: T,
	limit: number = 16 // 默认 60fps
): (...args: Parameters<T>) => void {
	let inThrottle: boolean = false;
	let lastArgs: Parameters<T> | null = null;
	let timeoutId: ReturnType<typeof setTimeout> | null = null;
	
	return function(this: any, ...args: Parameters<T>) {
		lastArgs = args;
		
		if (!inThrottle) {
			func.apply(this, args);
			inThrottle = true;
			
			timeoutId = setTimeout(() => {
				inThrottle = false;
				if (lastArgs) {
					func.apply(this, lastArgs);
					lastArgs = null;
				}
			}, limit);
		}
	};
}

/**
 * 防抖函数（性能优化版）
 */
export function performanceDebounce<T extends (...args: any[]) => any>(
	func: T,
	wait: number = 300
): (...args: Parameters<T>) => void {
	let timeoutId: ReturnType<typeof setTimeout> | null = null;
	
	return function(this: any, ...args: Parameters<T>) {
		if (timeoutId !== null) {
			clearTimeout(timeoutId);
		}
		
		timeoutId = setTimeout(() => {
			func.apply(this, args);
		}, wait);
	};
}

/**
 * 批量 DOM 更新
 * 使用 requestAnimationFrame 批量处理 DOM 操作
 */
export class DOMBatcher {
	private pending: Array<() => void> = [];
	private rafId: number | null = null;
	
	schedule(callback: () => void) {
		this.pending.push(callback);
		
		if (this.rafId === null) {
			this.rafId = requestAnimationFrame(() => {
				const callbacks = this.pending.slice();
				this.pending = [];
				this.rafId = null;
				
				callbacks.forEach(cb => cb());
			});
		}
	}
	
	clear() {
		if (this.rafId !== null) {
			cancelAnimationFrame(this.rafId);
			this.rafId = null;
		}
		this.pending = [];
	}
}

/**
 * 懒加载工具
 * 用于字幕列表的虚拟滚动
 */
export function createIntersectionObserver(
	callback: (entries: IntersectionObserverEntry[]) => void,
	options?: IntersectionObserverInit
): IntersectionObserver {
	const defaultOptions: IntersectionObserverInit = {
		root: null,
		rootMargin: '50px',
		threshold: 0.01,
		...options
	};
	
	return new IntersectionObserver(callback, defaultOptions);
}

/**
 * 图片懒加载
 */
export function lazyLoadImage(img: HTMLImageElement, src: string) {
	if ('loading' in HTMLImageElement.prototype) {
		// 原生懒加载支持
		img.loading = 'lazy';
		img.src = src;
	} else {
		// 使用 Intersection Observer
		const observer = createIntersectionObserver((entries) => {
			entries.forEach(entry => {
				if (entry.isIntersecting) {
					img.src = src;
					observer.disconnect();
				}
			});
		});
		observer.observe(img);
	}
}
