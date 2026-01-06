import React from 'react';
import type { SubtitleCue } from '../types';
import { ClickableText } from './OptimizedWord';
import { isRTLLanguage, type SupportedLanguage } from '../utils/languageUtils';

interface SubtitleItemProps {
  cue: SubtitleCue;
  index: number;
  isActive: boolean;
  isLooping: boolean;
  isRecording: boolean;
  isSelected: boolean;
  showEnglish: boolean;
  showChinese: boolean;
  showIndexAndTime: boolean;
  wordByWordHighlight: boolean;
  activeWordIndex: number;
  visibleLanguages: SupportedLanguage[]; // 要显示的语言列表
  onSubtitleClick: (cue: SubtitleCue) => void;
  onSubtitleDblClick: (cue: SubtitleCue) => void;
  onSubtitleContextMenu: (cue: SubtitleCue, e: React.MouseEvent) => void;
  onWordClick: (word: string, e: React.MouseEvent) => void;
  onExportSubtitle: (cue: SubtitleCue, e: React.MouseEvent) => void;
  activeItemRef?: React.RefObject<HTMLDivElement>;
}

export const SubtitleItem = React.memo<SubtitleItemProps>(({ 
  cue, 
  index, 
  isActive,
  wordByWordHighlight,
  isLooping,
  isRecording,
  isSelected,
  showEnglish,
  showChinese,
  showIndexAndTime,
  activeWordIndex,
  visibleLanguages,
  onSubtitleClick,
  onSubtitleDblClick,
  onSubtitleContextMenu,
  onWordClick,
  onExportSubtitle,
  activeItemRef
}) => {
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // 决定渲染哪些语言
  const renderLanguages = () => {
    // 如果有多语言数据且有可见语言设置
    if (cue.languages && Object.keys(cue.languages).length > 0) {
      return Object.entries(cue.languages)
        .filter(([lang]) => visibleLanguages.includes(lang as SupportedLanguage))
        .map(([lang, text]) => {
          if (!text) return null;
          
          const isRTL = isRTLLanguage(lang as SupportedLanguage);
          const canClick = ['en', 'es', 'fr', 'de', 'pt', 'it', 'nl'].includes(lang); // 支持查词的语言
          
          return (
            <div 
              key={lang}
              className={`linguaflow-subtitle-language ${isRTL ? 'rtl' : ''} ${isActive && !wordByWordHighlight ? 'linguaflow-line-highlight' : ''}`}
            >
              {canClick ? (
                <ClickableText
                  text={text}
                  isActive={isActive && wordByWordHighlight}
                  activeWordIndex={activeWordIndex}
                  onWordClick={onWordClick}
                />
              ) : (
                <span className="linguaflow-subtitle-language-text">{text}</span>
              )}
            </div>
          );
        });
    }
    
    // 向后兼容：使用textEn/textZh
    return (
      <>
        {cue.textEn && showEnglish && (
          <div className={`linguaflow-subtitle-item-en ${isActive && !wordByWordHighlight ? 'linguaflow-line-highlight' : ''}`}>
            <ClickableText
              text={cue.textEn}
              isActive={isActive && wordByWordHighlight}
              activeWordIndex={activeWordIndex}
              onWordClick={onWordClick}
            />
          </div>
        )}
        {cue.textZh && showChinese && (
          <div className={`linguaflow-subtitle-item-zh ${isActive && !wordByWordHighlight ? 'linguaflow-line-highlight' : ''}`}>{cue.textZh}</div>
        )}
        {!cue.textEn && !cue.textZh && (
          <div className={`linguaflow-subtitle-item-main ${isActive && !wordByWordHighlight ? 'linguaflow-line-highlight' : ''}`}>
            <ClickableText
              text={cue.text}
              isActive={isActive && wordByWordHighlight}
              activeWordIndex={activeWordIndex}
              onWordClick={onWordClick}
            />
          </div>
        )}
      </>
    );
  };

  return (
    <div
      ref={isActive ? activeItemRef : null}
      className={`linguaflow-subtitle-item ${
        isActive ? 'active' : ''
      } ${isLooping ? 'looping' : ''} ${isRecording ? 'recording' : ''} ${isSelected ? 'selected' : ''}`}
      onClick={() => onSubtitleClick(cue)}
      onDoubleClick={() => onSubtitleDblClick(cue)}
      onContextMenu={(e) => onSubtitleContextMenu(cue, e)}
    >
      <div className="linguaflow-subtitle-item-header">
        {showIndexAndTime && (
          <>
            <span className="linguaflow-subtitle-index">
              #{index + 1}
            </span>
            <span className="linguaflow-subtitle-time">
              {formatTime(cue.start)} → {formatTime(cue.end)}
            </span>
          </>
        )}
        
        <button 
          className="linguaflow-export-btn"
          onClick={(e) => onExportSubtitle(cue, e)}
          title="导出字幕到笔记"
        >
          📝
        </button>
        
        {isSelected && (
          <span className="linguaflow-selected-indicator" title="已选中">
            ●
          </span>
        )}
        {isLooping && (
          <span className="linguaflow-loop-badge">循环中</span>
        )}
      </div>
      
      <div className="linguaflow-subtitle-item-text">
        {renderLanguages()}
      </div>
    </div>
  );
});

SubtitleItem.displayName = 'SubtitleItem';
