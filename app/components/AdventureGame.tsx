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
import { generateStartingScenariosAction } from '../actions/adventure';

interface KofiWidgetOverlay {
  draw(username: string, config: Record<string, string>): void;
}

declare const kofiWidgetOverlay: KofiWidgetOverlay | undefined;

type GamePhase =
  | 'loading_scenarios'
  | 'selecting_scenario'
  | 'loading_first_node'
  | 'playing'
  | 'error';
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

const SCENARIO_CACHE_KEY = 'adventureGame_startingScenarios';

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

interface FullscreenElement extends HTMLElement {
  webkitRequestFullscreen?(): Promise<void>;
  mozRequestFullScreen?(): Promise<void>; // Note capital 'S'
  msRequestFullscreen?(): Promise<void>;
}

interface FullscreenDocument extends Document {
  webkitExitFullscreen?(): Promise<void>;
  mozCancelFullScreen?(): Promise<void>; // Note different name and capital 'S'
  msExitFullscreen?(): Promise<void>;

  webkitFullscreenElement?: Element | null;
  mozFullScreenElement?: Element | null; // Note capital 'S'
  msFullscreenElement?: Element | null;
}

const AdventureGame = () => {
  const {
    currentNode,
    isLoading: isNodeLoading,
    error: nodeError,
    storyHistory,
    makeChoice,
    isSpeaking,
    ttsError,
    ttsVolume,
    setSpeaking,
    setTTSError,
    setTTSVolume,
  } = useAdventureStore();

  const [gamePhase, setGamePhase] = useState<GamePhase>('loading_scenarios');
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [isUnauthorized, setIsUnauthorized] = useState(false);
  const [displayNode, setDisplayNode] = useState<AdventureNode | null>(null);
  const [isCurrentImageLoading, setIsCurrentImageLoading] = useState<boolean>(true);
  const [showChoices, setShowChoices] = useState<boolean>(false);
  const [showPassageText, setShowPassageText] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  const audioRef = useRef<HTMLAudioElement>(null);
  const ttsAudioRef = useRef<HTMLAudioElement>(null);
  const gameContainerRef = useRef<HTMLDivElement>(null);
  const readingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const [clickedChoiceIndex, setClickedChoiceIndex] = useState<number | null>(null);
  const [currentAudioData, setCurrentAudioData] = useState<string | null>(null);

  const fetchScenarios = useCallback(async () => {
    try {
      const cachedData = sessionStorage.getItem(SCENARIO_CACHE_KEY);
      if (cachedData) {
        const parsedData = JSON.parse(cachedData) as Scenario[];
        setScenarios(parsedData);
        setGamePhase('selecting_scenario');
        useAdventureStore.setState({ isLoading: false, error: null });
        setIsUnauthorized(false);
        return;
      }
    } catch (error) {
      console.error('Error reading scenarios from sessionStorage:', error);
      sessionStorage.removeItem(SCENARIO_CACHE_KEY);
    }

    setGamePhase('loading_scenarios');
    setIsUnauthorized(false);
    useAdventureStore.setState({ error: null, isLoading: true });

    try {
      const result = await generateStartingScenariosAction();

      if (result.error === 'Unauthorized: User must be logged in.') {
        setScenarios(hardcodedScenarios);
        setGamePhase('selecting_scenario');
        useAdventureStore.setState({ error: null, isLoading: false });
        setIsUnauthorized(true);
        return;
      }

      if (result.rateLimitError) {
        useAdventureStore.setState({
          error: { rateLimitError: result.rateLimitError },
          isLoading: false,
        });
        setGamePhase('error');
        return;
      }

      if (!result.scenarios) {
        throw new Error('No scenarios generated.');
      }

      setScenarios(result.scenarios);
      try {
        sessionStorage.setItem(SCENARIO_CACHE_KEY, JSON.stringify(result.scenarios));
      } catch (error) {
        console.error('Error saving scenarios to sessionStorage:', error);
      }

      setGamePhase('selecting_scenario');
      useAdventureStore.setState({ isLoading: false, error: null });
    } catch (err) {
      console.error('Error fetching scenarios:', err);
      useAdventureStore.setState({
        error: err instanceof Error ? err.message : 'Failed to load starting scenarios.',
        isLoading: false,
      });
      setGamePhase('error');
    }
  }, []);

  const stopTTSSpeech = useCallback(() => {
    const audioElement = ttsAudioRef.current;
    if (audioElement) {
      audioElement.pause();
      audioElement.currentTime = 0;
      audioElement.src = '';
    }
    setSpeaking(false);
    setShowChoices(true);
    if (readingTimerRef.current) {
      clearTimeout(readingTimerRef.current);
      readingTimerRef.current = null;
    }
  }, [setSpeaking]);

  const pauseTTSSpeech = useCallback(() => {
    const audioElement = ttsAudioRef.current;
    if (audioElement) {
      audioElement.pause();
    }
    setSpeaking(false);
    if (readingTimerRef.current) {
      clearTimeout(readingTimerRef.current);
      readingTimerRef.current = null;
    }
  }, [setSpeaking]);

  useEffect(() => {
    const shouldFetch =
      gamePhase === 'loading_scenarios' ||
      (currentNode === null && storyHistory.length === 0 && gamePhase !== 'selecting_scenario');

    if (shouldFetch) {
      if (gamePhase !== 'loading_scenarios') {
        setGamePhase('loading_scenarios');
      }
      setScenarios([]);
      setClickedChoiceIndex(null);
      setDisplayNode(null);
      setIsCurrentImageLoading(true);
      setCurrentAudioData(null);
      setShowChoices(false);
      setShowPassageText(false);
      if (readingTimerRef.current) {
        clearTimeout(readingTimerRef.current);
        readingTimerRef.current = null;
      }
      stopTTSSpeech();

      void fetchScenarios();
    }
  }, [fetchScenarios, currentNode, storyHistory, gamePhase, stopTTSSpeech]);

  const handleScenarioSelect = useCallback(
    (scenario: Scenario) => {
      setGamePhase('loading_first_node');
      if (!hasUserInteracted) {
        setHasUserInteracted(true);
      }
      makeChoice(scenario);
    },
    [makeChoice, hasUserInteracted]
  );

  const handleImageLoad = useCallback(
    (loadedImageUrl?: string) => {
      if (displayNode?.imageUrl && loadedImageUrl === displayNode.imageUrl) {
        setIsCurrentImageLoading(false);

        if (hasUserInteracted && currentAudioData && ttsAudioRef.current && !isSpeaking) {
          const audioSrc = `data:audio/mp3;base64,${currentAudioData}`;
          ttsAudioRef.current.src = audioSrc;
          ttsAudioRef.current
            .play()
            .then(() => {
              setSpeaking(true);
            })
            .catch((_err) => {
              setTTSError('Failed to auto-play audio after image load.');
              setSpeaking(false);
              setShowChoices(true);
            });
        } else if (!currentAudioData) {
          setShowChoices(true);
        }
      }
    },
    [
      displayNode,
      hasUserInteracted,
      currentAudioData,
      setSpeaking,
      setTTSError,
      isSpeaking,
      setIsCurrentImageLoading,
      setShowChoices,
    ]
  );

  const handleToggleSpeak = useCallback(() => {
    const audioElement = ttsAudioRef.current;
    if (!audioElement) return;

    if (isSpeaking) {
      pauseTTSSpeech();
    } else {
      if (readingTimerRef.current) {
        clearTimeout(readingTimerRef.current);
        readingTimerRef.current = null;
      }
      if (currentAudioData) {
        if (!audioElement.src.startsWith('data:audio/mp3')) {
          audioElement.src = `data:audio/mp3;base64,${currentAudioData}`;
        }
        audioElement
          .play()
          .then(() => setSpeaking(true))
          .catch((err) => {
            console.error('[ToggleSpeak] Error playing audio:', err);
            setTTSError('Failed to play audio.');
          });
      } else {
        console.warn('[ToggleSpeak] No audio data available to play.');
        setTTSError('Audio not available for this passage.');
      }
      if (!hasUserInteracted) {
        setHasUserInteracted(true);
      }
    }
  }, [isSpeaking, pauseTTSSpeech, currentAudioData, setSpeaking, setTTSError, hasUserInteracted]);

  useEffect(() => {
    const audioElement = ttsAudioRef.current;
    if (!audioElement) return;
    const handleAudioEnd = () => stopTTSSpeech();
    audioElement.addEventListener('ended', handleAudioEnd);
    return () => audioElement.removeEventListener('ended', handleAudioEnd);
  }, [stopTTSSpeech]);

  useEffect(() => {
    const newlyFetchedNode =
      gamePhase === 'playing' || gamePhase === 'loading_first_node' ? currentNode : null;

    if (newlyFetchedNode && newlyFetchedNode.passage !== displayNode?.passage) {
      if (isSpeaking) {
        stopTTSSpeech();
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
      if (isSpeaking) stopTTSSpeech();
      setShowChoices(false);
    }
  }, [currentNode, gamePhase, displayNode, isSpeaking, stopTTSSpeech]);

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
    const ttsAudio = ttsAudioRef.current;
    if (ttsAudio) {
      ttsAudio.volume = ttsVolume;
    }
  }, [ttsVolume]);

  useEffect(() => {
    if (nodeError !== null) {
      setGamePhase('error');
    }
  }, [nodeError]);

  useEffect(() => {
    return () => {
      if (readingTimerRef.current) {
        clearTimeout(readingTimerRef.current);
      }
    };
  }, []);

  const handleToggleFullscreen = useCallback(() => {
    const elem = gameContainerRef.current;
    if (!elem) return;

    // Use interfaces with type assertions
    const fullscreenElem = elem as FullscreenElement;
    const fullscreenDoc = document as FullscreenDocument;

    // Define potential requestFullscreen methods with vendor prefixes
    const requestFullscreen =
      // eslint-disable-next-line @typescript-eslint/unbound-method
      fullscreenElem.requestFullscreen ||
      // eslint-disable-next-line @typescript-eslint/unbound-method
      fullscreenElem.webkitRequestFullscreen ||
      // eslint-disable-next-line @typescript-eslint/unbound-method
      fullscreenElem.mozRequestFullScreen ||
      // eslint-disable-next-line @typescript-eslint/unbound-method
      fullscreenElem.msRequestFullscreen;

    // Define potential exitFullscreen methods with vendor prefixes
    const exitFullscreen =
      // eslint-disable-next-line @typescript-eslint/unbound-method
      fullscreenDoc.exitFullscreen ||
      // eslint-disable-next-line @typescript-eslint/unbound-method
      fullscreenDoc.webkitExitFullscreen ||
      // eslint-disable-next-line @typescript-eslint/unbound-method
      fullscreenDoc.mozCancelFullScreen ||
      // eslint-disable-next-line @typescript-eslint/unbound-method
      fullscreenDoc.msExitFullscreen;

    // Define potential fullscreenElement properties with vendor prefixes
    const fullscreenElement =
      fullscreenDoc.fullscreenElement ||
      fullscreenDoc.webkitFullscreenElement ||
      fullscreenDoc.mozFullScreenElement ||
      fullscreenDoc.msFullscreenElement;

    if (!fullscreenElement) {
      if (requestFullscreen) {
        // Bind 'this' to the element
        requestFullscreen.call(fullscreenElem).catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          const name = err instanceof Error ? err.name : 'UnknownError';
          console.error(`Error attempting to enable full-screen mode: ${message} (${name})`);
        });
      } else {
        console.error('Fullscreen API is not supported by this browser.');
      }
    } else {
      if (exitFullscreen) {
        // Bind 'this' to the document
        exitFullscreen.call(fullscreenDoc).catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          const name = err instanceof Error ? err.name : 'UnknownError';
          console.error(`Error attempting to exit full-screen mode: ${message} (${name})`);
        });
      } else {
        console.error('Fullscreen API is not supported by this browser.');
      }
    }
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const fullscreenDoc = document as FullscreenDocument;
      // Check multiple vendor-prefixed fullscreenElement properties
      const isCurrentlyFullscreen = !!(
        fullscreenDoc.fullscreenElement ||
        fullscreenDoc.webkitFullscreenElement ||
        fullscreenDoc.mozFullScreenElement ||
        fullscreenDoc.msFullscreenElement
      );
      setIsFullscreen(isCurrentlyFullscreen);
    };

    // Listen to vendor-prefixed fullscreenchange events
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange); // Note: no capital 'S'
    document.addEventListener('MSFullscreenChange', handleFullscreenChange); // Note: capital 'MSF'

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, []);

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
            ? nodeError.rateLimitError
            : null;
        const genericErrorMessage = typeof nodeError === 'string' ? nodeError : null;

        const containerClasses = isFullscreen
          ? 'fixed inset-0 z-50 bg-black flex items-center justify-center'
          : 'bg-slate-800 rounded-lg p-4 md:p-6 border border-slate-700 shadow-xl text-gray-300 min-h-[350px] relative mx-auto w-full flex flex-col';

        return (
          <div ref={gameContainerRef} className={containerClasses}>
            {gamePhase === 'loading_scenarios' && (
              <div className="flex-grow flex flex-col items-center justify-center">
                <ArrowPathIcon className="h-10 w-10 text-amber-300 animate-spin mb-4" />
                <p className="text-gray-400">Generating starting adventures...</p>
              </div>
            )}

            {gamePhase === 'loading_first_node' && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-800/80 rounded-lg z-20">
                <ArrowPathIcon className="h-10 w-10 text-amber-300 animate-spin" />
              </div>
            )}

            {gamePhase === 'error' && isUnauthorized && (
              <div className="text-center text-amber-100/90 flex flex-col items-center justify-center absolute inset-0 bg-slate-800/90 z-10 rounded-lg p-4">
                <p className="text-xl font-semibold mb-4">Please Sign In</p>
                <p className="mb-6 text-gray-400">
                  Please sign in to join the waiting list. Once approved, you can start your
                  adventure!
                </p>
              </div>
            )}

            {gamePhase === 'error' && rateLimitInfo && (
              <div className="text-center text-amber-300 flex flex-col items-center justify-center absolute inset-0 bg-slate-800/90 z-10 rounded-lg p-4">
                <p className="text-xl font-semibold mb-4">Time for a Break?</p>
                <p className="mb-6 text-gray-400">
                  You&apos;ve been adventuring hard! Maybe take a short break and come back{' '}
                  {formatResetTime(rateLimitInfo.resetTimestamp)}?
                </p>
              </div>
            )}

            {gamePhase === 'error' &&
              !rateLimitInfo &&
              !(
                typeof nodeError === 'string' &&
                nodeError === 'Unauthorized: User must be logged in.'
              ) &&
              genericErrorMessage && (
                <div className="text-center text-red-400 flex flex-col items-center justify-center absolute inset-0 bg-slate-800/90 z-10 rounded-lg p-4">
                  <p className="text-xl font-semibold mb-4">An Error Occurred</p>
                  <p className="mb-6 text-gray-400">
                    {genericErrorMessage || 'An unknown error occurred.'}
                  </p>
                </div>
              )}

            {gamePhase === 'selecting_scenario' && !nodeError && (
              <div className="flex-grow flex flex-col items-center">
                <h2 className="text-2xl font-semibold text-amber-100/90 mb-6 font-serif">
                  Choose your starting scenario:
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-4xl">
                  {scenarios.map((scenario, index) => (
                    <button
                      key={index}
                      onClick={() => handleScenarioSelect(scenario)}
                      className={`${buttonBaseClasses} ${choiceButtonClasses}`}
                      disabled={isNodeLoading}
                    >
                      <span>{scenario.text}</span>
                      <div className="text-xs mt-1 text-amber-200/50">
                        {scenario.genre && <span>Genre: {scenario.genre}</span>}
                        {scenario.tone && <span className="ml-2">Tone: {scenario.tone}</span>}
                        {scenario.visualStyle && (
                          <span className="ml-2">Style: {scenario.visualStyle}</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {gamePhase === 'playing' && !nodeError && (
              <>
                {displayNode && (
                  <>
                    <div
                      className={`
                      ${
                        isFullscreen
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
                              isFullscreen
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
                                isFullscreen
                                  ? 'absolute inset-0 w-full h-full object-cover'
                                  : 'object-cover'
                              }
                              transition-opacity duration-500 ${isCurrentImageLoading ? 'opacity-0' : 'opacity-100'}
                            `}
                            priority
                            sizes={
                              isFullscreen
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
                              onClick={handleToggleFullscreen}
                              title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                              aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                              className={`${buttonBaseClasses} ${ghostButtonClasses} p-1 rounded-full text-white hover:opacity-80 drop-shadow-sm`}
                            >
                              {isFullscreen ? (
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
                                    ? isSpeaking
                                      ? 'Stop reading aloud'
                                      : 'Read passage aloud'
                                    : 'Audio not available'
                                }
                                aria-label={
                                  isSpeaking ? 'Stop reading aloud' : 'Read passage aloud'
                                }
                                className={`${buttonBaseClasses} ${ghostButtonClasses} p-1 rounded-full text-white hover:opacity-80 drop-shadow-sm ${!currentAudioData ? 'opacity-50 cursor-not-allowed' : ''}`}
                                disabled={isNodeLoading || !currentAudioData}
                              >
                                {isSpeaking ? (
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

                          {ttsError && (
                            <p className="absolute bottom-0 left-0 right-0 mb-2 text-xs text-red-400 text-center z-5">
                              Speech Error: {ttsError}
                            </p>
                          )}
                        </div>
                      )}

                      {!isFullscreen && showPassageText && (
                        <div
                          className={`${!displayNode.imageUrl ? 'w-full' : 'md:w-1/2 lg:w-7/12'}`}
                        >
                          <div className="mb-4 text-xl leading-relaxed text-left w-full text-gray-300 relative">
                            {displayNode.passage ? (
                              <p style={{ whiteSpace: 'pre-wrap' }}>{displayNode.passage}</p>
                            ) : (
                              <p className="text-gray-500 italic">Loading passage...</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
                {!displayNode && isNodeLoading && gamePhase === 'playing' && (
                  <div className="flex-grow flex flex-col items-center justify-center">
                    <p className="text-gray-400 italic">Loading next part...</p>
                  </div>
                )}
              </>
            )}
          </div>
        );
      })()}
    </>
  );
};

export default AdventureGame;
