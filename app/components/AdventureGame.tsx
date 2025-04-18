'use client';

import React, { useEffect, useRef, useCallback, useState } from 'react';
import Image from 'next/image'; // Import next/image
import useAdventureStore from '@/store/adventureStore';
import { AdventureChoiceSchema } from '@/lib/domain/schemas'; // Import schema type
import { z } from 'zod';
import { ArrowPathIcon, SpeakerWaveIcon, SpeakerXMarkIcon } from '@heroicons/react/24/solid';
// Remove synthesizeSpeechAction import
// import { synthesizeSpeechAction } from '../actions/tts';
// Import the new action
import {
  generateStartingScenariosAction,
  // generateAdventureNodeAction, // Remove unused import
} from '../actions/adventure';
import AuthButton from '@/components/AuthButton';

// Remove TTS_VOICE_NAME constant
// const TTS_VOICE_NAME = 'en-IN-Chirp3-HD-Enceladus';

type GamePhase = 'loading_scenarios' | 'selecting_scenario' | 'playing' | 'error';
type Scenario = z.infer<typeof AdventureChoiceSchema>;

const AdventureGame = () => {
  // Get simplified state/actions from store
  const {
    currentNode,
    isLoading: isNodeLoading, // Rename to avoid clash with scenario loading
    error: nodeError,
    storyHistory,
    fetchAdventureNode, // Still used after scenario selection
    makeChoice,
    resetAdventure: resetStore,
    isSpeaking,
    ttsError,
    ttsVolume,
    setSpeaking,
    setTTSError,
    setTTSVolume,
  } = useAdventureStore();

  // Component state for game phase and scenarios
  const [gamePhase, setGamePhase] = useState<GamePhase>('loading_scenarios');
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [scenarioError, setScenarioError] = useState<string | null>(null);
  const [isUnauthorized, setIsUnauthorized] = useState(false); // Add new state for unauthorized status

  const audioRef = useRef<HTMLAudioElement>(null);
  const ttsAudioRef = useRef<HTMLAudioElement>(null);
  // const [isTTsLoading, setIsTTsLoading] = useState(false); // No longer needed? Maybe keep for manual play?
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const [clickedChoiceIndex, setClickedChoiceIndex] = useState<number | null>(null);
  // State to hold pre-generated audio data
  const [currentAudioData, setCurrentAudioData] = useState<string | null>(null);

  // --- Scenario Fetching ---
  const fetchScenarios = useCallback(async () => {
    setGamePhase('loading_scenarios');
    setScenarioError(null);
    try {
      const result = await generateStartingScenariosAction();
      if (result.error) {
        // Check specifically for the unauthorized error
        if (result.error === 'Unauthorized: User must be logged in.') {
          console.log('[AdventureGame] User is not logged in.');
          setIsUnauthorized(true);
          setGamePhase('error'); // Keep phase as error but use isUnauthorized flag to render differently
          return; // Stop further processing in this case
        }
        // Throw other errors to be caught below
        throw new Error(result.error);
      }
      if (!result.scenarios) {
        throw new Error('No scenarios generated.');
      }
      setIsUnauthorized(false); // Reset unauthorized flag on success
      setScenarios(result.scenarios);
      setGamePhase('selecting_scenario');
    } catch (err) {
      // Only set scenarioError if it's not the specific unauthorized error
      if (!(err instanceof Error && err.message === 'Unauthorized: User must be logged in.')) {
        console.error('Error fetching scenarios:', err);
        setScenarioError(err instanceof Error ? err.message : 'Failed to load starting scenarios.');
      }
      // Set gamePhase to error regardless, but rendering depends on isUnauthorized
      setGamePhase('error');
    }
  }, []);

  // Initial effect to fetch scenarios
  useEffect(() => {
    void fetchScenarios();
  }, [fetchScenarios]);

  // --- Handle Scenario Selection ---
  const handleScenarioSelect = useCallback(
    (scenario: Scenario) => {
      console.log('Selected scenario:', scenario.text);
      setGamePhase('playing');
      setHasUserInteracted(true);
      // Prime the history with the chosen scenario as the first passage
      // Note: This interacts directly with zustand state, might need an action
      useAdventureStore.setState({
        storyHistory: [{ passage: scenario.text }],
        currentNode: null, // Clear any previous node
        error: null,
      });
      // Fetch the first node *based on* the selected scenario
      void fetchAdventureNode(); // No choiceText needed here
    },
    [fetchAdventureNode]
  );

  // --- Reset ---
  const handleReset = useCallback(() => {
    resetStore(); // Reset zustand store
    setScenarios([]); // Clear scenarios
    setScenarioError(null);
    setIsUnauthorized(false); // Reset unauthorized flag on reset
    setClickedChoiceIndex(null);
    void fetchScenarios(); // Fetch new scenarios
  }, [resetStore, fetchScenarios]);

  // --- Handle Image Load ---
  const handleImageLoad = useCallback(() => {
    console.log('[ImageLoad] Image loaded.');
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
          setSpeaking(false); // Ensure state is correct
        });
    } else {
      console.log(
        `[ImageLoad] Conditions not met: interacted=${hasUserInteracted}, hasAudio=${!!currentAudioData}, isSpeaking=${isSpeaking}`
      );
    }
  }, [hasUserInteracted, currentAudioData, setSpeaking, setTTSError, isSpeaking]);

  // --- TTS Logic ---

  // Stop TTS playback
  const stopTTSSpeech = useCallback(() => {
    const audioElement = ttsAudioRef.current;
    if (audioElement) {
      audioElement.pause();
      audioElement.currentTime = 0;
      audioElement.src = ''; // Clear source
    }
    setSpeaking(false);
  }, [setSpeaking]);

  // Toggle manual playback
  const handleToggleSpeak = useCallback(() => {
    const audioElement = ttsAudioRef.current;
    if (!audioElement) return;

    if (isSpeaking) {
      stopTTSSpeech();
    } else {
      // Play only if audio data exists
      if (currentAudioData) {
        // If src isn't already set (e.g., wasn't auto-played), set it now
        if (!audioElement.src.startsWith('data:audio/mp3')) {
          audioElement.src = `data:audio/mp3;base64,${currentAudioData}`;
        }
        // Attempt to play
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
      // Ensure ambient audio plays on first manual interaction
      const ambientAudio = audioRef.current;
      if (ambientAudio && ambientAudio.paused) {
        ambientAudio.play().catch((e) => console.warn('Ambient audio play failed:', e));
      }
      if (!hasUserInteracted) {
        setHasUserInteracted(true);
      }
    }
  }, [isSpeaking, stopTTSSpeech, currentAudioData, setSpeaking, setTTSError, hasUserInteracted]);

  // Effect to handle audio ending
  useEffect(() => {
    const audioElement = ttsAudioRef.current;
    if (!audioElement) return;
    const handleAudioEnd = () => stopTTSSpeech();
    audioElement.addEventListener('ended', handleAudioEnd);
    return () => audioElement.removeEventListener('ended', handleAudioEnd);
  }, [stopTTSSpeech]);

  // Effect to store new audio data and handle passage changes
  const previousPassageRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const currentPassage = gamePhase === 'playing' ? currentNode?.passage : null;
    const audioData = gamePhase === 'playing' ? currentNode?.audioBase64 : null;

    console.log(
      '[Node Update Effect] New node received, passage changed:',
      currentPassage !== previousPassageRef.current
    );
    console.log('[Node Update Effect] Audio data available:', !!audioData);

    // Store audio data when node updates
    setCurrentAudioData(audioData ?? null);

    // Stop current speech if passage changes
    if (currentPassage !== previousPassageRef.current && isSpeaking) {
      console.log('[Node Update Effect] Passage changed, stopping current speech.');
      stopTTSSpeech();
    }

    // Update passage ref for next comparison
    previousPassageRef.current = currentPassage ?? undefined;
  }, [currentNode, gamePhase, isSpeaking, stopTTSSpeech]);

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

  // Handle regular choice clicks
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

  // --- Button Classes ---
  const buttonBaseClasses =
    'px-4 py-2 rounded-md border transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800';
  const choiceButtonClasses =
    'w-full text-left justify-start p-4 h-auto border-amber-800/50 bg-gradient-to-br from-amber-100/5 via-amber-100/10 to-amber-100/5 text-amber-100/80 hover:text-amber-100 hover:border-amber-700 hover:from-amber-100/10 hover:to-amber-100/10 focus:ring-amber-500 shadow-md hover:shadow-lg';
  const secondaryButtonClasses =
    'border-gray-600 bg-gray-700 text-gray-300 hover:bg-gray-600 focus:ring-gray-500 shadow-sm';
  const ghostButtonClasses =
    'border-transparent text-gray-400 hover:bg-gray-700/50 hover:text-gray-300 focus:ring-gray-500';

  // --- Volume Effects ---
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

  // --- Render Logic ---
  return (
    <>
      <audio ref={audioRef} loop hidden aria-hidden="true" />
      <audio ref={ttsAudioRef} hidden aria-hidden="true" />

      <div className="bg-slate-800 rounded-lg p-4 md:p-6 border border-slate-700 shadow-xl text-gray-300 min-h-[350px] relative mx-auto w-full flex flex-col">
        {/* Loading Scenarios State */}
        {gamePhase === 'loading_scenarios' && (
          <div className="flex-grow flex flex-col items-center justify-center">
            <ArrowPathIcon className="h-10 w-10 text-amber-300 animate-spin mb-4" />
            <p className="text-gray-400">Generating starting adventures...</p>
          </div>
        )}

        {/* Error State (Could be scenario or node error) */}
        {/* Render login prompt if unauthorized */}
        {gamePhase === 'error' && isUnauthorized && (
          <div className="text-center text-amber-100/90 flex flex-col items-center justify-center absolute inset-0 bg-slate-800/90 z-10 rounded-lg p-4">
            <p className="text-xl font-semibold mb-4">Please Log In</p>
            <p className="mb-6 text-gray-400">You need to be logged in to start an adventure.</p>
            <AuthButton variant="short" />
          </div>
        )}

        {/* Render generic error display if not unauthorized */}
        {gamePhase === 'error' && !isUnauthorized && (scenarioError || nodeError) && (
          <div className="text-center text-red-400 flex flex-col items-center justify-center absolute inset-0 bg-slate-800/90 z-10 rounded-lg p-4">
            <p className="text-xl font-semibold mb-4">An Error Occurred</p>
            <p className="mb-6 text-gray-400">{scenarioError || nodeError || 'Unknown error'}</p>
            <button
              onClick={handleReset}
              className={`${buttonBaseClasses} ${secondaryButtonClasses}`}
            >
              Try Again
            </button>
          </div>
        )}

        {/* Scenario Selection State */}
        {gamePhase === 'selecting_scenario' && !scenarioError && (
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

        {/* Playing State */}
        {gamePhase === 'playing' && !nodeError && (
          <>
            {/* Loading overlay: Only show initially */}
            {isNodeLoading && !currentNode && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-800/80 rounded-lg z-20">
                <ArrowPathIcon className="h-10 w-10 text-amber-300 animate-spin" />
              </div>
            )}

            {/* Main content */}
            {currentNode && (
              <>
                <div className="flex flex-col md:flex-row md:items-start md:gap-6 lg:gap-8 mb-6">
                  {currentNode.imageUrl && (
                    <div className="w-full md:w-1/2 lg:w-5/12 flex-shrink-0 mb-4 md:mb-0">
                      <div className="aspect-[16/10] bg-slate-700 rounded overflow-hidden shadow-md mb-4 relative">
                        <Image
                          src={currentNode.imageUrl}
                          alt="Adventure scene"
                          fill
                          className="object-cover"
                          priority
                          sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 40vw"
                          onLoad={handleImageLoad}
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

                  <div className={`${!currentNode.imageUrl ? 'w-full' : 'md:w-1/2 lg:w-7/12'}`}>
                    <div className="mb-4 text-xl leading-relaxed text-left w-full text-gray-300 relative">
                      <p style={{ whiteSpace: 'pre-wrap' }}>{currentNode.passage}</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 w-full">
                  {currentNode.choices.map((choice, index) => {
                    const isClicked = index === clickedChoiceIndex;
                    const isLoadingChoice = isNodeLoading && isClicked; // Use isNodeLoading
                    return (
                      <button
                        key={index}
                        onClick={() => handleChoiceClick(choice, index)}
                        className={`${buttonBaseClasses} ${choiceButtonClasses} flex items-center justify-between ${isNodeLoading ? 'opacity-50 cursor-not-allowed' : ''} ${isLoadingChoice ? 'border-amber-500 bg-amber-100/20' : ''}`}
                        disabled={isNodeLoading}
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
            {/* Show prompt if first node hasn't loaded yet */}
            {!currentNode && !isNodeLoading && gamePhase === 'playing' && (
              <div className="flex-grow flex flex-col items-center justify-center">
                <p className="text-gray-400">Generating your adventure...</p>
              </div>
            )}
          </>
        )}

        {/* Restart Button */}
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
    </>
  );
};

export default AdventureGame;
