'use client';

import React, { useEffect, useRef, useCallback, useState } from 'react';
import useStoryStore, { type ErrorState } from '@/store/storyStore';
import { StoryChoiceSchema, type StoryScene, type StoryChoice } from '@/lib/domain/schemas';
import { z } from 'zod';
import { ArrowPathIcon } from '@heroicons/react/24/solid';
import { FullScreen, useFullScreenHandle } from 'react-full-screen';
import { useSession } from 'next-auth/react';
import { useStoryAudio } from '@/hooks/story/useStoryAudio';
import { useStoryImageTransition } from '@/hooks/story/useStoryImageTransition';
import { useStoryFullscreenControls } from '@/hooks/story/useStoryFullscreenControls';
import { useStoryKeyboardShortcuts } from '@/hooks/story/useStoryKeyboardShortcuts';
import ScenarioSelector from './ScenarioSelector';
import StoryLoadingIndicator from './story/StoryLoadingIndicator';
import StoryErrorDisplay from './story/StoryErrorDisplay';
import StoryImageDisplay from './story/StoryImageDisplay';
import StoryChoices from './story/StoryChoices';

type Phase = 'selecting_scenario' | 'loading_first_node' | 'playing' | 'error_state';
type Scenario = z.infer<typeof StoryChoiceSchema>;

