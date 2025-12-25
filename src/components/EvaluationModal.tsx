import * as React from 'react';
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

interface EvaluationModalProps {
	evaluation: EvaluationResult | null;
	transcription: string | null;
	recordingBlobUrl: string | null;
	playerRef: React.RefObject<PlayerRef>;
	targetSubtitle: SubtitleCue | null;
	onClose: () => void;
	isVisible: boolean;
}

/**
 * 评分结果浮动弹窗
 * 
 * 在录音结束后显示评分结果和建议
 */
export function EvaluationModal({ evaluation, transcription, recordingBlobUrl, playerRef, targetSubtitle, onClose, isVisible }: EvaluationModalProps) {
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

	// 如果不可见或没有评分，不渲染
	if (!isVisible || !evaluation) {
		return null;
	}

	// 计算等级（必须在条件检查之后）
	const grade = SpeechEvaluator.getGrade(evaluation.finalScore || evaluation.score);

	return (
		<div className="linguaflow-modal-overlay" onClick={onClose}>
			<div className="linguaflow-modal-content" onClick={(e) => e.stopPropagation()}>
				<div className="linguaflow-modal-header">
					<div className="linguaflow-modal-title">
						<span className="linguaflow-modal-icon">{Icons.BarChart}</span>
						<h3>录音评分</h3>
					</div>
				</div>

				<div className="linguaflow-modal-body">
					{/* 得分圆环 */}
					<div className="linguaflow-score-circle-large" style={{ borderColor: grade.color }}>
						<div className="linguaflow-score-value-large" style={{ color: grade.color }}>
							{evaluation.finalScore || evaluation.score}
						</div>
						<div className="linguaflow-score-grade-large" style={{ color: grade.color }}>
							{grade.grade}
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
									<div className="linguaflow-audio-player-custom">
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
										<div className="linguaflow-audio-controls">
											<button className="linguaflow-audio-volume-btn" title="音量">
												<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
											</button>
											<button className="linguaflow-audio-more-btn" title="更多">
												<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
											</button>
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
									<div className="linguaflow-audio-player-custom">
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
										<div className="linguaflow-audio-controls">
											<button className="linguaflow-audio-volume-btn" title="音量">
												<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
											</button>
											<button className="linguaflow-audio-more-btn" title="更多">
												<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
											</button>
										</div>
									</div>
								</div>
							)}
						</div>
					</div>

					{/* 转录文本 */}
					{transcription && (
						<div className="linguaflow-modal-section">
							<h4>
								<span className="linguaflow-section-icon">{Icons.FileText}</span>
								识别内容
							</h4>
							<div className="linguaflow-transcription-box">
								{transcription}
							</div>
						</div>
					)}

					{/* 统计信息 */}
					<div className="linguaflow-modal-section">
						<h4>
							<span className="linguaflow-section-icon">{Icons.TrendingUp}</span>
							详细数据
						</h4>
						<div className="linguaflow-stats-grid">
							<div className="linguaflow-stat-item">
								<span className="linguaflow-stat-label">文本准确度</span>
								<span className="linguaflow-stat-value">{evaluation.score}分</span>
							</div>
							<div className="linguaflow-stat-item">
								<span className="linguaflow-stat-label">正确词数</span>
								<span className="linguaflow-stat-value">{evaluation.correctWords} / {evaluation.totalWords}</span>
							</div>
							
							{/* Azure 评分 */}
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
						</div>
					</div>

					{/* Azure 词级错误（如果有） */}
					{evaluation.azureAssessment && evaluation.azureAssessment.wordDetails.filter(w => w.errorType !== 'None').length > 0 && (
						<div className="linguaflow-modal-section">
							<h4>
								<span className="linguaflow-section-icon linguaflow-icon-warning">{Icons.AlertTriangle}</span>
								发音问题
							</h4>
							<ul className="linguaflow-error-list">
								{evaluation.azureAssessment.wordDetails
									.filter(w => w.errorType !== 'None')
									.map((word, idx) => (
										<li key={idx}>
											<strong>{word.word}</strong>: {word.errorType} 
											<span className="linguaflow-word-score-badge">({word.score.toFixed(1)}分)</span>
										</li>
									))
								}
							</ul>
						</div>
					)}

					{/* OpenAI Diff 视图 */}
					{evaluation.diffHtml && (
						<div className="linguaflow-modal-section">
							<h4>
								<span className="linguaflow-section-icon">{Icons.Search}</span>
								对比详情
							</h4>
							<div className="linguaflow-diff-legend">
								<div className="linguaflow-diff-legend-item">
									<div className="linguaflow-diff-legend-dot correct"></div>
									<span>正确</span>
								</div>
								<div className="linguaflow-diff-legend-item">
									<div className="linguaflow-diff-legend-dot missing"></div>
									<span>缺失</span>
								</div>
								<div className="linguaflow-diff-legend-item">
									<div className="linguaflow-diff-legend-dot extra"></div>
									<span>多余</span>
								</div>
							</div>
							<div 
								className="linguaflow-diff-view"
								dangerouslySetInnerHTML={{ __html: evaluation.diffHtml }}
							/>
						</div>
					)}
				</div>

				<div className="linguaflow-modal-footer">
					<button className="linguaflow-modal-btn-primary" onClick={onClose}>
						知道了
					</button>
				</div>
			</div>
		</div>
	);
}

/**
 * 格式化时间（分:秒）
 */
function formatTime(seconds: number): string {
	// 处理无效值（Infinity, NaN, 负数等）
	if (!isFinite(seconds) || seconds < 0) {
		return '0:00';
	}
	
	const mins = Math.floor(seconds / 60);
	const secs = Math.floor(seconds % 60);
	return `${mins}:${secs.toString().padStart(2, '0')}`;
}
