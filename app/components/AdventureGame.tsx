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
    ttsVolume: storeTtsVolume,
    setTTSVolume,
  } = useAdventureStore();

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
    'w-full text-left justify-start p-4 h-auto border-amber-800/50 bg-gradient-to-br from-amber-100/5 via-amber-100/10 to-amber-100/5 text-amber-100/80 hover:text-amber-100 hover:border-amber-700 hover:from-amber-100/10 hover:to-amber-100/10 focus:ring-amber-500 shadow-md hover:shadow-lg';

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

  return (
    <>
      <Script
        src="https://storage.ko-fi.com/cdn/scripts/overlay-widget.js"
        strategy="afterInteractive"
      />

      {(() => {
        const rateLimitInfo =
          typeof nodeError === 'object' && nodeError !== null && 'rateLimitError' in nodeError
            ? (nodeError.rateLimitError as RateLimitError)
            : null;
        const genericErrorMessage = typeof nodeError === 'string' ? nodeError : null;

        const containerClasses = fullscreenHandle.active
          ? 'fixed inset-0 z-50 bg-black flex items-center justify-center'
          : 'bg-slate-800 rounded-lg p-4 md:p-6 border border-slate-700 shadow-xl text-gray-300 min-h-[350px] relative mx-auto w-full flex flex-col';

        const showGameUI =
          gamePhase === 'playing' || gamePhase === 'loading_first_node' || gamePhase === 'error';

        return (
          <div ref={gameContainerRef} className={containerClasses}>
            {gamePhase === 'selecting_scenario' && (
              <ScenarioSelector
                onScenarioSelect={handleScenarioSelect}
                isLoadingSelection={isSelectingScenario}
                hardcodedScenarios={hardcodedScenarios}
              />
            )}

            {gamePhase === 'loading_first_node' && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-800/80 rounded-lg z-20">
                <ArrowPathIcon className="h-10 w-10 text-amber-300 animate-spin" />
              </div>
            )}

            {gamePhase === 'error' && rateLimitInfo && !rateLimitInfo.apiType && (
              <div className="text-center text-amber-300 flex flex-col items-center justify-center absolute inset-0 bg-slate-800/90 z-10 rounded-lg p-4">
                <p className="text-xl font-semibold mb-4">Time for a Break?</p>
                <p className="mb-6 text-gray-400">
                  You&apos;ve been adventuring hard! Maybe take a short break and come back{' '}
                  {formatResetTime(rateLimitInfo.resetTimestamp)}?
                </p>
              </div>
            )}

            {gamePhase === 'error' && !rateLimitInfo && genericErrorMessage && (
              <div className="text-center text-red-400 flex flex-col items-center justify-center absolute inset-0 bg-slate-800/90 z-10 rounded-lg p-4">
                <p className="text-xl font-semibold mb-4">An Error Occurred</p>
                <p className="mb-6 text-gray-400">
                  {genericErrorMessage || 'An unknown error occurred during the adventure.'}
                </p>
              </div>
            )}

            {showGameUI && gamePhase !== 'error' && (
              <FullScreen handle={fullscreenHandle}>
                <>
                  <div
                    className={
                      fullscreenHandle.active
                        ? 'p-4 w-full h-full flex flex-col'
                        : 'w-full h-full flex flex-col'
                    }
                  >
                    {displayNode && (
                      <>
                        <div
                          className={`
                            relative group overflow-hidden w-full flex-grow
                            ${fullscreenHandle.active ? 'bg-black' : 'aspect-[16/10] rounded shadow-md bg-slate-700'}
                            mb-4
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
                              absolute bottom-0 left-0 right-0 p-4 pt-16 z-10
                              bg-gradient-to-t from-black/80 via-black/60 to-transparent
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
