'use client';

import React, { useEffect, useRef, useCallback, useState } from 'react';
import useAdventureStore from '@/store/adventureStore';
import {
  ArrowPathIcon,
  SpeakerWaveIcon,
  SpeakerXMarkIcon,
  ArrowDownCircleIcon, // For loading indicator
} from '@heroicons/react/24/solid';
import {
  synthesizeSpeechAction, // Only need synthesis action now
} from '../actions/tts';

const TTS_VOICE_NAME = 'en-IN-Chirp3-HD-Enceladus';

const AdventureGame = () => {
  const {
    currentNode,
    isLoading,
    error,
    storyHistory,
    fetchAdventureNode,
    makeChoice,
    resetAdventure,
    // Get currentRoomId from store
    currentRoomId,
    // Get TTS state and actions
    isSpeaking,
    ttsError,
    ttsVolume,
    setSpeaking,
    setTTSError,
    setTTSVolume,
  } = useAdventureStore();

  // Ref for the audio element
  const audioRef = useRef<HTMLAudioElement>(null);
  // Ref for the TTS audio element
  const ttsAudioRef = useRef<HTMLAudioElement>(null);
  // Local state for TTS loading
  const [isTTsLoading, setIsTTsLoading] = useState(false);
  // State to track if user has interacted (for autoplay policy)
  const [hasUserInteracted, setHasUserInteracted] = useState(false);

  // Fetch the first node when the component mounts
  useEffect(() => {
    // Also check if currentRoomId is null to trigger initial fetch
    if (storyHistory.length === 0 && !currentNode && !isLoading && !currentRoomId) {
      // Start in room1, pass empty history initially
      void fetchAdventureNode(); // Pass no arguments for the initial fetch
    }
    // Dependency array needs careful consideration if fetchAdventureNode identity changes
  }, [isLoading, currentNode, storyHistory, currentRoomId, fetchAdventureNode]); // Re-run if these change to handle resets?

  // --- TTS Playback Logic ---
  const startTTSSpeech = useCallback(async () => {
    const audioElement = ttsAudioRef.current;
    const textToSpeak = currentNode?.passage;

    console.log(
      `Attempting startTTSSpeech: hasAudio=${!!audioElement}, hasText=${!!textToSpeak}, isSpeaking=${isSpeaking}, isLoading=${isTTsLoading}`
    );
    // Prevent starting if no audio element, no text, already speaking, or already loading TTS
    if (!audioElement || !textToSpeak || isSpeaking || isTTsLoading) {
      if (isSpeaking) console.log('startTTSSpeech: Already speaking.');
      if (isTTsLoading) console.log('startTTSSpeech: Already loading TTS.');
      return;
    }

    // Start new speech
    setIsTTsLoading(true);
    setTTSError(null);
    setSpeaking(false); // Ensure speaking is false before starting

    try {
      console.log(`Starting TTS: Voice=${TTS_VOICE_NAME}`); // Volume handled client-side

      const result = await synthesizeSpeechAction({
        text: textToSpeak,
        voiceName: TTS_VOICE_NAME, // Pass hardcoded name
      });

      console.log('Synthesize action result:', result);

      if (result.error) {
        throw new Error(result.error);
      }

      if (result.audioBase64) {
        const audioSrc = `data:audio/mp3;base64,${result.audioBase64}`;
        audioElement.src = audioSrc;
        await audioElement.play();
        setSpeaking(true); // Set speaking state only after play starts
      } else {
        throw new Error('No audio data received.');
      }
    } catch (error) {
      console.error('TTS startTTSSpeech Error:', error);
      setTTSError(error instanceof Error ? error.message : 'Failed to play audio.');
      setSpeaking(false); // Ensure state is false on error
    } finally {
      setIsTTsLoading(false);
    }
  }, [currentNode?.passage, isSpeaking, setSpeaking, setTTSError, isTTsLoading]);

  // Separate stop logic for clarity
  const stopTTSSpeech = useCallback(() => {
    const audioElement = ttsAudioRef.current;
    if (audioElement) {
      console.log('Stopping TTS playback.');
      audioElement.pause();
      audioElement.currentTime = 0;
      audioElement.src = '';
    }
    // Update state regardless of whether audio element existed
    setSpeaking(false);
  }, [setSpeaking]); // Depends on setSpeaking

  // Toggle handler for the button
  const handleToggleSpeak = useCallback(() => {
    if (isSpeaking) {
      stopTTSSpeech();
    } else {
      // --- Start Background Audio on First TTS Play ---
      // Attempt to play ambient audio only when TTS is explicitly started
      const ambientAudio = audioRef.current;
      if (ambientAudio && ambientAudio.paused) {
        ambientAudio
          .play()
          .catch((e) => console.warn('Ambient audio play failed on interaction:', e));
      }
      // --- End Background Audio Start ---

      void startTTSSpeech(); // Call async function
    }
    // Mark interaction when user explicitly toggles speech
    if (!hasUserInteracted) {
      console.log('User interaction registered via toggle button.');
      setHasUserInteracted(true);
    }
  }, [isSpeaking, startTTSSpeech, stopTTSSpeech, hasUserInteracted]);

  // Effect to handle audio ending
  useEffect(() => {
    const audioElement = ttsAudioRef.current;
    if (!audioElement) return;

    const handleAudioEnd = () => {
      stopTTSSpeech(); // Use the stop function
    };

    audioElement.addEventListener('ended', handleAudioEnd);
    return () => {
      audioElement.removeEventListener('ended', handleAudioEnd);
    };
  }, [stopTTSSpeech]); // Depends on stop function
  // --- End TTS Playback Handler ---

  // --- Effect for Auto-Play on New Passage ---
  const previousPassageRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const currentPassage = currentNode?.passage;

    // Conditions: Not loading main content, passage exists, passage is different from previous
    if (!isLoading && currentPassage && currentPassage !== previousPassageRef.current) {
      console.log('New passage detected...');
      console.log(
        `--> isLoading: ${isLoading}, hasUserInteracted: ${hasUserInteracted}, passageChanged: ${currentPassage !== previousPassageRef.current}`
      );

      // *** Only auto-play if user has interacted previously ***
      if (hasUserInteracted) {
        console.log('...starting auto-play.');
        // Start speech for the new passage after a short delay
        // Let startTTSSpeech handle potential overlaps by setting new src
        const timer = setTimeout(() => {
          void startTTSSpeech();
        }, 100); // Slightly longer delay for auto-play

        // Update previous passage ref *after* triggering speech
        previousPassageRef.current = currentPassage;

        return () => clearTimeout(timer); // Cleanup timer
      } else {
        console.log('...user has not interacted yet, skipping auto-play.');
        // Update ref anyway so the *next* change triggers correctly if interaction happens
        previousPassageRef.current = currentPassage;
      }
    } else if (!currentPassage) {
      // Clear previous passage if node becomes null
      previousPassageRef.current = undefined;
    }

    // Check and update ref if needed (e.g., initial load before interaction)
    // This ensures the first auto-play *after* interaction works
    if (currentPassage && !previousPassageRef.current) {
      previousPassageRef.current = currentPassage;
    }
    // Update ref on initial load even without interaction
    // Note: This condition is a bit redundant with the one inside the main `if`
    // but ensures the ref is set correctly on first load.
    previousPassageRef.current = currentPassage;
  }, [currentNode?.passage, isLoading, startTTSSpeech, stopTTSSpeech, hasUserInteracted]);
  // --- End Effect for Auto-Play on New Passage ---

  // Effect to control audio playback based on room change
  useEffect(() => {
    // --- Simplified Ambient Audio Logic ---
    const audioElement = audioRef.current;
    if (!audioElement) return; // Exit if no audio element

    const targetSoundSrc = '/sounds/entrance_chamber_ambient.mp3'; // Hardcoded path

    // Set the source if it's not already set
    if (audioElement.src.endsWith(targetSoundSrc)) {
      // Already set, do nothing
      console.log('Ambient audio source already set.');
    } else {
      console.log('Setting ambient audio source:', targetSoundSrc);
      audioElement.src = targetSoundSrc;
      audioElement.load(); // Load the source
    }

    // Playback is now handled by handleToggleSpeak after user interaction

    // Cleanup: Pause on unmount
    return () => {
      audioElement?.pause();
    };
    // --- End Simplified Ambient Audio Logic ---
  }, []); // Empty dependency array

  const handleChoiceClick = (choice: NonNullable<typeof currentNode>['choices'][number]) => {
    // Mark interaction when user makes a choice
    if (!hasUserInteracted) {
      console.log('User interaction registered via choice click.');
      setHasUserInteracted(true);
    }
    makeChoice(choice);
  };

  // --- Dark Library Theme Styles ---
  const buttonBaseClasses =
    'px-4 py-2 rounded-md border transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800';
  const choiceButtonClasses =
    'w-full text-left justify-start p-4 h-auto border-amber-800/50 bg-gradient-to-br from-amber-100/5 via-amber-100/10 to-amber-100/5 text-amber-100/80 hover:text-amber-100 hover:border-amber-700 hover:from-amber-100/10 hover:to-amber-100/10 focus:ring-amber-500 shadow-md hover:shadow-lg'; // Faux aged paper/leather
  const secondaryButtonClasses =
    'border-gray-600 bg-gray-700 text-gray-300 hover:bg-gray-600 focus:ring-gray-500 shadow-sm'; // Muted secondary
  const ghostButtonClasses =
    'border-transparent text-gray-500 hover:bg-gray-700/50 hover:text-gray-300 focus:ring-gray-500'; // Muted ghost

  // --- Effect to Control Ambient Volume ---
  useEffect(() => {
    const ambientAudio = audioRef.current;
    if (ambientAudio) {
      ambientAudio.volume = ttsVolume; // Set volume directly
    }
  }, [ttsVolume]);
  // --- End Effect to Control Ambient Volume ---

  // --- Effect to Control TTS Playback Volume ---
  useEffect(() => {
    const ttsAudio = ttsAudioRef.current;
    if (ttsAudio) {
      ttsAudio.volume = ttsVolume; // Set TTS element volume directly
    }
  }, [ttsVolume]);
  // --- End Effect to Control TTS Playback Volume ---

  return (
    // Add the hidden audio element
    <>
      <audio ref={audioRef} loop hidden aria-hidden="true" />
      {/* Hidden audio element for TTS playback */}
      <audio ref={ttsAudioRef} hidden aria-hidden="true" />

      <div className="bg-slate-800 rounded-lg p-4 md:p-8 border border-slate-700 shadow-xl mt-6 flex flex-col items-center text-gray-300 min-h-[350px]">
        {isLoading && (
          <div className="flex flex-col items-center justify-center flex-grow">
            {/* Update loader color */}
            <ArrowPathIcon className="h-12 w-12 animate-spin text-amber-300/70" />
            <p className="mt-4 text-lg text-gray-400">Generating adventure...</p>
          </div>
        )}

        {error && !isLoading && (
          // Update error text color for contrast
          <div className="text-center text-red-400 flex flex-col items-center justify-center flex-grow">
            <p className="text-xl font-semibold mb-4">An Error Occurred</p>
            <p className="mb-6 text-gray-400">{error}</p>
            <button
              onClick={() => fetchAdventureNode()} // Retry logic
              className={`${buttonBaseClasses} ${secondaryButtonClasses}`}
            >
              Retry
            </button>
          </div>
        )}

        {!isLoading && !error && currentNode && (
          <div className="w-full flex flex-col items-center">
            {currentNode.imageUrl && (
              <div className="mb-6 w-full max-w-xl aspect-video bg-slate-700 rounded overflow-hidden shadow-md">
                <img
                  src={currentNode.imageUrl}
                  alt={currentNode.roomId}
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            <div className="mb-4 text-lg leading-relaxed text-left w-full max-w-3xl text-gray-300 font-serif relative">
              <p style={{ whiteSpace: 'pre-wrap' }}>{currentNode.passage}</p>
            </div>

            {/* --- TTS Control Bar --- */}
            {currentNode && (
              <div className="flex items-center justify-start space-x-4 mb-6 w-full max-w-3xl">
                {/* Speaker Button */}
                <button
                  onClick={handleToggleSpeak}
                  title={isSpeaking ? 'Stop reading aloud' : 'Read passage aloud'}
                  aria-label={isSpeaking ? 'Stop reading aloud' : 'Read passage aloud'}
                  className={`${buttonBaseClasses} ${ghostButtonClasses} p-1 rounded-full`}
                  disabled={isLoading || isTTsLoading || !currentNode.passage}
                >
                  {isTTsLoading ? (
                    <ArrowDownCircleIcon className="h-5 w-5 animate-spin" />
                  ) : isSpeaking ? (
                    <SpeakerXMarkIcon className="h-5 w-5" />
                  ) : (
                    <SpeakerWaveIcon className="h-5 w-5" />
                  )}
                </button>
                {/* Volume Slider */}
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
            )}
            {/* --- End TTS Control Bar --- */}

            {/* TTS Error Display (Moved under control bar) */}
            {ttsError && <p className="mt-2 text-xs text-red-400">Speech Error: {ttsError}</p>}

            {/* Choices use updated button styles */}
            <div className="flex flex-col items-center space-y-3 w-full max-w-lg">
              {currentNode.choices.map((choice, index) => (
                <button
                  key={index}
                  onClick={() => handleChoiceClick(choice)}
                  className={`${buttonBaseClasses} ${choiceButtonClasses}`}
                  data-testid={`choice-button-${index}`}
                >
                  {choice.text}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Restart Button: Use updated ghost style and border */}
      {!isLoading && (storyHistory.length > 0 || error) && (
        <div className="mt-8 pt-4 border-t border-slate-700 w-full max-w-lg flex justify-center">
          <button onClick={resetAdventure} className={`${buttonBaseClasses} ${ghostButtonClasses}`}>
            Start New Adventure
          </button>
        </div>
      )}
    </>
  );
};

export default AdventureGame;
