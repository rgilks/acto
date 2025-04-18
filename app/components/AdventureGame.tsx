'use client';

import React, { useEffect, useRef, useCallback, useState } from 'react';
import useAdventureStore from '@/store/adventureStore';
import {
  ArrowPathIcon,
  SpeakerWaveIcon,
  SpeakerXMarkIcon,
  ArrowDownCircleIcon, // Loading indicator
} from '@heroicons/react/24/solid';
import { synthesizeSpeechAction } from '../actions/tts';

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
    currentRoomId,
    isSpeaking,
    ttsError,
    ttsVolume,
    setSpeaking,
    setTTSError,
    setTTSVolume,
  } = useAdventureStore();

  const audioRef = useRef<HTMLAudioElement>(null);
  const ttsAudioRef = useRef<HTMLAudioElement>(null);
  const [isTTsLoading, setIsTTsLoading] = useState(false);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const [clickedChoiceIndex, setClickedChoiceIndex] = useState<number | null>(null);

  useEffect(() => {
    if (storyHistory.length === 0 && !currentNode && !isLoading && !currentRoomId) {
      void fetchAdventureNode();
    }
  }, [isLoading, currentNode, storyHistory, currentRoomId, fetchAdventureNode]);

  const startTTSSpeech = useCallback(async () => {
    const audioElement = ttsAudioRef.current;
    const textToSpeak = currentNode?.passage;

    console.log(
      `Attempting startTTSSpeech: hasAudio=${!!audioElement}, hasText=${!!textToSpeak}, isSpeaking=${isSpeaking}, isLoading=${isTTsLoading}`
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
  }, [currentNode?.passage, isSpeaking, setSpeaking, setTTSError, isTTsLoading]);

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

  const previousPassageRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const currentPassage = currentNode?.passage;

    if (!isLoading && currentPassage && currentPassage !== previousPassageRef.current) {
      console.log('New passage detected...');
      console.log(
        `--> isLoading: ${isLoading}, hasUserInteracted: ${hasUserInteracted}, passageChanged: ${currentPassage !== previousPassageRef.current}`
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
    previousPassageRef.current = currentPassage;
  }, [currentNode?.passage, isLoading, startTTSSpeech, stopTTSSpeech, hasUserInteracted]);

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

  const handleChoiceClick = (
    choice: NonNullable<typeof currentNode>['choices'][number],
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
    'border-transparent text-gray-500 hover:bg-gray-700/50 hover:text-gray-300 focus:ring-gray-500';

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

      <div className="bg-slate-800 rounded-lg p-4 md:p-6 border border-slate-700 shadow-xl text-gray-300 min-h-[350px] relative mx-auto w-full">
        {error && !isLoading && (
          <div className="text-center text-red-400 flex flex-col items-center justify-center absolute inset-0 bg-slate-800/90 z-10 rounded-lg p-4">
            <p className="text-xl font-semibold mb-4">An Error Occurred</p>
            <p className="mb-6 text-gray-400">{error}</p>
            <button
              onClick={() => fetchAdventureNode()}
              className={`${buttonBaseClasses} ${secondaryButtonClasses}`}
            >
              Retry
            </button>
          </div>
        )}

        {isLoading && storyHistory.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-800/80 rounded-lg z-20">
            <ArrowPathIcon className="h-10 w-10 text-amber-300 animate-spin" />
          </div>
        )}

        {currentNode && (
          <>
            <div className="flex flex-col md:flex-row md:items-start md:gap-6 lg:gap-8 mb-6">
              {currentNode.imageUrl && (
                <div className="w-full md:w-1/2 lg:w-5/12 flex-shrink-0 mb-4 md:mb-0">
                  <div className="aspect-[16/10] bg-slate-700 rounded overflow-hidden shadow-md mb-4">
                    <img
                      src={currentNode.imageUrl}
                      alt={currentNode.roomId}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex items-center justify-center space-x-4 w-full">
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
                const isLoadingChoice = isLoading && isClicked;
                return (
                  <button
                    key={index}
                    onClick={() => handleChoiceClick(choice, index)}
                    className={`${buttonBaseClasses} ${choiceButtonClasses} flex items-center justify-between ${isLoading ? 'opacity-50 cursor-not-allowed' : ''} ${isLoadingChoice ? 'border-amber-500 bg-amber-100/20' : ''}`}
                    disabled={isLoading}
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
      </div>

      {!isLoading && (storyHistory.length > 0 || error) && (
        <div className="mt-8 pt-4 border-t border-slate-700 w-full max-w-lg mx-auto flex justify-center">
          <button onClick={resetAdventure} className={`${buttonBaseClasses} ${ghostButtonClasses}`}>
            Start New Adventure
          </button>
        </div>
      )}
    </>
  );
};

export default AdventureGame;
