import { ItemView, WorkspaceLeaf, TFile, Notice } from 'obsidian';
import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
import { SimplePlayer } from '../components/SimplePlayer';
import { SubtitleOverlay } from '../components/SubtitleOverlay';
import { SubtitleControls } from '../components/SubtitleControls';
import { EvaluationModal } from '../components/EvaluationModal';
import { AudioWaveform } from '../components/AudioWaveform';
import { LINGUA_FLOW_VIEW, type MediaSource, type PlayerRef } from '../types';
import { getResourceUrl, isMediaFile, isAudioFile } from '../utils/fileUtils';
import { SubtitleParser } from '../services/SubtitleParser';
import { useMediaStore } from '../store/mediaStore';
import { useMediaSync } from '../hooks/useMediaSync';
import { useRecordingSession } from '../hooks/useRecordingSession';
import type LinguaFlowPlugin from '../main';
import {
	isMobileDevice,
	isPhone,
	getPlayerHeight,
	getRecommendedSubtitleLayout,
	onScreenSizeChange
} from '../utils/platformUtils';

/**
 * LinguaFlow 视图 - React 挂载点
 * 负责管理 React 应用的生命周期和与 Obsidian 的集成
 */
export class LinguaFlowView extends ItemView {
	private root: ReactDOM.Root | null = null;
	public currentSource: MediaSource | null = null;
	private playerRef: React.RefObject<PlayerRef>;
	
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
		return 'LangPlayer';
	}

	getIcon(): string {
		return 'play-circle';
	}

	/**
	 * 获取视图状态（用于保存）
	 */
	getState() {
		const state = super.getState();
		if (this.currentSource) {
			// 更新当前播放时间，以便恢复时继续播放
			const currentTime = this.getCurrentTime();
			if (currentTime > 0) {
				this.currentSource.timestamp = currentTime;
			}

			// 序列化 source
			const sourceState: any = { ...this.currentSource };
			if (this.currentSource.type === 'local' && this.currentSource.file) {
				sourceState.filePath = this.currentSource.file.path;
				delete sourceState.file; // TFile 对象不可序列化，需移除
			}
			state.source = sourceState;
		}
		return state;
	}

	/**
	 * 恢复视图状态
	 */
	async setState(state: any, result: any) {
		await super.setState(state, result);
		
		if (state.source) {
			const source = state.source;
			// 恢复本地文件的 TFile 对象
			if (source.type === 'local' && source.filePath) {
				const file = this.app.vault.getAbstractFileByPath(source.filePath);
				if (file instanceof TFile) {
					source.file = file;
				} else {
					console.warn('[LinguaFlowView] 无法恢复文件，路径不存在:', source.filePath);
					return;
				}
			}
			
			// 自动重新加载媒体
			await this.loadMedia(source);
		}
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
		// 优化：如果是同一个文件，仅跳转，不重新加载
		if (this.currentSource) {
			const isSameFile = source.type === 'local' && 
							   this.currentSource.type === 'local' && 
							   source.file?.path === this.currentSource.file?.path;
							   
			const isSameUrl = source.type === 'url' && 
							  this.currentSource.type === 'url' && 
							  source.url === this.currentSource.url;
							  
			if (isSameFile || isSameUrl) {
				console.log('[LinguaFlowView] Same media source, skipping reload and just seeking');
				if (source.timestamp !== undefined && source.timestamp >= 0) {
					// 更新当前 source 的 timestamp
					this.currentSource.timestamp = source.timestamp;
					
					// 执行跳转和播放
					if (this.playerRef.current) {
						this.playerRef.current.seekTo(source.timestamp);
						this.playerRef.current.playVideo();
						const { useMediaStore } = require('../store/mediaStore');
						useMediaStore.getState().setPlaying(true);
					}
				}
				return; // 直接返回，不重置状态
			}
		}

		console.log('[LinguaFlowView] Loading media:', source);
		
		// 立即重置字幕和播放状态
		useMediaStore.getState().reset();
		
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
	 * @param timestamp - 起始时间（秒）
	 */
	public async loadFile(file: TFile, timestamp?: number) {
		if (!isMediaFile(file)) {
			throw new Error(`Unsupported file type: ${file.extension}`);
		}

		const url = getResourceUrl(file, this.app.vault);
		
		await this.loadMedia({
			type: 'local',
			url,
			displayName: file.name,
			timestamp,
			file
		});
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
	
	// 移动端检测和自适应高度
	const [isMobile, setIsMobile] = React.useState(isMobileDevice());
	const [isSmallScreen, setIsSmallScreen] = React.useState(isPhone());
	
	// 根据设备类型设置播放器高度
	const [playerHeight, setPlayerHeight] = React.useState<number>(() => {
		const defaultHeight = (plugin.settings as any).playerHeight ?? 400;
		return getPlayerHeight(defaultHeight);
	});
	
	// 从插件设置中读取默认宽度，如果没有则使用 400
	const [subtitleWidth, setSubtitleWidth] = React.useState<number>(() => {
		return (plugin.settings as any).subtitleWidth ?? 400;
	});
	const [isResizing, setIsResizing] = React.useState(false);
	const [isManuallyLocked, setIsManuallyLocked] = React.useState(false);
	
	// 监听屏幕尺寸变化
	React.useEffect(() => {
		const cleanup = onScreenSizeChange(() => {
			setIsMobile(isMobileDevice());
			setIsSmallScreen(isPhone());
			// 根据新的屏幕尺寸调整播放器高度
			const defaultHeight = (plugin.settings as any).playerHeight ?? 400;
			setPlayerHeight(getPlayerHeight(defaultHeight));
		});
		
		return cleanup;
	}, [plugin.settings]);
	
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
	
	// 订阅设置状态
	const videoFit = useMediaStore(state => state.videoFit);
	
	const isAudio = React.useMemo(() => {
		if (!source) return false;
		if (source.type === 'local' && source.file) {
			return isAudioFile(source.file);
		}
		return isAudioFile(source.url);
	}, [source]);

	// 初始化录音会话
	const recordingSession = useRecordingSession(plugin);

	// 监听 source 变化，处理时间跳转（修复从外部打开链接时的跳转问题）
	React.useEffect(() => {
		if (source?.timestamp !== undefined && source.timestamp >= 0 && playerRef.current && ready) {
			console.log('[LinguaFlowApp] Source changed with timestamp, seeking to:', source.timestamp);
			// 稍微延迟以确保播放器状态稳定
			setTimeout(() => {
				if (playerRef.current) {
					playerRef.current.seekTo(source.timestamp!);
					playerRef.current.playVideo();
					setPlaying(true);
				}
			}, 100);
		}
	}, [source, ready]);

	// 同步 playerRef 到 plugin.playerRef，以便 Store 方法可以访问
	React.useEffect(() => {
		if (playerRef.current && plugin.playerRef) {
			// 将当前的 playerRef.current 同步到 plugin.playerRef
			(plugin.playerRef as any).current = playerRef.current;
			console.log('[LinguaFlowApp] Synced playerRef to plugin.playerRef');
		}
	}, [playerRef.current, plugin]);

	// 启用高性能媒体同步
	// 当正在录音或显示评分弹窗时，阻塞自动化逻辑（如影子跟读的自动跳转）
	const isBlocked = recordingSession.isRecording || showEvaluationModal;
	useMediaSync(playerRef, ready, plugin, isBlocked);

	// 回调函数优化 (useCallback)
	const handleTogglePlay = React.useCallback(() => {
		if (playerRef.current) {
			if (isPlaying) {
				playerRef.current.pauseVideo();
				setPlaying(false);
			} else {
				playerRef.current.playVideo();
				setPlaying(true);
			}
		}
	}, [isPlaying, setPlaying]);

	const handleToggleLoop = React.useCallback(() => {
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
	}, [currentSubtitle, plugin]);

	const handleExitLoop = React.useCallback(() => {
		useMediaStore.getState().stopSegmentLoop();
	}, []);

	const handleRecord = React.useCallback(() => {
		if (currentSubtitle && recordingSession) {
			if (recordingSession.isRecording) {
				recordingSession.stopRecording();
			} else {
				if (playerRef.current && isPlaying) {
					console.log('[LinguaFlowView] Pausing video for recording');
					playerRef.current.pauseVideo();
					setPlaying(false);
				}
				recordingSession.startRecording(currentSubtitle);
			}
		}
	}, [currentSubtitle, recordingSession, isPlaying, setPlaying]);

	const handleRateChange = React.useCallback((rate: number) => {
		setPlaybackRate(rate);
		if (playerRef.current) {
			playerRef.current.setPlaybackRate(rate);
		}
	}, [setPlaybackRate]);

	const handleUnlock = React.useCallback(() => setIsManuallyLocked(false), []);

	// 双击重置为默认高度/宽度
	const handleDoubleClick = () => {
		const isRightLayout = !isMobile && plugin.settings.subtitleLayout === 'right';
		if (isRightLayout) {
			setSubtitleWidth(400);
			(plugin.settings as any).subtitleWidth = 400;
		} else {
			setPlayerHeight(400);
			(plugin.settings as any).playerHeight = 400;
		}
		plugin.saveSettings();
	};

	// 通用拖拽处理 (支持鼠标和触摸)
	const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
		// 忽略非左键点击（仅限鼠标）
		if ('button' in e && e.button !== 0) return;
		// 忽略多点触控
		if ('touches' in e && e.touches.length > 1) return;

		// 防止双击触发拖拽 (仅限鼠标)
		if ('detail' in e && e.detail === 2) return;
		
		// 阻止默认事件（特别是触摸时的滚动）
		// 注意：passive: false 事件监听器在 handleDragMove 中添加
		if (e.type === 'touchstart' && e.cancelable) {
			// 在某些浏览器中可能需要阻止默认行为以防止滚动
			// 但 React SyntheticEvent 有时受限，主要逻辑在原生 listener 中
		}
		
		setIsResizing(true);
		
		// 移动端强制视为底部布局
		const isRightLayout = !isMobile && plugin.settings.subtitleLayout === 'right';
		
		// 追踪当前值，解决闭包陷阱
		let currentWidth = subtitleWidth;
		let currentHeight = playerHeight;
		let ticking = false;

		const handleDragMove = (moveEvent: MouseEvent | TouchEvent) => {
			let clientX, clientY;
			if ('touches' in moveEvent) {
				const touchEvent = moveEvent as TouchEvent;
				if (touchEvent.touches && touchEvent.touches.length > 0) {
					clientX = touchEvent.touches[0]!.clientX;
					clientY = touchEvent.touches[0]!.clientY;
				} else {
					return;
				}
			} else {
				clientX = (moveEvent as MouseEvent).clientX;
				clientY = (moveEvent as MouseEvent).clientY;
			}

			if (!ticking) {
				window.requestAnimationFrame(() => {
					const container = document.querySelector('.linguaflow-container');
					if (!container) return;
					
					const rect = container.getBoundingClientRect();
					
					if (isRightLayout) {
						// 右侧布局：调整宽度
						const newWidth = Math.max(200, rect.right - clientX);
						currentWidth = newWidth;
						
						// 1. 更新 State
						setSubtitleWidth(newWidth);
						
						// 2. 直接更新 DOM
						const subtitleSection = document.querySelector('.linguaflow-subtitle-section') as HTMLElement;
						if (subtitleSection) {
							subtitleSection.style.width = `${newWidth}px`;
							subtitleSection.style.minWidth = `${newWidth}px`;
							subtitleSection.style.maxWidth = `${newWidth}px`;
						}
					} else {
						// 底部布局：调整高度
						const header = document.querySelector('.linguaflow-header');
						const headerHeight = header ? header.getBoundingClientRect().height : 0;
						const availableHeight = rect.height - headerHeight;
						const newHeight = Math.max(200, Math.min(availableHeight - 200, clientY - rect.top - headerHeight));
						
						currentHeight = newHeight;
						setPlayerHeight(newHeight);
					}
					ticking = false;
				});
				ticking = true;
			}
		};

		const handleDragEnd = () => {
			setIsResizing(false);
			document.removeEventListener('mousemove', handleDragMove);
			document.removeEventListener('mouseup', handleDragEnd);
			document.removeEventListener('touchmove', handleDragMove);
			document.removeEventListener('touchend', handleDragEnd);
			
			// 保存设置
			if (isRightLayout) {
				(plugin.settings as any).subtitleWidth = currentWidth;
			} else {
				(plugin.settings as any).playerHeight = currentHeight;
			}
			plugin.saveSettings();
		};

		document.addEventListener('mousemove', handleDragMove);
		document.addEventListener('mouseup', handleDragEnd);
		document.addEventListener('touchmove', handleDragMove, { passive: false });
		document.addEventListener('touchend', handleDragEnd);
	};

	// 重置状态并自动加载字幕当源改变时
	React.useEffect(() => {
		setError(null);
		setReady(false);
		// 重置字幕
		useMediaStore.getState().reset();

		// 如果是本地文件，尝试自动加载同名字幕
		if (source?.type === 'local' && source.file) {
			const loadSubtitles = async () => {
				const mediaFile = source.file!;
				try {
					const baseName = mediaFile.basename;
					const folder = mediaFile.parent;
					if (!folder) return;
					
					const folderPath = folder.path === '/' ? '' : folder.path;
					const subtitleExts = ['srt', 'vtt'];
					const suffixes = ['', '.zh', '.en', '.chs', '.cht', '.eng', '.jp', '.ja', '.ko', '.kr', '.zh-CN', '.zh-TW'];
					
					const vault = plugin.app.vault;
					
					for (const ext of subtitleExts) {
						for (const suffix of suffixes) {
							const fileName = `${baseName}${suffix}.${ext}`;
							const subtitlePath = folderPath ? `${folderPath}/${fileName}` : fileName;
							
							const file = vault.getAbstractFileByPath(subtitlePath);
							
							if (file instanceof TFile) {
								console.log('[LinguaFlowApp] Found subtitle:', file.path);
								const content = await vault.read(file);
								const subtitles = SubtitleParser.parse(content);
								
								if (subtitles.length > 0) {
									useMediaStore.getState().setSubtitles(subtitles);
									console.log('[LinguaFlowApp] Loaded', subtitles.length, 'subtitles');
									return;
								}
							}
						}
					}
					console.log('[LinguaFlowApp] No subtitle file found for', mediaFile.name);
				} catch (error) {
					console.error('[LinguaFlowApp] Failed to load subtitles:', error);
				}
			};
			loadSubtitles();
		}
	}, [source, plugin]);

	// 监听录音状态变化并优化弹窗显示时机
	React.useEffect(() => {
		console.log('[LinguaFlowView] State update:', {
			isRecording: recordingSession.isRecording,
			hasBlob: !!recordingSession.recordingBlobUrl,
			error: recordingSession.sessionError,
			isTranscribing: recordingSession.isTranscribing,
			showModal: showEvaluationModal
		});
		
		// 优化：录音停止后立即显示弹窗（即使还在转录中）
		if (!recordingSession.isRecording && recordingSession.recordingBlobUrl && !recordingSession.sessionError) {
			if (!showEvaluationModal) {
				console.log('[LinguaFlowView] Triggering Modal Open');
				setShowEvaluationModal(true);
			}
		} else if (recordingSession.sessionError) {
			console.log('[LinguaFlowView] Session Error:', recordingSession.sessionError);
			setShowEvaluationModal(false);
			// 只有当错误是新的时才提示（避免重复提示）
			new Notice(`录音失败: ${recordingSession.sessionError}`);
		}
	}, [
		recordingSession.isRecording, 
		recordingSession.recordingBlobUrl, 
		recordingSession.sessionError,
		// 添加 isTranscribing 作为依赖，确保状态更新时能重新评估
		recordingSession.isTranscribing
	]);

	// 监听错误状态
	React.useEffect(() => {
		if (recordingSession.sessionError) {
			console.error('[LinguaFlowView] Session error:', recordingSession.sessionError);
		}
	}, [recordingSession.sessionError]);

	// 添加全局键盘快捷键支持
	React.useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			const target = e.target as HTMLElement;
			
			// 如果正在输入，不触发快捷键
			// 检查 INPUT, TEXTAREA, contentEditable 以及 Obsidian 编辑器特定的类
			if (target.tagName === 'INPUT' || 
				target.tagName === 'TEXTAREA' ||
				target.isContentEditable ||
				target.classList.contains('cm-content') ||
				target.closest('.cm-editor') ||
				target.closest('.markdown-preview-view')) {
				return;
			}

			// 检查是否已经在处理事件（避免重复触发）
			if (e.defaultPrevented) {
				return;
			}

			// 获取当前状态
			const state = useMediaStore.getState();
			const player = playerRef.current;

			if (!player) {
				return;
			}

			// 获取快捷键配置 (深度合并默认值)
			const defaultHotkeys = {
				prevSubtitle: 'ArrowLeft',
				nextSubtitle: 'ArrowRight',
				rewind: 'Shift+ArrowLeft',
				fastForward: 'Shift+ArrowRight',
				playPause: ' ',
				record: 'r'
			};
			const hotkeys = { ...defaultHotkeys, ...plugin.settings.hotkeys };
			
			if (isHotkeyMatch(e, hotkeys.playPause)) { // 播放/暂停
				e.preventDefault();
				if (state.playing) {
					player.pauseVideo();
					setPlaying(false);
				} else {
					player.playVideo();
					setPlaying(true);
				}
			} else if (isHotkeyMatch(e, hotkeys.rewind)) { // 快退
				e.preventDefault();
				const currentTimeL = player.getCurrentTime();
				player.seekTo(Math.max(0, currentTimeL - 5));
			} else if (isHotkeyMatch(e, hotkeys.prevSubtitle)) { // 上一句字幕
				e.preventDefault();
				if (state.activeIndex > 0) {
					const prevCue = state.subtitles[state.activeIndex - 1];
					if (prevCue) {
						player.seekTo(prevCue.start);
						state.setActiveIndex(state.activeIndex - 1);
					}
				}
			} else if (isHotkeyMatch(e, hotkeys.fastForward)) { // 快进
				e.preventDefault();
				const currentTimeR = player.getCurrentTime();
				player.seekTo(currentTimeR + 5);
			} else if (isHotkeyMatch(e, hotkeys.nextSubtitle)) { // 下一句字幕
				e.preventDefault();
				if (state.activeIndex < state.subtitles.length - 1) {
					const nextCue = state.subtitles[state.activeIndex + 1];
					if (nextCue) {
						player.seekTo(nextCue.start);
						state.setActiveIndex(state.activeIndex + 1);
					}
				}
			} else if (isHotkeyMatch(e, hotkeys.record)) { // 录音
				e.preventDefault();
				if (recordingSession.isRecording) {
					recordingSession.stopRecording();
				} else if (state.activeIndex >= 0) {
					const cue = state.subtitles[state.activeIndex];
					if (cue) {
						// 录音前暂停播放
						if (state.playing) {
							player.pauseVideo();
							setPlaying(false);
						}
						recordingSession.startRecording(cue);
					}
				}
			} else if (e.key.toLowerCase() === 'a') { // Set Point A
				e.preventDefault();
				const currentTime = state.currentTime;
				state.setPointA(currentTime);
				new Notice(`🅰️ A点已设置: ${currentTime.toFixed(2)}s`);
			} else if (e.key.toLowerCase() === 'b') { // Set Point B
				e.preventDefault();
				const currentTime = state.currentTime;
				const pointA = state.pointA;
				if (pointA === null || currentTime <= pointA) {
					new Notice('⚠️ B点必须在A点之后');
				} else {
					state.setPointB(currentTime);
					state.enableABRepeat();
					new Notice(`🅱️ B点已设置: ${currentTime.toFixed(2)}s - AB循环已启动`);
				}
			} else if (e.key === '[') { // 保留硬编码备用：上一句
				if (state.activeIndex > 0) {
					const prevCue = state.subtitles[state.activeIndex - 1];
					if (prevCue) {
						player.seekTo(prevCue.start);
						state.setActiveIndex(state.activeIndex - 1);
					}
				}
			} else if (e.key === ']') { // 保留硬编码备用：下一句
				if (state.activeIndex < state.subtitles.length - 1) {
					const nextCue = state.subtitles[state.activeIndex + 1];
					if (nextCue) {
						player.seekTo(nextCue.start);
						state.setActiveIndex(state.activeIndex + 1);
					}
				}
			}
		};

		// 使用捕获阶段监听，防止 iframe 拦截键盘事件
		window.addEventListener('keydown', handleKeyDown, true);
		return () => {
			window.removeEventListener('keydown', handleKeyDown, true);
		};
	}, [playerRef, recordingSession, setPlaying]); // 依赖项

	// 监听错误状态
	React.useEffect(() => {
		if (recordingSession.sessionError) {
			console.error('[LinguaFlowView] Session error:', recordingSession.sessionError);
		}
	}, [recordingSession.sessionError]);

	if (!source) {
		return (
			<div className="linguaflow-container">
				{/* 空状态 - 只显示工具栏按钮区域 */}
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

	// 移动端强制使用底部布局，不修改用户设置
	const effectiveLayout = isMobile ? 'bottom' : plugin.settings.subtitleLayout;
	const layoutClass = effectiveLayout === 'right' ? 'linguaflow-layout-right' : 'linguaflow-layout-bottom';
	const isRightLayout = effectiveLayout === 'right';
	
	return (
		<div className={`linguaflow-container ${layoutClass} ${isResizing ? 'resizing' : ''}`}>
			<div className="linguaflow-header">
				<h2>{source.displayName || 'Media Player'}</h2>
			</div>

			{/* 主内容区 */}
			<div className="linguaflow-main-content">
				{/* 播放器和控制栏容器 */}
				<div className="linguaflow-player-wrapper-section">
					{/* 播放器区域 */}
					<div 
						className={`linguaflow-player-section ${isAudio ? 'linguaflow-audio-mode' : ''}`} 
						style={isRightLayout 
							? {} 
							: { 
								height: isAudio ? 'auto' : `${playerHeight}px`, 
								minHeight: isAudio ? '140px' : '200px',
								flex: isAudio ? '0 0 auto' : undefined
							  }}
					>
						<SimplePlayer
							ref={playerRef}
							url={source.url}
							autoPlay={false}
							startTime={source.timestamp || 0}
							videoFit={videoFit}
							onReady={() => {
								console.log('[LinguaFlowApp] Player ready');
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

						{isAudio && ready && (
							<div className="linguaflow-audio-visualizer">
								<div className="linguaflow-audio-info">
									<div className="linguaflow-audio-icon">🎵</div>
									<div className="linguaflow-audio-title">{source.displayName}</div>
								</div>
								<AudioWaveform playerRef={playerRef} isPlaying={isPlaying} />
							</div>
						)}
					</div>

					{/* 固定的控制栏 - 在播放器下方 */}
					{ready && plugin && (
						<SubtitleControls
							currentCue={currentSubtitle}
							plugin={plugin}
							playerRef={playerRef}
							isPlaying={isPlaying}
							isLooping={segmentLoopEnabled}
							isRecording={recordingSession?.isRecording || false}
							isManuallyLocked={isManuallyLocked}
							playbackRate={playbackRate}
							onTogglePlay={handleTogglePlay}
							onToggleLoop={handleToggleLoop}
							onExitLoop={handleExitLoop}
							onRecord={handleRecord}
							onRateChange={handleRateChange}
							onUnlock={handleUnlock}
						/>
					)}
				</div>

				{/* 拖拽分隔条 */}
				{ready && !isAudio && (
					<div 
						className={`linguaflow-resizer ${isResizing ? 'resizing' : ''}`}
						onMouseDown={handleDragStart}
						onTouchStart={handleDragStart}
						onDoubleClick={handleDoubleClick}
						title="拖拽调整大小 | 双击重置为默认高度"
						aria-label="Resize handle"
					>
						<div className="linguaflow-resizer-line"></div>
					</div>
				)}

				{/* 字幕列表区域 - 不包含控制栏 */}
				{ready && (
					<div 
						className="linguaflow-subtitle-section"
						style={{ 
							width: isRightLayout ? `${subtitleWidth}px` : 'auto',
							minWidth: isRightLayout ? `${subtitleWidth}px` : '0',
							maxWidth: isRightLayout ? `${subtitleWidth}px` : 'none'
						}}
					>
						<SubtitleOverlay 
							playerRef={playerRef}
							showList={isRightLayout ? true : plugin.settings.showInlineSubtitles}
							showControls={false}
							plugin={plugin}
							recordingSession={recordingSession}
						/>
					</div>
				)}
			</div>
			
			{!ready && (
				<div className="linguaflow-loading">
					<div className="linguaflow-spinner"></div>
					<p>Loading media...</p>
				</div>
			)}

			{/* 评分弹窗 - 仅在显示时渲染 */}
			{showEvaluationModal && recordingSession && (
				<EvaluationModal
					evaluation={recordingSession.evaluation}
					transcription={recordingSession.transcriptionResult}
					recordingBlobUrl={recordingSession.recordingBlobUrl}
					playerRef={playerRef}
					targetSubtitle={recordingSession.targetSubtitle}
					isVisible={showEvaluationModal}
					isTranscribing={recordingSession.isTranscribing}
					onClose={() => setShowEvaluationModal(false)}
					onRetry={() => {
						// 重新开始录音
						const cue = recordingSession.targetSubtitle;
						if (cue) {
							setShowEvaluationModal(false);
							
							// 确保视频暂停
							if (playerRef.current && isPlaying) {
								playerRef.current.pauseVideo();
								setPlaying(false);
							}
							
							// 延迟一点点开始，体验更好
							setTimeout(() => {
								recordingSession.startRecording(cue);
							}, 100);
						}
					}}
				/>
			)}
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
		// 使用 logger 记录错误（而不是 console.error）
		const { logger } = require('../utils/logger');
		logger.error('ErrorBoundary', 'Component error caught:', {
			error: error.message,
			stack: error.stack,
			componentStack: errorInfo.componentStack
		});
	}

	render() {
		if (this.state.hasError) {
			return (
				<div className="linguaflow-error-boundary">
					<div className="linguaflow-error-icon">⚠️</div>
					<h2>组件加载失败</h2>
					<p>很抱歉，播放器遇到了问题。您可以尝试重新加载。</p>
					
					{this.state.error && (
						<details style={{ marginTop: '16px', cursor: 'pointer' }}>
							<summary style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
								查看错误详情
							</summary>
							<pre style={{ 
								marginTop: '8px', 
								padding: '12px', 
								background: 'var(--background-secondary)', 
								borderRadius: '4px', 
								fontSize: '11px',
								overflow: 'auto',
								maxHeight: '200px',
								color: 'var(--text-error)'
							}}>
								{this.state.error.message}
								{'\n\n'}
								{this.state.error.stack}
							</pre>
						</details>
					)}
					
					<button
						onClick={() => this.setState({ hasError: false, error: null })}
						className="linguaflow-retry-btn"
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
 * 检查键盘事件是否匹配快捷键配置
 * @param e 键盘事件
 * @param hotkeySetting 快捷键配置字符串 (例如 'Shift+ArrowLeft', 'Space', 'r')
 */
function isHotkeyMatch(e: KeyboardEvent, hotkeySetting: string): boolean {
	if (!hotkeySetting) return false;
	
	const parts = hotkeySetting.split('+');
	const key = parts[parts.length - 1]!;
	const modifiers = parts.slice(0, parts.length - 1);
	
	const hasShift = modifiers.includes('Shift');
	const hasCtrl = modifiers.includes('Ctrl') || modifiers.includes('Control');
	const hasAlt = modifiers.includes('Alt');
	const hasMeta = modifiers.includes('Meta') || modifiers.includes('Cmd') || modifiers.includes('Command');
	
	// 检查修饰键是否完全匹配
	if (e.shiftKey !== hasShift) {
		return false;
	}
	if (e.ctrlKey !== hasCtrl) {
		return false;
	}
	if (e.altKey !== hasAlt) {
		return false;
	}
	if (e.metaKey !== hasMeta) {
		return false;
	}
	
	// 检查按键
	// 对于字母，忽略大小写 (如 'r' 和 'R' 都是 'r')
	if (key.length === 1) {
		return e.key.toLowerCase() === key.toLowerCase();
	}
	
	// 对于特殊键，如 ArrowLeft, Space
	if (key === 'Space') {
		return e.key === ' ';
	}
	
	// 对于方向键，优先使用 e.code，因为输入法可能干扰 e.key
	// e.code: 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'
	if (key.startsWith('Arrow')) {
		return e.code === key;
	}
	
	return e.key === key;
}
