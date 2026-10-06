import { useStoreApi } from '../store/mediaSession';
import { useCallback, useEffect, useRef } from 'react';
import { Notice } from 'obsidian';
import type { RecorderState } from '../types';
import { useRecordingStore } from '../store/recordingStore';
import { logger } from '../utils';
import { t } from '../i18n';

/**
 * Audio recorder with FSM state management and audio level monitoring.
 * State transitions: idle → preparing → recording → stopping → idle
 * Any state → error → idle
 */
export function useAudioRecorder() {
  const useRecordingStoreApi = useStoreApi(useRecordingStore);
  const stateRef = useRef<RecorderState>('idle');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const levelFrameRef = useRef<number>(0);
  const mountedRef = useRef(true);
  const generationRef = useRef(0);

  /**
   * Release recorder/analyser/audioCtx resources after each recording.
   * @param stopStream  true only on unmount — stops mic tracks so the OS indicator disappears.
   *                    false during normal stop — keeps the stream alive to avoid re-prompting.
   */
  const cleanup = useCallback((stopStream = false) => {
    // Stop level monitoring
    if (levelFrameRef.current) {
      window.cancelAnimationFrame(levelFrameRef.current);
      levelFrameRef.current = 0;
    }
    analyserRef.current = null;
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    // Only release mic tracks when explicitly requested (unmount)
    if (stopStream) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    recorderRef.current = null;
    chunksRef.current = [];
    useRecordingStoreApi.getState().setAudioLevel(0);
  }, []);

  const startLevelMonitoring = useCallback((stream: MediaStream) => {
    try {
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        // Compute RMS level 0–1
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i]! * dataArray[i]!;
        }
        const rms = Math.sqrt(sum / dataArray.length) / 255;
        useRecordingStoreApi.getState().setAudioLevel(rms);
        levelFrameRef.current = window.requestAnimationFrame(tick);
      };
      levelFrameRef.current = window.requestAnimationFrame(tick);
    } catch (e) {
      logger.warn('Audio level monitoring unavailable:', e);
    }
  }, []);

  const start = useCallback(async (): Promise<boolean> => {
    if (!mountedRef.current || stateRef.current !== 'idle') return false;
    const generation = ++generationRef.current;
    stateRef.current = 'preparing';
    useRecordingStoreApi.getState().setRecorderState('preparing');

    try {
      // Reuse existing stream if all tracks are still live — avoids repeated permission prompts
      const existingOk = streamRef.current?.getTracks().every((t) => t.readyState === 'live');
      if (!existingOk) {
        streamRef.current?.getTracks().forEach((t) => t.stop()); // release stale stream
        const acquired = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!mountedRef.current || generation !== generationRef.current) {
          acquired.getTracks().forEach(track => track.stop());
          return false;
        }
        streamRef.current = acquired;
      }
      const stream = streamRef.current!;

      // Start level monitoring
      startLevelMonitoring(stream);

      // Container fallback chain: webm/opus (Chromium desktop + Android) →
      // mp4/AAC (iOS WKWebView, which cannot record webm AT ALL — forcing
      // 'audio/webm' there throws NotSupportedError and recording never starts).
      // Last resort: let the engine pick its default container.
      const MIME_CANDIDATES = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4;codecs=mp4a.40.2',
        'audio/mp4',
      ];
      const mimeType = MIME_CANDIDATES.find((m) => {
        try { return MediaRecorder.isTypeSupported(m); } catch { return false; }
      });
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.start(100);
      stateRef.current = 'recording';
      useRecordingStoreApi.getState().setRecorderState('recording');
      return true;
    } catch (err) {
      if (!mountedRef.current || generation !== generationRef.current) return false;
      logger.error('Failed to start recording:', err);
      cleanup(true);
      stateRef.current = 'idle';
      useRecordingStoreApi.getState().setRecorderState('idle');
      return false;
    }
  }, [cleanup, startLevelMonitoring]);

  const stop = useCallback(async (): Promise<Blob | null> => {
    if (stateRef.current !== 'recording') return null;
    stateRef.current = 'stopping';
    useRecordingStoreApi.getState().setRecorderState('stopping');

    return new Promise((resolve) => {
      const recorder = recorderRef.current;
      if (!recorder) {
        cleanup();
        stateRef.current = 'idle';
        useRecordingStoreApi.getState().setRecorderState('idle');
        resolve(null);
        return;
      }

      let safetyTimer: number | null = null;

      recorder.onstop = () => {
        if (safetyTimer !== null) { window.clearTimeout(safetyTimer); safetyTimer = null; }
        const mime = recorder.mimeType;
        const blob = new Blob(chunksRef.current, { type: mime });
        cleanup();
        stateRef.current = 'idle';
        useRecordingStoreApi.getState().setRecorderState('idle');
        resolve(blob);
      };

      recorder.stop();

      // Safety timeout: some WebView MediaRecorder impls never fire onstop.
      // Surface the loss instead of dropping the recording silently.
      safetyTimer = window.setTimeout(() => {
        if (stateRef.current === 'stopping') {
          logger.warn('[useAudioRecorder] onstop did not fire within 3s — recording lost');
          new Notice(`Dashell Player: ${t('notice.recordingLost')}`);
          cleanup();
          stateRef.current = 'idle';
          useRecordingStoreApi.getState().setRecorderState('idle');
          resolve(null);
        }
      }, 3000);
    });
  }, [cleanup]);

  // Cleanup resources on unmount to prevent leaks — stop mic tracks so OS indicator goes away
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current++;
      if (recorderRef.current && recorderRef.current.state === 'recording') {
        recorderRef.current.stop();
      }
      cleanup(true); // stopStream=true: release mic on unmount
    };
  }, [cleanup]);

  return {
    start,
    stop,
    getState: () => stateRef.current,
    isRecording: () => stateRef.current === 'recording',
  };
}
