import { useState, useEffect, useCallback, useRef, RefObject } from 'react';

interface UseTTSPlayerProps {
  audioData: string | null; // Base64 encoded audio data
  volume: number;
  onPlaybackEnd?: () => void; // Optional callback when audio finishes naturally
  onPlaybackError?: (errorMsg: string) => void; // Optional callback on playback error
}

interface UseTTSPlayerReturn {
  play: () => void;
  pause: () => void;
  stop: () => void;
  isPlaying: boolean;
  error: string | null;
  audioRef: RefObject<HTMLAudioElement | null>; // Allow null in return type
}

function useTTSPlayer({
  audioData,
  volume,
  onPlaybackEnd,
  onPlaybackError,
}: UseTTSPlayerProps): UseTTSPlayerReturn {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [currentAudioSrc, setCurrentAudioSrc] = useState<string | null>(null);

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
      console.error('[useTTSPlayer] Audio Error:', errorMsg, audioElement.error);
      setError(errorMsg);
      setIsPlaying(false);
      onPlaybackError?.(errorMsg);
    },
    [onPlaybackError]
  );

  const play = useCallback(() => {
    // Log entry into the play function
    // console.log('[useTTSPlayer] play function called.'); // Cleaned up
    const audioElement = audioRef.current;

    // Derive the source directly from the prop for this check
    const latestSrc = audioData ? `data:audio/mp3;base64,${audioData}` : null;

    if (!audioElement || !latestSrc) {
      const msg = 'Audio element or source not available for playback.';
      // Simplified logging
      console.warn('[useTTSPlayer] Playback warning:', msg);
      setError(msg);
      onPlaybackError?.(msg);
      return;
    }

    // Use the derived latestSrc when setting/checking the element's source
    if (audioElement.src !== latestSrc) {
      // console.log('[useTTSPlayer] Setting audio element src'); // Cleaned up
      audioElement.src = latestSrc;
    }

    // Log volume just before attempting play
    // console.log(`[useTTSPlayer] Attempting play(). Volume: ${audioElement.volume}`); // Cleaned up

    // Reset error before attempting play
    setError(null);

    audioElement
      .play()
      .then(() => {
        setIsPlaying(true);
      })
      .catch((err) => {
        // Revert to simpler error logging
        const msg = 'Audio playback failed.';
        console.error('[useTTSPlayer] Error starting playback:', err);
        setError(msg);
        setIsPlaying(false);
        onPlaybackError?.(msg);
      });
  }, [audioData, onPlaybackError, currentAudioSrc]);

  const pause = useCallback(() => {
    const audioElement = audioRef.current;
    if (audioElement && isPlaying) {
      audioElement.pause();
      setIsPlaying(false);
    }
  }, [isPlaying]);

  const stop = useCallback(() => {
    const audioElement = audioRef.current;
    if (audioElement) {
      audioElement.pause();
      audioElement.currentTime = 0;
      // Don't reset src here, let the audioData useEffect handle it
      setIsPlaying(false);
      // Explicitly call onPlaybackEnd if defined, as 'ended' event won't fire
      // But only if it was actually playing to avoid redundant calls
      if (isPlaying) {
        handleEnded();
      }
    }
    // isPlaying dependency needed to ensure correct call to handleEnded
    // handleEnded dependency avoids potential stale closure
  }, [isPlaying, handleEnded]);

  // Effect to update audio source when audioData changes
  useEffect(() => {
    const newSrc = audioData ? `data:audio/mp3;base64,${audioData}` : null;
    setCurrentAudioSrc(newSrc);

    // If audio data changes while playing, stop playback
    if (isPlaying) {
      stop();
    }
    // Reset error when new audio comes in
    setError(null);
  }, [audioData, stop]); // Add stop dependency

  // Effect to handle setting volume
  useEffect(() => {
    const audioElement = audioRef.current;
    if (audioElement) {
      const clampedVolume = Math.max(0, Math.min(1, volume));
      audioElement.volume = clampedVolume;
    }
  }, [volume]);

  // Effect to attach/detach event listeners
  useEffect(() => {
    const audioElement = audioRef.current;
    if (!audioElement) return;

    audioElement.addEventListener('ended', handleEnded);
    audioElement.addEventListener('error', handleError);

    // Cleanup
    return () => {
      audioElement.removeEventListener('ended', handleEnded);
      audioElement.removeEventListener('error', handleError);
    };
  }, [handleEnded, handleError]);

  return { play, pause, stop, isPlaying, error, audioRef };
}

export default useTTSPlayer;
