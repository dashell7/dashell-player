import * as React from 'react';
import { createPortal } from 'react-dom';
import DiffMatchPatch from 'diff-match-patch';
import { SpeechEvaluator, type EvaluationResult } from '../services/SpeechEvaluator';
import type { SubtitleCue, PlayerRef } from '../types';
import { useMediaStore } from '../store/mediaStore';

// 精致的 SVG 图标
const Icons = {
	BarChart: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" x2="12" y1="20" y2="10"/><line x1="18" x2="18" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="16"/></svg>,
	Music: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>,
	FileText: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/></svg>,
	TrendingUp: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
	AlertTriangle: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>,
	Search: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>,
	Radio: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="2"/><path d="M4.93 19.07a10 10 0 0 1 0-14.14"/><path d="M7.76 16.24a6 6 0 0 1 0-8.49"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>,
	Mic: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>,
	Play: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>,
	Pause: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>,
	X: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg>,
};

const ErrorTypeMap: Record<string, string> = {
	'None': '正确',
	'Omission': '漏读',
	'Insertion': '多读',
	'Mispronunciation': '发音错误',
	'UnexpectedBreak': '停顿异常',
	'MissingBreak': '缺少停顿',
	'Monotone': '语调平淡',
};

interface EvaluationModalProps {
	evaluation: EvaluationResult | null;
	transcription: string | null;
	recordingBlobUrl: string | null;
	playerRef: React.RefObject<PlayerRef>;
	targetSubtitle: SubtitleCue | null;
	onClose: () => void;
	onRetry?: () => void; // 新增重试回调
	isVisible: boolean;
	isTranscribing?: boolean;
}

/**
 * 单词对比组件 - 使用 diff-match-patch 算法提供精准差异
 * 使用 React.memo 优化性能
 */
