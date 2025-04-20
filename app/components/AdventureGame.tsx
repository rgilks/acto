'use client';

import React, { useEffect, useRef, useCallback, useState } from 'react';
import Image from 'next/image';
import useAdventureStore from '@/store/adventureStore';
import { AdventureChoiceSchema, AdventureNode } from '@/lib/domain/schemas';
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
import AuthButton from './AuthButton';

interface RateLimitError {
  message: string;
  resetTimestamp: number;
  apiType?: 'text' | 'image' | 'tts';
}

type GamePhase = 'selecting_scenario' | 'loading_first_node' | 'playing' | 'error';
type Scenario = z.infer<typeof AdventureChoiceSchema>;

const hardcodedScenarios: Scenario[] = [
  {
    text: `You farm bio-luminescent fungi on a rogue asteroid nearing a sentient gas giant. Your prize mushroom has started singing.`,
    genre: `Weird Sci-Fi`,
    tone: `Curious, Slightly Ominous, Isolated`,
    visualStyle: `Bioluminescent Art, Soft Focus`,
  },
  {
    text: `As the royal poison taster, you've developed an unusual tolerance. Today's appetizer didn't kill you, but it *did* grant you the ability to taste secrets.`,
    genre: `Low Fantasy / Intrigue`,
    tone: `Suspenseful, Wry, Political`,
    visualStyle: `Renaissance Painting, Dark Palette`,
  },
  {
    text: `Your quantum cat has phased through the wrong reality again. You find yourself in a world where emotions manifest as tangible, and often dangerous, weather patterns.`,
    genre: `Conceptual Fantasy / Adventure`,
    tone: `Whimsical, Perilous, Urgent`,
    visualStyle: `Surrealist Landscape, Vibrant Colors`,
  },
  {
    text: `You run a dusty pawn shop on the edge of the multiverse. A being made of shifting clockwork offers you a broken pocket watch that doesn't just tell time, it *sells* it.`,
    genre: `Urban Fantasy / Mystery`,
    tone: `Mysterious, Gritty, Esoteric`,
    visualStyle: `Film Noir Photography, Steampunk Elements`,
  },
];

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

