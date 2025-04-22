'use client';

import React, { useEffect, useRef, useCallback, useState } from 'react';
import Image from 'next/image';
import useStoryStore, { type ErrorState } from '@/store/storyStore';
import { StoryChoiceSchema, StoryScene } from '@/lib/domain/schemas';
import { z } from 'zod';
import {
  ArrowPathIcon,
  ArrowsPointingOutIcon,
  ArrowsPointingInIcon,
  PauseIcon,
} from '@heroicons/react/24/solid';
import ScenarioSelector from './ScenarioSelector';
import useTTSPlayer from '@/hooks/useTTSPlayer';
import { FullScreen, useFullScreenHandle } from 'react-full-screen';
import { useSession } from 'next-auth/react';

type Phase = 'selecting_scenario' | 'loading_first_node' | 'playing' | 'error';
type Scenario = z.infer<typeof StoryChoiceSchema>;

// Add the list of voices
const chirp3Voices = [
  'en-GB-Chirp3-HD-Aoede',
  'en-GB-Chirp3-HD-Charon',
  'en-GB-Chirp3-HD-Fenrir',
  'en-GB-Chirp3-HD-Kore',
  'en-GB-Chirp3-HD-Leda',
  'en-GB-Chirp3-HD-Orus',
  'en-GB-Chirp3-HD-Puck',
  'en-GB-Chirp3-HD-Zephyr',
  'en-IN-Chirp3-HD-Aoede',
  'en-IN-Chirp3-HD-Charon',
  'en-IN-Chirp3-HD-Fenrir',
  'en-IN-Chirp3-HD-Kore',
  'en-IN-Chirp3-HD-Leda',
  'en-IN-Chirp3-HD-Orus',
  'en-IN-Chirp3-HD-Puck',
  'en-IN-Chirp3-HD-Zephyr',
  'en-US-Chirp3-HD-Aoede',
  'en-US-Chirp3-HD-Charon',
  'en-US-Chirp3-HD-Fenrir',
  'en-US-Chirp3-HD-Kore',
  'en-US-Chirp3-HD-Leda',
  'en-US-Chirp3-HD-Orus',
  'en-US-Chirp3-HD-Puck',
  'en-US-Chirp3-HD-Zephyr',
];

const getRandomVoice = () => {
  return chirp3Voices[Math.floor(Math.random() * chirp3Voices.length)];
};

