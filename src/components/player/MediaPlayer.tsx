import { useStoreApi } from '../../store/mediaSession';
import React, { useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import type { PlayerRef, MediaSource, MediaType } from '../../types';
import { usePlaybackStore } from '../../store/playbackStore';
import { logger } from '../../utils';
import { t } from '../../i18n';
import { Icon } from '../shared/Icon';

interface MediaPlayerProps {
  source: MediaSource;
  mediaType: MediaType;
  onReady?: () => void;
  onEnded?: () => void;
}

export const MediaPlayer = forwardRef<PlayerRef, MediaPlayerProps>(
  function MediaPlayer({ source, mediaType, onReady, onEnded }, ref) {
  const usePlaybackStoreApi = useStoreApi(usePlaybackStore);
    const mediaRef = useRef<HTMLMediaElement>(null);
    const { setPlaying, setDuration } = usePlaybackStoreApi.getState();
    const volume = usePlaybackStore((s) => s.volume);
    const playbackRate = usePlaybackStore((s) => s.playbackRate);

    // Expose PlayerRef API
    useImperativeHandle(ref, () => ({
      seekTo: (seconds: number) => {
        if (mediaRef.current) mediaRef.current.currentTime = seconds;
      },
      getCurrentTime: () => mediaRef.current?.currentTime ?? 0,
      getDuration: () => mediaRef.current?.duration ?? 0,
      getSecondsLoaded: () => {
        const el = mediaRef.current;
        if (!el || el.buffered.length === 0) return 0;
        return el.buffered.end(el.buffered.length - 1);
      },
      playVideo: () => {
      mediaRef.current?.play()?.catch((e: unknown) => {
        logger.warn('[MediaPlayer] play() rejected:', (e as Error).message);
      });
    },
      pauseVideo: () => { mediaRef.current?.pause(); },
      setPlaybackRate: (rate: number) => {
        if (mediaRef.current) mediaRef.current.playbackRate = rate;
      },
      setVolume: (volume: number) => {
        if (mediaRef.current) mediaRef.current.volume = volume;
      },
      reload: () => {
        const media = mediaRef.current;
        if (!media) return;
        usePlaybackStoreApi.getState().setPlaying(false);
        usePlaybackStoreApi.getState().setReadiness('loading');
        media.load();
      },
      getInternalPlayer: () => mediaRef.current,
    }), [usePlaybackStoreApi]);

    // Sync volume and rate
    useEffect(() => {
      if (mediaRef.current) mediaRef.current.volume = volume;
    }, [volume]);

    useEffect(() => {
      if (mediaRef.current) mediaRef.current.playbackRate = playbackRate;
    }, [playbackRate]);

    // Event handlers
    const handlePlay = useCallback(() => setPlaying(true), [setPlaying]);
    const handlePause = useCallback(() => setPlaying(false), [setPlaying]);
    const handleLoadStart = useCallback(() => {
      usePlaybackStoreApi.getState().setReadiness('loading');
    }, [usePlaybackStoreApi]);
    const handleLoadedMetadata = useCallback(() => {
      if (mediaRef.current) {
        setDuration(mediaRef.current.duration);
        onReady?.();
      }
    }, [setDuration, onReady]);
    const handleCanPlay = useCallback(() => {
      usePlaybackStoreApi.getState().setReadiness('ready');
    }, [usePlaybackStoreApi]);
    const handleWaiting = useCallback(() => {
      const current = usePlaybackStoreApi.getState().readiness;
      if (current !== 'error') usePlaybackStoreApi.getState().setReadiness('buffering');
    }, [usePlaybackStoreApi]);
    const handlePlaying = useCallback(() => {
      setPlaying(true);
      usePlaybackStoreApi.getState().setReadiness('ready');
    }, [setPlaying, usePlaybackStoreApi]);
    // NOTE: we deliberately do NOT wire the native `timeupdate` event.
    // `currentTime` has a single publisher — the throttled RAF loop in
    // useMediaSync — so the 0.1s publish throttle there isn't bypassed by an
    // unthrottled native handler (which caused redundant re-renders of every
    // currentTime subscriber).
    const handleEnded = useCallback(() => {
      setPlaying(false);
      onEnded?.();
    }, [setPlaying, onEnded]);

    const handleError = useCallback((e: React.SyntheticEvent<HTMLMediaElement>) => {
      const el = e.currentTarget;
      const err = el.error;
      let msg = t('notice.mediaPlaybackError');
      if (err) {
        switch (err.code) {
          case MediaError.MEDIA_ERR_ABORTED:        msg = t('notice.mediaErrAborted'); break;
          case MediaError.MEDIA_ERR_NETWORK:        msg = t('notice.mediaErrNetwork'); break;
          case MediaError.MEDIA_ERR_DECODE:         msg = t('notice.mediaErrDecode'); break;
          case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED: msg = t('notice.mediaErrSrcNotSupported'); break;
        }
      }
      logger.error('[MediaPlayer] error code', err?.code, '—', err?.message, '| url:', source.url);
      setPlaying(false);
      usePlaybackStoreApi.getState().setReadiness('error', msg);
    }, [setPlaying, source.url, usePlaybackStoreApi]);

    const commonProps = {
      ref: mediaRef,
      src: source.url,
      onPlay: handlePlay,
      onPause: handlePause,
      onLoadStart: handleLoadStart,
      onLoadedMetadata: handleLoadedMetadata,
      onCanPlay: handleCanPlay,
      onWaiting: handleWaiting,
      onStalled: handleWaiting,
      onPlaying: handlePlaying,
      onEnded: handleEnded,
      onError: handleError,
      preload: 'metadata' as const,
    };

    if (mediaType === 'audio') {
      return <audio {...commonProps} />;
    }

    return (
      <video
        {...(commonProps as React.VideoHTMLAttributes<HTMLVideoElement>)}
        className="lp-media-video"
      />
    );
  },
);

interface MediaPlaybackStatusProps {
  onRetry: () => void;
}

/** A compact status layer shared by video and audio layouts. */
export function MediaPlaybackStatus({ onRetry }: MediaPlaybackStatusProps) {
  const readiness = usePlaybackStore((state) => state.readiness);
  const errorMessage = usePlaybackStore((state) => state.errorMessage);

  if (readiness === 'idle' || readiness === 'ready') return null;

  if (readiness === 'error') {
    return (
      <div className="lp-media-status lp-media-status--error" role="alert" onClick={(event) => event.stopPropagation()}>
        <Icon name="alert-circle" size={18} />
        <span>{errorMessage ?? t('notice.mediaPlaybackError')}</span>
        <button type="button" className="lp-media-status-retry" onClick={(event) => {
          event.stopPropagation();
          onRetry();
        }}>
          <Icon name="refresh-cw" size={14} />
          {t('error.retry')}
        </button>
      </div>
    );
  }

  const buffering = readiness === 'buffering';
  return (
    <div className="lp-media-status" role="status" aria-live="polite" onClick={(event) => event.stopPropagation()}>
      <Icon name="loader" size={18} className="lp-media-status-spinner" />
      <span>{buffering ? t('player.bufferingMedia') : t('player.loadingMedia')}</span>
    </div>
  );
}
