'use client';

import React, { useEffect, useRef, useCallback, useState } from 'react';
import Image from 'next/image';
import useAdventureStore from '@/store/adventureStore';
import { AdventureChoiceSchema, AdventureNode } from '@/lib/domain/schemas';
import { z } from 'zod';
import { ArrowPathIcon, SpeakerWaveIcon, SpeakerXMarkIcon } from '@heroicons/react/24/solid';
import { generateStartingScenariosAction } from '../actions/adventure';
import AuthButton from '@/components/AuthButton';

type GamePhase = 'loading_scenarios' | 'selecting_scenario' | 'playing' | 'error';
type Scenario = z.infer<typeof AdventureChoiceSchema>;

// Helper function to format timestamp into a user-friendly string
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
  // For longer durations, show the time
  return `at ${resetDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

const AdventureGame = () => {
  const {
    currentNode,
    isLoading: isNodeLoading,
    error: nodeError,
    storyHistory,
    fetchAdventureNode,
    makeChoice,
    resetAdventure: resetStore,
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

  const audioRef = useRef<HTMLAudioElement>(null);
  const ttsAudioRef = useRef<HTMLAudioElement>(null);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const [clickedChoiceIndex, setClickedChoiceIndex] = useState<number | null>(null);
  const [currentAudioData, setCurrentAudioData] = useState<string | null>(null);

  const fetchScenarios = useCallback(async () => {
    setGamePhase('loading_scenarios');
    setIsUnauthorized(false);
    // Clear error in store before fetching
    useAdventureStore.setState({ error: null, isLoading: true });

    try {
      const result = await generateStartingScenariosAction();

      // Handle Rate Limit Error from starting scenarios
      if (result.rateLimitError) {
        console.warn('Scenario Rate Limit Hit:', result.rateLimitError);
        useAdventureStore.setState({
          error: { rateLimitError: result.rateLimitError },
          isLoading: false,
        });
        setGamePhase('error');
        return;
      }

      // Handle generic error from starting scenarios
      if (result.error) {
        if (result.error === 'Unauthorized: User must be logged in.') {
          console.log('[AdventureGame] User is not logged in.');
          setIsUnauthorized(true); // Keep local state for unauthorized display
          // Set generic error in store as well, or keep null?
          // Let's keep it null for now, isUnauthorized handles the display
          useAdventureStore.setState({ error: null, isLoading: false });
          setGamePhase('error');
          return;
        }
        // Throw other generic errors to be caught below
        throw new Error(result.error);
      }

      if (!result.scenarios) {
        throw new Error('No scenarios generated.');
      }

      // Success path
      setScenarios(result.scenarios);
      setGamePhase('selecting_scenario');
      useAdventureStore.setState({ isLoading: false, error: null }); // Ensure error is null on success
    } catch (err) {
      console.error('Error fetching scenarios:', err);
      // Set generic error state in the store
      useAdventureStore.setState({
        error: err instanceof Error ? err.message : 'Failed to load starting scenarios.',
        isLoading: false,
      });
      setGamePhase('error');
    }
  }, []);

  useEffect(() => {
    void fetchScenarios();
  }, [fetchScenarios]);

  const handleScenarioSelect = useCallback(
    (scenario: Scenario) => {
      console.log('Selected scenario:', scenario.text);
      setGamePhase('playing');
      setHasUserInteracted(true);
      useAdventureStore.setState({
        storyHistory: [{ passage: scenario.text }],
        currentNode: null,
        error: null,
      });
      void fetchAdventureNode();
    },
    [fetchAdventureNode]
  );

  const handleReset = useCallback(() => {
    resetStore(); // Resets store including error state
    setScenarios([]);
    setIsUnauthorized(false);
    setClickedChoiceIndex(null);
    setDisplayNode(null);
    setIsCurrentImageLoading(true);
    // Reset game phase and fetch scenarios again
    setGamePhase('loading_scenarios');
    void fetchScenarios();
  }, [resetStore, fetchScenarios]);

  const handleImageLoad = useCallback(
    (loadedImageUrl?: string) => {
      // console.log('[ImageLoad] Image load event fired for:', loadedImageUrl);
      if (displayNode?.imageUrl && loadedImageUrl === displayNode.imageUrl) {
        console.log('[ImageLoad] Matching image loaded. Setting loading state to false.');
        setIsCurrentImageLoading(false);

        if (hasUserInteracted && currentAudioData && ttsAudioRef.current && !isSpeaking) {
          console.log('[ImageLoad] Conditions met, attempting to play pre-fetched audio.');
          const audioSrc = `data:audio/mp3;base64,${currentAudioData}`;
          ttsAudioRef.current.src = audioSrc;
          ttsAudioRef.current
            .play()
            .then(() => {
              console.log('[ImageLoad] Audio playback started successfully.');
              setSpeaking(true);
            })
            .catch((err) => {
              console.error('[ImageLoad] Error playing audio:', err);
              setTTSError('Failed to auto-play audio after image load.');
              setSpeaking(false);
            });
        } else {
          console.log(
            `[ImageLoad] Conditions not met for audio auto-play: interacted=${hasUserInteracted}, hasAudio=${!!currentAudioData}, isSpeaking=${isSpeaking}`
          );
        }
      } else {
        console.log(
          `[ImageLoad] Mismatch or no display node URL. Loaded: ${loadedImageUrl}, Display Node URL: ${displayNode?.imageUrl}`
        );
      }
    },
    [displayNode, hasUserInteracted, currentAudioData, setSpeaking, setTTSError, isSpeaking]
  );

  const stopTTSSpeech = useCallback(() => {
    const audioElement = ttsAudioRef.current;
    if (audioElement) {
      audioElement.pause();
      audioElement.currentTime = 0;
      audioElement.src = '';
    }
    setSpeaking(false);
  }, [setSpeaking]);

  const handleToggleSpeak = useCallback(() => {
    const audioElement = ttsAudioRef.current;
    if (!audioElement) return;

    if (isSpeaking) {
      stopTTSSpeech();
    } else {
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
      const ambientAudio = audioRef.current;
      if (ambientAudio && ambientAudio.paused) {
        ambientAudio.play().catch((e) => console.warn('Ambient audio play failed:', e));
      }
      if (!hasUserInteracted) {
        setHasUserInteracted(true);
      }
    }
  }, [isSpeaking, stopTTSSpeech, currentAudioData, setSpeaking, setTTSError, hasUserInteracted]);

  useEffect(() => {
    const audioElement = ttsAudioRef.current;
    if (!audioElement) return;
    const handleAudioEnd = () => stopTTSSpeech();
    audioElement.addEventListener('ended', handleAudioEnd);
    return () => audioElement.removeEventListener('ended', handleAudioEnd);
  }, [stopTTSSpeech]);

  useEffect(() => {
    const newlyFetchedNode = gamePhase === 'playing' ? currentNode : null;

    console.log(
      '[Display Node Effect] Checking for node update. Current displayNode:',
      displayNode?.passage?.substring(0, 30),
      'Newly fetched node:',
      newlyFetchedNode?.passage?.substring(0, 30)
    );

    if (newlyFetchedNode && newlyFetchedNode.passage !== displayNode?.passage) {
      console.log(
        '[Display Node Effect] New node detected. TTS Available:',
        !!newlyFetchedNode.audioBase64
      );

      if (newlyFetchedNode.audioBase64 !== undefined) {
        console.log('[Display Node Effect] TTS ready or not required. Updating displayNode.');
        if (isSpeaking) {
          console.log('[Display Node Effect] New passage, stopping current speech.');
          stopTTSSpeech();
        }

        setDisplayNode(newlyFetchedNode);
        setCurrentAudioData(newlyFetchedNode.audioBase64 ?? null);

        if (newlyFetchedNode.imageUrl) {
          console.log(
            '[Display Node Effect] New image URL detected. Setting image loading to true.'
          );
          setIsCurrentImageLoading(true);
        } else {
          setIsCurrentImageLoading(false);
        }
      } else {
        console.log('[Display Node Effect] TTS data not yet available for new node. Waiting...');
      }
    } else if (!newlyFetchedNode && displayNode) {
      console.log('[Display Node Effect] Clearing display node.');
      setDisplayNode(null);
      setIsCurrentImageLoading(true);
      setCurrentAudioData(null);
      if (isSpeaking) stopTTSSpeech();
    }
  }, [currentNode, gamePhase, displayNode, isSpeaking, stopTTSSpeech]);

  useEffect(() => {
    const audioElement = audioRef.current;
    if (!audioElement) return;

    const targetSoundSrc = '/sounds/entrance_chamber_ambient.mp3';

    if (audioElement.src.endsWith(targetSoundSrc)) {
      console.log('Ambient audio source already set.');
    } else {
      console.log('Setting ambient audio source:', targetSoundSrc);
      audioElement.src = targetSoundSrc;
      audioElement.load();
    }

    return () => {
      audioElement?.pause();
    };
  }, []);

  const handleChoiceClick = useCallback(
    (choice: Scenario, index: number) => {
      if (!hasUserInteracted) {
        console.log('User interaction registered via choice click.');
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
  const secondaryButtonClasses =
    'border-gray-600 bg-gray-700 text-gray-300 hover:bg-gray-600 focus:ring-gray-500 shadow-sm';
  const ghostButtonClasses =
    'border-transparent text-gray-400 hover:bg-gray-700/50 hover:text-gray-300 focus:ring-gray-500';

  useEffect(() => {
    const ambientAudio = audioRef.current;
    if (ambientAudio) {
      ambientAudio.volume = ttsVolume;
    }
  }, [ttsVolume]);

  useEffect(() => {
    const ttsAudio = ttsAudioRef.current;
    if (ttsAudio) {
      ttsAudio.volume = ttsVolume;
    }
  }, [ttsVolume]);

  // Effect to synchronize gamePhase with error state from the store
  useEffect(() => {
    if (nodeError !== null) {
      // If there's an error in the store (rate limit or generic),
      // ensure the component enters the error phase.
      setGamePhase('error');
    }
    // We only want this effect to run when nodeError changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeError]);

  return (
    <>
      <audio ref={audioRef} loop hidden aria-hidden="true" />
      <audio ref={ttsAudioRef} hidden aria-hidden="true" />

      {(() => {
        const rateLimitInfo =
          typeof nodeError === 'object' && nodeError !== null && 'rateLimitError' in nodeError
            ? nodeError.rateLimitError
            : null;
        const genericErrorMessage = typeof nodeError === 'string' ? nodeError : null;

        return (
          <div className="bg-slate-800 rounded-lg p-4 md:p-6 border border-slate-700 shadow-xl text-gray-300 min-h-[350px] relative mx-auto w-full flex flex-col">
            {gamePhase === 'loading_scenarios' && (
              <div className="flex-grow flex flex-col items-center justify-center">
                <ArrowPathIcon className="h-10 w-10 text-amber-300 animate-spin mb-4" />
                <p className="text-gray-400">Generating starting adventures...</p>
              </div>
            )}

            {gamePhase === 'error' && isUnauthorized && (
              <div className="text-center text-amber-100/90 flex flex-col items-center justify-center absolute inset-0 bg-slate-800/90 z-10 rounded-lg p-4">
                <p className="text-xl font-semibold mb-4">Please Sign In</p>
                <p className="mb-6 text-gray-400">
                  You need to be signed in to start an adventure.
                </p>
                <AuthButton variant="short" />
              </div>
            )}

            {gamePhase === 'error' && rateLimitInfo && (
              <div className="text-center text-amber-300 flex flex-col items-center justify-center absolute inset-0 bg-slate-800/90 z-10 rounded-lg p-4">
                <p className="text-xl font-semibold mb-4">Time for a Break?</p>
                <p className="mb-6 text-gray-400">
                  You&apos;ve been adventuring hard! Maybe take a short break and come back{' '}
                  {formatResetTime(rateLimitInfo.resetTimestamp)}?
                </p>
                <button
                  onClick={handleReset}
                  className={`${buttonBaseClasses} ${secondaryButtonClasses}`}
                >
                  Start New Adventure
                </button>
              </div>
            )}

            {gamePhase === 'error' && !isUnauthorized && !rateLimitInfo && genericErrorMessage && (
              <div className="text-center text-red-400 flex flex-col items-center justify-center absolute inset-0 bg-slate-800/90 z-10 rounded-lg p-4">
                <p className="text-xl font-semibold mb-4">An Error Occurred</p>
                <p className="mb-6 text-gray-400">
                  {genericErrorMessage || 'An unknown error occurred.'}
                </p>
                <button
                  onClick={handleReset}
                  className={`${buttonBaseClasses} ${secondaryButtonClasses}`}
                >
                  Try Again
                </button>
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
                    </button>
                  ))}
                </div>
              </div>
            )}

            {gamePhase === 'playing' && !nodeError && (
              <>
                {isNodeLoading && !displayNode && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-800/80 rounded-lg z-20">
                    <ArrowPathIcon className="h-10 w-10 text-amber-300 animate-spin" />
                  </div>
                )}

                {displayNode && (
                  <>
                    <div className="flex flex-col md:flex-row md:items-start md:gap-6 lg:gap-8 mb-6">
                      {displayNode.imageUrl && (
                        <div className="w-full md:w-1/2 lg:w-5/12 flex-shrink-0 mb-4 md:mb-0">
                          <div className="aspect-[16/10] bg-slate-700 rounded overflow-hidden shadow-md mb-4 relative">
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
                              className={`object-cover transition-opacity duration-500 ${isCurrentImageLoading ? 'opacity-0' : 'opacity-100'}`}
                              priority
                              sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 40vw"
                              onLoad={() => handleImageLoad(displayNode.imageUrl)}
                              onError={() => {
                                console.error('Image failed to load:', displayNode.imageUrl);
                                setIsCurrentImageLoading(false);
                              }}
                            />
                          </div>
                          <div className="flex items-center justify-center space-x-4 w-full">
                            <button
                              onClick={handleToggleSpeak}
                              title={
                                currentAudioData
                                  ? isSpeaking
                                    ? 'Stop reading aloud'
                                    : 'Read passage aloud'
                                  : 'Audio not available'
                              }
                              aria-label={isSpeaking ? 'Stop reading aloud' : 'Read passage aloud'}
                              className={`${buttonBaseClasses} ${ghostButtonClasses} p-1 rounded-full ${!currentAudioData ? 'opacity-50 cursor-not-allowed' : ''}`}
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
                              className="h-1 w-24 cursor-pointer accent-amber-400"
                              title={`Volume: ${Math.round(ttsVolume * 100)}%`}
                              aria-label="Speech volume"
                              disabled={isNodeLoading}
                            />
                          </div>
                          {ttsError && (
                            <p className="mt-2 text-xs text-red-400 text-center">
                              Speech Error: {ttsError}
                            </p>
                          )}
                        </div>
                      )}

                      <div className={`${!displayNode.imageUrl ? 'w-full' : 'md:w-1/2 lg:w-7/12'}`}>
                        <div className="mb-4 text-xl leading-relaxed text-left w-full text-gray-300 relative">
                          {displayNode.passage ? (
                            <p style={{ whiteSpace: 'pre-wrap' }}>{displayNode.passage}</p>
                          ) : (
                            <p className="text-gray-500 italic">Loading passage...</p>
                          )}
                        </div>
                      </div>
                    </div>

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
                  </>
                )}
                {!displayNode && !isNodeLoading && gamePhase === 'playing' && (
                  <div className="flex-grow flex flex-col items-center justify-center">
                    <p className="text-gray-400">Generating your adventure...</p>
                  </div>
                )}
              </>
            )}

            {gamePhase === 'playing' && !isNodeLoading && !nodeError && storyHistory.length > 0 && (
              <div className="mt-8 pt-4 border-t border-slate-700 w-full max-w-lg mx-auto flex justify-center">
                <button
                  onClick={handleReset}
                  className={`${buttonBaseClasses} ${secondaryButtonClasses}`}
                >
                  Start New Adventure
                </button>
              </div>
            )}
          </div>
        );
      })()}
    </>
  );
};

export default AdventureGame;
