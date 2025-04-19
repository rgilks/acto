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
  const [currentAudioSrc, setCurrentAudioSrc] = useState<string | null>(null);
  const [isAudioInitialized, setIsAudioInitialized] = useState<boolean>(false);

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    setError(null);
    onPlaybackEnd?.();
  }, [onPlaybackEnd]);

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
    const latestSrc = audioData ? `data:audio/mp3;base64,${audioData}` : null;

    if (!audioElement || !latestSrc) {
      const msg = 'Audio element or source not available for playback.';
      setError(msg);
      onPlaybackError?.(msg);
      setIsPlaying(false);
      return;
    }

    if (audioElement.src !== latestSrc) {
      audioElement.src = latestSrc;
    }

    setError(null);

    if (audioElement.paused && !isPlaying) {
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
  }, [audioData, onPlaybackError, audioRef]);

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
      const wasPlaying = isPlaying;
      setIsPlaying(false);
      if (wasPlaying) {
        handleEnded();
      }
    }
  }, [isPlaying, handleEnded, audioRef]);

  useEffect(() => {
    const newSrc = audioData ? `data:audio/mp3;base64,${audioData}` : null;

    if (newSrc !== currentAudioSrc) {
      setCurrentAudioSrc(newSrc);

      const audioElement = audioRef.current;
      if (audioElement) {
        if (!audioElement.paused || isPlaying) {
          stop();
        }
        audioElement.src = newSrc ?? '';
      }

      setError(null);
    }
  }, [audioData, currentAudioSrc, audioRef, stop, isPlaying]);

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

    return () => {
      const currentAudioElement = audioRef.current;
      if (currentAudioElement) {
        currentAudioElement.removeEventListener('ended', handleEnded);
        currentAudioElement.removeEventListener('error', handleError);
      }
    };
  }, [handleEnded, handleError, isAudioInitialized]);

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
