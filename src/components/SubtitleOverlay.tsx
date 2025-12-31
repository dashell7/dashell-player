import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Notice } from 'obsidian';
import { useMediaStore, selectCurrentSubtitle } from '../store/mediaStore';
import type { SubtitleCue, PlayerRef } from '../types';
import type { UseRecordingSessionReturn } from '../hooks/useRecordingSession';
import type LinguaFlowPlugin from '../main';
import { SubtitleControls } from './SubtitleControls';
import { ClickableText } from './OptimizedWord';
import { VirtualScroll, AutoHeightVirtualScroll } from './VirtualScroll';
import { shouldEnablePerformanceMode } from '../utils/performanceUtils';
import { useResizeObserver } from '../hooks/useResizeObserver';
import type { SupportedLanguage } from '../utils/languageUtils';
import { isRTLLanguage } from '../utils/languageUtils';

interface SubtitleOverlayProps {
  playerRef: React.RefObject<PlayerRef>;
  showList?: boolean;  // 是否显示字幕列表
  showControls?: boolean;  // 是否显示控制栏
  plugin?: LinguaFlowPlugin;
  recordingSession?: UseRecordingSessionReturn;
}

/**
 * 单个字幕项组件 - 使用 memo 优化
 */
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

const SubtitleItem = React.memo<SubtitleItemProps>(({ 
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

/**
 * 字幕覆盖层组件
 * 
 * 功能：
 * 1. 显示当前激活的字幕（覆盖在视频上）
 * 2. 显示完整字幕列表（带高亮和滚动）
 * 3. 点击字幕跳转播放位置
 * 4. 双击字幕启用单句循环
 */
export function SubtitleOverlay({ playerRef, showList = true, showControls = true, plugin, recordingSession }: SubtitleOverlayProps) {
  const subtitles = useMediaStore(state => state.subtitles);
  const activeIndex = useMediaStore(state => state.activeIndex);
  const activeWordIndex = useMediaStore(state => state.activeWordIndex);
  const currentSubtitle = useMediaStore(selectCurrentSubtitle);
  
  // 智能判断是否启用虚拟滚动
  const useVirtualScroll = subtitles.length > 100 || shouldEnablePerformanceMode();
  
  // 只订阅需要的字段，避免不必要的重渲染
  const showEnglish = useMediaStore(state => state.subtitleConfig.showEnglish);
  const showChinese = useMediaStore(state => state.subtitleConfig.showChinese);
  const showIndexAndTime = useMediaStore(state => state.subtitleConfig.showIndexAndTime);
  const wordByWordHighlight = useMediaStore(state => state.subtitleConfig.wordByWordHighlight);
  
  const segmentLoopEnabled = useMediaStore(state => state.segmentLoopEnabled);
  const segmentLoopCurrent = useMediaStore(state => state.segmentLoopCurrent);
  const segmentLoopTotal = useMediaStore(state => state.segmentLoopTotal);
  const loopStart = useMediaStore(state => state.loopStart);
  const loopEnd = useMediaStore(state => state.loopEnd);
  const playbackRate = useMediaStore(state => state.playbackRate);
  const setPlaybackRate = useMediaStore(state => state.setPlaybackRate);
  // 使用 store 的播放状态，确保与播放器完全同步
  const isPlaying = useMediaStore(state => state.playing);
  const setPlaying = useMediaStore(state => state.setPlaying);
  
  const listRef = useRef<HTMLDivElement>(null);
  const activeItemRef = useRef<HTMLDivElement>(null);
  const virtualListRef = useRef<any>(null);
  
  // 使用 ResizeObserver 监听容器高度
  const { ref: resizeRef, height: containerHeight } = useResizeObserver<HTMLDivElement>();
  
  // 合并 ref: 将 resizeRef 和 listRef (如果需要) 结合
  // 注意：在普通模式下，listRef 用于滚动内部容器。resizeRef 用于测量外部容器。
  // 外部容器：linguaflow-subtitle-list (resizeRef)
  // 内部容器：linguaflow-subtitle-items (listRef) 或 AutoHeightVirtualScroll (virtualListRef)
  
  // 选中的字幕（用于控制栏）
  const [selectedCue, setSelectedCue] = useState<SubtitleCue | null>(null);
  const [isManuallyLocked, setIsManuallyLocked] = useState(false);
  // 是否正在悬停字幕列表
  const [isHovering, setIsHovering] = useState(false);
  
  // 监控时间跳跃，自动解锁字幕
  const lastTimeRef = useRef<number>(0);
  const currentTime = useMediaStore(state => state.currentTime);
  useEffect(() => {
    const timeDiff = Math.abs(currentTime - lastTimeRef.current);
    // 如果时间跳跃超过2秒，认为是用户拖动时间轴，自动解锁
    if (timeDiff > 2 && isManuallyLocked) {
      console.log('[SubtitleOverlay] 🎯 Large time jump detected:', timeDiff, 's - Unlocking');
      setIsManuallyLocked(false);
    }
    lastTimeRef.current = currentTime;
  }, [currentTime, isManuallyLocked]);
  
  // 自动跟随当前播放的字幕（如果没有手动锁定）
  useEffect(() => {
    if (!isManuallyLocked && currentSubtitle) {
      setSelectedCue(currentSubtitle);
    }
  }, [currentSubtitle, isManuallyLocked]);
  
  // 智能滚动到当前字幕 - 始终保持在第二行位置
  useEffect(() => {
    // 检查是否处于单句循环模式
    if (segmentLoopEnabled) {
      const state = useMediaStore.getState();
      // 使用 epsilon 比较浮点数，防止精度问题
      const epsilon = 0.01;
      const loopingCue = subtitles.find(s => 
        Math.abs(s.start - state.loopStart) < epsilon && 
        Math.abs(s.end - state.loopEnd) < epsilon
      );
      
      // 如果找到了正在循环的字幕，且当前激活的不是它，则不滚动
      // 这防止了循环跳转时瞬间匹配到上一句导致的跳动
      if (loopingCue && loopingCue.index !== activeIndex) {
        // console.log('[SubtitleOverlay] Skipping scroll: Segment loop active and index mismatch');
        return;
      }
    }

    // console.log('[SubtitleOverlay] Scroll Effect Triggered', { activeIndex, isManuallyLocked });
    
    // 如果鼠标悬停在列表上，暂停自动滚动（除非在单句循环模式下）
    if (isHovering && !segmentLoopEnabled) {
      return;
    }

    // 智能滚动
    if (useVirtualScroll) {
      // 虚拟滚动模式
      if (virtualListRef.current && activeIndex >= 0) {
        const isRightLayout = plugin?.settings.subtitleLayout === 'right';
        let offset = 0;

        if (isRightLayout) {
          // 右侧布局：活动字幕在视频中下部 (约 60% 的位置)
          // offset 是元素距离容器顶部的距离
          offset = containerHeight * 0.6;
        } else {
          // 底部布局：活动字幕在第二行
          // 预留一行的高度，这里估算为 80px (estimatedItemHeight)
          offset = 80;
        }

        virtualListRef.current.scrollToIndex(activeIndex, {
          behavior: 'smooth',
          offset
        });
      }
    } else {
      // 普通模式：手动计算滚动位置
      if (activeItemRef.current && listRef.current) {
        const container = listRef.current;
        const item = activeItemRef.current;
        
        const containerHeight = container.clientHeight;
        
        let targetScrollTop = 0;
        const isRightLayout = plugin?.settings.subtitleLayout === 'right';

        if (isRightLayout) {
          // 右侧布局：活动字幕在视频中下部 (约 60% 的位置)
          targetScrollTop = item.offsetTop - (containerHeight * 0.6);
        } else {
          // 底部布局：保持第二行 (显示上一行的顶部)
          const prevItem = item.previousElementSibling as HTMLElement;
          if (prevItem) {
            targetScrollTop = prevItem.offsetTop;
          } else {
            targetScrollTop = 0;
          }
        }
        
        if (targetScrollTop < 0) targetScrollTop = 0;
        
        container.scrollTo({
          top: targetScrollTop,
          behavior: 'smooth'
        });
      }
    }
  }, [activeIndex, segmentLoopEnabled, isHovering, useVirtualScroll]); // 添加 useVirtualScroll 依赖
  
  // 处理字幕点击 - 选中字幕（使用 useCallback 优化）
  const handleSubtitleClick = useCallback((cue: SubtitleCue) => {
    console.log('[SubtitleOverlay] Click - Select:', cue.start);
    
    // 如果点击的是当前选中的字幕，切换播放/暂停
    if (selectedCue?.id === cue.id) {
      const isPlaying = useMediaStore.getState().playing;
      if (isPlaying && playerRef.current) {
        // 正在播放 → 暂停
        playerRef.current.pauseVideo();
        useMediaStore.getState().setPlaying(false);
        console.log('[SubtitleOverlay] Toggled to pause');
      } else if (playerRef.current) {
        // 已暂停 → 播放
        playerRef.current.playVideo();
        useMediaStore.getState().setPlaying(true);
        console.log('[SubtitleOverlay] Toggled to play');
      }
      // 保持锁定状态
    } else {
      // 点击其他字幕：锁定并处理播放状态
      setSelectedCue(cue);
      setIsManuallyLocked(true);
      console.log('[SubtitleOverlay] Locked to:', cue.start);
      
      // 如果视频正在播放，暂停并跳转到该字幕
      const isPlaying = useMediaStore.getState().playing;
      if (isPlaying && playerRef.current) {
        playerRef.current.pauseVideo();
        useMediaStore.getState().setPlaying(false);
        playerRef.current.seekTo(cue.start);
        console.log('[SubtitleOverlay] Paused and seeked to:', cue.start);
      } else if (playerRef.current) {
        // 如果已暂停，只跳转不播放
        playerRef.current.seekTo(cue.start);
        console.log('[SubtitleOverlay] Seeked to (paused):', cue.start);
      }
    }
  }, [selectedCue?.id, playerRef]);
  
  // 处理字幕右键点击 - 显示上下文菜单
  const handleSubtitleContextMenu = useCallback((cue: SubtitleCue, e: React.MouseEvent) => {
    e.preventDefault();
    const { Menu } = require('obsidian');
    const menu = new Menu();
    
    menu.addItem((item: any) => {
      item
        .setTitle('📝 插入到笔记')
        .setIcon('pencil')
        .onClick(() => {
          if (plugin) {
            plugin.insertSubtitleToNote(cue);
          }
        });
    });

    menu.addSeparator();

    menu.addItem((item: any) => {
      item
        .setTitle('▶️ 跳转播放')
        .setIcon('play')
        .onClick(() => {
          if (playerRef.current) {
            playerRef.current.seekTo(cue.start);
            playerRef.current.playVideo();
            useMediaStore.getState().setPlaying(true);
          }
        });
    });
    
    menu.showAtMouseEvent(e.nativeEvent);
  }, [plugin, playerRef]);
  
  // 处理字幕双击 - 跳转播放并解锁（使用 useCallback 优化）
  const handleSubtitleDblClick = useCallback((cue: SubtitleCue) => {
    console.log('[SubtitleOverlay] Double Click - Jump and play:', cue.start);
    setSelectedCue(cue);
    setIsManuallyLocked(false); // 双击后解锁，跟随播放
    if (playerRef.current) {
      playerRef.current.seekTo(cue.start);
      playerRef.current.playVideo(); // ✅ 添加播放
      useMediaStore.getState().setPlaying(true); // ✅ 更新状态
      console.log('[SubtitleOverlay] Seeked to:', cue.start, 'and playing');
    } else {
      console.warn('[SubtitleOverlay] Player ref is null');
    }
  }, [playerRef]);
  
  // 处理单句播放
  const handlePlaySegment = (cue: SubtitleCue, e?: React.MouseEvent) => {
    e?.stopPropagation(); // 防止触发 Item 点击
    console.log('[SubtitleOverlay] Play segment:', cue.text);
    
    if (playerRef.current) {
      // 先跳转到开始时间
      playerRef.current.seekTo(cue.start);
      // 触发播放器播放
      playerRef.current.playVideo?.();
      // 启用单句播放状态
      useMediaStore.getState().playSegment(cue.start, cue.end);
    }
  };
  
  // 处理单句循环播放
  const handleSegmentLoop = (cue: SubtitleCue, e?: React.MouseEvent) => {
    e?.stopPropagation();
    
    const loopCount = plugin?.settings.loopCount ?? -1;
    console.log('[SubtitleOverlay] Start segment loop:', cue.text, 'Count:', loopCount, 'Index:', cue.index);
    
    if (playerRef.current) {
      playerRef.current.seekTo(cue.start);
      playerRef.current.playVideo?.();
      useMediaStore.getState().startSegmentLoop(cue.start, cue.end, loopCount, cue.index);
    }
  };

  // 处理单句录音
  const handleRecordSegment = async (cue: SubtitleCue, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!recordingSession) return;
    
    const { isRecording, targetSubtitle, startRecording, stopRecording } = recordingSession;
    
    // 如果正在录音且是当前句，则停止
    if (isRecording && targetSubtitle?.id === cue.id) {
      await stopRecording();
    } else {
      // 否则开始录音（如果之前在录音，会先停止之前的）
      // 自动暂停播放器和停止循环
      if (playerRef.current) {
        playerRef.current.pauseVideo?.();
      }
      // 停止单句循环（如果正在循环）
      const { segmentLoopEnabled } = useMediaStore.getState();
      if (segmentLoopEnabled) {
        useMediaStore.getState().stopSegmentLoop();
      }
      
      await startRecording(cue);
    }
  };

  // 退出循环
  const handleStopLoop = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    useMediaStore.getState().stopSegmentLoop();
  };
  
  // 处理单词点击查词
  const handleWordClick = useCallback(async (word: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    const cleanWord = word.replace(/[.,;:!?'"()[\]{}]/g, '').trim();
    if (!cleanWord) return;
    
    console.log('[SubtitleOverlay] Word clicked:', cleanWord);
    
    if (!plugin || !(plugin as any).app) return;
    const app = (plugin as any).app;
    
    try {
      // 根据设置决定是否复制到剪切板
      if (plugin.settings.autoCopyWordOnLookup && navigator.clipboard) {
        await navigator.clipboard.writeText(cleanWord);
      }
      
      const languageLearnerPlugin = app.plugins?.plugins?.['obsidian-language-learner'];
      if (languageLearnerPlugin && app.plugins?.enabledPlugins?.has?.('obsidian-language-learner')) {
        const openPanel = plugin.settings.openLanguageLearnerPanel;
        const target = e.target as HTMLElement;
        
        if (typeof languageLearnerPlugin.queryWord === 'function') {
          if (openPanel) {
            languageLearnerPlugin.queryWord(cleanWord, target);
          } else {
            languageLearnerPlugin.queryWord(cleanWord);
          }
          new Notice(`查询: ${cleanWord}`);
        }
      }
    } catch (error) {
      console.error('[SubtitleOverlay] Error:', error);
    }
  }, [plugin]);

  // 处理字幕导出
  const handleExportSubtitle = useCallback((cue: SubtitleCue, e: React.MouseEvent) => {
    e.stopPropagation();
    if (plugin) {
      plugin.insertSubtitleToNote(cue);
    }
  }, [plugin]);
  
  // 处理播放/暂停
  const handleTogglePlay = useCallback(() => {
    if (playerRef.current) {
      if (isPlaying) {
        playerRef.current.pauseVideo();
        setPlaying(false);
      } else {
        playerRef.current.playVideo();
        setPlaying(true);
      }
    }
  }, [isPlaying, setPlaying, playerRef]);

  // 处理循环切换
  const handleToggleLoop = useCallback(() => {
    const cue = selectedCue || currentSubtitle;
    if (cue) {
      handleSegmentLoop(cue);
    }
  }, [selectedCue, currentSubtitle, handleSegmentLoop]);

  // 处理退出循环
  const handleExitLoop = useCallback(() => {
    handleStopLoop();
  }, [handleStopLoop]);

  // 处理录音
  const handleRecord = useCallback(() => {
    const cue = selectedCue || currentSubtitle;
    if (cue && recordingSession) {
      handleRecordSegment(cue);
    }
  }, [selectedCue, currentSubtitle, recordingSession, handleRecordSegment]);

  // 处理速率变化
  const handleRateChange = useCallback((rate: number) => {
    setPlaybackRate(rate);
    if (playerRef.current) {
      playerRef.current.setPlaybackRate(rate);
    }
  }, [setPlaybackRate, playerRef]);

  // 处理解锁
  const handleUnlock = useCallback(() => {
    setIsManuallyLocked(false);
  }, []);

  // 渲染单个字幕项的函数 (使用 useCallback 优化)
  const renderSubtitleItem = useCallback((cue: SubtitleCue, index: number) => {
    const isLoopingThis = segmentLoopEnabled && 
      loopStart === cue.start && 
      loopEnd === cue.end;

    const isRecordingThis = !!(recordingSession?.isRecording && 
      recordingSession?.targetSubtitle?.id === cue.id);

    const isSelected = selectedCue?.id === cue.id;
    
    return (
      <SubtitleItem
        key={cue.id}
        cue={cue}
        index={index}
        isActive={index === activeIndex}
        isLooping={isLoopingThis}
        isRecording={isRecordingThis}
        isSelected={isSelected}
        showEnglish={showEnglish}
        showChinese={showChinese}
        showIndexAndTime={showIndexAndTime}
        wordByWordHighlight={wordByWordHighlight}
        activeWordIndex={index === activeIndex ? activeWordIndex : -1}
        visibleLanguages={useMediaStore.getState().subtitleConfig.visibleLanguages}
        onSubtitleClick={handleSubtitleClick}
        onSubtitleDblClick={handleSubtitleDblClick}
        onSubtitleContextMenu={handleSubtitleContextMenu}
        onWordClick={handleWordClick}
        onExportSubtitle={handleExportSubtitle}
        activeItemRef={index === activeIndex ? activeItemRef : undefined}
      />
    );
  }, [
    segmentLoopEnabled, loopStart, loopEnd, 
    recordingSession?.isRecording, recordingSession?.targetSubtitle?.id, 
    selectedCue?.id, activeIndex, 
    showEnglish, showChinese, showIndexAndTime, wordByWordHighlight, activeWordIndex,
    handleSubtitleClick, handleSubtitleDblClick, handleSubtitleContextMenu, handleWordClick, handleExportSubtitle
  ]);
  
  return (
    <div className="linguaflow-subtitle-container">
      {/* 字幕控制栏 */}
      {showControls && subtitles.length > 0 && plugin && (
        <SubtitleControls
          currentCue={selectedCue || currentSubtitle}
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
      
      {/* 字幕列表 */}
      {showList && subtitles.length > 0 && (
        <div 
          className="linguaflow-subtitle-list"
          onMouseEnter={() => setIsHovering(true)}
          onMouseLeave={() => setIsHovering(false)}
          ref={resizeRef}
        >
          {useVirtualScroll && containerHeight > 0 ? (
            // 虚拟滚动模式（大量字幕或低性能设备）
            <AutoHeightVirtualScroll
              ref={virtualListRef}
              items={subtitles}
              estimatedItemHeight={80} // 预估每个字幕项高度
              containerHeight={containerHeight} // 动态容器高度
              overscan={5} // 上下各额外渲染5个项目
              renderItem={renderSubtitleItem}
              getItemKey={(cue) => cue.id}
              className="linguaflow-subtitle-items"
            />
          ) : (
            // 普通模式（少量字幕）
            <div 
              className="linguaflow-subtitle-items" 
              ref={listRef}
            >
              {subtitles.map((cue, index) => renderSubtitleItem(cue, index))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 格式化时间（分:秒）
 */
function formatTime(seconds: number): string {
	const mins = Math.floor(seconds / 60);
	const secs = Math.floor(seconds % 60);
	return `${mins}:${secs.toString().padStart(2, '0')}`;
}
