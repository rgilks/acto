import { useEffect, useCallback } from 'react';
import { type FullScreenHandle } from 'react-full-screen';
import { type StoryScene, type StoryChoice } from '@/lib/domain/schemas';

interface UseStoryKeyboardShortcutsProps {
  fullscreenHandle: FullScreenHandle;
  showChoices: boolean;
  displayNode: StoryScene | null;
  focusedChoiceIndex: number | null;
  setFocusedChoiceIndex: React.Dispatch<React.SetStateAction<number | null>>;
  handleChoiceClick: (choice: StoryChoice, index: number) => void;
  isNodeLoading: boolean;
  localVolume: number;
  setLocalVolume: React.Dispatch<React.SetStateAction<number>>;
  setTTSVolume: (volume: number) => void; // Assuming this comes from the store or context
}

export function useStoryKeyboardShortcuts({
  fullscreenHandle,
  showChoices,
  displayNode,
  focusedChoiceIndex,
  setFocusedChoiceIndex,
  handleChoiceClick,
  isNodeLoading,
  localVolume,
  setLocalVolume,
  setTTSVolume,
}: UseStoryKeyboardShortcutsProps) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const volumeStep = 0.05;

      // Fullscreen Toggle (F or Space)
      if (key === 'f' || key === ' ') {
        if (key === ' ') event.preventDefault();
        if (fullscreenHandle.active) {
          void fullscreenHandle.exit();
        } else {
          void fullscreenHandle.enter();
        }
        return;
      }

      // Choice Navigation/Selection
      if (showChoices && displayNode && displayNode.choices.length > 0) {
        if (isNodeLoading) return;

        const numChoices = displayNode.choices.length;

        if (key === 'arrowleft') {
          event.preventDefault();
          setFocusedChoiceIndex((prevIndex) => {
            if (prevIndex === null || prevIndex === 0) {
              return numChoices - 1;
            } else {
              return prevIndex - 1;
            }
          });
        } else if (key === 'arrowright') {
          event.preventDefault();
          setFocusedChoiceIndex((prevIndex) => {
            if (prevIndex === null || prevIndex === numChoices - 1) {
              return 0;
            } else {
              return prevIndex + 1;
            }
          });
        } else if (key === 'enter') {
          if (focusedChoiceIndex !== null) {
            event.preventDefault();
            const choice = displayNode.choices[focusedChoiceIndex];
            handleChoiceClick(choice, focusedChoiceIndex);
          }
        } else if (['1', '2', '3'].includes(key)) {
          const index = parseInt(key) - 1;
          if (index >= 0 && index < numChoices) {
            event.preventDefault();
            const choice = displayNode.choices[index];
            handleChoiceClick(choice, index);
          }
        }

        return; // Don't process volume changes if it was a choice key
      }

      // Volume Control (Up/Down Arrows, +/-, =)
      if (key === 'arrowup' || key === '=' || key === '+') {
        event.preventDefault();
        const newVolume = Math.min(1, localVolume + volumeStep);
        setLocalVolume(newVolume);
        setTTSVolume(newVolume);
      } else if (key === 'arrowdown' || key === '-') {
        event.preventDefault();
        const newVolume = Math.max(0, localVolume - volumeStep);
        setLocalVolume(newVolume);
        setTTSVolume(newVolume);
      }
    },
    [
      fullscreenHandle,
      showChoices,
      displayNode,
      focusedChoiceIndex,
      setFocusedChoiceIndex,
      handleChoiceClick,
      isNodeLoading,
      localVolume,
      setLocalVolume,
      setTTSVolume,
    ]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);
}