// Re-add formatResetTime function
function formatResetTime(timestamp: number): string {
  if (!timestamp) return 'an unknown time';
  const now = Date.now();
  const resetDate = new Date(timestamp);
  const diffSeconds = Math.round((timestamp - now) / 1000);

  if (diffSeconds <= 0) return 'shortly';
  if (diffSeconds < 60) return `in ${diffSeconds} second${diffSeconds > 1 ? 's' : ''}`;
  if (diffSeconds < 3600) {
    const minutes = Math.ceil(diffSeconds / 60);
    return `in about ${minutes} minute${minutes > 1 ? 's' : ''}`;
  }
  return `at ${resetDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

const StoryStory = () => {
  const store = useStoryStore();
  const {
    currentNode,
    isLoading: isNodeLoading,
    error: nodeError,
    makeChoice,
    ttsVolume: storeTtsVolume,
    setTTSVolume,
    dynamicScenarios,
    isFetchingScenarios,
    fetchScenariosError,
    fetchScenarios,
    triggerReset,
    retryLastFetch,
    stopSpeaking: stopTTS,
    lastFetchParamsForRetry,
    rateLimitError,
  } = store;

  const { data: _session, status: sessionStatus } = useSession();
  const isUserLoggedIn = sessionStatus === 'authenticated';

  const [phase, setPhase] = useState<Phase>('selecting_scenario');
  const [displayNode, setDisplayNode] = useState<StoryScene | null>(null);
  const [isCurrentImageLoading, setIsCurrentImageLoading] = useState<boolean>(true);
  const [showChoices, setShowChoices] = useState<boolean>(false);
  const [clickedChoiceIndex, setClickedChoiceIndex] = useState<number | null>(null);
  const [currentAudioData, setCurrentAudioData] = useState<string | null>(null);
  const [localVolume, setLocalVolume] = useState<number>(storeTtsVolume);
  const [isSelectingScenario, setIsSelectingScenario] = useState(false);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const [showFullscreenControls, setShowFullscreenControls] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [focusedChoiceIndex, setFocusedChoiceIndex] = useState<number | null>(null);

  // State for image cross-fade
  const [previousImageUrl, setPreviousImageUrl] = useState<string | null>(null);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const [isTransitioningImage, setIsTransitioningImage] = useState<boolean>(false);

  // State for explicit user pause action
  const [userPaused, setUserPaused] = useState<boolean>(false);
  // ADDED: State to track if TTS finished or failed
  const [playbackFinishedOrFailed, setPlaybackFinishedOrFailed] = useState(false);

  const fullscreenHandle = useFullScreenHandle();
  const storyContainerRef = useRef<HTMLDivElement>(null);
  // ADDED: Ref to track the timeout for showing choices when no audio is detected
  const showChoicesTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const {
    play: playTTS,
    pause: pauseTTS,
    isPlaying: isTTSPlaying,
    error: ttsPlayerError,
    audioRef: ttsAudioRef,
  } = useTTSPlayer({
    audioData: currentAudioData,
    volume: storeTtsVolume,
    onPlaybackEnd: useCallback(() => {
      // Don't show choices directly, set flag instead
      setPlaybackFinishedOrFailed(true);
      setUserPaused(false); // Audio ended naturally, not paused by user
    }, [setPlaybackFinishedOrFailed, setUserPaused]), // Adjusted dependencies
    onPlaybackError: useCallback(
      (_errorMsg: string) => {
        // Don't show choices directly, set flag instead
        setPlaybackFinishedOrFailed(true);
        setUserPaused(false); // Audio error, not paused by user
      },
      [setPlaybackFinishedOrFailed, setUserPaused] // Adjusted dependencies
    ),
  });

  // Explicitly type the ref to match the possible error states
  const previousErrorRef = useRef<ErrorState>(null);

  useEffect(() => {
    setLocalVolume(storeTtsVolume);
  }, [storeTtsVolume]);

  useEffect(() => {
    if (
      sessionStatus === 'authenticated' &&
      !dynamicScenarios &&
      !isFetchingScenarios &&
      !fetchScenariosError
    ) {
      void fetchScenarios();
    }
  }, [sessionStatus, dynamicScenarios, isFetchingScenarios, fetchScenariosError, fetchScenarios]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const touchDetected = window.matchMedia('(pointer: coarse)').matches;
      setIsTouchDevice(touchDetected);
    }
  }, []);

  const handleFetchNewScenarios = useCallback(() => {
    setPhase('selecting_scenario');
    void fetchScenarios();
  }, [fetchScenarios]);

  const handleScenarioSelect = useCallback(
    (scenario: Scenario) => {
      if (sessionStatus === 'loading') {
        return;
      }

      setIsSelectingScenario(true);
      setPhase('loading_first_node');
      if (!hasUserInteracted) {
        setHasUserInteracted(true);
      }
      setDisplayNode(null);
      setIsCurrentImageLoading(true);
      setCurrentAudioData(null);
      setShowChoices(false);
      setClickedChoiceIndex(null);
      setFocusedChoiceIndex(null);
      stopTTS();

      const voice = getRandomVoice();
      const scenarioWithVoice = { ...scenario, voice };

      makeChoice(scenarioWithVoice);
    },
    [makeChoice, hasUserInteracted, stopTTS, sessionStatus]
  );

  const handleImageLoad = useCallback(
    (loadedImageUrl?: string) => {
      // Check if the loaded image is the one we are transitioning to
      if (loadedImageUrl && loadedImageUrl === currentImageUrl) {
        setIsCurrentImageLoading(false); // Mark loading as complete for the *new* image
        setIsTransitioningImage(true); // Trigger the opacity swap

        // After the transition duration, update the previous image URL
        // Adjust timeout duration based on CSS transition duration (1000ms here)
        setTimeout(() => {
          setPreviousImageUrl(loadedImageUrl);
          setIsTransitioningImage(false); // Reset transition state
        }, 1000); // Match CSS transition duration

        // --- Start TTS if applicable ---
        // Restore autoplay logic for subsequent nodes
        if (hasUserInteracted && currentAudioData && !isTTSPlaying && !userPaused) {
          // Autoplay only if user has interacted, audio exists, not playing, AND not explicitly paused (e.g., first node)
          playTTS();
        }
      }
    },
    // Restore dependencies needed for autoplay logic, remove setShowChoices
    [currentImageUrl, currentAudioData, hasUserInteracted, isTTSPlaying, playTTS, userPaused]
  );

  useEffect(() => {
    const syncHydratedState = () => {
      const state = useStoryStore.getState();
      if (state.currentNode) {
        setPhase((currentPhase) =>
          currentPhase === 'selecting_scenario' ? 'playing' : currentPhase
        );
        setDisplayNode(state.currentNode);
        const initialAudioData = state.currentNode.audioBase64 ?? null;
        setCurrentAudioData(initialAudioData);
        // Set initial image states for potential crossfade on first real node change
        setCurrentImageUrl(state.currentNode.imageUrl ?? null);
        setPreviousImageUrl(state.currentNode.imageUrl ?? null);
        setIsCurrentImageLoading(!!state.currentNode.imageUrl);
        setShowChoices(false);
        setFocusedChoiceIndex(null);
        setUserPaused(!!initialAudioData); // If audio exists on load, consider it paused initially
      }
    };

    if (useStoryStore.persist.hasHydrated()) {
      syncHydratedState();
    } else {
      const unsubscribe = useStoryStore.persist.onFinishHydration(() => {
        syncHydratedState();
        unsubscribe();
      });
      return () => {
        unsubscribe();
      };
    }
  }, []);

  // Effect to sync subsequent store changes
  useEffect(() => {
    const newlyFetchedNode = currentNode;

    if (phase !== 'loading_first_node' && isSelectingScenario) {
      setIsSelectingScenario(false);
    }

    // If store node changes OR we just successfully retried after a format error, update component state
    const justRetriedSuccessfully =
      previousErrorRef.current === 'AI_RESPONSE_FORMAT_ERROR' && !nodeError;
    if (newlyFetchedNode && (newlyFetchedNode !== displayNode || justRetriedSuccessfully)) {
      console.log('[StoryStory Effect] Syncing new node to displayNode.', {
        newNodeId: newlyFetchedNode.passage.substring(0, 10), // Simple ID check
        displayNodeId: displayNode?.passage.substring(0, 10),
        justRetriedSuccessfully,
      });

      // Store the current error state *before* potential updates
      previousErrorRef.current = nodeError;

      // Reset playback finished state for the new node
      setPlaybackFinishedOrFailed(false);

      stopTTS(); // Stop any currently playing TTS
      setShowChoices(false); // Hide choices for the new node initially
      setClickedChoiceIndex(null); // Reset clicked choice visual state
      setFocusedChoiceIndex(null);
      // Don't set isCurrentImageLoading here directly, handleImageLoad will do it

      const newAudioData = newlyFetchedNode.audioBase64 ?? null;
      setCurrentAudioData(newAudioData); // Set audio data for the player hook
      setDisplayNode(newlyFetchedNode); // Update the displayed node content

      // --- Set paused state only for the first node ---
      const isFirstNodeLoading = phase === 'loading_first_node';
      setUserPaused(isFirstNodeLoading && !!newAudioData); // Pause only if it's the first node and has audio

      // Set image URLs for cross-fade
      if (newlyFetchedNode.imageUrl && newlyFetchedNode.imageUrl !== currentImageUrl) {
        setPreviousImageUrl(currentImageUrl); // Store the old URL
        setCurrentImageUrl(newlyFetchedNode.imageUrl); // Set the new target URL
        setIsCurrentImageLoading(true); // Start loading spinner for the new image
        setIsTransitioningImage(false); // Ensure transition starts clean
      } else if (!newlyFetchedNode.imageUrl) {
        // Handle case where new node has no image (but might have audio)
        setPreviousImageUrl(currentImageUrl);
        setCurrentImageUrl(null);
        setIsCurrentImageLoading(false); // No image to load
        setIsTransitioningImage(true); // Trigger fade out of old image if present
        setTimeout(() => {
          setPreviousImageUrl(null);
          setIsTransitioningImage(false);
        }, 1000);

        // --- ADDED: Autoplay audio if no image on subsequent nodes ---
        if (newAudioData && !isFirstNodeLoading && hasUserInteracted) {
          // If there IS audio, NO image, it's NOT the first node, and user HAS interacted, play audio.
          console.log('[StoryStory Effect] Autoplaying audio for node with no image.');
          playTTS();
        }
        // --- END ADDED BLOCK ---
      }

      if (phase === 'loading_first_node') {
        setPhase('playing');
      }
    } else if (!newlyFetchedNode && displayNode) {
      // Handle case where currentNode becomes null (e.g., after reset)
      // Only reset if displayNode was previously set, to avoid loop on initial load/hydration
      if (phase !== 'selecting_scenario') {
        setPhase('selecting_scenario');
        setDisplayNode(null);
        setIsCurrentImageLoading(true);
        setCurrentAudioData(null);
        setShowChoices(false);
        setClickedChoiceIndex(null);
        setFocusedChoiceIndex(null);
        stopTTS();
      }
    }

    // Update the ref *after* the main logic
    if (nodeError !== previousErrorRef.current) {
      previousErrorRef.current = nodeError;
    }
  }, [
    currentNode, // Main trigger
    displayNode, // Compare against current display
    phase, // Read and set story phase
    isSelectingScenario, // Read state
    stopTTS, // Call action
    setPhase, // Update state
    setShowChoices, // Update state
    setClickedChoiceIndex, // Update state
    setFocusedChoiceIndex, // Update state
    setIsCurrentImageLoading, // Update state
    setCurrentAudioData, // Update state
    currentImageUrl, // Add missing dependency for image transition logic
    nodeError, // Need to react to error changes for retry logic
    setUserPaused, // Add setUserPaused to dependency array
    // Add playTTS, isTTSPlaying, hasUserInteracted back for use in handleImageLoad
    playTTS,
    isTTSPlaying,
    hasUserInteracted,
  ]);

  // ADDED: Effect to control when choices are shown (Revised)
  useEffect(() => {
    // Clear any existing timeout when dependencies change
    if (showChoicesTimeoutRef.current) {
      clearTimeout(showChoicesTimeoutRef.current);
      showChoicesTimeoutRef.current = null;
    }

    if (playbackFinishedOrFailed) {
      // If playback finished or failed, show choices immediately
      console.log('[StoryStory Effect] Showing choices (playback finished/failed).');
      setShowChoices(true);
    } else if (!currentAudioData && displayNode) {
      // If no audio data, set a short timeout to show choices.
      // This gives a chance for audio to potentially start playing if there's a slight delay.
      console.log('[StoryStory Effect] No audio detected, setting timeout to show choices.');
      showChoicesTimeoutRef.current = setTimeout(() => {
        console.log('[StoryStory Effect] Showing choices (timeout after no audio).');
        setShowChoices(true);
      }, 150); // Short delay (e.g., 150ms)
    } else {
      // If there IS audio and playback hasn't finished/failed, ensure choices are hidden (redundant, but safe)
      // setShowChoices(false); // Avoid potential flicker if state updates coincide
    }

    // Cleanup function to clear timeout if component unmounts or dependencies change before timeout fires
    return () => {
      if (showChoicesTimeoutRef.current) {
        clearTimeout(showChoicesTimeoutRef.current);
        showChoicesTimeoutRef.current = null;
      }
    };
  }, [playbackFinishedOrFailed, currentAudioData, displayNode, setShowChoices]);

  // ADDED: Effect to cancel the 'show choices' timeout if audio starts playing
  useEffect(() => {
    if (isTTSPlaying && showChoicesTimeoutRef.current) {
      console.log('[StoryStory Effect] Audio started playing, cancelling show choices timeout.');
      clearTimeout(showChoicesTimeoutRef.current);
      showChoicesTimeoutRef.current = null;
    }
  }, [isTTSPlaying]);

  const handleChoiceClick = useCallback(
    (choice: Scenario, index: number) => {
      if (!hasUserInteracted) {
        setHasUserInteracted(true);
      }
      setShowChoices(false); // Hide choices immediately when one is selected
      setClickedChoiceIndex(index);
      setFocusedChoiceIndex(null);
      makeChoice(choice);
    },
    [makeChoice, hasUserInteracted, setShowChoices]
  );

  const buttonBaseClasses =
    'px-4 py-2 rounded-md border transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800';
  const choiceButtonClasses =
    'w-full text-left justify-start p-2 text-sm sm:p-3 sm:text-base md:p-5 md:text-xl lg:p-7 lg:text-2xl xl:p-10 xl:text-4xl border-amber-800/50 bg-gradient-to-br from-amber-100/5 via-amber-100/10 to-amber-100/5 text-amber-100/80 shadow-[0_0_10px_rgba(252,211,77,0.3)] hover:shadow-[0_0_15px_rgba(252,211,77,0.5)] hover:text-amber-100 hover:border-amber-700 hover:from-amber-100/10 hover:to-amber-100/10 focus:ring-amber-500 flex items-center';

  useEffect(() => {
    if (nodeError !== null) {
      setPhase('error');
    }
  }, [nodeError]);

  const togglePlayPause = useCallback(() => {
    if (isTTSPlaying) {
      pauseTTS();
      setUserPaused(true); // User explicitly paused
    } else {
      playTTS();
      setUserPaused(false); // User explicitly played
    }
  }, [isTTSPlaying, playTTS, pauseTTS]);

  const handleVolumeChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const newVolume = parseFloat(event.target.value);
      setLocalVolume(newVolume);
      setTTSVolume(newVolume);
      setShowChoices(false);
      setClickedChoiceIndex(null);
      setFocusedChoiceIndex(null);
      setUserPaused(false); // Reset pause state
      stopTTS();
    },
    [setTTSVolume, stopTTS]
  );

  const handleRestart = useCallback(() => {
    triggerReset();
    // Fetch new scenarios after resetting
    if (isUserLoggedIn) {
      void fetchScenarios();
    }
    setPhase('selecting_scenario');
    setDisplayNode(null);
    setIsCurrentImageLoading(true);
    setCurrentAudioData(null);
    setShowChoices(false);
    setClickedChoiceIndex(null);
    setFocusedChoiceIndex(null);
    stopTTS();
    if (fullscreenHandle.active) {
      void fullscreenHandle.exit();
    }
  }, [triggerReset, stopTTS, fullscreenHandle, fetchScenarios, isUserLoggedIn]);

  useEffect(() => {
    if (isTouchDevice) {
      setShowFullscreenControls(false);
      return;
    }

    const container = storyContainerRef.current;
    if (!container || !fullscreenHandle.active) {
      setShowFullscreenControls(false);
      return;
    }

    let hideTimeout: NodeJS.Timeout | null = null;

    const handleMouseMove = (event: MouseEvent) => {
      if (!fullscreenHandle.active) return;
      const rect = container.getBoundingClientRect();
      const mouseY = event.clientY - rect.top;
      const threshold = rect.height * 0.2;
      if (mouseY <= threshold) {
        setShowFullscreenControls(true);
        if (hideTimeout) clearTimeout(hideTimeout);
        hideTimeout = setTimeout(() => {
          setShowFullscreenControls(false);
        }, 2000);
      } else {
        if (hideTimeout) clearTimeout(hideTimeout); // Clear timeout if mouse moves below threshold
        setShowFullscreenControls(false); // Hide controls immediately when mouse moves below threshold
      }
    };

    const handleMouseLeave = () => {
      if (hideTimeout) clearTimeout(hideTimeout);
      setShowFullscreenControls(false);
    };

    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseleave', handleMouseLeave);

    const initialCheckTimeout = setTimeout(() => {
      if (fullscreenHandle.active) {
        const event = new MouseEvent('mousemove', {
          bubbles: true,
          cancelable: true,
          clientX: window.innerWidth / 2,
          clientY: window.innerHeight * 0.1,
        });
        container.dispatchEvent(event);
      }
    }, 100);

    return () => {
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseleave', handleMouseLeave);
      if (hideTimeout) clearTimeout(hideTimeout);
      clearTimeout(initialCheckTimeout);
    };
  }, [fullscreenHandle.active, isTouchDevice, setShowFullscreenControls]);

  // Effect for keyboard shortcuts (Fullscreen, Choices, Volume)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const volumeStep = 0.05; // Adjust volume by 5%

      // Fullscreen Toggle (F or Space)
      if (key === 'f' || key === ' ') {
        if (key === ' ') event.preventDefault();
        if (fullscreenHandle.active) {
          void fullscreenHandle.exit();
        } else {
          void fullscreenHandle.enter();
        }
        return; // Don't process further if it was a fullscreen toggle
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

        // If it was a choice key, don't process volume changes
        return;
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
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    fullscreenHandle,
    showChoices,
    displayNode,
    focusedChoiceIndex,
    handleChoiceClick,
    isNodeLoading,
    localVolume,
    setLocalVolume,
    setTTSVolume,
  ]);

  // Effect to manage body class for touch landscape fullscreen
  useEffect(() => {
    const updateFullscreenClass = () => {
      const isTouch = navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
      const isLandscape = window.matchMedia('(orientation: landscape)').matches;

      if (isTouch && isLandscape) {
        document.body.classList.add('touch-landscape-fullscreen');
      } else {
        document.body.classList.remove('touch-landscape-fullscreen');
      }
    };

    // Initial check
    updateFullscreenClass();

    // Listen for orientation changes and resize (which might trigger orientation change)
    window.addEventListener('resize', updateFullscreenClass);
    // Use deprecated orientationchange as fallback for some devices if needed, resize is generally better
    // window.addEventListener('orientationchange', updateFullscreenClass);

    // Cleanup
    return () => {
      window.removeEventListener('resize', updateFullscreenClass);
      // window.removeEventListener('orientationchange', updateFullscreenClass);
      document.body.classList.remove('touch-landscape-fullscreen'); // Ensure class is removed on unmount
    };
  }, []); // Run only once on mount

  const effectiveError =
    nodeError || fetchScenariosError || (rateLimitError ? { rateLimitError } : null);

  // --- ADDED: Specific handling for Rate Limit Error ---
  if (
    typeof effectiveError === 'object' &&
    effectiveError !== null &&
    'rateLimitError' in effectiveError
  ) {
    const rateLimitInfo = effectiveError.rateLimitError;
    const resetTime = formatResetTime(rateLimitInfo.resetTimestamp);
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-4">
        <h2 className="text-2xl font-bold text-red-500 mb-4">Rate Limit Reached</h2>
        <p className="mb-4">{rateLimitInfo.message}</p>
        <p className="text-sm text-gray-400 mb-6">
          Please try again {resetTime}. You can continue playing then!
        </p>
        <button
          onClick={handleRestart}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white flex items-center"
        >
          <ArrowPathIcon className="h-5 w-5 mr-2" />
          Start Over
        </button>
      </div>
    );
  }
  // --- END ADDED BLOCK ---

  // --- ADDED: Specific handling for AI Response Format Error ---
  if (effectiveError === 'AI_RESPONSE_FORMAT_ERROR') {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-4">
        <h2 className="text-2xl font-bold text-yellow-400 mb-4">Storyteller Hiccup</h2>
        <p className="mb-6 text-gray-300">
          The storyteller seems to have gotten a bit confused with the response. Want to try asking
          again?
        </p>
        <button
          onClick={retryLastFetch}
          disabled={!lastFetchParamsForRetry} // Disable if params somehow got cleared
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-white flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ArrowPathIcon className="h-5 w-5 mr-2" />
          Retry Last Action
        </button>
        <button
          onClick={handleRestart}
          className="mt-4 text-sm text-gray-400 hover:text-white underline"
        >
          Or Start Over
        </button>
      </div>
    );
  }
  // --- END ADDED BLOCK ---

  // Generic Error Catch-all (keep existing logic)
  const simpleErrorMessage = typeof effectiveError === 'string' ? effectiveError : null;
  if (simpleErrorMessage) {
    let friendlyMessage = 'Something went wrong. Please try starting over.';
    if (simpleErrorMessage === 'Failed to fetch') {
      friendlyMessage =
        'Could not connect to the server. Please check your connection or click Start Over.';
    }

    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-4">
        <h2 className="text-2xl font-bold text-orange-400 mb-4">Oops! Something Went Wrong</h2>
        <p className="mb-6 text-gray-300">{friendlyMessage}</p>
        <button
          onClick={handleRestart}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white flex items-center"
        >
          <ArrowPathIcon className="h-5 w-5 mr-2" />
          Start Over
        </button>
      </div>
    );
  }

  // ----- RENDER LOGIC RESTRUCTURED -----

  // 1. Loading State for the very first node
  if (phase === 'loading_first_node') {
    return (
      <div className="flex flex-col items-center justify-center text-center p-8 h-[60vh]">
        <svg
          className="animate-spin h-10 w-10 text-amber-400 mb-4"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          ></circle>
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          ></path>
        </svg>
        <p className="text-xl text-amber-200">Conjuring the first step...</p>
      </div>
    );
  }

  // 2. Scenario Selection State
  if (phase === 'selecting_scenario') {
    return (
      <ScenarioSelector
        onScenarioSelect={handleScenarioSelect}
        isLoadingSelection={isSelectingScenario}
        scenariosToDisplay={dynamicScenarios}
        isLoadingScenarios={isFetchingScenarios}
        fetchError={fetchScenariosError}
        onFetchNewScenarios={handleFetchNewScenarios}
        isUserLoggedIn={isUserLoggedIn}
      />
    );
  }

  // 3. Playing State (Main Story UI)
  if (phase === 'playing' && displayNode) {
    const containerClasses = fullscreenHandle.active
      ? 'fixed inset-0 z-50 bg-black flex items-center justify-center'
      : 'bg-slate-800 rounded-lg p-2 sm:p-4 md:p-6 border border-slate-700 shadow-xl text-gray-300 relative mx-4  flex flex-col';

    return (
      <div ref={storyContainerRef} className={`${containerClasses} story-outer-container`}>
        <FullScreen
          handle={fullscreenHandle}
          className="flex-grow flex flex-col story-fullscreen-container"
        >
          <>
            <div className={'w-full h-full flex flex-col relative'}>
              {/* Image Container */}
              <div
                className={`
                  relative group overflow-hidden w-full flex-grow
                  ${
                    fullscreenHandle.active
                      ? 'bg-black h-full w-full'
                      : 'min-h-[200px] aspect-[16/10] rounded shadow-md bg-slate-700 flex items-center justify-center shadow-xl shadow-amber-300/20 story-image-wrapper'
                  }
                `}
              >
                {/* Previous Image (Bottom Layer) */}
                {previousImageUrl && (
                  <Image
                    key={`prev-${previousImageUrl}`}
                    src={previousImageUrl}
                    alt="Previous story scene"
                    fill
                    className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ease-in-out ${
                      isTransitioningImage ? 'opacity-0' : 'opacity-100'
                    }`}
                    priority // Load previous image with priority if needed
                    sizes={
                      fullscreenHandle.active
                        ? '100vw'
                        : '(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 40vw'
                    }
                  />
                )}

                {/* Current Image (Top Layer) - Loads and Fades In */}
                {currentImageUrl && (
                  <Image
                    key={`curr-${currentImageUrl}`}
                    src={currentImageUrl}
                    alt="Story scene"
                    fill
                    className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ease-in-out ${
                      isTransitioningImage ? 'opacity-100' : 'opacity-0'
                    }`}
                    priority
                    sizes={
                      fullscreenHandle.active
                        ? '100vw'
                        : '(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 40vw'
                    }
                    onLoad={() => {
                      handleImageLoad(currentImageUrl);
                    }}
                    onError={() => {
                      console.error('Image failed to load:', currentImageUrl);
                      setIsCurrentImageLoading(false);
                      // Potentially trigger transition anyway or show error
                      setIsTransitioningImage(true);
                      setTimeout(() => {
                        setPreviousImageUrl(currentImageUrl); // Even if failed, treat as stable
                        setIsTransitioningImage(false);
                      }, 1000);
                    }}
                  />
                )}

                {/* Loading Spinner (shows while new image is loading, before transition starts) */}
                {isCurrentImageLoading && (
                  <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm flex items-center justify-center z-10">
                    <ArrowPathIcon className="h-8 w-8 text-slate-400 animate-spin" />
                  </div>
                )}

                {/* Centered Pause icon - Show only if explicitly paused by user or on initial load with audio */}
                {userPaused && (
                  <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
                    <PauseIcon className="h-16 w-16 sm:h-20 sm:w-20 md:h-24 md:w-24 text-white/75" />
                  </div>
                )}

                {/* Fullscreen Toggle Button */}
                {!isTouchDevice && ( // Don't show on touch or if API unavailable
                  <button
                    onClick={
                      fullscreenHandle.active ? fullscreenHandle.exit : fullscreenHandle.enter
                    }
                    className={`absolute top-2 left-2 z-20 p-1.5 bg-black/40 rounded-full text-white/80 hover:text-white transition-all
                    ${
                      fullscreenHandle.active
                        ? showFullscreenControls
                          ? 'opacity-100 pointer-events-auto duration-200' // Show on hover in fullscreen
                          : 'opacity-0 pointer-events-none duration-300' // Hide when not hovered in fullscreen
                        : 'opacity-50 hover:opacity-100' // Default visibility outside fullscreen
                    }
                  `}
                    aria-label={fullscreenHandle.active ? 'Exit Fullscreen' : 'Enter Fullscreen'}
                  >
                    {fullscreenHandle.active ? (
                      <ArrowsPointingInIcon className="h-5 w-5" />
                    ) : (
                      <ArrowsPointingOutIcon className="h-5 w-5" />
                    )}
                  </button>
                )}

                {/* Click handler overlay */}
                <div
                  className="absolute inset-0 z-10 cursor-pointer"
                  onClick={currentAudioData ? togglePlayPause : undefined}
                ></div>

                {/* Volume Slider */}
                {currentAudioData && (
                  <div
                    className={`absolute top-2 right-2 z-20 flex items-center space-x-2 bg-black/40 rounded-full px-2 py-1 transition-all
                        ${
                          fullscreenHandle.active
                            ? showFullscreenControls && !isTouchDevice
                              ? 'opacity-100 pointer-events-auto duration-200'
                              : 'opacity-0 pointer-events-none duration-300'
                            : !isTouchDevice
                              ? 'opacity-50 hover:opacity-100 transition-opacity duration-200'
                              : 'opacity-0 pointer-events-none'
                        }
                      `}
                  >
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={localVolume}
                      onChange={handleVolumeChange}
                      className="w-16 h-1 bg-slate-500 rounded-full appearance-none cursor-pointer accent-amber-300"
                      aria-label="Narration volume"
                    />
                    {ttsPlayerError && (
                      <span className="ml-2 text-xs text-red-400 bg-black/50 px-1.5 py-0.5 rounded">
                        Audio Error
                      </span>
                    )}
                  </div>
                )}

                {/* Choices Section */}
                <div
                  className={`
                    absolute bottom-0 left-0 right-0 p-2 pt-10 sm:p-3 sm:pt-12 md:p-4 md:pt-16 z-10
                    bg-gradient-to-t from-black/80 via-black/60 to-transparent backdrop-blur-sm
                    transition-opacity ease-in-out [transition-duration:2000ms]
                    ${showChoices ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}
                  `}
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3 w-full">
                    {displayNode.choices.map((choice, index) => {
                      const isClicked = index === clickedChoiceIndex;
                      const isDisabled = isNodeLoading;
                      const isLoadingChoice = isNodeLoading && isClicked;
                      const isFocused = index === focusedChoiceIndex;

                      let currentChoiceClasses = `${buttonBaseClasses} ${choiceButtonClasses}`;
                      if (isDisabled && !isLoadingChoice) {
                        currentChoiceClasses += ' opacity-50 cursor-not-allowed';
                      }
                      if (isLoadingChoice) {
                        currentChoiceClasses = currentChoiceClasses
                          .replace(/shadow-\[.*?\}]/g, '')
                          .replace(/hover:shadow-\[.*?\}]/g, '');
                        currentChoiceClasses +=
                          ' border-amber-500 bg-amber-100/20 animate-pulse-glow';
                      }
                      if (isFocused && !isLoadingChoice) {
                        currentChoiceClasses +=
                          ' ring-2 ring-offset-2 ring-offset-black/50 ring-amber-300/80';
                      }

                      return (
                        <button
                          key={index}
                          onClick={() => {
                            handleChoiceClick(choice, index);
                          }}
                          className={currentChoiceClasses}
                          disabled={isDisabled}
                          data-testid={`choice-button-${index}`}
                        >
                          <span>{choice.text}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
              {/* Subtle intermediate loading spinner for next node */}
              {isNodeLoading && (
                <div className="absolute bottom-4 right-4 z-30 p-2 bg-black/30 rounded-full">
                  <ArrowPathIcon className="h-6 w-6 text-amber-300 animate-spin animate-pulse" />
                </div>
              )}
            </div>
          </>
        </FullScreen>
        <audio ref={ttsAudioRef} className="hidden" aria-hidden="true" />
      </div>
    );
  }

  // 4. Fallback or Default State (should ideally not be reached if logic is sound)
  //    Could render a generic error or return null/empty fragment
  console.warn('[StoryStory] Reached unexpected render state.', { phase });
  return null; // Or a fallback UI
};

export default StoryStory;