const AdventureGame = () => {
  const store = useAdventureStore();
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
    stopSpeaking: stopTTS,
    setLoginRequired,
    loginRequired,
  } = store;

  const { data: _session, status: sessionStatus } = useSession();
  const isUserLoggedIn = sessionStatus === 'authenticated';

  const [gamePhase, setGamePhase] = useState<GamePhase>('selecting_scenario');
  const [displayNode, setDisplayNode] = useState<AdventureNode | null>(null);
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

  const fullscreenHandle = useFullScreenHandle();
  const gameContainerRef = useRef<HTMLDivElement>(null);

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
      console.log('[AdventureGame] onPlaybackEnd called. Setting showChoices = true.');
      setShowChoices(true);
    }, [setShowChoices]),
    onPlaybackError: useCallback(
      (errorMsg: string) => {
        console.log(
          `[AdventureGame] onPlaybackError called with error: ${errorMsg}. Setting showChoices = true.`
        );
        setShowChoices(true);
      },
      [setShowChoices]
    ),
  });

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
      console.log('[AdventureGame] User logged in, fetching dynamic scenarios...');
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
    setGamePhase('selecting_scenario');
    void fetchScenarios();
  }, [fetchScenarios]);

  const handleScenarioSelect = useCallback(
    (scenario: Scenario) => {
      if (sessionStatus === 'loading') {
        console.log('[AdventureGame] Session status is loading, delaying scenario select.');
        return;
      }

      if (!isUserLoggedIn) {
        console.log('[AdventureGame] User not logged in, setting login required.');
        setLoginRequired(true);
        return;
      }

      setIsSelectingScenario(true);
      setGamePhase('loading_first_node');
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

      makeChoice(scenario);
    },
    [isUserLoggedIn, setLoginRequired, makeChoice, hasUserInteracted, stopTTS, sessionStatus]
  );

  const handleImageLoad = useCallback(
    (loadedImageUrl?: string) => {
      if (displayNode?.imageUrl && loadedImageUrl === displayNode.imageUrl) {
        setIsCurrentImageLoading(false);
        console.log('[AdventureGame handleImageLoad] Ready to potentially play.', {
          hasUserInteracted,
          hasAudio: !!currentAudioData,
          isTTSPlaying,
        });
        if (hasUserInteracted && currentAudioData && !isTTSPlaying) {
          console.log(
            '[AdventureGame handleImageLoad] User interacted, audio exists, not playing. Calling playTTS().'
          );
          playTTS();
        } else if (!currentAudioData) {
          setShowChoices(true);
        }
      }
    },
    [displayNode, hasUserInteracted, currentAudioData, isTTSPlaying, playTTS, setShowChoices]
  );

  useEffect(() => {
    const syncHydratedState = () => {
      const state = useAdventureStore.getState();
      if (state.currentNode) {
        console.log('[AdventureGame Hydration] Rehydrated node found, setting initial state.');
        setGamePhase((currentPhase) =>
          currentPhase === 'selecting_scenario' ? 'playing' : currentPhase
        );
        setDisplayNode(state.currentNode);
        setCurrentAudioData(state.currentNode.audioBase64 ?? null);
        setIsCurrentImageLoading(!!state.currentNode.imageUrl);
        setShowChoices(false);
        setFocusedChoiceIndex(null);
      } else {
        console.log('[AdventureGame Hydration] Store hydrated, but no currentNode found.');
      }
    };

    if (useAdventureStore.persist.hasHydrated()) {
      syncHydratedState();
    } else {
      const unsubscribe = useAdventureStore.persist.onFinishHydration(() => {
        console.log('[AdventureGame Hydration] Hydration finished via subscription.');
        syncHydratedState();
        unsubscribe();
      });
      return () => {
        unsubscribe();
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Effect to sync subsequent store changes
  useEffect(() => {
    const newlyFetchedNode = currentNode;

    if (gamePhase !== 'loading_first_node' && isSelectingScenario) {
      setIsSelectingScenario(false);
    }

    // If store node changes (and is different from displayNode), update component state
    if (newlyFetchedNode && newlyFetchedNode.passage !== displayNode?.passage) {
      console.log('[AdventureGame Sync Effect] Syncing store currentNode to displayNode.');
      stopTTS();
      setShowChoices(false);
      setFocusedChoiceIndex(null);
      setDisplayNode(newlyFetchedNode);
      const newAudioData = newlyFetchedNode.audioBase64 ?? null;
      setCurrentAudioData(newAudioData);
      setIsCurrentImageLoading(!!newlyFetchedNode.imageUrl);
      if (gamePhase === 'loading_first_node') {
        setGamePhase('playing');
      }
      const imageAvailable = !!newlyFetchedNode.imageUrl;
      const audioAvailable = !!newAudioData;
      if (!imageAvailable && !audioAvailable) {
        setShowChoices(true);
      } else if (!imageAvailable && audioAvailable) {
        if (hasUserInteracted && !isTTSPlaying) {
          console.log('[AdventureGame Sync Effect] No image, has audio, not playing. Playing TTS.');
          playTTS();
        } else {
          console.log(
            '[AdventureGame Sync Effect] No image, has audio, but no user interaction yet or already playing. Waiting.'
          );
        }
      } else if (imageAvailable) {
        console.log('[AdventureGame Sync Effect] Image available, waiting for load.');
      }
    } else if (!newlyFetchedNode && gamePhase !== 'selecting_scenario') {
      // Handle case where currentNode becomes null (e.g., after reset via triggerReset)
      console.log(
        '[AdventureGame Sync Effect] Store currentNode is null, resetting phase and display.'
      );
      setGamePhase('selecting_scenario'); // <-- Explicitly set phase back
      setDisplayNode(null);
      setIsCurrentImageLoading(true);
      setCurrentAudioData(null);
      setShowChoices(false);
      setFocusedChoiceIndex(null);
    }
  }, [
    currentNode,
    gamePhase,
    displayNode,
    stopTTS,
    playTTS,
    hasUserInteracted,
    isTTSPlaying,
    isSelectingScenario,
    setGamePhase,
  ]);

  const handleChoiceClick = useCallback(
    (choice: Scenario, index: number) => {
      if (!hasUserInteracted) {
        setHasUserInteracted(true);
      }
      setClickedChoiceIndex(index);
      setFocusedChoiceIndex(null);
      makeChoice(choice);
    },
    [makeChoice, hasUserInteracted]
  );

  const buttonBaseClasses =
    'px-4 py-2 rounded-md border transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800';
  const choiceButtonClasses =
    'w-full text-left justify-start p-2 text-sm sm:p-3 sm:text-base md:p-5 md:text-xl lg:p-7 lg:text-2xl xl:p-10 xl:text-4xl border-amber-800/50 bg-gradient-to-br from-amber-100/5 via-amber-100/10 to-amber-100/5 text-amber-100/80 shadow-[0_0_10px_rgba(252,211,77,0.3)] hover:shadow-[0_0_15px_rgba(252,211,77,0.5)] hover:text-amber-100 hover:border-amber-700 hover:from-amber-100/10 hover:to-amber-100/10 focus:ring-amber-500 flex items-center';

  useEffect(() => {
    if (nodeError !== null) {
      setGamePhase('error');
    }
  }, [nodeError]);

  const togglePlayPause = useCallback(() => {
    if (isTTSPlaying) {
      pauseTTS();
    } else {
      playTTS();
    }
  }, [isTTSPlaying, playTTS, pauseTTS]);

  const handleVolumeChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const newVolume = parseFloat(event.target.value);
      setLocalVolume(newVolume);
      setTTSVolume(newVolume);
    },
    [setTTSVolume]
  );

  const handleRestart = useCallback(() => {
    triggerReset();
    setGamePhase('selecting_scenario');
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
  }, [triggerReset, stopTTS, fullscreenHandle]);

  useEffect(() => {
    if (isTouchDevice) {
      setShowFullscreenControls(false);
      return;
    }

    const container = gameContainerRef.current;
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
        hideTimeout = setTimeout(() => setShowFullscreenControls(false), 2000);
      } else {
        if (hideTimeout) clearTimeout(hideTimeout);
      }
    };

    const handleMouseLeave = () => {
      if (hideTimeout) clearTimeout(hideTimeout);
      setShowFullscreenControls(false);
    };

    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseleave', handleMouseLeave);

    const initialCheckTimeout = setTimeout(() => {
      if (container && fullscreenHandle.active) {
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
      if (container) {
        container.removeEventListener('mousemove', handleMouseMove);
        container.removeEventListener('mouseleave', handleMouseLeave);
      }
      if (hideTimeout) clearTimeout(hideTimeout);
      if (initialCheckTimeout) clearTimeout(initialCheckTimeout);
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
            if (choice) {
              handleChoiceClick(choice, focusedChoiceIndex);
            }
          }
        } else if (['1', '2', '3'].includes(key)) {
          const index = parseInt(key) - 1;
          if (index >= 0 && index < numChoices) {
            event.preventDefault();
            const choice = displayNode.choices[index];
            if (choice) {
              handleChoiceClick(choice, index);
            }
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

  const effectiveError = nodeError || fetchScenariosError;
  const rateLimitInfo =
    typeof effectiveError === 'object' &&
    effectiveError !== null &&
    'rateLimitError' in effectiveError
      ? (effectiveError.rateLimitError as RateLimitError)
      : null;

  // Effect to reset loginRequired when session status changes
  useEffect(() => {
    if (sessionStatus === 'authenticated' && loginRequired) {
      console.log('[AdventureGame] User is now authenticated, resetting loginRequired flag.');
      setLoginRequired(false);
      // If a scenario was selected just before logging in, potentially restart the selection process
      // This depends on desired UX, for now, just reset the flag.
    }
    // NOTE: The check above implicitly handles the case where the component mounts
    // and the user is already logged in but loginRequired was persisted.
  }, [sessionStatus, loginRequired, setLoginRequired]);

  if (loginRequired) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8 max-w-lg mx-auto bg-slate-800 border border-slate-700 rounded-lg shadow-xl space-y-6">
        <h2 className="text-2xl font-bold text-yellow-400">Sign In Required</h2>
        <p className="text-sm text-gray-400">New users are currently added via a waitlist.</p>
        <AuthButton />
        <button
          onClick={handleRestart}
          className="text-sm text-gray-400 hover:text-white underline pt-4"
        >
          Go back to Scenario Selection
        </button>
      </div>
    );
  }

  if (effectiveError === 'SCENARIO_PARSE_ERROR') {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-4">
        <h2 className="text-2xl font-bold text-yellow-400 mb-4">Scenario Generation Hiccup</h2>
        <p className="mb-6 text-gray-300">
          Had a little trouble understanding the scenarios generated. Let&apos;s try again!
        </p>
        <button
          onClick={handleFetchNewScenarios}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-white flex items-center"
        >
          <ArrowPathIcon className="h-5 w-5 mr-2" />
          Try Generating Scenarios Again
        </button>
      </div>
    );
  }

  if (effectiveError === 'SCENARIO_FETCH_FAILED') {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-4">
        <h2 className="text-2xl font-bold text-amber-400 mb-4">Scenario Fetch Issue</h2>
        <p className="mb-6 text-gray-300">
          Couldn&apos;t fetch new scenarios from the server right now. Maybe try again?
        </p>
        <button
          onClick={handleFetchNewScenarios}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-white flex items-center"
        >
          <ArrowPathIcon className="h-5 w-5 mr-2" />
          Retry Fetching Scenarios
        </button>
      </div>
    );
  }

  if (rateLimitInfo) {
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
          Try Different Scenario
        </button>
      </div>
    );
  }

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

  if (
    gamePhase === 'selecting_scenario' &&
    !displayNode &&
    !isNodeLoading &&
    !isSelectingScenario
  ) {
    return (
      <ScenarioSelector
        onScenarioSelect={handleScenarioSelect}
        isLoadingSelection={isSelectingScenario}
        scenariosToDisplay={isUserLoggedIn ? dynamicScenarios : hardcodedScenarios}
        isLoadingScenarios={isFetchingScenarios}
        fetchError={fetchScenariosError}
        onFetchNewScenarios={handleFetchNewScenarios}
        isUserLoggedIn={isUserLoggedIn}
      />
    );
  }

  return (
    <>
      {(() => {
        const containerClasses = fullscreenHandle.active
          ? 'fixed inset-0 z-50 bg-black flex items-center justify-center'
          : 'bg-slate-800 rounded-lg p-2 sm:p-4 md:p-6 border border-slate-700 shadow-xl text-gray-300 relative mx-4  flex flex-col';

        const showGameUI =
          gamePhase === 'playing' || gamePhase === 'loading_first_node' || gamePhase === 'error';

        if (gamePhase === 'loading_first_node' && !displayNode && !effectiveError) {
          return (
            <div className="flex-grow flex flex-col items-center justify-center h-full">
              <ArrowPathIcon className="h-10 w-10 text-amber-300 animate-spin mb-4" />
              <p className="text-gray-400">Preparing scenario...</p>
            </div>
          );
        }

        return (
          <div ref={gameContainerRef} className={`${containerClasses} game-outer-container`}>
            {showGameUI && gamePhase !== 'error' && (
              <FullScreen
                handle={fullscreenHandle}
                className="flex-grow flex flex-col game-fullscreen-container"
              >
                <>
                  <div className={'w-full h-full flex flex-col relative'}>
                    {displayNode && (
                      <>
                        <div
                          className={`
                            relative group overflow-hidden w-full flex-grow
                            ${
                              fullscreenHandle.active
                                ? 'bg-black h-full w-full'
                                : 'min-h-[200px] aspect-[16/10] rounded shadow-md bg-slate-700 flex items-center justify-center shadow-xl shadow-amber-300/20 game-image-wrapper'
                            }
                          `}
                        >
                          {displayNode.imageUrl && (
                            <>
                              {isCurrentImageLoading && (
                                <div className="absolute inset-0 bg-slate-600 flex items-center justify-center z-10">
                                  <ArrowPathIcon className="h-8 w-8 text-slate-400 animate-spin" />
                                </div>
                              )}
                              <button
                                onClick={
                                  fullscreenHandle.active
                                    ? fullscreenHandle.exit
                                    : fullscreenHandle.enter
                                }
                                className={`absolute top-2 left-2 z-20 p-1.5 bg-black/40 text-white/80 rounded-full hover:bg-black/60 hover:text-white transition-all
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
                                aria-label={
                                  fullscreenHandle.active ? 'Exit fullscreen' : 'Enter fullscreen'
                                }
                              >
                                {fullscreenHandle.active ? (
                                  <ArrowsPointingInIcon className="h-5 w-5" />
                                ) : (
                                  <ArrowsPointingOutIcon className="h-5 w-5" />
                                )}
                              </button>
                              <Image
                                key={displayNode.imageUrl}
                                src={displayNode.imageUrl}
                                alt="Adventure scene"
                                fill
                                className={`
                                  ${fullscreenHandle.active ? 'absolute inset-0 w-full h-full object-cover' : 'object-cover'}
                                  transition-opacity duration-500 ${isCurrentImageLoading ? 'opacity-0' : 'opacity-100'}
                                `}
                                priority
                                sizes={
                                  fullscreenHandle.active
                                    ? '100vw'
                                    : '(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 40vw'
                                }
                                onLoad={() => handleImageLoad(displayNode.imageUrl)}
                                onError={() => {
                                  console.error('Image failed to load:', displayNode.imageUrl);
                                  setIsCurrentImageLoading(false);
                                }}
                              />
                            </>
                          )}

                          {/* Centered Pause icon - Hide if loading next node OR if choices are shown */}
                          {currentAudioData && !isTTSPlaying && !isNodeLoading && !showChoices && (
                            <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
                              <PauseIcon className="h-16 w-16 sm:h-20 sm:w-20 md:h-24 md:w-24 text-white/75" />
                            </div>
                          )}

                          {/* Click handler overlay */}
                          <div
                            className="absolute inset-0 z-10 cursor-pointer"
                            onClick={currentAudioData ? togglePlayPause : undefined}
                          ></div>

                          {/* Volume Slider Section (Top Right): Refined visibility logic */}
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

                          {/* Choices Section - MOVED INSIDE Image Container */}
                          <div
                            className={`
                              absolute bottom-0 left-0 right-0 p-2 pt-10 sm:p-3 sm:pt-12 md:p-4 md:pt-16 z-10
                              bg-gradient-to-t from-black/80 via-black/60 to-transparent backdrop-blur-sm
                              transition-opacity duration-500 ease-in-out
                              ${showChoices ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}
                            `}
                          >
                            {showChoices && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3 w-full">
                                {displayNode.choices.map((choice, index) => {
                                  const isClicked = index === clickedChoiceIndex;
                                  const isDisabled = isNodeLoading;
                                  const isLoadingChoice = isNodeLoading && isClicked;
                                  const isFocused = index === focusedChoiceIndex;

                                  // Base classes + conditional styling
                                  let currentChoiceClasses = `${buttonBaseClasses} ${choiceButtonClasses}`;
                                  if (isDisabled && !isLoadingChoice) {
                                    currentChoiceClasses += ' opacity-50 cursor-not-allowed';
                                  }
                                  if (isLoadingChoice) {
                                    // Remove static shadows and add pulsing animation
                                    currentChoiceClasses = currentChoiceClasses
                                      .replace(/shadow-\[.*?\}]/g, '') // Remove base shadow
                                      .replace(/hover:shadow-\[.*?\}]/g, ''); // Remove hover shadow
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
                                      onClick={() => handleChoiceClick(choice, index)}
                                      className={currentChoiceClasses}
                                      disabled={isDisabled}
                                      data-testid={`choice-button-${index}`}
                                    >
                                      <span>{choice.text}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>{' '}
                        {/* End Image Container Div */}
                      </>
                    )}
                    {!displayNode && isNodeLoading && gamePhase === 'playing' && (
                      <div className="flex-grow flex flex-col items-center justify-center">
                        <ArrowPathIcon className="h-8 w-8 text-amber-300 animate-spin mb-2" />
                        <p className="text-gray-400 italic">Loading next part...</p>
                      </div>
                    )}
                  </div>
                </>
              </FullScreen>
            )}
          </div>
        );
      })()}
      <audio ref={ttsAudioRef} className="hidden" aria-hidden="true" />
    </>
  );
};

export default AdventureGame;
