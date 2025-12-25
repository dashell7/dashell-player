import DiffMatchPatch from 'diff-match-patch';
import type { AzurePronunciationResult } from './AzurePronunciationService';

/**
 * 评分结果
 */
export interface EvaluationResult {
	// 文本匹配评分
	score: number;              // 匹配度得分 (0-100)
	accuracy: number;           // 准确率 (0-1)
	totalWords: number;         // 总词数
	correctWords: number;       // 正确词数
	insertedWords: number;      // 多余词数
	deletedWords: number;       // 缺失词数
	diffHtml: string;           // HTML 格式的差异视图
	
	// Azure 发音评估（可选）
	azureAssessment?: {
		pronunciationScore: number;    // 综合发音分数
		accuracyScore: number;         // 准确度分数
		fluencyScore: number;          // 流利度分数
		completenessScore: number;     // 完整度分数
		wordDetails: Array<{
			word: string;
			score: number;
			errorType: string;
		}>;
	};
	
	// 最终综合评分
	finalScore?: number;        // 综合所有评分的最终得分

	details: {
		original: string;       // 原文
		transcribed: string;    // 转录文本
		normalizedOriginal: string;   // 标准化原文
		normalizedTranscribed: string; // 标准化转录
	};
}

/**
 * 语音评分器
 * 
 * 使用 diff-match-patch 算法比较原文和转录文本，
 * 计算匹配度得分并生成可视化的差异视图
 */
export class SpeechEvaluator {
	private static dmp = new DiffMatchPatch();

	/**
	 * 评估语音转录质量
	 * 
	 * @param original - 原始文本
	 * @param transcribed - 转录文本
	 * @returns 评分结果
	 * 
	 * @example
	 * ```typescript
	 * const result = SpeechEvaluator.evaluate(
	 *   "Hello, how are you today?",
	 *   "Hello how are you"
	 * );
	 * console.log('Score:', result.score);
	 * console.log('HTML:', result.diffHtml);
	 * ```
	 */
	static evaluate(original: string, transcribed: string): EvaluationResult {
		// 验证输入
		if (!original || typeof original !== 'string') {
			throw new Error('Invalid original text');
		}
		if (!transcribed || typeof transcribed !== 'string') {
			throw new Error('Invalid transcribed text');
		}
		
		console.log('[SpeechEvaluator] Evaluating speech:', {
			originalLength: original.length,
			transcribedLength: transcribed.length,
		});

		// 标准化文本（转小写，移除标点符号）
		const normalizedOriginal = this.normalizeText(original);
		const normalizedTranscribed = this.normalizeText(transcribed);

		console.log('[SpeechEvaluator] Normalized texts:', {
			original: normalizedOriginal,
			transcribed: normalizedTranscribed,
		});

		// 计算差异
		const diffs = this.dmp.diff_main(normalizedOriginal, normalizedTranscribed);
		this.dmp.diff_cleanupSemantic(diffs);

		console.log('[SpeechEvaluator] Diffs computed:', diffs.length, 'changes');

		// 统计词数
		const stats = this.calculateStats(diffs, normalizedOriginal);

		// 计算得分
		const score = this.calculateScore(stats);

		// 生成 HTML
		const diffHtml = this.generateDiffHtml(diffs);

		const result: EvaluationResult = {
			score,
			accuracy: stats.correctWords / stats.totalWords,
			totalWords: stats.totalWords,
			correctWords: stats.correctWords,
			insertedWords: stats.insertedWords,
			deletedWords: stats.deletedWords,
			diffHtml,
			details: {
				original,
				transcribed,
				normalizedOriginal,
				normalizedTranscribed,
			},
		};

		console.log('[SpeechEvaluator] Evaluation result:', {
			score: result.score,
			accuracy: (result.accuracy * 100).toFixed(1) + '%',
			correct: result.correctWords,
			total: result.totalWords,
		});

		return result;
	}

