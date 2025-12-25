import React, { useRef, useEffect, useMemo } from 'react';

/**
 * 预处理的单词数据接口
 */
export interface ParsedWord {
text: string;
index: number;
isWord: boolean; // true=单词, false=空格/标点
}

/**
 * 文本预处理工具 - 只在字幕加载时执行一次
 */
export class TextProcessor {
  private static cache = new Map<string, ParsedWord[]>();
  private static readonly MAX_CACHE_SIZE = 500;

  /**
   * 解析文本为单词数组（带缓存）
   */
  static parseText(text: string): ParsedWord[] {
    // 检查缓存
    if (this.cache.has(text)) {
      return this.cache.get(text)!;
    }

    // 简单的缓存清理策略：如果缓存过大，直接清空
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      console.log('[TextProcessor] Cache full, clearing...');
      this.cache.clear();
    }

    // 按空格和标点符号分割，但保留它们
    const tokens = text.split(/(\s+|[.,;:!?'"()[\]{}])/);
    const parsed: ParsedWord[] = [];
    let wordIndex = 0;

    tokens.forEach((token) => {
      if (!token) return;

      // 判断是否为单词（不是空白或单个标点）
      const isWord = token.trim().length > 0 && !/^[.,;:!?'"()[\]{}]$/.test(token);

      parsed.push({
        text: token,
        index: isWord ? wordIndex++ : -1,
        isWord,
      });
    });

    // 缓存结果
    this.cache.set(text, parsed);
    return parsed;
  }
/**
 * 清除缓存（在字幕更新时调用）
 */
static clearCache() {
this.cache.clear();
}

/**
 * 获取缓存大小
 */
static getCacheSize() {
return this.cache.size;
}
}

/**
 * 优化的可点击文本渲染组件
 * 使用 DOM 操作直接更新高亮，避免 React 重渲染
 */
interface ClickableTextProps {
text: string;
isActive: boolean;
activeWordIndex: number;
onWordClick: (word: string, e: React.MouseEvent) => void;
}

export const ClickableText = React.memo<ClickableTextProps>(({
text,
isActive,
activeWordIndex,
onWordClick,
}) => {
// 使用预处理的单词数据
const parsedWords = useMemo(() => TextProcessor.parseText(text), [text]);

// 存储所有单词的 DOM 引用
const wordRefs = useRef<(HTMLSpanElement | null)[]>([]);
const prevIndexRef = useRef<number>(-1);

// 初始化 refs 数组
wordRefs.current = parsedWords.map(() => null);

// 监听 activeWordIndex 变化，直接操作 DOM
useEffect(() => {
// 调试日志
console.log('[ClickableText] Effect:', { isActive, activeWordIndex, wordRefsLen: wordRefs.current.length });

// 如果当前句子不活跃，或者没有单词，不做任何操作
if (!isActive) {
// 清除之前的高亮（如果有）
if (prevIndexRef.current !== -1) {
const prevEl = wordRefs.current[prevIndexRef.current];
if (prevEl) prevEl.classList.remove('linguaflow-word-highlight');
prevIndexRef.current = -1;
}
return;
}

// 找到对应的 DOM 元素索引
// parsedWords 中的 index 是逻辑单词索引，我们需要找到对应的数组索引
const targetIndex = parsedWords.findIndex(p => p.index === activeWordIndex);
console.log('[ClickableText] Highlight update:', { activeWordIndex, targetIndex });

// 移除旧的高亮
if (prevIndexRef.current !== -1 && prevIndexRef.current !== targetIndex) {
const prevEl = wordRefs.current[prevIndexRef.current];
if (prevEl) prevEl.classList.remove('linguaflow-word-highlight');
}

// 添加新的高亮
if (targetIndex !== -1) {
const targetEl = wordRefs.current[targetIndex];
if (targetEl) {
targetEl.classList.add('linguaflow-word-highlight');
prevIndexRef.current = targetIndex;
} else {
console.warn('[ClickableText] Target element not found for index:', targetIndex);
}
} else {
// 如果没找到对应单词（比如刚开始播放或结束），也要清除旧的
if (prevIndexRef.current !== -1) {
const prevEl = wordRefs.current[prevIndexRef.current];
if (prevEl) prevEl.classList.remove('linguaflow-word-highlight');
prevIndexRef.current = -1;
}
}
}, [isActive, activeWordIndex, parsedWords]);

// 当 text 变化时，重置
useEffect(() => {
prevIndexRef.current = -1;
}, [text]);

return (
<div className="stns">
{parsedWords.map((parsed, idx) => {
// 空格和标点直接显示
if (!parsed.isWord) {
return <React.Fragment key={idx}>{parsed.text}</React.Fragment>;
}

// 单词渲染为 span，并绑定 ref
return (
<span
key={idx}
ref={el => wordRefs.current[idx] = el}
className="linguaflow-clickable-word"
onClick={(e) => onWordClick(parsed.text, e)}
title={`查询: ${parsed.text}`}
>
{parsed.text}
</span>
);
})}
</div>
);
}, (prevProps, nextProps) => {
	// 自定义比较函数
	// 注意：我们必须允许 activeWordIndex 的变化触发组件重新执行
	// 这样 useEffect 才能获取到新的 activeWordIndex 并更新 DOM
	// 但是，由于 JSX 中不使用 activeWordIndex，React 的 Diff 结果会是"无变化"
	// 所以 React 不会操作 DOM，只有我们的 useEffect 会操作 DOM
	
	const isTextSame = prevProps.text === nextProps.text;
	const isActiveSame = prevProps.isActive === nextProps.isActive;
	const isIndexSame = prevProps.activeWordIndex === nextProps.activeWordIndex;
	
	return isTextSame && isActiveSame && isIndexSame;
});

ClickableText.displayName = 'ClickableText';
