import * as React from 'react';
import { useMemo, useCallback } from 'react';
import { SpeechEvaluator } from '../services/SpeechEvaluator';
import { useMediaStore } from '../store/mediaStore';
import type { EvaluationResult } from '../services/SpeechEvaluator';
import type LinguaFlowPlugin from '../main';
import type { UseRecordingSessionReturn } from '../hooks/useRecordingSession';

interface RecordingPanelProps {
	plugin: LinguaFlowPlugin;  // 插件实例
	session: UseRecordingSessionReturn; // 录音会话
}

/**
 * 录音控制面板
 * 
 * 功能：
 * 1. 录音控制（开始、停止、暂停）
 * 2. 语音转文本（Whisper API）
 * 3. 发音评分
 * 4. 结果显示
 */
export function RecordingPanel({ plugin, session }: RecordingPanelProps) {
	const { 
		startRecording, 
		stopRecording, 
		pauseRecording: pause, 
		resumeRecording: resume, 
		isRecording, 
		isPaused, 
		duration, 
		recorderError,
		isTranscribing,
		transcriptionResult,
		evaluation,
		sessionError,
		recordingBlobUrl,
		targetSubtitle
	} = session;
	
	// 从插件设置获取 API Key（优先使用新字段）- 缓存
	const apiKey = useMemo(() => 
		plugin.settings.sttApiKey || plugin.settings.openaiApiKey,
		[plugin.settings.sttApiKey, plugin.settings.openaiApiKey]
	);
	
	// 获取当前字幕 (用于显示跟读文本)
	const subtitles = useMediaStore(state => state.subtitles);
	const activeIndex = useMediaStore(state => state.activeIndex);
	
	// 优先显示 targetSubtitle，否则显示 activeIndex - 缓存
	const currentSubtitle = useMemo(() => 
		targetSubtitle || (activeIndex >= 0 ? subtitles[activeIndex] : null),
		[targetSubtitle, activeIndex, subtitles]
	);

	/**
	 * 开始录音
	 */
	const handleStartRecording = async () => {
		await startRecording();
	};

	/**
	 * 停止录音并转录
	 */
	const handleStopRecording = async () => {
		await stopRecording();
	};

	/**
	 * 格式化时间 - 使用 useCallback 避免重复创建
	 */
	const formatDuration = useCallback((seconds: number): string => {
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	}, []);
	
	const error = sessionError || (recorderError?.message);

	return (
		<div className="linguaflow-recording-panel">
			{/* 服务未配置提示 */}
			{plugin.settings.speechProvider === 'openai' && !apiKey && (
				<div className="linguaflow-api-key-section">
					<h4>⚠️ 需要配置 OpenAI API Key</h4>
					<p className="linguaflow-hint-text">
						请在插件设置中配置 OpenAI API Key 以使用语音转文本功能
					</p>
					<p className="linguaflow-hint-text">
						设置 → LinguaFlow → 语音服务提供商 → OpenAI
					</p>
				</div>
			)}
			
			{plugin.settings.speechProvider === 'azure' && (
			!(plugin.settings.sttApiKey || plugin.settings.azureSubscriptionKey) || 
			!(plugin.settings.sttBaseUrl || plugin.settings.azureRegion)
		) && (
			<div className="linguaflow-api-key-section">
				<h4>⚠️ 需要配置 Azure Speech Services</h4>
				<p className="linguaflow-hint-text">
					请在插件设置中配置 Azure Subscription Key 和 Region
				</p>
				<p className="linguaflow-hint-text">
					设置 → LinguaFlow → 语音服务提供商 → Azure
				</p>
			</div>
		)}

			{/* 录音控制 */}
			<div className="linguaflow-recorder-controls">
				{!isRecording && !isPaused && (
					<button 
						onClick={handleStartRecording}
						className="linguaflow-record-btn"
						disabled={!currentSubtitle}
					>
						🎤 开始录音
					</button>
				)}

				{isRecording && (
					<>
						<button 
							onClick={handleStopRecording}
							className="linguaflow-record-btn recording"
						>
							⏹️ 停止录音
						</button>
						
						<button 
							onClick={pause}
							className="linguaflow-record-btn pause"
						>
							⏸️ 暂停
						</button>
					</>
				)}

				{isPaused && (
					<>
						<button 
							onClick={handleStopRecording}
							className="linguaflow-record-btn"
						>
							⏹️ 停止
						</button>
						
						<button 
							onClick={resume}
							className="linguaflow-record-btn"
						>
							▶️ 继续
						</button>
					</>
				)}

				{/* 时长显示 */}
				{(isRecording || isPaused) && (
					<div className="linguaflow-record-time">
						{formatDuration(duration)}
					</div>
				)}

				{/* 状态显示 */}
				{isRecording && (
					<div className="linguaflow-record-status recording">
						🔴 录音中...
					</div>
				)}
				{isPaused && (
					<div className="linguaflow-record-status paused">
						⏸️ 已暂停
					</div>
				)}
			</div>

			{/* 当前字幕提示 */}
			{currentSubtitle && !isRecording && !isPaused && (
				<div className="linguaflow-current-subtitle-hint">
					<h4>📝 跟读这句：</h4>
					<div className="linguaflow-subtitle-text-large">
						{currentSubtitle.text}
					</div>
				</div>
			)}

			{/* 录音播放 */}
			{recordingBlobUrl && !isRecording && (
				<div className="linguaflow-recording-playback">
					<h4>🎧 你的录音：</h4>
					<audio 
						src={recordingBlobUrl} 
						controls 
						className="linguaflow-audio-player"
					/>
				</div>
			)}

			{/* 转录中 */}
			{isTranscribing && (
				<div className="linguaflow-transcribing">
					<div className="linguaflow-spinner"></div>
					<p>正在转录和评分...</p>
				</div>
			)}

			{/* 转录结果 */}
			{transcriptionResult && !isTranscribing && (
				<div className="linguaflow-transcription-result">
					<h4>📄 识别结果：</h4>
					<div className="linguaflow-transcription-text">
						{transcriptionResult}
					</div>
				</div>
			)}

			{/* 评分结果 */}
			{evaluation && !isTranscribing && (
				<div className="linguaflow-evaluation-result">
					<h4>📊 评分结果：</h4>
					
					{/* 得分显示 */}
					<div className="linguaflow-score-display">
						<div 
							className="linguaflow-score-circle"
							style={{ 
								borderColor: SpeechEvaluator.getGrade(evaluation.finalScore || evaluation.score).color,
								color: SpeechEvaluator.getGrade(evaluation.finalScore || evaluation.score).color,
							}}
						>
							<div className="linguaflow-score-value">
								{evaluation.finalScore || evaluation.score}
							</div>
							<div className="linguaflow-score-grade">
								{SpeechEvaluator.getGrade(evaluation.finalScore || evaluation.score).grade}
							</div>
							{evaluation.finalScore && (
								<div className="linguaflow-score-type">综合评分</div>
							)}
						</div>

						{/* 统计信息 */}
						<div className="linguaflow-score-stats">
							{/* 文本评分 */}
							<div className="linguaflow-score-stat">
								<span className="linguaflow-score-stat-label">文本准确</span>
								<span className="linguaflow-score-stat-value">
									{evaluation.score}分
								</span>
							</div>
							<div className="linguaflow-score-stat">
								<span className="linguaflow-score-stat-label">正确词数</span>
								<span className="linguaflow-score-stat-value">
									{evaluation.correctWords} / {evaluation.totalWords}
								</span>
							</div>
							
							{/* Azure 评分（如果有） */}
							{evaluation.azureAssessment && (
								<>
									<div className="linguaflow-score-stat">
										<span className="linguaflow-score-stat-label">发音质量</span>
										<span className="linguaflow-score-stat-value">
											{evaluation.azureAssessment.pronunciationScore.toFixed(1)}分
										</span>
									</div>
									<div className="linguaflow-score-stat">
										<span className="linguaflow-score-stat-label">流利度</span>
										<span className="linguaflow-score-stat-value">
											{evaluation.azureAssessment.fluencyScore.toFixed(1)}分
										</span>
									</div>
								</>
							)}
						</div>
					</div>

					{/* Azure 详细评分（如果有） */}
					{evaluation.azureAssessment && (
						<div className="linguaflow-azure-details">
							<h5>🎤 Azure 发音评估详情：</h5>
							<div className="linguaflow-azure-scores">
								<div className="linguaflow-azure-score-item">
									<span>准确度</span>
									<div className="linguaflow-score-bar">
										<div 
											className="linguaflow-score-bar-fill"
											style={{ width: `${evaluation.azureAssessment.accuracyScore}%` }}
										/>
									</div>
									<span>{evaluation.azureAssessment.accuracyScore.toFixed(1)}</span>
								</div>
								<div className="linguaflow-azure-score-item">
									<span>流利度</span>
									<div className="linguaflow-score-bar">
										<div 
											className="linguaflow-score-bar-fill"
											style={{ width: `${evaluation.azureAssessment.fluencyScore}%` }}
										/>
									</div>
									<span>{evaluation.azureAssessment.fluencyScore.toFixed(1)}</span>
								</div>
								<div className="linguaflow-azure-score-item">
									<span>完整度</span>
									<div className="linguaflow-score-bar">
										<div 
											className="linguaflow-score-bar-fill"
											style={{ width: `${evaluation.azureAssessment.completenessScore}%` }}
										/>
									</div>
									<span>{evaluation.azureAssessment.completenessScore.toFixed(1)}</span>
								</div>
							</div>
							
							{/* 词级别错误 */}
							{evaluation.azureAssessment.wordDetails.filter(w => w.errorType !== 'None').length > 0 && (
								<div className="linguaflow-word-errors">
									<h6>⚠️ 发音问题：</h6>
									<ul>
										{evaluation.azureAssessment.wordDetails
											.filter(w => w.errorType !== 'None')
											.map((word, idx) => (
												<li key={idx}>
													<strong>{word.word}</strong>: {word.errorType} 
													<span className="linguaflow-word-score">({word.score.toFixed(1)}分)</span>
												</li>
											))
										}
									</ul>
								</div>
							)}
						</div>
					)}

					{/* 反馈消息 */}
					<div 
						className="linguaflow-score-message"
						style={{ 
							borderLeftColor: SpeechEvaluator.getGrade(evaluation.finalScore || evaluation.score).color 
						}}
					>
						{SpeechEvaluator.getGrade(evaluation.finalScore || evaluation.score).message}
					</div>

					{/* 差异视图（仅 OpenAI 模式） */}
					{evaluation.diffHtml && (
						<div className="linguaflow-diff-section">
							<h4>🔍 详细对比：</h4>
							
							{/* 图例 */}
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

							{/* 差异视图 */}
							<div 
								className="linguaflow-diff-view"
								dangerouslySetInnerHTML={{ __html: evaluation.diffHtml }}
							/>
						</div>
					)}
				</div>
			)}

			{/* 错误显示 */}
			{(error || recorderError) && (
				<div className="linguaflow-error-message">
					⚠️ {error || recorderError?.message}
				</div>
			)}

			{/* 使用提示 */}
			{!isRecording && !isPaused && !evaluation && (
				<div className="linguaflow-usage-hint">
					<h4>💡 使用说明：</h4>
					<ol>
						<li>双击字幕选择要练习的句子</li>
						<li>点击"开始录音"按钮</li>
						<li>大声跟读字幕内容</li>
						<li>点击"停止录音"</li>
						<li>自动转录并评分</li>
					</ol>
				</div>
			)}
		</div>
	);
}
