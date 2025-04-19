'use client';

import React, { useEffect, useRef, useCallback, useState } from 'react';
import Image from 'next/image';
import Script from 'next/script';
import useAdventureStore from '@/store/adventureStore';
import { AdventureChoiceSchema, AdventureNode } from '@/lib/domain/schemas';
import { z } from 'zod';
import {
  ArrowPathIcon,
  SpeakerWaveIcon,
  SpeakerXMarkIcon,
  EyeIcon,
  EyeSlashIcon,
  ArrowsPointingOutIcon,
  ArrowsPointingInIcon,
} from '@heroicons/react/24/solid';
import ScenarioSelector from './ScenarioSelector';
import useTTSPlayer from '@/hooks/useTTSPlayer';
import { FullScreen, useFullScreenHandle } from 'react-full-screen';

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
    text: 'The neon glow of Neo-Kyoto reflects in the slick, rain-streaked streets. You awaken with a data-chip implanted in your arm, a cryptic message flashing across your augmented reality display.',
    genre: 'Cyberpunk',
    tone: 'Gritty, Suspenseful',
    visualStyle: 'Dark, Dynamic Anime',
  },
  {
    text: 'You are a newly appointed village elder. The sacred spring has run dry, and the ancient prophecy foretells impending doom. A weathered map lies before you.',
    genre: 'Fantasy',
    tone: 'Hopeful, Somber',
    visualStyle: 'Watercolor Illustration',
  },
  {
    text: 'You are a detective, summoned to a lavish estate by an anonymous client. A priceless artifact has vanished, and the eccentric inhabitants are all prime suspects.',
    genre: 'Mystery',
    tone: 'Intriguing, Deceptive',
    visualStyle: 'Film Noir Photography',
  },
  {
    text: 'Your escape pod crash-lands on a desolate, uncharted planet. Scanners indicate a faint life-sign nearby. Your survival depends on finding its source.',
    genre: 'Sci-Fi Survival',
    tone: 'Isolated, Tense',
    visualStyle: 'Photorealistic, Bleak Landscape',
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
    ttsVolume,
    setTTSVolume,
  } = useAdventureStore();

  const [gamePhase, setGamePhase] = useState<GamePhase>('selecting_scenario');
  const [displayNode, setDisplayNode] = useState<AdventureNode | null>(null);
  const [isCurrentImageLoading, setIsCurrentImageLoading] = useState<boolean>(true);
  const [showChoices, setShowChoices] = useState<boolean>(false);
  const [showPassageText, setShowPassageText] = useState<boolean>(false);
  const [clickedChoiceIndex, setClickedChoiceIndex] = useState<number | null>(null);
  const [currentAudioData, setCurrentAudioData] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement>(null);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);

  const fullscreenHandle = useFullScreenHandle();
  const gameContainerRef = useRef<HTMLDivElement>(null);

  const {
    play: playTTS,
    pause: pauseTTS,
    stop: stopTTS,
    isPlaying: isTTSSpeaking,
    error: ttsPlayerError,
    audioRef: ttsAudioRef,
  } = useTTSPlayer({
    audioData: currentAudioData,
    volume: ttsVolume,
    onPlaybackEnd: useCallback(() => {
      setShowChoices(true);
    }, []),
    onPlaybackError: useCallback((_errorMsg: string) => {
      setShowChoices(true);
    }, []),
  });

  const handleScenarioSelect = useCallback(
    (scenario: Scenario) => {
      setGamePhase('loading_first_node');
      if (!hasUserInteracted) {
        setHasUserInteracted(true);
      }
      setDisplayNode(null);
      setIsCurrentImageLoading(true);
      setCurrentAudioData(null);
      setShowChoices(false);
      setShowPassageText(false);
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

        if (hasUserInteracted && currentAudioData) {
          playTTS();
        } else if (!currentAudioData) {
          setShowChoices(true);
        }
      }
    },
    [
      displayNode,
      hasUserInteracted,
      currentAudioData,
      setIsCurrentImageLoading,
      setShowChoices,
      playTTS,
    ]
  );

  const handleToggleSpeak = useCallback(() => {
    if (isTTSSpeaking) {
      pauseTTS();
    } else {
      if (currentAudioData) {
        playTTS();
      } else {
        console.warn('[ToggleSpeak] No audio data available to play.');
      }
      if (!hasUserInteracted) {
        setHasUserInteracted(true);
      }
    }
  }, [isTTSSpeaking, pauseTTS, playTTS, currentAudioData, hasUserInteracted]);

  useEffect(() => {
    const newlyFetchedNode =
      gamePhase === 'playing' || gamePhase === 'loading_first_node' ? currentNode : null;

    if (newlyFetchedNode && newlyFetchedNode.passage !== displayNode?.passage) {
      if (isTTSSpeaking) {
        stopTTS();
      }
      setShowChoices(false);

      setDisplayNode(newlyFetchedNode);
      setCurrentAudioData(newlyFetchedNode.audioBase64 ?? null);
      const imageAvailable = !!newlyFetchedNode.imageUrl;
      const audioAvailable = !!newlyFetchedNode.audioBase64;
      setIsCurrentImageLoading(imageAvailable);

      if (gamePhase === 'loading_first_node') {
        setGamePhase('playing');
      }

      if (!imageAvailable && !audioAvailable) {
        setShowChoices(true);
      }
    } else if (!newlyFetchedNode && displayNode && gamePhase === 'playing') {
      setDisplayNode(null);
      setIsCurrentImageLoading(true);
      setCurrentAudioData(null);
      if (isTTSSpeaking) stopTTS();
      setShowChoices(false);
    }
  }, [currentNode, gamePhase, displayNode, isTTSSpeaking, stopTTS]);

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
    'w-full text-left justify-start p-4 h-auto border-amber-800/50 bg-gradient-to-br from-amber-100/5 via-amber-100/10 to-amber-100/5 text-amber-100/80 hover:text-amber-100 hover:border-amber-700 hover:from-amber-100/10 hover:to-amber-100/10 focus:ring-amber-500 shadow-md hover:shadow-lg';
  const ghostButtonClasses =
    'border-transparent text-gray-400 hover:bg-gray-700/50 hover:text-gray-300 focus:ring-gray-500';

  useEffect(() => {
    if (nodeError !== null) {
      setGamePhase('error');
    }
  }, [nodeError]);

  return (
    <>
      <Script
        src="https://storage.ko-fi.com/cdn/scripts/overlay-widget.js"
        strategy="afterInteractive"
        onLoad={() => {
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
        }}
      />

      <audio ref={audioRef} loop hidden aria-hidden="true" />
      <audio ref={ttsAudioRef} hidden aria-hidden="true" />

      {(() => {
        const rateLimitInfo =
          typeof nodeError === 'object' && nodeError !== null && 'rateLimitError' in nodeError
            ? (nodeError.rateLimitError as RateLimitError)
            : null;
        const genericErrorMessage = typeof nodeError === 'string' ? nodeError : null;

        const containerClasses = fullscreenHandle.active
          ? 'fixed inset-0 z-50 bg-black flex items-center justify-center'
          : 'bg-slate-800 rounded-lg p-4 md:p-6 border border-slate-700 shadow-xl text-gray-300 min-h-[350px] relative mx-auto w-full flex flex-col';

        // Determine if the main game UI or the selector should be shown
        const showGameUI =
          gamePhase === 'playing' || gamePhase === 'loading_first_node' || gamePhase === 'error';

        return (
          <div ref={gameContainerRef} className={containerClasses}>
            {/* Scenario Selector */}
            {gamePhase === 'selecting_scenario' && (
              <ScenarioSelector
                onScenarioSelect={handleScenarioSelect}
                // @ts-expect-error TS correctly identifies this state is impossible *while* selecting_scenario is true, but the prop needs to check for the *next* state.
                isLoadingSelection={isNodeLoading && gamePhase === 'loading_first_node'} // Loading state for the *first* node fetch
                hardcodedScenarios={hardcodedScenarios}
              />
            )}

            {/* Loading Overlay for First Node */}
            {gamePhase === 'loading_first_node' && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-800/80 rounded-lg z-20">
                <ArrowPathIcon className="h-10 w-10 text-amber-300 animate-spin" />
              </div>
            )}

            {/* Rate Limit Error Display (Gameplay) */}
            {gamePhase === 'error' && rateLimitInfo && !rateLimitInfo.apiType && (
              <div className="text-center text-amber-300 flex flex-col items-center justify-center absolute inset-0 bg-slate-800/90 z-10 rounded-lg p-4">
                <p className="text-xl font-semibold mb-4">Time for a Break?</p>
                <p className="mb-6 text-gray-400">
                  You&apos;ve been adventuring hard! Maybe take a short break and come back{' '}
                  {formatResetTime(rateLimitInfo.resetTimestamp)}?
                </p>
              </div>
            )}

            {/* Generic Error Display (Gameplay) */}
            {gamePhase === 'error' && !rateLimitInfo && genericErrorMessage && (
              <div className="text-center text-red-400 flex flex-col items-center justify-center absolute inset-0 bg-slate-800/90 z-10 rounded-lg p-4">
                <p className="text-xl font-semibold mb-4">An Error Occurred</p>
                <p className="mb-6 text-gray-400">
                  {genericErrorMessage || 'An unknown error occurred during the adventure.'}
                </p>
              </div>
            )}

            {/* Main Game Playing UI */}
            {showGameUI && gamePhase !== 'error' && (
              <FullScreen handle={fullscreenHandle}>
                <>
                  {displayNode && (
                    <>
                      <div
                        className={`
                        ${
                          fullscreenHandle.active
                            ? 'relative h-full aspect-video'
                            : 'flex flex-col md:flex-row md:items-start md:gap-6 lg:gap-8 mb-6'
                        }
                      `}
                      >
                        {displayNode.imageUrl && (
                          <div
                            className={`
                              relative group overflow-hidden w-full h-full
                              ${
                                fullscreenHandle.active
                                  ? 'bg-black'
                                  : `flex-shrink-0 mb-4 md:mb-0 aspect-[16/10] rounded shadow-md bg-slate-700 ${showPassageText ? 'w-full md:w-1/2 lg:w-5/12' : 'w-full'}`
                              }
                            `}
                          >
                            {isCurrentImageLoading && (
                              <div className="absolute inset-0 bg-slate-600 flex items-center justify-center z-10">
                                <ArrowPathIcon className="h-8 w-8 text-slate-400 animate-spin" />
                              </div>
                            )}
                            <Image
                              key={displayNode.imageUrl}
                              src={displayNode.imageUrl}
                              alt="Adventure scene"
                              fill
                              className={`
                                ${
                                  fullscreenHandle.active
                                    ? 'absolute inset-0 w-full h-full object-cover'
                                    : 'object-cover'
                                }
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
                            <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between space-x-3 p-2 bg-gradient-to-b from-black/80 to-transparent">
                              <button
                                onClick={
                                  fullscreenHandle.active
                                    ? fullscreenHandle.exit
                                    : fullscreenHandle.enter
                                }
                                title={
                                  fullscreenHandle.active ? 'Exit fullscreen' : 'Enter fullscreen'
                                }
                                aria-label={
                                  fullscreenHandle.active ? 'Exit fullscreen' : 'Enter fullscreen'
                                }
                                className={`${buttonBaseClasses} ${ghostButtonClasses} p-1 rounded-full text-white hover:opacity-80 drop-shadow-sm`}
                              >
                                {fullscreenHandle.active ? (
                                  <ArrowsPointingInIcon className="h-5 w-5" />
                                ) : (
                                  <ArrowsPointingOutIcon className="h-5 w-5" />
                                )}
                              </button>
                              <div className="flex items-center space-x-3">
                                <button
                                  onClick={handleToggleSpeak}
                                  title={
                                    currentAudioData
                                      ? isTTSSpeaking
                                        ? 'Stop reading aloud'
                                        : 'Read passage aloud'
                                      : 'Audio not available'
                                  }
                                  aria-label={
                                    isTTSSpeaking ? 'Stop reading aloud' : 'Read passage aloud'
                                  }
                                  className={`${buttonBaseClasses} ${ghostButtonClasses} p-1 rounded-full text-white hover:opacity-80 drop-shadow-sm ${!currentAudioData ? 'opacity-50 cursor-not-allowed' : ''}`}
                                  disabled={isNodeLoading || !currentAudioData}
                                >
                                  {isTTSSpeaking ? (
                                    <SpeakerXMarkIcon className="h-5 w-5" />
                                  ) : (
                                    <SpeakerWaveIcon className="h-5 w-5" />
                                  )}
                                </button>
                                <input
                                  type="range"
                                  min="0"
                                  max="1"
                                  step="0.1"
                                  value={ttsVolume}
                                  onChange={(e) => setTTSVolume(parseFloat(e.target.value))}
                                  className="h-1 w-20 md:w-24 cursor-pointer appearance-none rounded-full bg-transparent focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-black/50 focus:ring-amber-500 [&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:w-full [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-gray-400/70 [&::-moz-range-track]:h-1 [&::-moz-range-track]:w-full [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-gray-400/70 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-amber-400 [&::-webkit-slider-thumb]:-mt-1 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:bg-amber-400 [&::-moz-range-thumb]:-mt-1"
                                  title={`Volume: ${Math.round(ttsVolume * 100)}%`}
                                  aria-label="Speech volume"
                                  disabled={isNodeLoading}
                                />
                                <button
                                  onClick={() => setShowPassageText((prev) => !prev)}
                                  title={showPassageText ? 'Hide text' : 'Show text'}
                                  aria-label={showPassageText ? 'Hide text' : 'Show text'}
                                  className={`${buttonBaseClasses} ${ghostButtonClasses} p-1 rounded-full text-white hover:opacity-80 drop-shadow-sm`}
                                >
                                  {showPassageText ? (
                                    <EyeSlashIcon className="h-5 w-5" />
                                  ) : (
                                    <EyeIcon className="h-5 w-5" />
                                  )}
                                </button>
                              </div>
                            </div>
                          </div>
                        )}

                        <div
                          className={`
                            absolute bottom-0 left-0 right-0 p-4 pt-16
                            bg-gradient-to-t from-black/90 via-black/70 to-transparent
                            transition-opacity duration-500 ease-in-out
                            ${showChoices ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}
                          `}
                        >
                          {showChoices && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 w-full">
                              {displayNode.choices.map((choice, index) => {
                                const isClicked = index === clickedChoiceIndex;
                                const isDisabled = isNodeLoading;
                                const isLoadingChoice = isNodeLoading && isClicked;
                                return (
                                  <button
                                    key={index}
                                    onClick={() => handleChoiceClick(choice, index)}
                                    className={`${buttonBaseClasses} ${choiceButtonClasses} flex items-center justify-between ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''} ${isLoadingChoice ? 'border-amber-500 bg-amber-100/20' : ''}`}
                                    disabled={isDisabled}
                                    data-testid={`choice-button-${index}`}
                                  >
                                    <span>{choice.text}</span>
                                    {isLoadingChoice && (
                                      <ArrowPathIcon className="h-5 w-5 animate-spin text-amber-300/70 ml-4" />
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {ttsPlayerError && (
                          <p className="absolute bottom-0 left-0 right-0 mb-2 text-xs text-red-400 text-center z-5">
                            Speech Error: {ttsPlayerError}
                          </p>
                        )}
                      </div>
                    </>
                  )}
                  {/* Loading Indicator specifically for *subsequent* nodes */}
                  {!displayNode && isNodeLoading && gamePhase === 'playing' && (
                    <div className="flex-grow flex flex-col items-center justify-center">
                      <ArrowPathIcon className="h-8 w-8 text-amber-300 animate-spin mb-2" />
                      <p className="text-gray-400 italic">Loading next part...</p>
                    </div>
                  )}
                </>
              </FullScreen>
            )}
          </div>
        );
      })()}
    </>
  );
};

export default AdventureGame;
