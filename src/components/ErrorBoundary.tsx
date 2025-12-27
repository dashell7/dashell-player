import * as React from 'react';
import { logger } from '../utils/logger';

interface ErrorBoundaryProps {
	children: React.ReactNode;
	fallback?: React.ReactNode;
	onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
	hasError: boolean;
	error: Error | null;
	errorInfo: React.ErrorInfo | null;
}

/**
 * React 错误边界组件
 * 捕获子组件树中的 JavaScript 错误，记录错误并显示降级 UI
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
	constructor(props: ErrorBoundaryProps) {
		super(props);
		this.state = {
			hasError: false,
			error: null,
			errorInfo: null
		};
	}

	static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
		// 更新 state 以显示降级 UI
		return { hasError: true, error };
	}

	componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
		// 记录错误到日志系统
		logger.error('ErrorBoundary', 'Component error caught:', {
			error: error.message,
			stack: error.stack,
			componentStack: errorInfo.componentStack
		});

		// 更新state保存错误信息
		this.setState({
			error,
			errorInfo
		});

		// 调用可选的错误处理函数
		this.props.onError?.(error, errorInfo);
	}

	handleReset = () => {
		this.setState({
			hasError: false,
			error: null,
			errorInfo: null
		});
	};

	render() {
		if (this.state.hasError) {
			// 如果提供了自定义降级 UI，使用它
			if (this.props.fallback) {
				return this.props.fallback;
			}

			// 默认降级 UI
			return (
				<div className="linguaflow-error-boundary">
					<div className="linguaflow-error-icon">⚠️</div>
					<h2>组件加载失败</h2>
					<p>很抱歉，播放器遇到了问题。</p>
					
					{this.state.error && (
						<details style={{ marginTop: '16px' }}>
							<summary style={{ cursor: 'pointer', color: 'var(--text-muted)' }}>
								查看错误详情
							</summary>
							<pre style={{ 
								marginTop: '8px', 
								padding: '12px', 
								background: 'var(--background-secondary)', 
								borderRadius: '4px', 
								fontSize: '11px',
								overflow: 'auto',
								maxHeight: '200px'
							}}>
								<strong>错误信息：</strong>
								{'\n'}{this.state.error.message}
								{'\n\n'}
								<strong>错误堆栈：</strong>
								{'\n'}{this.state.error.stack}
								{this.state.errorInfo && (
									<>
										{'\n\n'}
										<strong>组件堆栈：</strong>
										{'\n'}{this.state.errorInfo.componentStack}
									</>
								)}
							</pre>
						</details>
					)}

					<button 
						className="linguaflow-retry-btn" 
						onClick={this.handleReset}
						style={{ marginTop: '16px' }}
					>
						重试
					</button>
				</div>
			);
		}

		return this.props.children;
	}
}

/**
 * 函数式组件错误边界 Hook (辅助)
 * 注意：React Hooks 目前还不支持 componentDidCatch，这只是一个包装器
 */
export function withErrorBoundary<P extends object>(
	Component: React.ComponentType<P>,
	fallback?: React.ReactNode
): React.FC<P> {
	return (props: P) => (
		<ErrorBoundary fallback={fallback}>
			<Component {...props} />
		</ErrorBoundary>
	);
}