	/**
	 * 标准化文本
	 * - 转小写
	 * - 移除标点符号
	 * - 统一空格
	 */
	private static normalizeText(text: string): string {
		return text
			.toLowerCase()
			.replace(/[.,!?;:'"]/g, '')  // 移除标点
			.replace(/\s+/g, ' ')        // 统一空格
			.trim();
	}

	/**
	 * 计算统计数据
	 */
	private static calculateStats(
		diffs: Array<[number, string]>,
		originalText: string
	) {
		const originalWords = originalText.split(/\s+/).filter(w => w.length > 0);
		const totalWords = originalWords.length;

		let correctWords = 0;
		let insertedWords = 0;
		let deletedWords = 0;

		for (const [operation, text] of diffs) {
			const words = text.split(/\s+/).filter(w => w.length > 0);
			
			if (operation === 0) {
				// 相同部分
				correctWords += words.length;
			} else if (operation === 1) {
				// 插入（多说了）
				insertedWords += words.length;
			} else if (operation === -1) {
				// 删除（少说了）
				deletedWords += words.length;
			}
		}

		return {
			totalWords,
			correctWords,
			insertedWords,
			deletedWords,
		};
	}

	/**
	 * 计算得分 (0-100)
	 * 
	 * 评分规则：
	 * - 基础分：正确词数 / 总词数 * 100
	 * - 扣分：每个多余词 -2 分
	 * - 扣分：每个缺失词 -3 分
	 */
	private static calculateScore(stats: {
		totalWords: number;
		correctWords: number;
		insertedWords: number;
		deletedWords: number;
	}): number {
		if (stats.totalWords === 0) return 0;

		// 基础分：准确率 * 100
		let score = (stats.correctWords / stats.totalWords) * 100;

		// 扣分：多余词
		score -= stats.insertedWords * 2;

		// 扣分：缺失词
		score -= stats.deletedWords * 3;

		// 限制在 0-100 范围
		return Math.max(0, Math.min(100, Math.round(score)));
	}

	/**
	 * 生成差异视图 HTML
	 * 
	 * 使用 <ins> 和 <del> 标签标记差异：
	 * - <del>：删除的部分（应该说但没说）
	 * - <ins>：插入的部分（多说的）
	 * - 普通文本：正确的部分
	 */
	private static generateDiffHtml(diffs: Array<[number, string]>): string {
		const html: string[] = [];

		for (const [operation, text] of diffs) {
			const escapedText = this.escapeHtml(text);
			
			if (operation === 0) {
				// 相同部分 - 绿色
				html.push(`<span class="diff-equal">${escapedText}</span>`);
			} else if (operation === 1) {
				// 插入部分（多说了）- 蓝色 + <ins>
				html.push(`<ins class="diff-insert">${escapedText}</ins>`);
			} else if (operation === -1) {
				// 删除部分（少说了）- 红色 + <del>
				html.push(`<del class="diff-delete">${escapedText}</del>`);
			}
		}

		return html.join('');
	}

	/**
	 * 转义 HTML 特殊字符
	 */
	private static escapeHtml(text: string): string {
		const map: Record<string, string> = {
			'&': '&amp;',
			'<': '&lt;',
			'>': '&gt;',
			'"': '&quot;',
			"'": '&#039;',
		};
		
		return text.replace(/[&<>"']/g, char => map[char] || char);
	}

	/**
	 * 获取评分等级
	 */
	static getGrade(score: number): {
		grade: string;
		color: string;
		message: string;
	} {
		if (score >= 90) {
			return {
				grade: 'A',
				color: '#28a745',
				message: '太棒了！发音接近完美。',
			};
		} else if (score >= 80) {
			return {
				grade: 'B',
				color: '#17a2b8',
				message: '非常好！发音清晰易懂。',
			};
		} else if (score >= 70) {
			return {
				grade: 'C',
				color: '#ffc107',
				message: '不错！部分发音仍需改进。',
			};
		} else if (score >= 60) {
			return {
				grade: 'D',
				color: '#fd7e14',
				message: '一般。请针对问题单词多加练习。',
			};
		} else {
			return {
				grade: 'F',
				color: '#dc3545',
				message: '继续加油！尝试放慢语速，咬字更清晰些。',
			};
		}
	}

	/**
	 * 合并 Azure 发音评估结果
	 * 
	 * @param textResult - 文本匹配评分结果
	 * @param azureResult - Azure 发音评估结果
	 * @returns 合并后的评分结果
	 */
	static mergeWithAzureAssessment(
		textResult: EvaluationResult,
		azureResult: AzurePronunciationResult
	): EvaluationResult {
		console.log('[SpeechEvaluator] Merging Azure assessment...');
		
		// 准备 Azure 评估数据
		const azureAssessment = {
			pronunciationScore: azureResult.pronunciationScore,
			accuracyScore: azureResult.accuracyScore,
			fluencyScore: azureResult.fluencyScore,
			completenessScore: azureResult.completenessScore,
			wordDetails: azureResult.words.map(w => ({
				word: w.word,
				score: w.accuracyScore,
				errorType: w.errorType,
			})),
		};

		// 计算综合评分（加权平均）
		// 文本准确性 40% + Azure 发音 60%
		const finalScore = Math.round(
			textResult.score * 0.4 +
			azureResult.pronunciationScore * 0.6
		);

		console.log('[SpeechEvaluator] Final score:', {
			textScore: textResult.score,
			azureScore: azureResult.pronunciationScore,
			finalScore,
		});

		return {
			...textResult,
			azureAssessment,
			finalScore,
		};
	}
}
