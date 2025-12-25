import { ItemView, WorkspaceLeaf, TFile, Notice } from 'obsidian';
import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
import { SimplePlayer } from '../components/SimplePlayer';
import { MediaPlayer } from '../components/MediaPlayer';
import { SubtitleOverlay } from '../components/SubtitleOverlay';
import { SubtitleControls } from '../components/SubtitleControls';
import { EvaluationModal } from '../components/EvaluationModal';
import { LINGUA_FLOW_VIEW, type MediaSource, type PlayerRef } from '../types';
import { getResourceUrl, isYouTubeUrl, isMediaFile } from '../utils/fileUtils';
import { SubtitleParser } from '../services/SubtitleParser';
import { useMediaStore } from '../store/mediaStore';
import { useMediaSync } from '../hooks/useMediaSync';
import { useRecordingSession } from '../hooks/useRecordingSession';
import type LinguaFlowPlugin from '../main';

/**
 * LinguaFlow 视图 - React 挂载点
 * 负责管理 React 应用的生命周期和与 Obsidian 的集成
 */
export class LinguaFlowView extends ItemView {
	private root: ReactDOM.Root | null = null;
	private playerRef: React.RefObject<PlayerRef>;
	private currentSource: MediaSource | null = null;
	
	constructor(
		leaf: WorkspaceLeaf,
		private plugin: LinguaFlowPlugin
	) {
		super(leaf);
		this.playerRef = React.createRef();
	}

	getViewType(): string {
		return LINGUA_FLOW_VIEW;
	}

	getDisplayText(): string {
		return 'LinguaFlow Player';
	}

	getIcon(): string {
		return 'play-circle';
	}

	/**
	 * 视图打开时调用
	 */
	async onOpen() {
		console.log('[LinguaFlowView] Opening view');
		
		// 创建容器
		const container = this.containerEl.children[1];
		if (container) {
			container.empty();
			container.addClass('linguaflow-view');
		}

		// 挂载 React 应用
		this.mountReact();
	}

	/**
	 * 视图关闭时调用
	 */
	async onClose() {
		console.log('[LinguaFlowView] Closing view');
		
		// 卸载 React
		if (this.root) {
			this.root.unmount();
			this.root = null;
		}
	}

	/**
	 * 挂载 React 应用
	 */
	private mountReact() {
		const container = this.containerEl.children[1];
		
		// 创建 React root
		this.root = ReactDOM.createRoot(container as HTMLElement);
		
		// 渲染应用
		this.renderApp();
	}

	/**
	 * 渲染 React 应用
	 */
	private renderApp() {
		if (!this.root) return;

		this.root.render(
			<React.StrictMode>
				<ErrorBoundary>
					<LinguaFlowApp
						source={this.currentSource}
						playerRef={this.playerRef}
						plugin={this.plugin}
					/>
				</ErrorBoundary>
			</React.StrictMode>
		);
	}

	/**
	 * 刷新视图（重新渲染）
	 */
	refresh() {
		console.log('[LinguaFlowView] Refreshing view');
		this.renderApp();
	}

	/**
	 * 加载媒体源
	 * @param source - 媒体源信息
	 */
	public async loadMedia(source: MediaSource) {
		console.log('[LinguaFlowView] Loading media:', source);
		
		this.currentSource = source;
		this.renderApp();
		
		// 如果有起始时间，等待播放器加载后跳转
		if (source.timestamp && source.timestamp > 0) {
			setTimeout(() => {
				this.seekTo(source.timestamp!);
			}, 1000);
		}
	}

	/**
	 * 加载本地文件
	 * @param file - Obsidian 文件对象
	 */
	public async loadFile(file: TFile) {
		if (!isMediaFile(file)) {
			throw new Error(`Unsupported file type: ${file.extension}`);
		}

		const url = getResourceUrl(file, this.app.vault);
		
		await this.loadMedia({
			type: 'local',
			url,
			displayName: file.name,
		});
		
		// 自动加载字幕文件
		await this.loadSubtitlesForFile(file);
	}
	
