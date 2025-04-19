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
  const audioRef = useRef<HTMLAudioElement | null>(null); // Initialize as null
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [currentAudioSrc, setCurrentAudioSrc] = useState<string | null>(null);
  // New state for autoplay trigger
  const [isReadyToPlay, setIsReadyToPlay] = useState(false);

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
    const audioElement = audioRef.current;
    const latestSrc = audioData ? `data:audio/mp3;base64,${audioData}` : null;

    if (!audioElement || !latestSrc) {
      const msg = 'Audio element or source not available for playback.';
      console.warn('[useTTSPlayer] Playback warning:', msg);
      setError(msg);
      onPlaybackError?.(msg);
      // Ensure isPlaying is false if we can't play
      setIsPlaying(false);
      return;
    }

    if (audioElement.src !== latestSrc) {
      audioElement.src = latestSrc;
    }

    setError(null);

    // Check if already playing before attempting to play
    if (!isPlaying) {
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
    }
  }, [audioData, onPlaybackError, isPlaying]); // Added isPlaying dependency

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

  // Effect to update audio source when audioData changes and trigger ready state
  useEffect(() => {
    const newSrc = audioData ? `data:audio/mp3;base64,${audioData}` : null;

    // Only update src and trigger play logic if the source actually changed
    if (newSrc !== currentAudioSrc) {
      setCurrentAudioSrc(newSrc);

      // If audio data changes while playing, stop playback
      if (isPlaying) {
        stop();
      }
      // Reset error when new audio comes in
      setError(null);

      // Set ready to play if we have a valid new source
      setIsReadyToPlay(!!newSrc);
    }
  }, [audioData, stop, isPlaying, currentAudioSrc]); // Added currentAudioSrc, isPlaying dependencies

  // Effect to handle actual autoplay when ready
  useEffect(() => {
    if (isReadyToPlay) {
      play();
      setIsReadyToPlay(false); // Reset trigger after attempting play
    }
  }, [isReadyToPlay, play]); // Dependencies: the trigger state and the play function

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
      // Check again in cleanup in case element was removed
      if (audioElement) {
        audioElement.removeEventListener('ended', handleEnded);
        audioElement.removeEventListener('error', handleError);
      }
    };
  }, [handleEnded, handleError]); // Removed dependency on audioRef.current

  // Effect to initialize audio element client-side
  useEffect(() => {
    if (!audioRef.current && typeof Audio !== 'undefined') {
      audioRef.current = new Audio();
    }
    // Optional: Cleanup ref if component unmounts, though useRef usually handles this
    // return () => { audioRef.current = null; };
  }, []);

  return { play, pause, stop, isPlaying, error, audioRef };
}

export default useTTSPlayer;
