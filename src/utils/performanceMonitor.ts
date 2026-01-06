/**
 * 性能监控工具
 * 用于跟踪和测量代码执行时间，帮助识别性能瓶颈
 */

export interface PerformanceMetric {
	name: string;
	duration: number;
	timestamp: number;
}

export class PerformanceMonitor {
	private metrics: PerformanceMetric[] = [];
	private timers: Map<string, number> = new Map();
	private enabled: boolean;

	constructor(enabled: boolean = false) {
		this.enabled = enabled || process.env.NODE_ENV === 'development';
	}

	/**
	 * 开始计时
	 * @param name - 操作名称
	 */
	start(name: string): void {
		if (!this.enabled) return;
		this.timers.set(name, performance.now());
	}

	/**
	 * 结束计时并记录
	 * @param name - 操作名称
	 * @returns 持续时间（毫秒）
	 */
	end(name: string): number {
		if (!this.enabled) return 0;

		const startTime = this.timers.get(name);
		if (startTime === undefined) {
			console.warn(`[PerformanceMonitor] No start time found for: ${name}`);
			return 0;
		}

		const duration = performance.now() - startTime;
		this.metrics.push({
			name,
			duration,
			timestamp: Date.now(),
		});

		this.timers.delete(name);

		console.log(`[Perf] ${name}: ${duration.toFixed(2)}ms`);

		return duration;
	}

	/**
	 * 测量异步函数的执行时间
	 * @param name - 操作名称
	 * @param fn - 异步函数
	 * @returns 函数结果和持续时间
	 */
	async measureAsync<T>(
		name: string,
		fn: () => Promise<T>
	): Promise<{ result: T; duration: number }> {
		if (!this.enabled) {
			const result = await fn();
			return { result, duration: 0 };
		}

		this.start(name);
		const result = await fn();
		const duration = this.end(name);

		return { result, duration };
	}

	/**
	 * 测量同步函数的执行时间
	 * @param name - 操作名称
	 * @param fn - 同步函数
	 * @returns 函数结果和持续时间
	 */
	measure<T>(name: string, fn: () => T): { result: T; duration: number } {
		if (!this.enabled) {
			const result = fn();
			return { result, duration: 0 };
		}

		this.start(name);
		const result = fn();
		const duration = this.end(name);

		return { result, duration };
	}

	/**
	 * 获取所有记录的性能指标
	 */
	getMetrics(): PerformanceMetric[] {
		return [...this.metrics];
	}

	/**
	 * 获取特定操作的平均执行时间
	 * @param name - 操作名称
	 */
	getAverage(name: string): number {
		const filtered = this.metrics.filter(m => m.name === name);
		if (filtered.length === 0) return 0;

		const sum = filtered.reduce((acc, m) => acc + m.duration, 0);
		return sum / filtered.length;
	}

	/**
	 * 获取特定操作的最大执行时间
	 * @param name - 操作名称
	 */
	getMax(name: string): number {
		const filtered = this.metrics.filter(m => m.name === name);
		if (filtered.length === 0) return 0;

		return Math.max(...filtered.map(m => m.duration));
	}

	/**
	 * 清除所有记录
	 */
	clear(): void {
		this.metrics = [];
		this.timers.clear();
	}

	/**
	 * 导出性能报告
	 */
	report(): string {
		if (!this.enabled || this.metrics.length === 0) {
			return 'Performance monitoring is disabled or no metrics recorded.';
		}

		const report: string[] = [];
		report.push('=== Performance Report ===\n');

		// 按名称分组
		const groups = new Map<string, PerformanceMetric[]>();
		for (const metric of this.metrics) {
			if (!groups.has(metric.name)) {
				groups.set(metric.name, []);
			}
			groups.get(metric.name)!.push(metric);
		}

		// 生成报告
		for (const [name, metrics] of groups) {
			const avg = metrics.reduce((sum, m) => sum + m.duration, 0) / metrics.length;
			const max = Math.max(...metrics.map(m => m.duration));
			const min = Math.min(...metrics.map(m => m.duration));

			report.push(`${name}:`);
			report.push(`  Count: ${metrics.length}`);
			report.push(`  Avg:  ${avg.toFixed(2)}ms`);
			report.push(`  Min:  ${min.toFixed(2)}ms`);
			report.push(`  Max:  ${max.toFixed(2)}ms\n`);
		}

		return report.join('\n');
	}

	/**
	 * 启用/禁用性能监控
	 */
	setEnabled(enabled: boolean): void {
		this.enabled = enabled;
	}

	/**
	 * 检查是否启用
	 */
	isEnabled(): boolean {
		return this.enabled;
	}
}

/**
 * 全局性能监控实例
 * 使用方式：perfMonitor.start('operation'); ... perfMonitor.end('operation');
 */
export const perfMonitor = new PerformanceMonitor();