	/**
	 * 加载视频对应的字幕文件
	 */
	private async loadSubtitlesForFile(mediaFile: TFile) {
		try {
			// 查找同名字幕文件
			const baseName = mediaFile.basename;
			const folder = mediaFile.parent;
			
			if (!folder) return;
			
			const subtitleExts = ['srt', 'vtt'];
			
			for (const ext of subtitleExts) {
				const subtitlePath = `${folder.path}/${baseName}.${ext}`;
				const file = this.app.vault.getAbstractFileByPath(subtitlePath);
				
				if (file instanceof TFile) {
					console.log('[LinguaFlowView] Found subtitle:', file.path);
					const content = await this.app.vault.read(file);
					const subtitles = SubtitleParser.parse(content);
					
					if (subtitles.length > 0) {
						useMediaStore.getState().setSubtitles(subtitles);
						console.log('[LinguaFlowView] Loaded', subtitles.length, 'subtitles');
						return; // 找到第一个就返回
					}
				}
			}
			
			console.log('[LinguaFlowView] No subtitle file found for', mediaFile.name);
		} catch (error) {
			console.error('[LinguaFlowView] Failed to load subtitles:', error);
		}
	}

	/**
	 * 跳转到指定时间
	 * @param seconds - 秒数
	 */
	public seekTo(seconds: number) {
		if (this.playerRef.current) {
			this.playerRef.current.seekTo(seconds);
		}
	}

	/**
	 * 获取当前播放时间
	 */
	public getCurrentTime(): number {
		return this.playerRef.current?.getCurrentTime() || 0;
	}
}

/**
 * React 应用主组件
 */
interface LinguaFlowAppProps {
	source: MediaSource | null;
	playerRef: React.RefObject<PlayerRef>;
	plugin: LinguaFlowPlugin;
}

