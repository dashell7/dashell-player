/**
 * 多语言支持工具
 * 支持语言识别、分离和管理
 */

/**
 * 支持的语言类型
 */
export type SupportedLanguage = 
	| 'en'    // English 英语
	| 'zh'    // Chinese 中文
	| 'ja'    // Japanese 日语
	| 'ko'    // Korean 韩语
	| 'es'    // Spanish 西班牙语
	| 'fr'    // French 法语
	| 'de'    // German 德语
	| 'pt'    // Portuguese 葡萄牙语
	| 'ru'    // Russian 俄语
	| 'ar'    // Arabic 阿拉伯语
	| 'it'    // Italian 意大利语
	| 'nl'    // Dutch 荷兰语
	| 'pl'    // Polish 波兰语
	| 'tr'    // Turkish 土耳其语
	| 'vi'    // Vietnamese 越南语
	| 'th'    // Thai 泰语
	| 'id'    // Indonesian 印尼语
	| 'hi'    // Hindi 印地语
	| 'unknown'; // 未知语言

/**
 * 语言信息
 */
export interface LanguageInfo {
	code: SupportedLanguage;
	name: string;
	nativeName: string;
	unicodeRange?: [number, number]; // Unicode范围
	rtl?: boolean; // 是否从右到左书写
}

/**
 * 语言配置映射
 */
export const LANGUAGE_CONFIG: Record<SupportedLanguage, LanguageInfo> = {
	en: {
		code: 'en',
		name: 'English',
		nativeName: 'English',
		unicodeRange: [0x0000, 0x007F]
	},
	zh: {
		code: 'zh',
		name: 'Chinese',
		nativeName: '中文',
		unicodeRange: [0x4E00, 0x9FFF]
	},
	ja: {
		code: 'ja',
		name: 'Japanese',
		nativeName: '日本語',
		unicodeRange: [0x3040, 0x30FF] // Hiragana + Katakana
	},
	ko: {
		code: 'ko',
		name: 'Korean',
		nativeName: '한국어',
		unicodeRange: [0xAC00, 0xD7AF] // Hangul
	},
	es: {
		code: 'es',
		name: 'Spanish',
		nativeName: 'Español',
		unicodeRange: [0x0000, 0x007F]
	},
	fr: {
		code: 'fr',
		name: 'French',
		nativeName: 'Français',
		unicodeRange: [0x0000, 0x007F]
	},
	de: {
		code: 'de',
		name: 'German',
		nativeName: 'Deutsch',
		unicodeRange: [0x0000, 0x007F]
	},
	pt: {
		code: 'pt',
		name: 'Portuguese',
		nativeName: 'Português',
		unicodeRange: [0x0000, 0x007F]
	},
	ru: {
		code: 'ru',
		name: 'Russian',
		nativeName: 'Русский',
		unicodeRange: [0x0400, 0x04FF] // Cyrillic
	},
	ar: {
		code: 'ar',
		name: 'Arabic',
		nativeName: 'العربية',
		unicodeRange: [0x0600, 0x06FF],
		rtl: true
	},
	it: {
		code: 'it',
		name: 'Italian',
		nativeName: 'Italiano',
		unicodeRange: [0x0000, 0x007F]
	},
	nl: {
		code: 'nl',
		name: 'Dutch',
		nativeName: 'Nederlands',
		unicodeRange: [0x0000, 0x007F]
	},
	pl: {
		code: 'pl',
		name: 'Polish',
		nativeName: 'Polski',
		unicodeRange: [0x0000, 0x007F]
	},
	tr: {
		code: 'tr',
		name: 'Turkish',
		nativeName: 'Türkçe',
		unicodeRange: [0x0000, 0x007F]
	},
	vi: {
		code: 'vi',
		name: 'Vietnamese',
		nativeName: 'Tiếng Việt',
		unicodeRange: [0x0000, 0x007F]
	},
	th: {
		code: 'th',
		name: 'Thai',
		nativeName: 'ไทย',
		unicodeRange: [0x0E00, 0x0E7F]
	},
	id: {
		code: 'id',
		name: 'Indonesian',
		nativeName: 'Bahasa Indonesia',
		unicodeRange: [0x0000, 0x007F]
	},
	hi: {
		code: 'hi',
		name: 'Hindi',
		nativeName: 'हिन्दी',
		unicodeRange: [0x0900, 0x097F] // Devanagari
	},
	unknown: {
		code: 'unknown',
		name: 'Unknown',
		nativeName: 'Unknown'
	}
};

