import { useState, useCallback, useRef, useEffect } from 'react';
import useTTSPlayer from '@/hooks/useTTSPlayer';

interface UseStoryAudioProps {
  audioData: string | null;
  volume: number;
  // Callback to signal when choices should potentially be shown
  onTriggerShowChoices: () => void;
  // Callback to be called when audio starts playing (e.g., to cancel timeouts)
  onAudioPlay?: () => void;
  // Indicate if this is the very first node being loaded
  isFirstNodeLoading: boolean;
}

export function useStoryAudio({
  audioData,
  volume,
  onTriggerShowChoices,
  onAudioPlay,
  isFirstNodeLoading,
}: UseStoryAudioProps) {
  const [userPaused, setUserPaused] = useState<boolean>(false);
  // State to track if TTS has finished or failed, used to trigger showing choices
  const [playbackFinishedOrFailed, setPlaybackFinishedOrFailed] = useState(false);

  // Timeout ref to manage showing choices when no audio is detected
  const showChoicesTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handlePlaybackEnd = useCallback(() => {
    setPlaybackFinishedOrFailed(true);
    setUserPaused(false); // Audio ended naturally
    onTriggerShowChoices();
  }, [onTriggerShowChoices]);

  const handlePlaybackError = useCallback(
    (_errorMsg: string) => {
      setPlaybackFinishedOrFailed(true);
      setUserPaused(false); // Audio error
      onTriggerShowChoices();
    },
    [onTriggerShowChoices]
  );

  const {
    play: playTTS,
    pause: pauseTTS,
    isPlaying: isTTSPlaying,
    error: ttsPlayerError,
    audioRef: ttsAudioRef,
  } = useTTSPlayer({
    audioData: audioData,
    volume: volume,
    onPlaybackEnd: handlePlaybackEnd,
    onPlaybackError: handlePlaybackError,
  });

  // Effect to handle setting initial pause state and resetting flags
  useEffect(() => {
    // Pause only if it's the first node and has audio
    setUserPaused(isFirstNodeLoading && !!audioData);
    // Reset playback finished state for the new node
    setPlaybackFinishedOrFailed(false);
    // Clear any pending timeout for showing choices
    if (showChoicesTimeoutRef.current) {
      clearTimeout(showChoicesTimeoutRef.current);
      showChoicesTimeoutRef.current = null;
    }
  }, [audioData, isFirstNodeLoading]); // Re-run when audio data or first node status changes

  // Effect to control showing choices based on audio state
  useEffect(() => {
    // Clear any existing timeout
    if (showChoicesTimeoutRef.current) {
      clearTimeout(showChoicesTimeoutRef.current);
      showChoicesTimeoutRef.current = null;
    }

    if (playbackFinishedOrFailed) {
      // If playback finished or failed, trigger immediately
      // (Handled by onPlaybackEnd/onPlaybackError now)
      // console.log('[useStoryAudio] Triggering show choices (playback finished/failed).');
      // onTriggerShowChoices();
    } else if (!audioData) {
      // If no audio data, set a timeout to show choices
      console.log('[useStoryAudio] No audio detected, setting timeout to show choices.');
      showChoicesTimeoutRef.current = setTimeout(() => {
        console.log('[useStoryAudio] Triggering show choices (timeout after no audio).');
        onTriggerShowChoices();
      }, 150); // Short delay
    }

    // Cleanup timeout on unmount or dependency change
    return () => {
      if (showChoicesTimeoutRef.current) {
        clearTimeout(showChoicesTimeoutRef.current);
        showChoicesTimeoutRef.current = null;
      }
    };
    // Re-run when these states change
  }, [playbackFinishedOrFailed, audioData, onTriggerShowChoices]);

  // Effect to cancel the 'show choices' timeout if audio starts playing
  useEffect(() => {
    if (isTTSPlaying) {
      if (showChoicesTimeoutRef.current) {
        console.log('[useStoryAudio] Audio started, cancelling show choices timeout.');
        clearTimeout(showChoicesTimeoutRef.current);
        showChoicesTimeoutRef.current = null;
      }
      // Optional: call the onAudioPlay callback if provided
      onAudioPlay?.();
    }
  }, [isTTSPlaying, onAudioPlay]);

  const togglePlayPause = useCallback(() => {
    if (isTTSPlaying) {
      pauseTTS();
      setUserPaused(true); // User explicitly paused
    } else if (audioData) {
      // Only attempt to play if there is audio data
      playTTS();
      setUserPaused(false); // User explicitly played
    }
  }, [isTTSPlaying, pauseTTS, playTTS, audioData]);

  // Return necessary states and functions
  return {
    userPaused,
    setUserPaused, // May still need direct setting in some cases (like hydration)
    isTTSPlaying,
    ttsPlayerError,
    ttsAudioRef,
    togglePlayPause,
    playTTS, // Expose playTTS for specific cases (like image load)
    pauseTTS,
  };
}