function LinguaFlowApp({ source, playerRef, plugin }: LinguaFlowAppProps) {
	const [error, setError] = React.useState<string | null>(null);
	const [ready, setReady] = React.useState(false);
	const [showEvaluationModal, setShowEvaluationModal] = React.useState(false);
	// 从插件设置中读取默认高度，如果没有则使用 400
	const [playerHeight, setPlayerHeight] = React.useState<number>(() => {
		return (plugin.settings as any).playerHeight ?? 400;
	});
	const [isResizing, setIsResizing] = React.useState(false);
	const [isManuallyLocked, setIsManuallyLocked] = React.useState(false);
	
	// 订阅媒体状态（包括播放状态）
	const subtitles = useMediaStore(state => state.subtitles);
	const activeIndex = useMediaStore(state => state.activeIndex);
	const currentSubtitle = subtitles[activeIndex] || null;
	const segmentLoopEnabled = useMediaStore(state => state.segmentLoopEnabled);
	const playbackRate = useMediaStore(state => state.playbackRate);
	const setPlaybackRate = useMediaStore(state => state.setPlaybackRate);
	// 使用 store 的播放状态，确保与控制栏完全同步
	const isPlaying = useMediaStore(state => state.playing);
	const setPlaying = useMediaStore(state => state.setPlaying);
	
	// 初始化录音会话
	const recordingSession = useRecordingSession(plugin);

	// 启用高性能媒体同步
	useMediaSync(playerRef, ready, plugin);

	// 双击重置为默认高度
	const handleDoubleClick = () => {
		setPlayerHeight(400);
		(plugin.settings as any).playerHeight = 400;
		plugin.saveSettings();
	};

	// 处理拖拽调整大小
	const handleMouseDown = (e: React.MouseEvent) => {
		// 防止双击触发拖拽
		if (e.detail === 2) return;
		
		setIsResizing(true);
		e.preventDefault();
		// 添加选择禁用样式
		document.body.style.cursor = 'ns-resize';
		document.body.style.userSelect = 'none';
	};

	React.useEffect(() => {
		if (!isResizing) return;

		const handleMouseMove = (e: MouseEvent) => {
			// 计算新的播放器高度
			const container = document.querySelector('.linguaflow-container');
			if (container) {
				const rect = container.getBoundingClientRect();
				const header = document.querySelector('.linguaflow-header');
				const headerHeight = header?.getBoundingClientRect().height || 60;
				
				// 从容器顶部计算，减去标题栏高度
				const newHeight = e.clientY - rect.top - headerHeight;
				
				// 限制最小和最大高度
				const minHeight = 200;
				const maxHeight = rect.height - headerHeight - 250; // 为字幕列表留空间
				
				const finalHeight = Math.max(minHeight, Math.min(newHeight, maxHeight));
				setPlayerHeight(finalHeight);
			}
		};

		const handleMouseUp = () => {
			setIsResizing(false);
			// 移除选择禁用样式
			document.body.style.cursor = '';
			document.body.style.userSelect = '';
			
			// 保存高度设置到插件
			(plugin.settings as any).playerHeight = playerHeight;
			plugin.saveSettings();
		};

		document.addEventListener('mousemove', handleMouseMove);
		document.addEventListener('mouseup', handleMouseUp);

		return () => {
			document.removeEventListener('mousemove', handleMouseMove);
			document.removeEventListener('mouseup', handleMouseUp);
		};
	}, [isResizing, playerHeight, plugin]);

	// 重置状态当源改变时
	React.useEffect(() => {
		setError(null);
		setReady(false);
		// 重置字幕
		useMediaStore.getState().reset();
	}, [source]);

	// 监听评分结果，自动弹出评分弹窗
	React.useEffect(() => {
		console.log('[LinguaFlowView] Evaluation effect triggered:', {
			hasEvaluation: !!recordingSession.evaluation,
			isRecording: recordingSession.isRecording,
			isTranscribing: recordingSession.isTranscribing,
			evaluation: recordingSession.evaluation,
			sessionError: recordingSession.sessionError
		});
		
		if (recordingSession.evaluation && !recordingSession.isRecording && !recordingSession.isTranscribing) {
			console.log('[LinguaFlowView] ✅ All conditions met, showing evaluation modal');
			setShowEvaluationModal(true);
		} else {
			console.log('[LinguaFlowView] ❌ Conditions not met for modal:', {
				hasEvaluation: !!recordingSession.evaluation,
				notRecording: !recordingSession.isRecording,
				notTranscribing: !recordingSession.isTranscribing
			});
		}
		
		// 如果有错误，显示提示
		if (recordingSession.sessionError) {
			console.error('[LinguaFlowView] Session error:', recordingSession.sessionError);
			new Notice(`录音处理失败: ${recordingSession.sessionError}`);
		}
	}, [recordingSession.evaluation, recordingSession.isRecording, recordingSession.isTranscribing, recordingSession.sessionError]);

	if (!source) {
		return (
			<div className="linguaflow-empty">
				<div className="linguaflow-empty-icon">🎬</div>
				<h2>Welcome to LinguaFlow</h2>
				<p>Open a media file or use the protocol to start playing</p>
				<div className="linguaflow-examples">
					<h3>Examples:</h3>
					<ul>
						<li><code>obsidian://linguaflow?src=https://youtube.com/watch?v=...</code></li>
						<li><code>obsidian://linguaflow?src=path/to/video.mp4&t=30</code></li>
					</ul>
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="linguaflow-error">
				<div className="linguaflow-error-icon">⚠️</div>
				<h2>Error loading media</h2>
				<p>{error}</p>
				<button
					onClick={() => setError(null)}
					className="linguaflow-retry-btn"
				>
					Retry
				</button>
			</div>
		);
	}

	return (
		<div className="linguaflow-container">
			<div className="linguaflow-header">
				<h2>{source.displayName || 'Media Player'}</h2>
				{source.type === 'youtube' && (
					<span className="linguaflow-badge">YouTube</span>
				)}
				{source.type === 'local' && (
					<span className="linguaflow-badge">Local File</span>
				)}
			</div>

			{/* 播放器区域 */}
			<div 
				className="linguaflow-player-section" 
				style={{ height: `${playerHeight}px`, minHeight: '200px' }}
			>
				{source.type === 'youtube' ? (
					<MediaPlayer
						ref={playerRef}
						url={source.url}
						autoPlay={false}
						startTime={source.timestamp || 0}
						onReady={() => {
							console.log('[LinguaFlowApp] Player ready (YouTube)');
							setReady(true);
						}}
						onError={(err: any) => {
							console.error('[LinguaFlowApp] Player error:', err);
							setError(err.message || 'Failed to load media');
						}}
						onProgress={(state: any) => {
							// 同步播放状态到 store（关键！）
							if (state && typeof state.playing === 'boolean') {
								useMediaStore.getState().setPlaying(state.playing);
							}
						}}
					/>
				) : (
					<SimplePlayer
						ref={playerRef}
						url={source.url}
						autoPlay={false}
						startTime={source.timestamp || 0}
						videoFit={plugin.settings.videoFit}
						onReady={() => {
							console.log('[LinguaFlowApp] Player ready (Local)');
							setReady(true);
						}}
						onError={(err: any) => {
							console.error('[LinguaFlowApp] Player error:', err);
							setError(err.message || 'Failed to load media');
						}}
						onProgress={(state: any) => {
							// 同步播放状态到 store（关键！）
							if (state && typeof state.playing === 'boolean') {
								useMediaStore.getState().setPlaying(state.playing);
							}
						}}
					/>
				)}
			</div>

			{/* 固定的控制栏 - 总是在视频下方 */}
			{ready && subtitles.length > 0 && plugin && (
				<SubtitleControls
					currentCue={currentSubtitle}
					plugin={plugin}
					playerRef={playerRef}
					isPlaying={isPlaying}
					isLooping={segmentLoopEnabled}
					isRecording={recordingSession?.isRecording || false}
					isManuallyLocked={isManuallyLocked}
					playbackRate={playbackRate}
					onTogglePlay={() => {
						if (playerRef.current) {
							if (isPlaying) {
								playerRef.current.pauseVideo();
								setPlaying(false);
							} else {
								playerRef.current.playVideo();
								setPlaying(true);
							}
						}
					}}
					onToggleLoop={() => {
						if (currentSubtitle) {
							const loopCount = plugin.settings.loopCount ?? 3;
							const activeIndex = useMediaStore.getState().activeIndex;
							useMediaStore.getState().startSegmentLoop(
								currentSubtitle.start, 
								currentSubtitle.end, 
								loopCount,
								activeIndex
							);
						}
					}}
					onExitLoop={() => {
						useMediaStore.getState().stopSegmentLoop();
					}}
					onRecord={() => {
						if (currentSubtitle && recordingSession) {
							if (recordingSession.isRecording) {
								recordingSession.stopRecording();
							} else {
								// 录音前强制暂停播放，避免背景音干扰
								if (playerRef.current && isPlaying) {
									console.log('[LinguaFlowView] Pausing video for recording');
									playerRef.current.pauseVideo();
									setPlaying(false);
								}
								recordingSession.startRecording(currentSubtitle);
							}
						}
					}}
					onRateChange={(rate: number) => {
						setPlaybackRate(rate);
						if (playerRef.current) {
							playerRef.current.setPlaybackRate(rate);
						}
					}}
					onUnlock={() => setIsManuallyLocked(false)}
				/>
			)}

			{/* 拖拽分隔条 */}
			{ready && (
				<div 
					className={`linguaflow-resizer ${isResizing ? 'resizing' : ''}`}
					onMouseDown={handleMouseDown}
					onDoubleClick={handleDoubleClick}
					title="拖拽调整大小 | 双击重置为默认高度"
					aria-label="Resize handle"
				>
					<div className="linguaflow-resizer-line"></div>
				</div>
			)}

			{/* 字幕列表区域 - 不包含控制栏 */}
			{ready && (
				<div className="linguaflow-subtitle-section">
					<SubtitleOverlay 
						playerRef={playerRef}
						showList={plugin.settings.showInlineSubtitles}
						showControls={false}
						plugin={plugin}
						recordingSession={recordingSession}
					/>
				</div>
			)}
			
			{!ready && (
				<div className="linguaflow-loading">
					<div className="linguaflow-spinner"></div>
					<p>Loading media...</p>
				</div>
			)}

			{/* 评分弹窗 */}
			<EvaluationModal
				evaluation={recordingSession.evaluation}
				transcription={recordingSession.transcriptionResult}
				recordingBlobUrl={recordingSession.recordingBlobUrl}
				playerRef={playerRef}
				targetSubtitle={recordingSession.targetSubtitle}
				isVisible={showEvaluationModal}
				onClose={() => setShowEvaluationModal(false)}
			/>
		</div>
	);
}

/**
 * React Error Boundary
 * 捕获并显示 React 组件中的错误
 */
interface ErrorBoundaryState {
	hasError: boolean;
	error: Error | null;
}

class ErrorBoundary extends React.Component<
	{ children: React.ReactNode },
	ErrorBoundaryState
> {
	constructor(props: { children: React.ReactNode }) {
		super(props);
		this.state = { hasError: false, error: null };
	}

	static getDerivedStateFromError(error: Error): ErrorBoundaryState {
		return { hasError: true, error };
	}

	componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
		console.error('[ErrorBoundary] Caught error:', error, errorInfo);
	}

	render() {
		if (this.state.hasError) {
			return (
				<div className="linguaflow-error-boundary">
					<h2>❌ Something went wrong</h2>
					<p>{this.state.error?.message}</p>
					<pre>{this.state.error?.stack}</pre>
					<button
						onClick={() => this.setState({ hasError: false, error: null })}
						className="linguaflow-retry-btn"
					>
						Try again
					</button>
				</div>
			);
		}

		return this.props.children;
	}
}
