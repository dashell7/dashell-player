import React from 'react';
import type { SupportedLanguage } from '../utils/languageUtils';
import { getLanguageName, LANGUAGE_CONFIG } from '../utils/languageUtils';

/**
 * 语言选择器组件属性
 */
interface LanguageSelectorProps {
	/** 可用的语言列表 */
	availableLanguages: SupportedLanguage[];
	/** 当前可见的语言列表 */
	visibleLanguages: SupportedLanguage[];
	/** 语言可见性变化回调 */
	onLanguageToggle: (lang: SupportedLanguage) => void;
	/** 组件样式 */
	className?: string;
	/** 是否显示本地语言名称 */
	useNativeNames?: boolean;
}

/**
 * 语言选择器组件
 * 允许用户选择要显示的字幕语言
 */
export const LanguageSelector: React.FC<LanguageSelectorProps> = ({
	availableLanguages,
	visibleLanguages,
	onLanguageToggle,
	className = '',
	useNativeNames = true
}) => {
	if (availableLanguages.length === 0) {
		return null;
	}

	// 如果只有一种语言，不显示选择器
	if (availableLanguages.length === 1) {
		return null;
	}

	return (
		<div className={`linguaflow-language-selector ${className}`}>
			<div className="linguaflow-language-selector-label">
				语言:
			</div>
			<div className="linguaflow-language-selector-buttons">
				{availableLanguages.map(lang => {
					const isVisible = visibleLanguages.includes(lang);
					const langInfo = LANGUAGE_CONFIG[lang];
					const displayName = useNativeNames ? langInfo.nativeName : langInfo.name;
					
					return (
						<button
							key={lang}
							className={`linguaflow-language-btn ${isVisible ? 'active' : ''}`}
							onClick={() => onLanguageToggle(lang)}
							title={`${langInfo.name} / ${langInfo.nativeName}`}
						>
							{displayName}
						</button>
					);
				})}
			</div>
		</div>
	);
};

/**
 * 紧凑型语言选择器（用于控制栏）
 */
interface CompactLanguageSelectorProps {
	availableLanguages: SupportedLanguage[];
	visibleLanguages: SupportedLanguage[];
	onLanguageToggle: (lang: SupportedLanguage) => void;
}

export const CompactLanguageSelector: React.FC<CompactLanguageSelectorProps> = ({
	availableLanguages,
	visibleLanguages,
	onLanguageToggle
}) => {
	if (availableLanguages.length <= 1) {
		return null;
	}

	return (
		<div className="linguaflow-compact-language-selector">
			{availableLanguages.map(lang => {
				const isVisible = visibleLanguages.includes(lang);
				const langInfo = LANGUAGE_CONFIG[lang];
				
				// 使用语言代码的简写
				const displayCode = lang.toUpperCase();
				
				return (
					<button
						key={lang}
						className={`linguaflow-lang-toggle ${isVisible ? 'active' : ''}`}
						onClick={() => onLanguageToggle(lang)}
						title={`${langInfo.name} / ${langInfo.nativeName}`}
					>
						{displayCode}
					</button>
				);
			})}
		</div>
	);
};

/**
 * 下拉式语言选择器
 */
interface DropdownLanguageSelectorProps {
	availableLanguages: SupportedLanguage[];
	currentLanguage: SupportedLanguage;
	onLanguageChange: (lang: SupportedLanguage) => void;
	label?: string;
}

export const DropdownLanguageSelector: React.FC<DropdownLanguageSelectorProps> = ({
	availableLanguages,
	currentLanguage,
	onLanguageChange,
	label = '字幕语言'
}) => {
	if (availableLanguages.length <= 1) {
		return null;
	}

	return (
		<div className="linguaflow-dropdown-language-selector">
			<label>{label}:</label>
			<select
				value={currentLanguage}
				onChange={(e) => onLanguageChange(e.target.value as SupportedLanguage)}
				className="linguaflow-language-dropdown"
			>
				{availableLanguages.map(lang => {
					const langInfo = LANGUAGE_CONFIG[lang];
					return (
						<option key={lang} value={lang}>
							{langInfo.nativeName} ({langInfo.name})
						</option>
					);
				})}
			</select>
		</div>
	);
};