const StoryStory = () => {
  const store = useStoryStore();
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
    rateLimitError,
  } = store;

  const { data: _session, status: sessionStatus } = useSession();
  const isUserLoggedIn = sessionStatus === 'authenticated';

  const [phase, setPhase] = useState<Phase>('selecting_scenario');
  const [displayNode, setDisplayNode] = useState<StoryScene | null>(null);
  const [currentAudioData, setCurrentAudioData] = useState<string | null>(null);
  const [localVolume, setLocalVolume] = useState<number>(storeTtsVolume);
  const [showChoices, setShowChoices] = useState<boolean>(false);
  const [clickedChoiceIndex, setClickedChoiceIndex] = useState<number | null>(null);
  const [focusedChoiceIndex, setFocusedChoiceIndex] = useState<number | null>(null);
  const [isSelectingScenario, setIsSelectingScenario] = useState(false);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [targetImageUrl, setTargetImageUrl] = useState<string | null>(null);
  const previousErrorRef = useRef<ErrorState>(null);

  const fullscreenHandle = useFullScreenHandle();
  const storyContainerRef = useRef<HTMLDivElement>(null);

  const triggerShowChoicesHandler = useCallback(() => {
    if (phase === 'playing' && displayNode) {
      setShowChoices(true);
    }
  }, [phase, displayNode]);

  const {
    userPaused: storyUserPaused,
    setUserPaused: setStoryUserPaused,
    isTTSPlaying: storyIsTTSPlaying,
    ttsPlayerError: storyTTSPlayerError,
    ttsAudioRef: storyTTSAudioRef,
    togglePlayPause: storyTogglePlayPause,
    playTTS: storyPlayTTS,
  } = useStoryAudio({
    audioData: currentAudioData,
    volume: localVolume,
    onTriggerShowChoices: triggerShowChoicesHandler,
    isFirstNodeLoading: phase === 'loading_first_node',
  });

  const {
    previousImageUrl: storyPreviousImageUrl,
    currentImageUrl: storyCurrentImageUrl,
    isTransitioningImage: storyIsTransitioningImage,
    isCurrentImageLoading: storyIsCurrentImageLoading,
    handleImageLoad,
    handleImageError,
  } = useStoryImageTransition({
    targetImageUrl: targetImageUrl,
    onImageReadyForAudio: () => {
      if (hasUserInteracted && currentAudioData && !storyIsTTSPlaying && !storyUserPaused) {
        storyPlayTTS();
      }
    },
    initialImageUrl: displayNode?.imageUrl ?? null,
  });

  const showFullscreenControls = useStoryFullscreenControls({
    storyContainerRef,
    fullscreenHandle,
    isTouchDevice,
  });

  const handleChoiceClick = useCallback(
    (choice: StoryChoice, index: number) => {
      if (!hasUserInteracted) {
        setHasUserInteracted(true);
      }
      setShowChoices(false);
      setClickedChoiceIndex(index);
      setFocusedChoiceIndex(null);
      makeChoice(choice);
    },
    [makeChoice, hasUserInteracted]
  );

  useStoryKeyboardShortcuts({
    fullscreenHandle,
    showChoices,
    displayNode,
    focusedChoiceIndex,
    setFocusedChoiceIndex,
    handleChoiceClick,
    isNodeLoading,
    localVolume,
    setLocalVolume,
    setTTSVolume,
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
    setPhase('selecting_scenario');
    void fetchScenarios();
  }, [fetchScenarios]);

  const handleScenarioSelect = useCallback(
    (scenario: Scenario) => {
      if (sessionStatus === 'loading') return;

      setIsSelectingScenario(true);
      setPhase('loading_first_node');
      if (!hasUserInteracted) setHasUserInteracted(true);

      setDisplayNode(null);
      setCurrentAudioData(null);
      setTargetImageUrl(null);
      setShowChoices(false);
      setClickedChoiceIndex(null);
      setFocusedChoiceIndex(null);
      stopTTS();

      const defaultVoice = 'en-US-Chirp3-HD-Aoede';
      const choiceData: StoryChoice = { ...scenario, voice: defaultVoice };
      makeChoice(choiceData);
    },
    [makeChoice, hasUserInteracted, stopTTS, sessionStatus]
  );

  useEffect(() => {
    const syncHydratedState = () => {
      const state = useStoryStore.getState();
      if (state.currentNode) {
        setPhase((currentPhase) =>
          currentPhase === 'selecting_scenario' ? 'playing' : currentPhase
        );
        setDisplayNode(state.currentNode);
        const initialAudioData = state.currentNode.audioBase64 ?? null;
        setCurrentAudioData(initialAudioData);
        setTargetImageUrl(state.currentNode.imageUrl ?? null);
        setShowChoices(false);
        setFocusedChoiceIndex(null);
        setStoryUserPaused(!!initialAudioData && phase === 'loading_first_node');
      } else {
        setPhase('selecting_scenario');
      }
      setLocalVolume(state.ttsVolume);
    };

    if (useStoryStore.persist.hasHydrated()) {
      syncHydratedState();
    } else {
      const unsubscribe = useStoryStore.persist.onFinishHydration(() => {
        syncHydratedState();
        unsubscribe();
      });
      return () => {
        unsubscribe();
      };
    }
  }, [setStoryUserPaused, phase]);

  useEffect(() => {
    const newlyFetchedNode = currentNode;

    if (phase !== 'loading_first_node' && isSelectingScenario) {
      setIsSelectingScenario(false);
    }

    const justRetriedSuccessfully =
      previousErrorRef.current === 'AI_RESPONSE_FORMAT_ERROR' && !nodeError;

    if (newlyFetchedNode && (newlyFetchedNode !== displayNode || justRetriedSuccessfully)) {
      console.log('[StoryStory Effect] Syncing new node.');

      previousErrorRef.current = nodeError;

      stopTTS();
      setShowChoices(false);
      setClickedChoiceIndex(null);
      setFocusedChoiceIndex(null);

      const newAudioData = newlyFetchedNode.audioBase64 ?? null;
      setCurrentAudioData(newAudioData);
      setDisplayNode(newlyFetchedNode);
      setTargetImageUrl(newlyFetchedNode.imageUrl ?? null);

      if (
        !newlyFetchedNode.imageUrl &&
        newAudioData &&
        phase !== 'loading_first_node' &&
        hasUserInteracted
      ) {
        console.log('[StoryStory Effect] Autoplaying audio for node with no image.');
        storyPlayTTS();
      }

      if (phase === 'loading_first_node') {
        setPhase('playing');
      }
    } else if (!newlyFetchedNode && displayNode && phase !== 'selecting_scenario') {
      console.log('[StoryStory Effect] currentNode is null, resetting to scenario selection.');
      setPhase('selecting_scenario');
      setDisplayNode(null);
      setCurrentAudioData(null);
      setTargetImageUrl(null);
      setShowChoices(false);
      setClickedChoiceIndex(null);
      setFocusedChoiceIndex(null);
      stopTTS();
    }

    if (nodeError !== previousErrorRef.current) {
      previousErrorRef.current = nodeError;
    }
  }, [
    currentNode,
    nodeError,
    phase,
    isSelectingScenario,
    displayNode,
    stopTTS,
    storyPlayTTS,
    hasUserInteracted,
  ]);

  useEffect(() => {
    const effectiveError =
      nodeError || fetchScenariosError || (rateLimitError ? { rateLimitError } : null);
    if (effectiveError && phase !== 'selecting_scenario' && phase !== 'loading_first_node') {
      setPhase('error_state');
      stopTTS();
    } else if (!effectiveError && phase === 'error_state') {
      if (displayNode?.passage) {
        setPhase('playing');
      } else {
        setPhase('selecting_scenario');
      }
    }
  }, [nodeError, fetchScenariosError, rateLimitError, phase, displayNode?.passage, stopTTS]);

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
    if (isUserLoggedIn) {
      void fetchScenarios();
    }
    setPhase('selecting_scenario');
    setDisplayNode(null);
    setCurrentAudioData(null);
    setTargetImageUrl(null);
    setShowChoices(false);
    setClickedChoiceIndex(null);
    setFocusedChoiceIndex(null);
    stopTTS();
    if (fullscreenHandle.active) {
      void fullscreenHandle.exit();
    }
  }, [triggerReset, stopTTS, fullscreenHandle, fetchScenarios, isUserLoggedIn]);

  const effectiveError =
    nodeError || fetchScenariosError || (rateLimitError ? { rateLimitError } : null);

  if (phase === 'error_state' && effectiveError) {
    return <StoryErrorDisplay error={effectiveError} onRestart={handleRestart} />;
  }

  if (phase === 'loading_first_node') {
    return <StoryLoadingIndicator />;
  }

  if (phase === 'selecting_scenario') {
    return (
      <ScenarioSelector
        onScenarioSelect={handleScenarioSelect}
        isLoadingSelection={isSelectingScenario}
        scenariosToDisplay={dynamicScenarios}
        isLoadingScenarios={isFetchingScenarios}
        fetchError={fetchScenariosError}
        onFetchNewScenarios={handleFetchNewScenarios}
        isUserLoggedIn={isUserLoggedIn}
      />
    );
  }

  if (phase === 'playing' && displayNode) {
    const containerClasses = fullscreenHandle.active
      ? 'fixed inset-0 z-50 bg-black flex items-center justify-center'
      : 'bg-slate-800 rounded-lg p-2 sm:p-4 md:p-6 border border-slate-700 shadow-xl text-gray-300 relative mx-4 flex flex-col';

    return (
      <div ref={storyContainerRef} className={`${containerClasses} story-outer-container`}>
        <FullScreen
          handle={fullscreenHandle}
          className="flex-grow flex flex-col story-fullscreen-container"
        >
          <div className={'w-full h-full flex flex-col relative'}>
            <StoryImageDisplay
              previousImageUrl={storyPreviousImageUrl}
              currentImageUrl={storyCurrentImageUrl}
              isTransitioningImage={storyIsTransitioningImage}
              isCurrentImageLoading={storyIsCurrentImageLoading}
              handleImageLoad={handleImageLoad}
              handleImageError={handleImageError}
              userPaused={storyUserPaused}
              togglePlayPause={storyTogglePlayPause}
              currentAudioData={currentAudioData}
              ttsPlayerError={storyTTSPlayerError}
              localVolume={localVolume}
              handleVolumeChange={handleVolumeChange}
              fullscreenHandle={fullscreenHandle}
              isTouchDevice={isTouchDevice}
              showFullscreenControls={showFullscreenControls}
            >
              <StoryChoices
                choices={displayNode.choices}
                onChoiceClick={handleChoiceClick}
                isNodeLoading={isNodeLoading}
                clickedChoiceIndex={clickedChoiceIndex}
                focusedChoiceIndex={focusedChoiceIndex}
                showChoices={showChoices}
              />
            </StoryImageDisplay>

            {isNodeLoading && !isSelectingScenario && (
              <div className="absolute bottom-4 right-4 z-30 p-2 bg-black/30 rounded-full">
                <ArrowPathIcon className="h-6 w-6 text-amber-300 animate-spin animate-pulse" />
              </div>
            )}
          </div>
        </FullScreen>
        <audio ref={storyTTSAudioRef} className="hidden" aria-hidden="true" />
      </div>
    );
  }

  console.warn('[StoryStory] Reached unexpected render state. Defaulting to scenario selection.', {
    phase,
  });
  return (
    <ScenarioSelector
      onScenarioSelect={handleScenarioSelect}
      isLoadingSelection={isSelectingScenario}
      scenariosToDisplay={dynamicScenarios}
      isLoadingScenarios={isFetchingScenarios}
      fetchError={fetchScenariosError}
      onFetchNewScenarios={handleFetchNewScenarios}
      isUserLoggedIn={isUserLoggedIn}
    />
  );
};

export default StoryStory;
