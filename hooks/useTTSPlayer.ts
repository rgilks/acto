import { useState, useEffect, useCallback, useRef, RefObject } from 'react';

interface UseTTSPlayerProps {
  audioData: string | null;
  volume: number;
  onPlaybackEnd?: () => void;
  onPlaybackError?: (errorMsg: string) => void;
}

interface UseTTSPlayerReturn {
  play: () => void;
  pause: () => void;
  stop: () => void;
  isPlaying: boolean;
  error: string | null;
  audioRef: RefObject<HTMLAudioElement | null>;
}

function useTTSPlayer({
  audioData,
  volume,
  onPlaybackEnd,
  onPlaybackError,
}: UseTTSPlayerProps): UseTTSPlayerReturn {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const audioSrcRef = useRef<string | null>(null);
  const [isAudioInitialized, setIsAudioInitialized] = useState<boolean>(false);

  const handleEnded = useCallback(() => {
    if (!isPlaying) return;
    setIsPlaying(false);
    setError(null);
    onPlaybackEnd?.();
  }, [onPlaybackEnd, isPlaying]);

  const handleTimeUpdate = useCallback(
    (event: Event) => {
      const audioElement = event.target as HTMLAudioElement;
      if (audioElement.duration > 0 && audioElement.currentTime >= audioElement.duration) {
        handleEnded();
      }
    },
    [handleEnded]
  );

  const handleError = useCallback(
    (event: Event) => {
      const audioElement = event.target as HTMLAudioElement;
      let errorMsg = 'An unknown audio error occurred.';
      if (audioElement.error) {
        switch (audioElement.error.code) {
          case MediaError.MEDIA_ERR_ABORTED:
            errorMsg = 'Audio playback was aborted.';
            break;
          case MediaError.MEDIA_ERR_NETWORK:
            errorMsg = 'A network error caused audio download to fail.';
            break;
          case MediaError.MEDIA_ERR_DECODE:
            errorMsg = 'Audio decoding failed.';
            break;
          case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
            errorMsg = 'Audio source not supported.';
            break;
          default:
            errorMsg = `Audio error code: ${audioElement.error.code}`;
        }
      }
      setError(errorMsg);
      setIsPlaying(false);
      onPlaybackError?.(errorMsg);
    },
    [onPlaybackError]
  );

  const play = useCallback(() => {
    const audioElement = audioRef.current;
    const latestSrc = audioSrcRef.current;

    if (!audioElement || !latestSrc) {
      const msg = 'Audio element or source not available for playback.';
      console.warn('[useTTSPlayer] Playback failed:', msg);
      setError(msg);
      onPlaybackError?.(msg);
      setIsPlaying(false);
      return;
    }

    if (audioElement.src !== latestSrc) {
      console.log('[useTTSPlayer] Setting audio src before play.');
      audioElement.src = latestSrc;
    }

    setError(null);

    if (audioElement.paused || !isPlaying) {
      console.log('[useTTSPlayer] Attempting to play...');
      audioElement
        .play()
        .then(() => {
          setIsPlaying(true);
        })
        .catch(() => {
          const msg = 'Audio playback failed.';
          setError(msg);
          setIsPlaying(false);
          onPlaybackError?.(msg);
        });
    }
  }, [isPlaying, audioRef, onPlaybackError]);

  const pause = useCallback(() => {
    const audioElement = audioRef.current;
    if (audioElement && isPlaying) {
      audioElement.pause();
      setIsPlaying(false);
    }
  }, [isPlaying, audioRef]);

  const stop = useCallback(() => {
    const audioElement = audioRef.current;
    if (audioElement) {
      audioElement.pause();
      audioElement.currentTime = 0;
      audioElement.src = '';
      const wasPlaying = isPlaying;
      setIsPlaying(false);
      if (wasPlaying) {
        handleEnded();
      }
    }
  }, [isPlaying, handleEnded, audioRef]);

  useEffect(() => {
    const newSrc = audioData ? `data:audio/mp3;base64,${audioData}` : null;

    if (newSrc !== audioSrcRef.current) {
      console.log('[useTTSPlayer] Audio data changed, updating src ref.');
      audioSrcRef.current = newSrc;

      if (isPlaying) {
        console.log('[useTTSPlayer] Stopping playback due to source change.');
        stop();
      }

      if (newSrc === null && audioRef.current) {
        audioRef.current.src = '';
      }

      setError(null);
    }
  }, [audioData, isPlaying, stop]);

  useEffect(() => {
    const audioElement = audioRef.current;
    if (audioElement) {
      const clampedVolume = Math.max(0, Math.min(1, volume));
      audioElement.volume = clampedVolume;
    }
  }, [volume, audioRef]);

  useEffect(() => {
    const audioElement = audioRef.current;
    if (!audioElement) {
      return;
    }

    audioElement.addEventListener('ended', handleEnded);
    audioElement.addEventListener('error', handleError);
    audioElement.addEventListener('timeupdate', handleTimeUpdate);

    return () => {
      const currentAudioElement = audioRef.current;
      if (currentAudioElement) {
        currentAudioElement.removeEventListener('ended', handleEnded);
        currentAudioElement.removeEventListener('error', handleError);
        currentAudioElement.removeEventListener('timeupdate', handleTimeUpdate);
      }
    };
  }, [handleEnded, handleError, handleTimeUpdate, isAudioInitialized]);

  useEffect(() => {
    if (!audioRef.current && typeof Audio !== 'undefined') {
      audioRef.current = new Audio();
      audioRef.current.volume = Math.max(0, Math.min(1, volume));
      setIsAudioInitialized(true);
    }
  }, [volume]);

  return { play, pause, stop, isPlaying, error, audioRef };
}

export default useTTSPlayer;
