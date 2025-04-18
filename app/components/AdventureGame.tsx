'use client';

import React, { useEffect, useRef, useCallback, useState } from 'react';
import Image from 'next/image'; // Import next/image
import useAdventureStore from '@/store/adventureStore';
import { AdventureChoiceSchema } from '@/lib/domain/schemas'; // Import schema type
import { z } from 'zod';
import {
  ArrowPathIcon,
  SpeakerWaveIcon,
  SpeakerXMarkIcon,
  ArrowDownCircleIcon, // Loading indicator
} from '@heroicons/react/24/solid';
import { synthesizeSpeechAction } from '../actions/tts';
// Import the new action
import {
  generateStartingScenariosAction,
  // generateAdventureNodeAction, // Remove unused import
} from '../actions/adventure';

const TTS_VOICE_NAME = 'en-IN-Chirp3-HD-Enceladus';

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

  const audioRef = useRef<HTMLAudioElement>(null);
  const ttsAudioRef = useRef<HTMLAudioElement>(null);
  const [isTTsLoading, setIsTTsLoading] = useState(false);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const [clickedChoiceIndex, setClickedChoiceIndex] = useState<number | null>(null);

  // --- Fetch Starting Scenarios ---
  const fetchScenarios = useCallback(async () => {
    setGamePhase('loading_scenarios');
    setScenarioError(null);
    try {
      const result = await generateStartingScenariosAction();
      if (result.error) {
        throw new Error(result.error);
      }
      if (!result.scenarios) {
        throw new Error('No scenarios generated.');
      }
      setScenarios(result.scenarios);
      setGamePhase('selecting_scenario');
    } catch (err) {
      console.error('Error fetching scenarios:', err);
      setScenarioError(err instanceof Error ? err.message : 'Failed to load starting scenarios.');
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

  // Reset function now also resets component state
  const handleReset = useCallback(() => {
    resetStore(); // Reset zustand store
    setScenarios([]); // Clear scenarios
    setScenarioError(null);
    setClickedChoiceIndex(null);
    void fetchScenarios(); // Fetch new scenarios
  }, [resetStore, fetchScenarios]);

  // --- TTS Logic (mostly unchanged, uses `currentNode` which is null initially) ---
  const startTTSSpeech = useCallback(async () => {
    const audioElement = ttsAudioRef.current;
    // Only speak if in playing phase and node exists
    const textToSpeak = gamePhase === 'playing' ? currentNode?.passage : null;

    console.log(
      `Attempting startTTSSpeech: phase=${gamePhase}, hasAudio=${!!audioElement}, hasText=${!!textToSpeak}, isSpeaking=${isSpeaking}, isTTsLoading=${isTTsLoading}`
    );
    if (!audioElement || !textToSpeak || isSpeaking || isTTsLoading) {
      if (isSpeaking) console.log('startTTSSpeech: Already speaking.');
      if (isTTsLoading) console.log('startTTSSpeech: Already loading TTS.');
      return;
    }

    setIsTTsLoading(true);
    setTTSError(null);
    setSpeaking(false);

    try {
      console.log(`Starting TTS: Voice=${TTS_VOICE_NAME}`);

      const result = await synthesizeSpeechAction({
        text: textToSpeak,
        voiceName: TTS_VOICE_NAME,
      });

      console.log('Synthesize action result:', result);

      if (result.error) {
        throw new Error(result.error);
      }

      if (result.audioBase64) {
        const audioSrc = `data:audio/mp3;base64,${result.audioBase64}`;
        audioElement.src = audioSrc;
        await audioElement.play();
        setSpeaking(true);
      } else {
        throw new Error('No audio data received.');
      }
    } catch (error) {
      console.error('TTS startTTSSpeech Error:', error);
      setTTSError(error instanceof Error ? error.message : 'Failed to play audio.');
      setSpeaking(false);
    } finally {
      setIsTTsLoading(false);
    }
  }, [currentNode?.passage, isSpeaking, setSpeaking, setTTSError, isTTsLoading, gamePhase]); // Added gamePhase dependency

  const stopTTSSpeech = useCallback(() => {
    const audioElement = ttsAudioRef.current;
    if (audioElement) {
      console.log('Stopping TTS playback.');
      audioElement.pause();
      audioElement.currentTime = 0;
      audioElement.src = '';
    }
    setSpeaking(false);
  }, [setSpeaking]);

  const handleToggleSpeak = useCallback(() => {
    if (isSpeaking) {
      stopTTSSpeech();
    } else {
      const ambientAudio = audioRef.current;
      if (ambientAudio && ambientAudio.paused) {
        ambientAudio
          .play()
          .catch((e) => console.warn('Ambient audio play failed on interaction:', e));
      }
      void startTTSSpeech();
    }
    if (!hasUserInteracted) {
      console.log('User interaction registered via toggle button.');
      setHasUserInteracted(true);
    }
  }, [isSpeaking, startTTSSpeech, stopTTSSpeech, hasUserInteracted]);

  useEffect(() => {
    const audioElement = ttsAudioRef.current;
    if (!audioElement) return;

    const handleAudioEnd = () => {
      stopTTSSpeech();
    };

    audioElement.addEventListener('ended', handleAudioEnd);
    return () => {
      audioElement.removeEventListener('ended', handleAudioEnd);
    };
  }, [stopTTSSpeech]);

  // Effect for Auto-Play on New Passage (add gamePhase check)
  const previousPassageRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const currentPassage = gamePhase === 'playing' ? currentNode?.passage : null;
    if (!isNodeLoading && currentPassage && currentPassage !== previousPassageRef.current) {
      console.log('New passage detected...');
      console.log(
        `--> isLoading: ${isNodeLoading}, hasUserInteracted: ${hasUserInteracted}, passageChanged: ${currentPassage !== previousPassageRef.current}`
      );

      if (hasUserInteracted) {
        console.log('...starting auto-play.');
        const timer = setTimeout(() => {
          void startTTSSpeech();
        }, 100);
        previousPassageRef.current = currentPassage;
        return () => clearTimeout(timer);
      } else {
        console.log('...user has not interacted yet, skipping auto-play.');
        previousPassageRef.current = currentPassage;
      }
    } else if (!currentPassage) {
      previousPassageRef.current = undefined;
    }

    if (currentPassage && !previousPassageRef.current) {
      previousPassageRef.current = currentPassage;
    }
    // Assign only if currentPassage is not null
    if (currentPassage !== null) {
      previousPassageRef.current = currentPassage;
    }
  }, [
    currentNode?.passage,
    isNodeLoading,
    startTTSSpeech,
    stopTTSSpeech,
    hasUserInteracted,
    gamePhase,
  ]);

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

  // Handle regular choice clicks (uses zustand makeChoice)
  const handleChoiceClick = (
    choice: Scenario, // Can reuse Scenario type here
    index: number
  ) => {
    if (!hasUserInteracted) {
      console.log('User interaction registered via choice click.');
      setHasUserInteracted(true);
    }
    setClickedChoiceIndex(index);
    makeChoice(choice);
  };

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
        {gamePhase !== 'loading_scenarios' && (scenarioError || nodeError) && (
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
                        />
                      </div>
                      <div className="flex items-center justify-center space-x-4 w-full">
                        <button
                          onClick={handleToggleSpeak}
                          title={isSpeaking ? 'Stop reading aloud' : 'Read passage aloud'}
                          aria-label={isSpeaking ? 'Stop reading aloud' : 'Read passage aloud'}
                          className={`${buttonBaseClasses} ${ghostButtonClasses} p-1 rounded-full`}
                          disabled={isNodeLoading || isTTsLoading || !currentNode.passage} // Use isNodeLoading
                        >
                          {isTTsLoading ? (
                            <ArrowDownCircleIcon className="h-5 w-5 animate-spin" />
                          ) : isSpeaking ? (
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
                          disabled={isTTsLoading}
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