const SimpleDiffView = React.memo(({ original, transcribed }: { original: string, transcribed: string }) => {
	// 预处理原文：过滤中文行
	const cleanOriginal = original
		.split(/\n/)
		.filter(line => !/[\u4e00-\u9fa5]/.test(line))
		.join(' ');

	// 标准化处理函数
	const normalize = (t: string) => t.toLowerCase().replace(/[.,!?;:'"]/g, '').replace(/\s+/g, ' ').trim();
	
	const text1 = normalize(cleanOriginal);
	const text2 = normalize(transcribed);
	
	// 使用 diff-match-patch 计算差异
	const dmp = new DiffMatchPatch();
	const diffs = dmp.diff_main(text1, text2);
	dmp.diff_cleanupSemantic(diffs);
	
	return (
		<div className="linguaflow-diff-text-container">
			{diffs.map((diff, i) => {
				const [op, text] = diff;
				let className = 'linguaflow-diff-word';
				
				if (op === 0) { // Equal
					className += ' correct';
				} else if (op === 1) { // Insert (多读)
					className += ' extra';
				} else if (op === -1) { // Delete (漏读)
					className += ' missing';
				}
				
				return <span key={i} className={className}>{text}</span>;
			})}
		</div>
	);
}, (prevProps, nextProps) => prevProps.original === nextProps.original && prevProps.transcribed === nextProps.transcribed);

/**
 * Azure 词级评估视图 - 精准显示发音错误
 * 使用 React.memo 优化性能
 */
const AzureWordView = React.memo(({ words }: { words: { word: string, score: number, errorType: string }[] }) => {
	return (
		<div className="linguaflow-diff-text-container">
			{words.map((w, i) => {
				let className = 'linguaflow-diff-word';
				
				// 根据 Azure 错误类型应用样式
				if (w.errorType === 'None') {
					className += ' correct';
				} else if (w.errorType === 'Mispronunciation') {
					className += ' warning';
				} else if (w.errorType === 'Omission') {
					className += ' missing';
				} else if (w.errorType === 'Insertion') {
					className += ' extra';
				}
				
				return (
					<span 
						key={i} 
						className={className} 
						title={`${ErrorTypeMap[w.errorType] || w.errorType} (${w.score}分)`}
					>
						{w.word}{' '}
					</span>
				);
			})}
		</div>
	);
}, (prevProps, nextProps) => JSON.stringify(prevProps.words) === JSON.stringify(nextProps.words));

/**
 * 评分结果浮动弹窗
 */
export function EvaluationModal({ evaluation, transcription, recordingBlobUrl, playerRef, targetSubtitle, onClose, onRetry, isVisible, isTranscribing = false }: EvaluationModalProps) {
	const [recordingAudio, setRecordingAudio] = React.useState<HTMLAudioElement | null>(null);
	const [isRecordingPlaying, setIsRecordingPlaying] = React.useState(false);
	const [recordingCurrentTime, setRecordingCurrentTime] = React.useState(0);
	const [recordingDuration, setRecordingDuration] = React.useState(0);

	// 播放原音频片段（单句播放，播放完自动停止）
	const handlePlayOriginal = () => {
		if (playerRef.current && targetSubtitle) {
			// 使用 playSegment 实现单句播放
			playerRef.current.seekTo(targetSubtitle.start);
			playerRef.current.playVideo?.();
			useMediaStore.getState().playSegment(targetSubtitle.start, targetSubtitle.end);
		}
	};

	// 初始化录音音频
	React.useEffect(() => {
		if (!recordingBlobUrl) return;
		
		const audio = new Audio(recordingBlobUrl);
		
		// 定义事件处理函数
		const handleLoadedMetadata = () => {
			setRecordingDuration(audio.duration);
		};
		const handleTimeUpdate = () => {
			setRecordingCurrentTime(audio.currentTime);
		};
		const handleEnded = () => {
			setIsRecordingPlaying(false);
		};
		const handlePlay = () => {
			setIsRecordingPlaying(true);
		};
		const handlePause = () => {
			setIsRecordingPlaying(false);
		};
		
		// 添加事件监听器
		audio.addEventListener('loadedmetadata', handleLoadedMetadata);
		audio.addEventListener('timeupdate', handleTimeUpdate);
		audio.addEventListener('ended', handleEnded);
		audio.addEventListener('play', handlePlay);
		audio.addEventListener('pause', handlePause);
		
		setRecordingAudio(audio);
		
		// 清理函数：移除所有事件监听器并停止播放
		return () => {
			audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
			audio.removeEventListener('timeupdate', handleTimeUpdate);
			audio.removeEventListener('ended', handleEnded);
			audio.removeEventListener('play', handlePlay);
			audio.removeEventListener('pause', handlePause);
			audio.pause();
			audio.src = '';
		};
	}, [recordingBlobUrl]);

	// 播放/暂停录音
	const handleToggleRecording = () => {
		if (!recordingAudio) return;
		
		if (isRecordingPlaying) {
			recordingAudio.pause();
		} else {
			recordingAudio.play();
		}
	};

	// 如果不可见，不渲染
	if (!isVisible) {
		return null;
	}

	// 如果没有评分且不在转录中，不渲染
	if (!evaluation && !isTranscribing) {
		return null;
	}

	// 计算等级（如果有评分）
	const grade = evaluation ? SpeechEvaluator.getGrade(evaluation.finalScore || evaluation.score) : {
		grade: '...',
		color: '#888',
		message: '正在分析中...'
	};

	return createPortal(
		<div className="linguaflow-modal-overlay" onClick={onClose}>
			<div className="linguaflow-modal-content" onClick={(e) => e.stopPropagation()}>
				<div className="linguaflow-modal-header">
					<div className="linguaflow-modal-title">
						<span className="linguaflow-modal-icon">{Icons.BarChart}</span>
						<h3>录音评分</h3>
					</div>
					<button className="linguaflow-modal-close" onClick={onClose}>
						{Icons.X}
					</button>
				</div>

				<div className="linguaflow-modal-body">
					{/* 得分和详细数据横向布局 */}
					<div className="linguaflow-score-stats-container">
						{/* 得分圆环 */}
						<div className="linguaflow-score-circle-large" style={{ borderColor: grade.color }}>
							<div className="linguaflow-score-value-large" style={{ color: grade.color }}>
								{evaluation ? (evaluation.finalScore || evaluation.score) : '...'}
							</div>
							<div className="linguaflow-score-grade-large" style={{ color: grade.color }}>
								{grade.grade}
							</div>
						</div>

						{/* 详细数据 */}
						<div className="linguaflow-stats-grid">
							{isTranscribing ? (
								<>
									<div className="linguaflow-stat-item">
										<span className="linguaflow-stat-label">正在分析...</span>
										<span className="linguaflow-stat-value">⏳</span>
									</div>
									<div className="linguaflow-stat-item">
										<span className="linguaflow-stat-label">正在评分...</span>
										<span className="linguaflow-stat-value">⏳</span>
									</div>
									<div className="linguaflow-stat-item">
										<span className="linguaflow-stat-label">请稍候...</span>
										<span className="linguaflow-stat-value">⏳</span>
									</div>
								</>
							) : evaluation ? (
								<>
									<div className="linguaflow-stat-item">
										<span className="linguaflow-stat-label">文本准确度</span>
										<span className="linguaflow-stat-value">{evaluation.score}分</span>
									</div>
									<div className="linguaflow-stat-item">
										<span className="linguaflow-stat-label">正确词数</span>
										<span className="linguaflow-stat-value">{evaluation.correctWords}/{evaluation.totalWords}</span>
									</div>
									{evaluation.azureAssessment && (
										<>
											<div className="linguaflow-stat-item">
												<span className="linguaflow-stat-label">发音质量</span>
												<span className="linguaflow-stat-value">{evaluation.azureAssessment.pronunciationScore.toFixed(1)}分</span>
											</div>
											<div className="linguaflow-stat-item">
												<span className="linguaflow-stat-label">流利度</span>
												<span className="linguaflow-stat-value">{evaluation.azureAssessment.fluencyScore.toFixed(1)}分</span>
											</div>
											<div className="linguaflow-stat-item">
												<span className="linguaflow-stat-label">完整度</span>
												<span className="linguaflow-stat-value">{evaluation.azureAssessment.completenessScore.toFixed(1)}分</span>
											</div>
										</>
									)}
								</>
							) : null}
						</div>
					</div>

					{/* 评分反馈 */}
					<div className="linguaflow-score-feedback" style={{ borderLeftColor: grade.color }}>
						{grade.message}
					</div>

					{/* 音频对比区域 */}
					<div className="linguaflow-modal-section">
						<h4>
							<span className="linguaflow-section-icon">{Icons.Music}</span>
							音频对比
						</h4>
						<div className="linguaflow-audio-comparison">
							{/* 原音频 */}
							{targetSubtitle && (
								<div className="linguaflow-audio-item">
									<div className="linguaflow-audio-label">
										<span className="linguaflow-audio-icon">{Icons.Radio}</span>
										原音频
									</div>
									<div className="linguaflow-audio-player-simple">
										<button 
											className="linguaflow-audio-play-btn"
											onClick={handlePlayOriginal}
											title="播放原音频片段"
										>
											{Icons.Play}
										</button>
										<div className="linguaflow-audio-time">
											{formatTime(targetSubtitle.start)} / {formatTime(targetSubtitle.end)}
										</div>
									</div>
								</div>
							)}

							{/* 录音播放器 */}
							{recordingBlobUrl && (
								<div className="linguaflow-audio-item">
									<div className="linguaflow-audio-label">
										<span className="linguaflow-audio-icon">{Icons.Mic}</span>
										你的录音
									</div>
									<div className="linguaflow-audio-player-simple">
										<button 
											className="linguaflow-audio-play-btn"
											onClick={handleToggleRecording}
											title={isRecordingPlaying ? "暂停" : "播放"}
										>
											{isRecordingPlaying ? Icons.Pause : Icons.Play}
										</button>
										<div className="linguaflow-audio-time">
											{formatTime(recordingCurrentTime)} / {formatTime(recordingDuration)}
										</div>
									</div>
								</div>
							)}
						</div>
					</div>

					{/* 发音检视区域 */}
					<div className="linguaflow-modal-section">
						<h4>
							<span className="linguaflow-section-icon">{Icons.FileText}</span>
							发音检视
						</h4>
						
						{targetSubtitle && (
							<div className="linguaflow-original-text">
								{targetSubtitle.text}
							</div>
						)}
						
						<div className="linguaflow-diff-view">
							<div className="linguaflow-diff-label">识别结果:</div>
							{evaluation?.azureAssessment ? (
								<AzureWordView words={evaluation.azureAssessment.wordDetails} />
							) : evaluation?.diffHtml ? (
								<div dangerouslySetInnerHTML={{ __html: evaluation.diffHtml }} />
							) : transcription ? (
								<SimpleDiffView 
									original={targetSubtitle?.text || ''} 
									transcribed={transcription} 
								/>
							) : (
								<div className="linguaflow-diff-placeholder">暂无识别结果</div>
							)}
						</div>
					</div>

					{/* 错误详情列表 */}
					{evaluation?.azureAssessment && evaluation.azureAssessment.wordDetails.filter(w => w.errorType !== 'None').length > 0 && (
						<div className="linguaflow-modal-section">
							<h4>
								<span className="linguaflow-section-icon">{Icons.AlertTriangle}</span>
								发音问题
							</h4>
							<ul className="linguaflow-error-list">
								{evaluation.azureAssessment.wordDetails
									.filter(w => w.errorType !== 'None')
									.map((word, idx) => (
										<li key={idx} className="linguaflow-error-item">
											<span className={`linguaflow-error-tag ${word.errorType.toLowerCase()}`}>
												{ErrorTypeMap[word.errorType] || word.errorType}
											</span>
											<span className="linguaflow-error-word">{word.word}</span>: 
											<span className="linguaflow-error-score">发音错误({word.score.toFixed(1)}分)</span>
										</li>
									))}
							</ul>
						</div>
					)}
				</div>

				<div className="linguaflow-modal-footer">
					<div className="linguaflow-modal-buttons">
						{onRetry && (
							<button className="linguaflow-modal-btn-secondary" onClick={onRetry}>
								重试
							</button>
						)}
						<button className="linguaflow-modal-btn-primary" onClick={onClose}>
							知道了
						</button>
					</div>
				</div>
			</div>
		</div>,
		document.body
	);
}

function formatTime(seconds: number): string {
	// 处理无效值（Infinity, NaN, 负数等）
	if (!Number.isFinite(seconds) || seconds < 0) {
		return '0:00';
	}
	
	const mins = Math.floor(seconds / 60);
	const secs = Math.floor(seconds % 60);
	return `${mins}:${secs.toString().padStart(2, '0')}`;
}
