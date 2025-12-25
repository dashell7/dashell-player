import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Notice } from 'obsidian';
import { useMediaStore, selectCurrentSubtitle } from '../store/mediaStore';
import type { SubtitleCue, PlayerRef } from '../types';
import type { UseRecordingSessionReturn } from '../hooks/useRecordingSession';
import type LinguaFlowPlugin from '../main';
import { SubtitleControls } from './SubtitleControls';
import { ClickableText } from './OptimizedWord';

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
  activeWordIndex: number;
  onSubtitleClick: (cue: SubtitleCue) => void;
  onSubtitleDblClick: (cue: SubtitleCue) => void;
  onWordClick: (word: string, e: React.MouseEvent) => void;
  activeItemRef?: React.RefObject<HTMLDivElement>;
}

const SubtitleItem = React.memo<SubtitleItemProps>(({ 
  cue, 
  index, 
  isActive,
  isLooping,
  isRecording,
  isSelected,
  showEnglish,
  showChinese,
  showIndexAndTime,
  activeWordIndex,
  onSubtitleClick,
  onSubtitleDblClick,
  onWordClick,
  activeItemRef
}) => {
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // 使用优化的 ClickableText 组件

  return (
    <div
      ref={isActive ? activeItemRef : null}
      className={`linguaflow-subtitle-item ${
        isActive ? 'active' : ''
      } ${isLooping ? 'looping' : ''} ${isRecording ? 'recording' : ''} ${isSelected ? 'selected' : ''}`}
      onClick={() => onSubtitleClick(cue)}
      onDoubleClick={() => onSubtitleDblClick(cue)}
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
        {cue.textEn && showEnglish && (
          <div className="linguaflow-subtitle-item-en">
            <ClickableText
              text={cue.textEn}
              isActive={isActive}
              activeWordIndex={activeWordIndex}
              onWordClick={onWordClick}
            />
          </div>
        )}
        {cue.textZh && showChinese && (
          <div className="linguaflow-subtitle-item-zh">{cue.textZh}</div>
        )}
        {!cue.textEn && !cue.textZh && (
          <div className="linguaflow-subtitle-item-main">
            <ClickableText
              text={cue.text}
              isActive={isActive}
              activeWordIndex={activeWordIndex}
              onWordClick={onWordClick}
            />
          </div>
        )}
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
  
  // 只订阅需要的字段，避免不必要的重渲染
  const showEnglish = useMediaStore(state => state.subtitleConfig.showEnglish);
  const showChinese = useMediaStore(state => state.subtitleConfig.showChinese);
  const showIndexAndTime = useMediaStore(state => state.subtitleConfig.showIndexAndTime);
  
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
  
  // 选中的字幕（用于控制栏）
  const [selectedCue, setSelectedCue] = useState<SubtitleCue | null>(null);
  // 是否手动锁定选择（用户点击选中后锁定，不自动跟随播放）
  const [isManuallyLocked, setIsManuallyLocked] = useState(false);
  
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
    
    // 只在未手动锁定时自动滚动
    if (!isManuallyLocked && activeItemRef.current && listRef.current) {
      const container = listRef.current;
      const item = activeItemRef.current;
      
      // 获取单个字幕项的高度
      const itemHeight = item.offsetHeight;
      
      // 修正：要显示在第二行，意味着我们需要滚动到"上一条字幕"的顶部位置
      // 如果没有上一条（第一句），就滚动到0
      
      let targetScrollTop = 0;
      
      // 尝试获取上一条字幕元素
      const prevItem = item.previousElementSibling as HTMLElement;
      
      if (prevItem) {
        // 如果有上一条，滚动到上一条的顶部
        // 这样上一条会在第一行，当前条就在第二行
        targetScrollTop = prevItem.offsetTop;
      } else {
        // 如果是第一条，滚动到顶部
        targetScrollTop = 0;
      }
      
      // console.log('[SubtitleOverlay] 🎯 Scrolling to Second Line:', { targetScrollTop });
      
      // 平滑滚动到目标位置
      container.scrollTo({
        top: targetScrollTop,
        behavior: 'smooth'
      });
    }
  }, [activeIndex, isManuallyLocked, segmentLoopEnabled]); // 添加 segmentLoopEnabled 依赖
  
  // 处理字幕点击 - 选中字幕（使用 useCallback 优化）
  const handleSubtitleClick = useCallback((cue: SubtitleCue) => {
    console.log('[SubtitleOverlay] Click - Select:', cue.start);
    
    // 如果点击的是当前选中的字幕，或者是当前播放的字幕，则解锁（跟随播放）
    if (selectedCue?.id === cue.id || currentSubtitle?.id === cue.id) {
      setIsManuallyLocked(false);
      console.log('[SubtitleOverlay] Unlocked - Will follow current subtitle');
    } else {
      // 否则锁定到点击的字幕
      setSelectedCue(cue);
      setIsManuallyLocked(true);
      console.log('[SubtitleOverlay] Locked to:', cue.start);
    }
  }, [selectedCue?.id, currentSubtitle?.id]);
  
  // 处理字幕双击 - 跳转播放并解锁（使用 useCallback 优化）
  const handleSubtitleDblClick = useCallback((cue: SubtitleCue) => {
    console.log('[SubtitleOverlay] Double Click - Jump to:', cue.start);
    setSelectedCue(cue);
    setIsManuallyLocked(false); // 双击后解锁，跟随播放
    if (playerRef.current) {
      playerRef.current.seekTo(cue.start);
      console.log('[SubtitleOverlay] Seeked to:', cue.start);
    } else {
      console.warn('[SubtitleOverlay] Player ref is null');
    }
  }, [playerRef]);
  
  // 处理字幕双击 - 单句播放
  const handleSubtitleDoubleClick = (cue: SubtitleCue) => {
    console.log('[SubtitleOverlay] Double click - Play segment');
    handlePlaySegment(cue);
  };
  
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
    
    // 清理单词（去除标点符号）
    const cleanWord = word.replace(/[.,;:!?'"()[\]{}]/g, '').trim();
    if (!cleanWord) return;
    
    console.log('[SubtitleOverlay] Word clicked:', cleanWord);
    
    if (!plugin) {
      new Notice('插件未初始化');
      return;
    }
    
    const app = (plugin as any).app;
    if (!app) {
      new Notice('无法访问 Obsidian App');
      return;
    }
    
    try {
      // 将单词复制到剪贴板（始终执行，作为后备）
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(cleanWord);
        console.log('[SubtitleOverlay] Word copied to clipboard:', cleanWord);
      }
      
      // 查找 obsidian-language-learner 插件
      const installedPlugins = app.plugins?.plugins;
      const languageLearnerPlugin = installedPlugins?.['obsidian-language-learner'];
      
      if (!languageLearnerPlugin) {
        new Notice('未找到 Language Learner 插件，请确保已安装并启用');
        console.warn('[SubtitleOverlay] obsidian-language-learner plugin not found');
        console.log('[SubtitleOverlay] Available plugins:', Object.keys(installedPlugins || {}));
        return;
      }
      
      console.log('[SubtitleOverlay] Found obsidian-language-learner plugin');
      
      // 检查插件是否已启用
      if (!app.plugins?.enabledPlugins?.has?.('obsidian-language-learner')) {
        new Notice('Language Learner 插件未启用，请在设置中启用该插件');
        return;
      }
      
      // 根据设置决定是否打开录入面板
      const openPanel = plugin.settings.openLanguageLearnerPanel;
      const target = e.target as HTMLElement;
      
      console.log('[SubtitleOverlay] Calling queryWord, openPanel:', openPanel);
      
      if (typeof languageLearnerPlugin.queryWord === 'function') {
        if (openPanel) {
          // 传递 target 参数，打开录入面板并填充例句
          // Language Learner 会通过 target.parentElement 找到 .stns 元素并获取句子
          languageLearnerPlugin.queryWord(cleanWord, target);
          new Notice(`查询: ${cleanWord} (已打开录入面板)`);
        } else {
          // 不传递 target 参数，仅显示查词结果
          languageLearnerPlugin.queryWord(cleanWord);
          new Notice(`查询: ${cleanWord}`);
        }
      } else {
        new Notice('Language Learner 插件的 queryWord 方法不可用');
      }
      
    } catch (error) {
      console.error('[SubtitleOverlay] Error looking up word:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      new Notice('查词失败: ' + errorMessage);
    }
  }, [plugin]);
  
  // 将文本渲染为可点击的单词（带高亮）
  const renderClickableText = (text: string, isCurrentSubtitle: boolean = false, currentWordIndex: number = -1) => {
    // 按空格和标点符号分割，但保留标点
    const tokens = text.split(/(\s+|[.,;:!?'"()[\]{}])/);
    
    // 跟踪单词计数（只计数真实单词，不包括空格和标点）
    let wordCount = 0;
    
    return (
      <div className="stns">
        {tokens.map((token, index) => {
          // 如果是空白或标点，直接显示
          if (/^\s+$/.test(token) || /^[.,;:!?'"()[\]{}]$/.test(token)) {
            return <span key={index}>{token}</span>;
          }
          
          // 如果是单词，添加点击事件和可能的高亮
          if (token.trim()) {
            const thisWordIndex = wordCount;
            wordCount++;
            
            // 判断是否应该高亮：必须是当前字幕，并且单词索引匹配
            const shouldHighlight = isCurrentSubtitle && currentWordIndex === thisWordIndex;
            
            return (
              <span
                key={index}
                className={`linguaflow-clickable-word ${shouldHighlight ? 'linguaflow-word-highlight' : ''}`}
                onClick={(e) => handleWordClick(token, e)}
                title={`查询: ${token}`}
              >
                {token}
              </span>
            );
          }
          
          return null;
        })}
      </div>
    );
  };
  
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
          onTogglePlay={() => {
            if (playerRef.current) {
              if (isPlaying) {
                playerRef.current.pauseVideo();
                setPlaying(false);
              } else {
                playerRef.current.playVideo();
                setPlaying(true);
              }
            }
          }}
          onToggleLoop={() => {
            const cue = selectedCue || currentSubtitle;
            if (cue) {
              handleSegmentLoop(cue);
            }
          }}
          onExitLoop={() => handleStopLoop()}
          onRecord={() => {
            const cue = selectedCue || currentSubtitle;
            if (cue && recordingSession) {
              handleRecordSegment(cue);
            }
          }}
          onRateChange={(rate) => {
            setPlaybackRate(rate);
            if (playerRef.current) {
              playerRef.current.setPlaybackRate(rate);
            }
          }}
          onUnlock={() => setIsManuallyLocked(false)}
        />
      )}
      
      {/* 字幕列表 */}
      {showList && subtitles.length > 0 && (
        <div className="linguaflow-subtitle-list">
          <div className="linguaflow-subtitle-items" ref={listRef}>
            {subtitles.map((cue, index) => {
              const isLoopingThis = segmentLoopEnabled && 
                loopStart === cue.start && 
                loopEnd === cue.end;

              // 判断是否正在录制此句
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
                  activeWordIndex={index === activeIndex ? activeWordIndex : -1}
                  onSubtitleClick={handleSubtitleClick}
                  onSubtitleDblClick={handleSubtitleDblClick}
                  onWordClick={handleWordClick}
                  activeItemRef={activeItemRef}
                />
              );
            })}
          </div>
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
