import React, { useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Notice } from 'obsidian';
import type { PlayerRef, MediaSource, MediaType } from '../../types';
import { usePlaybackStore } from '../../store/playbackStore';
import { logger } from '../../utils';
import { t } from '../../i18n';

interface MediaPlayerProps {
  source: MediaSource;
  mediaType: MediaType;
  onReady?: () => void;
  onEnded?: () => void;
}

export const MediaPlayer = forwardRef<PlayerRef, MediaPlayerProps>(
  function MediaPlayer({ source, mediaType, onReady, onEnded }, ref) {
    const mediaRef = useRef<HTMLMediaElement>(null);
    const { setPlaying, setDuration } = usePlaybackStore.getState();
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
      getInternalPlayer: () => mediaRef.current,
    }), []);

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
    const handleLoadedMetadata = useCallback(() => {
      if (mediaRef.current) {
        setDuration(mediaRef.current.duration);
        onReady?.();
      }
    }, [setDuration, onReady]);
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
      new Notice(`LangPlayer: ${msg}`);
    }, [source.url]);

    const commonProps = {
      ref: mediaRef,
      src: source.url,
      onPlay: handlePlay,
      onPause: handlePause,
      onLoadedMetadata: handleLoadedMetadata,
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
