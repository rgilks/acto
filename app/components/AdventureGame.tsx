'use client';

import React, { useEffect, useRef, useCallback, useState } from 'react';
import Image from 'next/image';
import Script from 'next/script';
import useAdventureStore from '@/store/adventureStore';
import { AdventureChoiceSchema, AdventureNode } from '@/lib/domain/schemas';
import { z } from 'zod';
import {
  ArrowPathIcon,
  ArrowsPointingOutIcon,
  ArrowsPointingInIcon,
  PlayIcon,
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

interface KofiWidgetOverlay {
  draw(username: string, config: Record<string, string>): void;
}

declare const kofiWidgetOverlay: KofiWidgetOverlay | undefined;

type GamePhase = 'selecting_scenario' | 'loading_first_node' | 'playing' | 'error';
type Scenario = z.infer<typeof AdventureChoiceSchema>;

const hardcodedScenarios: Scenario[] = [
  {
    text: `You are a bio-luminescent fungus farmer on a rogue asteroid nearing a sentient gas giant. Your prize-winning giant mushroom has just started... singing.`,
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
    fetchStartingScenarios,
    loginRequired,
    triggerReset,
  } = useAdventureStore();

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

  const fullscreenHandle = useFullScreenHandle();
  const gameContainerRef = useRef<HTMLDivElement>(null);

  const {
    play: playTTS,
    pause: pauseTTS,
    stop: stopTTS,
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

  const [isIphone, setIsIphone] = useState(false);

  useEffect(() => {
    const userAgent = window.navigator.userAgent;
    setIsIphone(/iPhone/i.test(userAgent));
  }, []);

  useEffect(() => {
    if (
      sessionStatus === 'authenticated' &&
      !dynamicScenarios &&
      !isFetchingScenarios &&
      !fetchScenariosError
    ) {
      console.log('[AdventureGame] User logged in, fetching dynamic scenarios...');
      void fetchStartingScenarios();
    }
  }, [
    sessionStatus,
    dynamicScenarios,
    isFetchingScenarios,
    fetchScenariosError,
    fetchStartingScenarios,
  ]);

  const handleFetchNewScenarios = useCallback(() => {
    setGamePhase('selecting_scenario');
    void fetchStartingScenarios();
  }, [fetchStartingScenarios]);

  const handleScenarioSelect = useCallback(
    (scenario: Scenario) => {
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
      stopTTS();

      makeChoice(scenario);
    },
    [makeChoice, hasUserInteracted, stopTTS]
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
    const newlyFetchedNode =
      gamePhase === 'playing' || gamePhase === 'loading_first_node' ? currentNode : null;

    if (gamePhase !== 'loading_first_node' && isSelectingScenario) {
      setIsSelectingScenario(false);
    }

    if (newlyFetchedNode && newlyFetchedNode.passage !== displayNode?.passage) {
      stopTTS();
      setShowChoices(false);

      setDisplayNode(newlyFetchedNode);
      const newAudioData = newlyFetchedNode.audioBase64 ?? null;
      setCurrentAudioData(newAudioData);
      console.log(
        '[AdventureGame useEffect] Setting currentAudioData:',
        newAudioData ? `Exists (${newAudioData.substring(0, 30)}...)` : 'null'
      );
      const imageAvailable = !!newlyFetchedNode.imageUrl;
      const audioAvailable = !!newAudioData;
      setIsCurrentImageLoading(imageAvailable);

      if (gamePhase === 'loading_first_node') {
        setGamePhase('playing');
      }

      if (!imageAvailable && !audioAvailable) {
        setShowChoices(true);
      } else if (!imageAvailable && audioAvailable) {
        if (hasUserInteracted && !isTTSPlaying) {
          console.log('[AdventureGame useEffect] No image, has audio, not playing. Playing TTS.');
          playTTS();
        } else {
          console.log(
            '[AdventureGame useEffect] No image, has audio, but no user interaction yet or already playing. Waiting.'
          );
        }
      } else if (imageAvailable) {
        console.log('[AdventureGame useEffect] Has image. Waiting for handleImageLoad.');
      }
    } else if (!newlyFetchedNode && displayNode && gamePhase === 'playing') {
      setDisplayNode(null);
      setIsCurrentImageLoading(true);
      setCurrentAudioData(null);
      stopTTS();
      setShowChoices(false);
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
  ]);

  const handleChoiceClick = useCallback(
    (choice: Scenario, index: number) => {
      if (!hasUserInteracted) {
        setHasUserInteracted(true);
      }
      setClickedChoiceIndex(index);
      makeChoice(choice);
    },
    [makeChoice, hasUserInteracted]
  );

  const buttonBaseClasses =
    'px-4 py-2 rounded-md border transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800';
  const choiceButtonClasses =
    'w-full text-left justify-start p-2 text-sm sm:p-3 sm:text-base md:p-4 border-amber-800/50 bg-gradient-to-br from-amber-100/5 via-amber-100/10 to-amber-100/5 text-amber-100/80 hover:text-amber-100 hover:border-amber-700 hover:from-amber-100/10 hover:to-amber-100/10 focus:ring-amber-500 shadow-md hover:shadow-lg flex items-center';

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

  useEffect(() => {
    if (
      typeof kofiWidgetOverlay === 'object' &&
      kofiWidgetOverlay !== null &&
      typeof kofiWidgetOverlay.draw === 'function'
    ) {
      kofiWidgetOverlay.draw('robgilks', {
        type: 'floating-chat',
        'floating-chat.donateButton.text': 'Tip Me',
        'floating-chat.donateButton.background-color': '#323842',
        'floating-chat.donateButton.text-color': '#fff',
      });
    }
  }, []);

  const effectiveError = nodeError || fetchScenariosError;

  const rateLimitInfo =
    typeof effectiveError === 'object' &&
    effectiveError !== null &&
    'rateLimitError' in effectiveError
      ? (effectiveError.rateLimitError as RateLimitError)
      : null;

  const simpleErrorMessage = typeof effectiveError === 'string' ? effectiveError : null;

  const handleRestart = useCallback(() => {
    triggerReset();
    setGamePhase('selecting_scenario');
    setDisplayNode(null);
    setIsCurrentImageLoading(true);
    setCurrentAudioData(null);
    setShowChoices(false);
    setClickedChoiceIndex(null);
    stopTTS();
    if (fullscreenHandle.active) {
      void fullscreenHandle.exit();
    }
  }, [triggerReset, stopTTS, fullscreenHandle]);

  if (loginRequired) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-4">
        <h2 className="text-2xl font-bold text-yellow-400 mb-4">Sign In Required</h2>
        <p className="mb-4">Please sign in to start your adventure.</p>
        <p className="text-sm text-gray-400 mb-6">
          New users are currently added via a waitlist. Sign in to check your status or join!
        </p>
        <AuthButton />
        <button
          onClick={handleRestart}
          className="mt-4 text-sm text-gray-400 hover:text-white underline"
        >
          Go back
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

  if (simpleErrorMessage) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-4">
        <h2 className="text-2xl font-bold text-red-500 mb-4">An Error Occurred</h2>
        <p className="mb-6">{simpleErrorMessage}</p>
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
      <Script
        src="https://storage.ko-fi.com/cdn/scripts/overlay-widget.js"
        strategy="afterInteractive"
      />

      {(() => {
        const containerClasses = fullscreenHandle.active
          ? 'fixed inset-0 z-50 bg-black flex items-center justify-center'
          : 'bg-slate-800 rounded-lg p-2 sm:p-4 md:p-6 border border-slate-700 shadow-xl text-gray-300 relative mx-auto w-full flex flex-col';

        const showGameUI =
          gamePhase === 'playing' || gamePhase === 'loading_first_node' || gamePhase === 'error';

        if (gamePhase === 'loading_first_node' && !displayNode && !effectiveError) {
          return (
            <div className="flex-grow flex flex-col items-center justify-center h-full">
              <ArrowPathIcon className="h-10 w-10 text-amber-300 animate-spin mb-4" />
              <p className="text-gray-400">Generating your adventure...</p>
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
                  <div className={'w-full h-full flex flex-col'}>
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
                              {!isIphone && (
                                <button
                                  onClick={
                                    fullscreenHandle.active
                                      ? fullscreenHandle.exit
                                      : fullscreenHandle.enter
                                  }
                                  className="absolute top-2 left-2 z-20 p-1.5 bg-black/40 text-white/80 rounded-full hover:bg-black/60 hover:text-white transition-all opacity-50 hover:opacity-100 transition-opacity duration-200"
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
                              )}
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

                          {currentAudioData && (
                            <div className="absolute top-2 right-2 z-20 flex items-center space-x-2 bg-black/40 rounded-full px-2 py-1 opacity-50 hover:opacity-100 transition-opacity duration-200">
                              <button
                                onClick={togglePlayPause}
                                className="p-1 text-white/80 hover:text-white transition-all"
                                aria-label={isTTSPlaying ? 'Pause narration' : 'Play narration'}
                              >
                                {isTTSPlaying ? (
                                  <PauseIcon className="h-5 w-5" />
                                ) : (
                                  <PlayIcon className="h-5 w-5" />
                                )}
                              </button>
                              <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.05"
                                value={localVolume}
                                onChange={handleVolumeChange}
                                className="w-16 h-1 bg-slate-500 rounded-full appearance-none cursor-pointer accent-slate-400"
                                aria-label="Narration volume"
                              />
                              {ttsPlayerError && (
                                <span className="ml-2 text-xs text-red-400 bg-black/50 px-1.5 py-0.5 rounded">
                                  Audio Error
                                </span>
                              )}
                            </div>
                          )}

                          <div
                            className={`
                              absolute bottom-0 left-0 right-0 p-2 pt-10 sm:p-3 sm:pt-12 md:p-4 md:pt-16 z-10
                              bg-gradient-to-t from-black/80 via-black/60 to-transparent
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
                                  return (
                                    <button
                                      key={index}
                                      onClick={() => handleChoiceClick(choice, index)}
                                      className={`${buttonBaseClasses} ${choiceButtonClasses} ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''} ${isLoadingChoice ? 'border-amber-500 bg-amber-100/20' : ''}`}
                                      disabled={isDisabled}
                                      data-testid={`choice-button-${index}`}
                                    >
                                      <span>{choice.text}</span>
                                      {isLoadingChoice && (
                                        <ArrowPathIcon className="h-5 w-5 animate-spin text-amber-300/70 ml-2 sm:ml-3 md:ml-4" />
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
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