/**
 * 语言检测规则
 */
const LANGUAGE_PATTERNS: Array<{
	lang: SupportedLanguage;
	regex: RegExp;
	weight: number;
}> = [
	{ lang: 'zh', regex: /[\u4e00-\u9fa5]/, weight: 1.0 },      // 中文
	{ lang: 'ja', regex: /[\u3040-\u309f\u30a0-\u30ff]/, weight: 1.0 }, // 日文（平假名+片假名）
	{ lang: 'ko', regex: /[\uac00-\ud7af]/, weight: 1.0 },      // 韩文
	{ lang: 'ru', regex: /[\u0400-\u04ff]/, weight: 1.0 },      // 俄文（西里尔字母）
	{ lang: 'ar', regex: /[\u0600-\u06ff]/, weight: 1.0 },      // 阿拉伯文
	{ lang: 'th', regex: /[\u0e00-\u0e7f]/, weight: 1.0 },      // 泰文
	{ lang: 'hi', regex: /[\u0900-\u097f]/, weight: 1.0 },      // 印地文（天城文）
	// 拉丁字母语言（需要更复杂的检测）
	{ lang: 'es', regex: /[áéíóúñ¿¡]/i, weight: 0.8 },          // 西班牙语特征
	{ lang: 'fr', regex: /[àâäçéèêëïîôùûü]/i, weight: 0.8 },   // 法语特征
	{ lang: 'de', regex: /[äöüß]/i, weight: 0.8 },              // 德语特征
	{ lang: 'pt', regex: /[ãâáàçéêíóôõú]/i, weight: 0.8 },     // 葡萄牙语特征
	{ lang: 'vi', regex: /[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/i, weight: 0.9 }, // 越南语特征
	{ lang: 'pl', regex: /[ąćęłńóśźż]/i, weight: 0.8 },        // 波兰语特征
	{ lang: 'tr', regex: /[çğıöşü]/i, weight: 0.8 },            // 土耳其语特征
];

/**
 * 检测文本语言（性能优化版）
 * @param text 要检测的文本
 * @returns 检测到的语言代码
 */
export function detectLanguage(text: string): SupportedLanguage {
	if (!text || text.trim().length === 0) {
		return 'unknown';
	}

	// 快速路径 1: 中文检测（包括汉字和标点）
	if (/[\u4e00-\u9fa5\u3000-\u303F\uFF00-\uFFEF]/.test(text)) {
		return 'zh';
	}
	
	// 快速路径 2: 纯数字和标点 → 英文
	if (/^[\d\s.,!?;:'"()\-]+$/.test(text)) {
		return 'en';
	}
	
	// 快速路径 3: 包含英文字母 → 英文
	if (/[a-zA-Z]/.test(text)) {
		return 'en';
	}

	// 慢速路径：完整的模式匹配（仅用于特殊语言）
	const scores: Partial<Record<SupportedLanguage, number>> = {};

	for (const pattern of LANGUAGE_PATTERNS) {
		const matches = text.match(pattern.regex);
		if (matches) {
			scores[pattern.lang] = (scores[pattern.lang] || 0) + matches.length * pattern.weight;
		}
	}

	// 找出得分最高的语言
	let maxScore = 0;
	let detectedLang: SupportedLanguage = 'unknown';

	for (const [lang, score] of Object.entries(scores)) {
		if (score > maxScore) {
			maxScore = score;
			detectedLang = lang as SupportedLanguage;
		}
	}

	return detectedLang;
}

/**
 * 分离多语言文本
 * @param text 混合语言文本
 * @returns 按语言分离的文本对象
 */
export function separateLanguages(text: string): Partial<Record<SupportedLanguage, string>> {
	const result: Partial<Record<SupportedLanguage, string>> = {};

	// 按行分离
	const lines = text.split('\n').map(l => l.trim()).filter(l => l);

	if (lines.length === 0) {
		return result;
	}

	// 单行处理
	if (lines.length === 1) {
		const lang = detectLanguage(text);
		result[lang] = text;
		return result;
	}

	// 多行处理：为每行检测语言
	const langGroups: Map<SupportedLanguage, string[]> = new Map();

	for (const line of lines) {
		// 优先使用中文标点符号判断（处理纯数字字幕）
		// \u4e00-\u9fa5: 中文汉字
		// \u3000-\u303F: CJK 符号和标点
		// \uFF00-\uFFEF: 全角ASCII、全角标点
		let lang: SupportedLanguage;
		if (/[\u4e00-\u9fa5\u3000-\u303F\uFF00-\uFFEF]/.test(line)) {
			lang = 'zh';
		} else {
			lang = detectLanguage(line);
			// 如果检测为 unknown 但包含数字，默认为英文
			if (lang === 'unknown' && /\d/.test(line)) {
				lang = 'en';
			}
		}
		
		if (!langGroups.has(lang)) {
			langGroups.set(lang, []);
		}
		langGroups.get(lang)!.push(line);
	}

	// 合并同语言的行
	for (const [lang, langLines] of langGroups) {
		result[lang] = langLines.join(' ');
	}

	return result;
}

/**
 * 判断是否为CJK语言（中日韩）
 * @param lang 语言代码
 * @returns 是否为CJK语言
 */
export function isCJKLanguage(lang: SupportedLanguage): boolean {
	return lang === 'zh' || lang === 'ja' || lang === 'ko';
}

/**
 * 判断是否为从右到左书写的语言
 * @param lang 语言代码
 * @returns 是否为RTL语言
 */
export function isRTLLanguage(lang: SupportedLanguage): boolean {
	return LANGUAGE_CONFIG[lang]?.rtl || false;
}

/**
 * 获取语言显示名称
 * @param lang 语言代码
 * @param useNative 是否使用本地语言名称
 * @returns 语言名称
 */
export function getLanguageName(lang: SupportedLanguage, useNative: boolean = false): string {
	const info = LANGUAGE_CONFIG[lang];
	if (!info) return 'Unknown';
	return useNative ? info.nativeName : info.name;
}

/**
 * 获取所有支持的语言列表
 * @returns 语言列表
 */
export function getSupportedLanguages(): LanguageInfo[] {
	return Object.values(LANGUAGE_CONFIG).filter(l => l.code !== 'unknown');
}

/**
 * 根据文本内容智能排序语言
 * @param languages 语言列表
 * @param text 参考文本
 * @returns 排序后的语言列表
 */
export function sortLanguagesByRelevance(
	languages: SupportedLanguage[],
	text?: string
): SupportedLanguage[] {
	if (!text) {
		return languages;
	}

	const detectedLang = detectLanguage(text);
	const sorted = [...languages];

	// 将检测到的语言放在最前面
	if (detectedLang !== 'unknown') {
		const index = sorted.indexOf(detectedLang);
		if (index > 0) {
			sorted.splice(index, 1);
			sorted.unshift(detectedLang);
		}
	}

	return sorted;
}

/**
 * 验证语言代码
 * @param code 语言代码
 * @returns 是否为有效的语言代码
 */
export function isValidLanguageCode(code: string): code is SupportedLanguage {
	return code in LANGUAGE_CONFIG;
}
