/**
 * 统一的日志系统
 * 可以通过设置开关控制日志输出，避免生产环境日志泄露
 */

export enum LogLevel {
	DEBUG = 0,
	INFO = 1,
	WARN = 2,
	ERROR = 3,
	NONE = 4
}

class Logger {
	private level: LogLevel = LogLevel.NONE; // 默认关闭所有日志
	private prefix: string = '[LangPlayer]';

	/**
	 * 设置日志级别
	 */
	setLevel(level: LogLevel) {
		this.level = level;
	}

	/**
	 * 启用调试模式
	 */
	enableDebug() {
		this.level = LogLevel.DEBUG;
	}

	/**
	 * 禁用所有日志
	 */
	disableAll() {
		this.level = LogLevel.NONE;
	}

	/**
	 * 调试日志（详细信息）
	 */
	debug(component: string, ...args: any[]) {
		if (this.level <= LogLevel.DEBUG) {
			console.log(`${this.prefix}[${component}]`, ...args);
		}
	}

	/**
	 * 信息日志（一般信息）
	 */
	info(component: string, ...args: any[]) {
		if (this.level <= LogLevel.INFO) {
			console.log(`${this.prefix}[${component}]`, ...args);
		}
	}

	/**
	 * 警告日志（潜在问题）
	 */
	warn(component: string, ...args: any[]) {
		if (this.level <= LogLevel.WARN) {
			console.warn(`${this.prefix}[${component}]`, ...args);
		}
	}

	/**
	 * 错误日志（严重问题）
	 */
	error(component: string, ...args: any[]) {
		if (this.level <= LogLevel.ERROR) {
			console.error(`${this.prefix}[${component}]`, ...args);
		}
	}

	/**
	 * 性能测量开始
	 */
	perfStart(label: string) {
		if (this.level <= LogLevel.DEBUG) {
			performance.mark(`${label}-start`);
		}
	}

	/**
	 * 性能测量结束
	 */
	perfEnd(label: string) {
		if (this.level <= LogLevel.DEBUG) {
			performance.mark(`${label}-end`);
			performance.measure(label, `${label}-start`, `${label}-end`);
			const measure = performance.getEntriesByName(label)[0];
			if (measure) {
				console.log(`${this.prefix}[Perf] ${label}: ${measure.duration.toFixed(2)}ms`);
			}
		}
	}
}

// 导出单例
export const logger = new Logger();
