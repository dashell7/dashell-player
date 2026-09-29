import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SoundPatternCueProgress, SoundPatternProgressSnapshot } from '../../types';
import { usePlugin, useSettings } from '../../context';
import { useLoopStore } from '../../store/loopStore';
import { usePlaybackStore } from '../../store/playbackStore';
import { selectCurrentSubtitle, useSubtitleStore } from '../../store/subtitleStore';
import { useSoundPatternStore } from '../../store/soundPatternStore';
import {
  buildDictationMediaKey,
  buildSubtitleFingerprint,
  clampSoundPatternTarget,
  completeSoundPatternCue,
  emptySoundPatternCueProgress,
  incrementSoundPatternRepetition,
  isSoundPatternSnapshotCurrent,
  revealSoundPatternStage,
} from '../../utils';
import { generateChineseMeaning } from '../../services/AiMeaningService';
import { t } from '../../i18n';

function emptySnapshot(fingerprint: string): SoundPatternProgressSnapshot {
  return { subtitleFingerprint: fingerprint, cueProgress: {}, updatedAt: Date.now() };
}

export function SoundPatternPanel() {
  const plugin = usePlugin();
  const settings = useSettings();
  const subtitles = useSubtitleStore((s) => s.subtitles);
  const cue = useSubtitleStore(selectCurrentSubtitle);
  const activeIndex = useSubtitleStore((s) => s.activeIndex);
  const sourceUrl = usePlaybackStore((s) => s.source?.url ?? '');
  const player = usePlaybackStore((s) => s.playerRef);
  const playbackRate = usePlaybackStore((s) => s.playbackRate);
  const [snapshot, setSnapshot] = useState<SoundPatternProgressSnapshot>(() => emptySnapshot('empty'));
  const snapshotRef = useRef(snapshot);
  const [loadingMeaning, setLoadingMeaning] = useState(false);
  const [meaningError, setMeaningError] = useState('');
  const [progressSaveFailed, setProgressSaveFailed] = useState(false);
  const [progressSaving, setProgressSaving] = useState(false);
  const requestRef = useRef<AbortController | null>(null);
  const pendingSaveRef = useRef<SoundPatternProgressSnapshot | null>(null);
  const currentCueRef = useRef<string | undefined>(cue?.id);

  const fingerprint = useMemo(() => buildSubtitleFingerprint(subtitles), [subtitles]);
  const mediaKey = useMemo(
    () => buildDictationMediaKey(sourceUrl, fingerprint),
    [sourceUrl, fingerprint],
  );
  const target = clampSoundPatternTarget(settings.soundPattern?.repetitionTarget);
  const progress = cue ? snapshot.cueProgress[cue.id] ?? emptySoundPatternCueProgress() : null;
  const sourceText = cue?.textEn?.trim() || cue?.text.trim() || '';
  const subtitleMeaning = cue?.textZh?.trim() || '';
  const visibleMeaning = progress?.meaning || subtitleMeaning;

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  const cancelMeaningRequest = useCallback(() => {
    requestRef.current?.abort();
    requestRef.current = null;
    useSoundPatternStore.getState().nextRequestGeneration();
    setLoadingMeaning(false);
  }, []);

  useEffect(() => {
    const saved = plugin.getSoundPatternProgress(mediaKey);
    setSnapshot(isSoundPatternSnapshotCurrent(fingerprint, saved) ? saved! : emptySnapshot(fingerprint));
    setMeaningError('');
    pendingSaveRef.current = null;
    setProgressSaveFailed(false);
    setProgressSaving(false);
    cancelMeaningRequest();
  }, [cancelMeaningRequest, fingerprint, mediaKey, plugin]);

  useEffect(() => {
    useSoundPatternStore.getState().setOpen(true);
    useSubtitleStore.getState().setPracticeMode('soundPattern');
    return () => {
      cancelMeaningRequest();
      useLoopStore.getState().exitMode();
      useSoundPatternStore.getState().setOpen(false);
      useSubtitleStore.getState().clearPracticeMode('soundPattern');
    };
  }, [cancelMeaningRequest]);

  useEffect(() => {
    if (currentCueRef.current !== cue?.id) {
      currentCueRef.current = cue?.id;
      cancelMeaningRequest();
      setMeaningError('');
    }
  }, [cancelMeaningRequest, cue?.id]);

  const saveProgress = useCallback(async (
    cueId: string,
    update: (current: SoundPatternCueProgress) => SoundPatternCueProgress,
  ) => {
    const currentSnapshot = snapshotRef.current;
    const next = update(currentSnapshot.cueProgress[cueId] ?? emptySoundPatternCueProgress());
    const nextSnapshot: SoundPatternProgressSnapshot = {
      subtitleFingerprint: fingerprint,
      cueProgress: { ...currentSnapshot.cueProgress, [cueId]: next },
      lastCueId: cueId,
      updatedAt: Date.now(),
    };
    snapshotRef.current = nextSnapshot;
    setSnapshot(nextSnapshot);
    pendingSaveRef.current = nextSnapshot;
    setProgressSaving(true);
    setProgressSaveFailed(false);
    try {
      await plugin.setSoundPatternProgress(mediaKey, nextSnapshot);
      if (pendingSaveRef.current === nextSnapshot) {
        pendingSaveRef.current = null;
        setProgressSaving(false);
      }
    } catch {
      if (pendingSaveRef.current === nextSnapshot) {
        setProgressSaving(false);
        setProgressSaveFailed(true);
      }
    }
  }, [fingerprint, mediaKey, plugin]);

  const retryProgressSave = useCallback(() => {
    const pending = pendingSaveRef.current;
    if (!pending || progressSaving) return;
    setProgressSaving(true);
    void plugin.setSoundPatternProgress(mediaKey, pending).then(() => {
      if (pendingSaveRef.current === pending) {
        pendingSaveRef.current = null;
        setProgressSaving(false);
        setProgressSaveFailed(false);
      }
    }).catch(() => {
      if (pendingSaveRef.current === pending) {
        setProgressSaving(false);
        setProgressSaveFailed(true);
      }
    });
  }, [mediaKey, plugin, progressSaving]);

  const replay = useCallback(() => {
    if (!cue || !player) return;
    const offset = useSubtitleStore.getState().offset;
    useLoopStore.getState().enterMode({ type: 'segmentPlay', end: cue.end });
    player.seekTo(Math.max(0, cue.start + offset), 'seconds');
    player.playVideo();
  }, [cue, player]);

  const setRate = useCallback((rate: number) => {
    usePlaybackStore.getState().setPlaybackRate(rate);
    usePlaybackStore.getState().playerRef?.setPlaybackRate(rate);
  }, []);

  const countImitation = useCallback(() => {
    if (!cue) return;
    void saveProgress(cue.id, (current) => incrementSoundPatternRepetition(current, target));
  }, [cue, saveProgress, target]);

  const revealMeaning = useCallback(() => {
    if (!cue) return;
    void saveProgress(cue.id, (current) => revealSoundPatternStage(current, 'meaning', target));
  }, [cue, saveProgress, target]);

  const revealText = useCallback(() => {
    if (!cue) return;
    void saveProgress(cue.id, (current) => revealSoundPatternStage(current, 'text', target));
  }, [cue, saveProgress, target]);

  const completeAndNext = useCallback(() => {
    if (!cue) return;
    void saveProgress(cue.id, (current) => completeSoundPatternCue(current));
    const nextIndex = activeIndex + 1;
    if (nextIndex >= 0 && nextIndex < subtitles.length) {
      cancelMeaningRequest();
      useSubtitleStore.getState().setActiveIndex(nextIndex);
    }
  }, [activeIndex, cancelMeaningRequest, cue, saveProgress, subtitles.length]);

  const generateMeaning = useCallback(async () => {
    if (!cue || !sourceText || loadingMeaning) return;
    cancelMeaningRequest();
    const controller = new AbortController();
    requestRef.current = controller;
    const generation = useSoundPatternStore.getState().nextRequestGeneration();
    setLoadingMeaning(true);
    setMeaningError('');
    try {
      const meaning = await generateChineseMeaning(
        settings.aiMeaning,
        plugin.getAiMeaningApiKey(),
        sourceText,
        controller.signal,
      );
      if (controller.signal.aborted || useSoundPatternStore.getState().requestGeneration !== generation) return;
      if (selectCurrentSubtitle(useSubtitleStore.getState())?.id !== cue.id) return;
      await saveProgress(cue.id, (current) => ({ ...current, meaning, updatedAt: Date.now() }));
    } catch (error) {
      if (!controller.signal.aborted) setMeaningError(error instanceof Error ? error.message : t('soundPattern.meaningFailed'));
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
      if (!controller.signal.aborted) setLoadingMeaning(false);
    }
  }, [cancelMeaningRequest, cue, loadingMeaning, plugin, saveProgress, settings.aiMeaning, sourceText]);

  if (!player) {
    return <div className="lp-sound-pattern lp-sound-pattern--empty">{t('soundPattern.noPlayer')}</div>;
  }
  if (!cue || !sourceText) {
    return <div className="lp-sound-pattern lp-sound-pattern--empty">{t('soundPattern.noCue')}</div>;
  }

  const atLastCue = activeIndex >= subtitles.length - 1;
  return (
    <div className="lp-sound-pattern">
      <div className="lp-sound-pattern-head">
        <div>{t('soundPattern.title')}</div>
        <span>{Math.max(0, activeIndex + 1)}/{subtitles.length}</span>
      </div>

      <div className="lp-sound-pattern-stage">
        {progressSaveFailed && (
          <div className="lp-sound-pattern-error" role="alert">
            <span>{t('soundPattern.progressSaveFailed')}</span>
            <button className="lp-btn" onClick={retryProgressSave} disabled={progressSaving}>
              {progressSaving ? t('soundPattern.savingProgress') : t('soundPattern.retryProgressSave')}
            </button>
          </div>
        )}
        {progress?.stage === 'imitate' && (
          <>
            <div className="lp-sound-pattern-count">{progress.repetitions}/{target}</div>
            <div className="lp-sound-pattern-muted">{t('soundPattern.imitateHint')}</div>
            <div className="lp-sound-pattern-actions">
              <button className="lp-btn" onClick={replay}>{t('soundPattern.play')}</button>
              <button className="lp-btn lp-btn-primary" onClick={countImitation}>{t('soundPattern.countOne')}</button>
            </div>
            <div className="lp-sound-pattern-rates">
              {[0.5, 0.75, 1].map((rate) => (
                <button key={rate} className={`lp-btn${playbackRate === rate ? ' lp-btn-primary' : ''}`} onClick={() => setRate(rate)}>{rate}x</button>
              ))}
            </div>
            <button className="lp-sound-pattern-link" onClick={revealMeaning}>{t('soundPattern.revealEarly')}</button>
          </>
        )}

        {(progress?.stage === 'meaning' || progress?.stage === 'text' || progress?.stage === 'completed') && (
          <>
            <div className="lp-sound-pattern-label">{t('soundPattern.meaning')}</div>
            {visibleMeaning ? (
              <div className="lp-sound-pattern-meaning">{visibleMeaning}</div>
            ) : (
              <div className="lp-sound-pattern-actions">
                <button className="lp-btn lp-btn-primary" disabled={!settings.aiMeaning.enabled || loadingMeaning} onClick={() => void generateMeaning()}>
                  {loadingMeaning ? t('soundPattern.generating') : t('soundPattern.generateMeaning')}
                </button>
                {!settings.aiMeaning.enabled && <span className="lp-sound-pattern-muted">{t('soundPattern.aiNotConfigured')}</span>}
              </div>
            )}
            {meaningError && <div className="lp-sound-pattern-error">{meaningError}</div>}
            {progress?.stage === 'meaning' && visibleMeaning && (
              <button className="lp-btn lp-btn-primary" onClick={revealText}>{t('soundPattern.revealText')}</button>
            )}
          </>
        )}

        {(progress?.stage === 'text' || progress?.stage === 'completed') && (
          <>
            <div className="lp-sound-pattern-label">{t('soundPattern.original')}</div>
            <div className="lp-sound-pattern-text">{sourceText}</div>
            {progress?.stage === 'text' && (
              <button className="lp-btn lp-btn-primary" onClick={completeAndNext}>
                {atLastCue ? t('soundPattern.complete') : t('soundPattern.completeNext')}
              </button>
            )}
          </>
        )}

        {progress?.stage === 'completed' && (
          <button className="lp-btn" disabled={atLastCue} onClick={completeAndNext}>{t('soundPattern.next')}</button>
        )}
      </div>
    </div>
  );
}
