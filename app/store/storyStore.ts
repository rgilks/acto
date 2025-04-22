import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { persist, createJSONStorage } from 'zustand/middleware';
import { type StoryScene, StoryChoiceSchema } from '@/lib/domain/schemas';
import { generateStorySceneAction } from '@/app/actions/generateStoryScene';
import { generateScenariosAction } from '@/app/actions/generateScenarios';
import { buildStoryPrompt } from '@/lib/promptUtils';
import { z } from 'zod';
import JSZip from 'jszip';
import { type RateLimitError } from '@/lib/types';

// Simplified History Item
export interface StoryHistoryItem {
  passage: string;
  choiceText?: string | undefined;
  summary?: string | undefined;
  prompt?: string | undefined;
  imagePrompt?: string | undefined;
  choices?: z.infer<typeof StoryChoiceSchema>[] | undefined;
}

// Parameters needed to retry fetchStoryScene
interface FetchParams {
  choiceText?: string | undefined;
  metadata?: AdventureMetadata | undefined;
  voice?: string | null | undefined;
}

// Type for the error state, which can be a string or a structured rate limit error
export type ErrorState = string | { rateLimitError: RateLimitError } | null | undefined;

type Scenario = z.infer<typeof StoryChoiceSchema>;

// Type for the metadata to be stored and passed - Exported
export interface AdventureMetadata {
  genre?: string | undefined;
  tone?: string | undefined;
  visualStyle?: string | undefined;
  initialScenarioText?: string | undefined;
}

// Interface for prompt log entries
interface PromptLogEntry {
  step: number;
  prompt: string;
  passage: string;
  imagePrompt: string;
  choices: string[];
  summary: string;
  choiceMade: string;
}

// Simplified State
interface AdventureState {
  currentNode: StoryScene | null;
  storyHistory: StoryHistoryItem[];
  isLoading: boolean;
  error: ErrorState;
  rateLimitError: RateLimitError | null;
  loginRequired: boolean;
  currentGenre: string | null;
  currentTone: string | null;
  currentVisualStyle: string | null;
  currentVoice: string | null;

  // State for dynamic starting scenarios
  dynamicScenarios: Scenario[] | null;
  isFetchingScenarios: boolean;
  fetchScenariosError: ErrorState;

  // --- TTS State --- (Keep)
  isSpeaking: boolean;
  ttsError: string | null;
  ttsVolume: number;
  // --- End TTS State ---

  // State for manual retries
  lastFetchParamsForRetry: FetchParams | null;

  // --- Calculated/Derived State ---
  currentMetadata: AdventureMetadata | null;
}

interface AdventureActions {
  fetchStoryScene: (
    choiceText?: string,
    metadata?: AdventureMetadata,
    voice?: string | null
  ) => Promise<void>;
  fetchScenarios: () => Promise<void>;
  setCurrentMetadata: (metadata: AdventureMetadata) => void;
  setLoginRequired: (required: boolean) => void;
  // TTS Actions (Keep)
  stopSpeaking: () => void;
  setSpeaking: (isSpeaking: boolean) => void;
  setTTSError: (error: string | null) => void;
  setTTSVolume: (volume: number) => void;
  makeChoice: (choice: z.infer<typeof StoryChoiceSchema>) => void;
  resetAdventure: () => void;
  triggerReset: () => void;
  saveStory: () => Promise<void>;
  retryLastFetch: () => void;
  startNewAdventure: (metadata: AdventureMetadata) => void;
  restartAdventure: () => void;
  resetAdventureState: () => void;
}

// Simplified Initial State
const initialState: AdventureState = {
  currentNode: null,
  storyHistory: [],
  isLoading: false,
  error: null,
  loginRequired: false,
  currentGenre: null,
  currentTone: null,
  currentVisualStyle: null,
  currentVoice: null,

  // State for dynamic starting scenarios
  dynamicScenarios: null,
  isFetchingScenarios: false,
  fetchScenariosError: null,

  // --- Initial TTS State --- (Keep)
  isSpeaking: false,
  ttsError: null,
  ttsVolume: 1,
  // --- End Initial TTS State ---
  lastFetchParamsForRetry: null,

  // --- Calculated/Derived State ---
  currentMetadata: null,
  rateLimitError: null,
};

export const useAdventureStore = create<AdventureState & AdventureActions>()(
  persist(
    immer((set, get) => ({
      ...initialState,

      setCurrentMetadata: (metadata) => {
        set((state) => {
          state.currentGenre = metadata.genre ?? null;
          state.currentTone = metadata.tone ?? null;
          state.currentVisualStyle = metadata.visualStyle ?? null;
          state.currentMetadata = metadata;
        });
      },

      fetchScenarios: async () => {
        set((state) => {
          state.isFetchingScenarios = true;
          state.fetchScenariosError = null;
        });

        try {
          const result = await generateScenariosAction();

          if (result.rateLimitError) {
            console.warn('Rate limit hit fetching scenarios:', result.rateLimitError);
            const definiteRateLimitError = result.rateLimitError;
            set((state) => {
              state.fetchScenariosError = { rateLimitError: definiteRateLimitError };
              state.isFetchingScenarios = false;
            });
            return;
          }

          if (result.error === 'Failed to parse scenarios from AI response.') {
            console.info('[Adventure Store] AI scenario parsing failed. Treating as info.');
            set((state) => {
              state.fetchScenariosError = 'SCENARIO_PARSE_ERROR';
              state.isFetchingScenarios = false;
            });
            return;
          }

          if (result.error) {
            throw new Error(result.error);
          }
          if (!result.scenarios) {
            throw new Error('No scenarios received from the server.');
          }

          set((state) => {
            state.dynamicScenarios = result.scenarios ?? null;
            state.isFetchingScenarios = false;
            state.fetchScenariosError = null;
          });
        } catch (error) {
          console.error('Error fetching scenarios:', error);
          set((state) => {
            state.fetchScenariosError = 'SCENARIO_FETCH_FAILED';
            state.isFetchingScenarios = false;
          });
        }
      },

      fetchStoryScene: async (choiceText, metadata, voice) => {
        const { storyHistory, currentMetadata, currentVoice } = get();

        // Use provided metadata if available, otherwise use current store metadata
        const currentGenre = metadata?.genre ?? currentMetadata?.genre ?? null;
        const currentTone = metadata?.tone ?? currentMetadata?.tone ?? null;
        const currentVisualStyle = metadata?.visualStyle ?? currentMetadata?.visualStyle ?? null;

        // Store params *before* the call in case it fails retryably
        const currentFetchParams: FetchParams = {
          choiceText,
          metadata,
          voice: voice ?? currentVoice,
        };

        // Define variable to hold the prompt for logging and history update
        let fullPromptForLog: string | undefined = undefined;

        set({
          isLoading: true,
          error: null,
          rateLimitError: null,
          lastFetchParamsForRetry: currentFetchParams,
        });

        try {
          // --- CONSTRUCT PARAMS JUST BEFORE CALL ---
          const fullHistory = storyHistory;
          // Trim history for payload size
          const trimmedHistory = fullHistory.map((item: StoryHistoryItem) => ({
            passage: item.passage,
            choiceText: item.choiceText,
            summary: item.summary,
          }));

          const actionParams: Parameters<typeof generateStorySceneAction>[0] = {
            storyContext: { history: trimmedHistory },
            genre: currentGenre ?? undefined,
            tone: currentTone ?? undefined,
            visualStyle: currentVisualStyle ?? undefined,
            initialScenarioText:
              storyHistory.length === 0 ? currentMetadata?.initialScenarioText : undefined,
          };
          // --- Log prompt AFTER constructing params ---
          fullPromptForLog = buildStoryPrompt(
            actionParams.storyContext,
            undefined,
            actionParams.genre,
            actionParams.tone,
            actionParams.visualStyle
          );
          // --- END ---

          // Pass the parameter object and the voice to the action
          const result = await generateStorySceneAction(actionParams, currentVoice);

          // Handle rate limit errors first
          if (result.rateLimitError) {
            console.warn('[Adventure Store] Rate limit hit:', result.rateLimitError);
            const definiteRateLimitError = result.rateLimitError;
            set((state) => {
              state.rateLimitError = definiteRateLimitError;
              state.isLoading = false;
            });
            return;
          }

          // Check for specific retryable errors
          if (
            result.error === 'Failed to parse AI response.' ||
            result.error === 'AI response validation failed.'
          ) {
            console.warn(`[Adventure Store] Retryable error occurred: ${result.error}`);
            set((state) => {
              state.error = 'AI_RESPONSE_FORMAT_ERROR';
              state.lastFetchParamsForRetry = currentFetchParams;
              state.isLoading = false;
            });
            return;
          }

          // Handle other non-retryable server errors
          if (result.error) {
            throw new Error(result.error);
          }

          // Check for missing node
          if (!result.storyScene) {
            throw new Error('No adventure scene received from the server.');
          }

          // --- SUCCESS PATH ---
          const newScene = result.storyScene;
          const updatedHistory = [
            ...storyHistory,
            {
              passage: newScene.passage,
              summary: newScene.updatedSummary,
              prompt: fullPromptForLog,
              imagePrompt: newScene.imagePrompt,
              choices: newScene.choices,
            },
          ];

          set((state) => {
            state.storyHistory = updatedHistory;
            state.currentNode = newScene;
            state.isLoading = false;
            state.error = null;
            state.rateLimitError = null;
            state.loginRequired = false;
            state.lastFetchParamsForRetry = null;
          });

          // --- Store current image separately ---
          if (newScene.imageUrl) {
            localStorage.setItem('current-story-image', newScene.imageUrl);
          } else {
            console.log('[Store] No image URL found, removing item from localStorage.');
            localStorage.removeItem('current-story-image');
          }
          // --- End store current image ---

          // --- Store current audio separately ---
          console.log(
            '[Store] Reached point to save separate audio. newScene.audioBase64 exists:',
            !!newScene.audioBase64
          );
          if (newScene.audioBase64) {
            console.log('[Store] Saving audio Base64 to localStorage.');
            localStorage.setItem('current-story-audio', newScene.audioBase64);
          } else {
            console.log('[Store] No audio Base64 found, removing item from localStorage.');
            localStorage.removeItem('current-story-audio');
          }
          // --- End store current audio ---
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Failed to fetch adventure scene.';
          if (errorMessage === 'Unauthorized: User must be logged in.') {
            console.info('[Adventure Store] Unauthorized: User must be logged in.');
            set((state) => {
              state.loginRequired = true;
              state.error = null;
              state.isLoading = false;
            });
          } else {
            console.error('Error fetching adventure scene:', error);
            set((state) => {
              state.error = errorMessage;
              state.loginRequired = false;
              state.isLoading = false;
              state.rateLimitError = null;
              state.lastFetchParamsForRetry = null;
            });
          }
        }
      },

      makeChoice: (choice: z.infer<typeof StoryChoiceSchema>) => {
        const isInitialCall = get().storyHistory.length === 0;
        // Get fetchStoryScene before potentially modifying state
        const { fetchStoryScene, setCurrentMetadata } = get();

        // Store metadata if it's the first call (scenario selection)
        if (isInitialCall) {
          const metadata: AdventureMetadata = {
            genre: choice.genre,
            tone: choice.tone,
            visualStyle: choice.visualStyle,
          };
          setCurrentMetadata(metadata);
          set((state) => {
            state.currentVoice = choice.voice ?? null;
            // Push the initial history item (Step 0)
            state.storyHistory.push({
              passage: choice.text,
              choiceText: '(Scenario Selection)',
            });
          });
          // Fetch first real node (Step 1), passing metadata
          void fetchStoryScene(undefined, metadata);
        } else {
          // This is a subsequent choice within the adventure
          // Update the *previous* history item (N-1) with the choice made
          set((state) => {
            const lastHistoryIndex = state.storyHistory.length - 1;
            if (lastHistoryIndex >= 0) {
              state.storyHistory[lastHistoryIndex].choiceText = choice.text;
            } else {
              // Should not happen if not isInitialCall, but log just in case
              console.warn(
                '[makeChoice] Attempted to update choice on non-initial call with empty history.'
              );
            }
          });
          // Fetch the next node (Step N)
          void fetchStoryScene();
        }
      },

      setLoginRequired: (required) => {
        set((state) => {
          state.loginRequired = required;
        });
      },

      resetAdventure: () => {
        console.log('Resetting adventure store state...');
        set((state) => {
          const currentVolume = state.ttsVolume;
          const currentScenarios = state.dynamicScenarios;
          Object.assign(state, initialState);
          state.ttsVolume = currentVolume;
          state.dynamicScenarios = currentScenarios;
          state.currentNode = null;
          state.storyHistory = [];
          state.isLoading = false;
          state.error = null;
          state.rateLimitError = null;
          state.loginRequired = false;
          state.currentGenre = null;
          state.currentTone = null;
          state.currentVisualStyle = null;
          state.currentVoice = null;
          state.isSpeaking = false;
          state.ttsError = null;
          state.lastFetchParamsForRetry = null;
          state.currentMetadata = null;
        });
      },

      triggerReset: () => {
        console.log('[Adventure Store] Triggering Reset');
        get().resetAdventure();
      },

      saveStory: async () => {
        const { storyHistory, currentNode, currentGenre, currentTone, currentVisualStyle } = get();
        if (!storyHistory.length && !currentNode) {
          console.warn('[Save Story] No story data to save.');
          return;
        }

        const zip = new JSZip();

        // Prepare history data and log data simultaneously
        const fullHistoryForJson = [];
        const promptLog: PromptLogEntry[] = [];

        for (let i = 0; i < storyHistory.length; i++) {
          const item = storyHistory[i];

          // Determine choice made leading to this step
          let choiceMadeText = '(Not recorded)';
          if (i === 0) {
            choiceMadeText = '(Scenario Selection)';
          } else if (i > 0 && storyHistory[i - 1]) {
            // Check if previous item exists
            // Provide fallback if choiceText is undefined
            choiceMadeText = storyHistory[i - 1].choiceText ?? '(Choice text missing)';
          }

          // Use the specific interface directly now
          const logEntry: PromptLogEntry = {
            step: i,
            prompt: item.prompt ?? 'Prompt not recorded',
            passage: item.passage,
            imagePrompt: item.imagePrompt ?? 'Image prompt not generated',
            choices: item.choices?.map((c) => c.text) ?? [],
            summary: item.summary ?? 'Summary not recorded',
            choiceMade: choiceMadeText,
          };

          // Push the typed object
          promptLog.push(logEntry);

          fullHistoryForJson.push({
            ...item,
            // Prepare item for story.json (removing unnecessary fields for this file)
            prompt: undefined,
            imagePrompt: undefined,
            choices: undefined,
          });
        }

        // Add current node info if exists (as the final state, not a full step in prompt log)
        if (currentNode) {
          fullHistoryForJson.push({
            passage: currentNode.passage,
            summary: currentNode.updatedSummary,
            // Omit prompt, choiceText, audio etc. for the final node state in story.json
          });
        }

        // 1. Create and add story.json (using cleaned history)
        const storyData = {
          metadata: {
            genre: currentGenre,
            tone: currentTone,
            visualStyle: currentVisualStyle,
            savedAt: new Date().toISOString(),
          },
          history: fullHistoryForJson, // Use the prepared array
        };
        zip.file('story.json', JSON.stringify(storyData, null, 2));

        // 1.5 Add prompt_log.json
        zip.file('prompt_log.json', JSON.stringify(promptLog, null, 2));

        // Create a subfolder for media files within the zip
        const mediaFolder = zip.folder('media');

        if (!mediaFolder) {
          console.error('[Save Story] Could not create media folder in zip.');
          return;
        }

        // --- Modified: Save only the CURRENT image ---
        let currentImagePromise: Promise<void> | null = null;
        if (currentNode?.imageUrl) {
          console.log('[Save Story] Attempting to save current image...');
          currentImagePromise = (async () => {
            try {
              // Current node is guaranteed by outer check, imageUrl check needed for fetch
              if (!currentNode.imageUrl) {
                throw new Error('Image URL became undefined unexpectedly.');
              }
              const response = await fetch(currentNode.imageUrl);
              if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
              const blob = await response.blob();
              const extension = blob.type.split('/')[1] || 'png';
              mediaFolder.file(`current_image.${extension}`, blob);
              console.log(`[Save Story] Added current_image.${extension} to zip.`);
            } catch (error) {
              console.error(
                `[Save Story] Failed to fetch or add current image (${currentNode.imageUrl}):`,
                error
              );
            }
          })();
        } else {
          console.log('[Save Story] No current node or image URL to save.');
        }
        // --- End Modified Section ---

        // --- Save only the CURRENT audio ---
        let currentAudioPromise: Promise<void> | null = null;
        if (currentNode?.audioBase64) {
          console.log('[Save Story] Attempting to save current audio...');
          currentAudioPromise = (async () => {
            try {
              // Decode Base64 and add as MP3
              const fetchResponse = await fetch(
                `data:audio/mpeg;base64,${currentNode.audioBase64}`
              );
              const blob = await fetchResponse.blob();
              mediaFolder.file(`current_audio.mp3`, blob);
              console.log(`[Save Story] Added current_audio.mp3 to zip.`);
            } catch (error) {
              console.error(`[Save Story] Failed to decode or add current audio:`, error);
            }
          })();
        } else {
          console.log('[Save Story] No current node or audio data to save.');
        }

        // Wait for current image and audio (if any) to be processed
        const mediaPromises = [currentImagePromise, currentAudioPromise].filter(Boolean);
        if (mediaPromises.length > 0) {
          await Promise.all(mediaPromises);
        }

        // 4. Generate the zip file and trigger download
        try {
          const zipBlob = await zip.generateAsync({ type: 'blob' });
          const url = URL.createObjectURL(zipBlob);
          const a = document.createElement('a');
          a.href = url;

          // Create filename: acto-Genre-YYYY-MM-DD-HH-MM.zip
          const now = new Date();
          const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
          const hours = now.getHours().toString().padStart(2, '0');
          const minutes = now.getMinutes().toString().padStart(2, '0');
          const timeStr = `${hours}-${minutes}`;
          const genrePart = currentGenre
            ? `${currentGenre.substring(0, 15).replace(/\W+/g, '')}-`
            : ''; // Keep the trailing hyphen if genre exists

          a.download = `acto-${genrePart}${dateStr}-${timeStr}.zip`;

          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          console.log('[Save Story] Story zip file download triggered.');
        } catch (error) {
          console.error('[Save Story] Error generating or downloading zip file:', error);
          // Optionally, update state with a save error
        }
      },

      // TTS Actions (Unchanged)
      stopSpeaking: () => {
        get().setSpeaking(false);
      },
      setSpeaking: (speaking: boolean) => {
        set((state) => {
          state.isSpeaking = speaking;
          if (!speaking) {
            state.ttsError = null;
          }
        });
      },
      setTTSError: (error: string | null) => {
        set((state) => {
          state.ttsError = error;
          state.isSpeaking = false;
        });
      },
      setTTSVolume: (volume: number) => {
        const clampedVolume = Math.max(0, Math.min(1, volume));
        set((state) => {
          state.ttsVolume = clampedVolume;
        });
      },
      retryLastFetch: () => {
        const { lastFetchParamsForRetry, fetchStoryScene } = get();
        if (lastFetchParamsForRetry) {
          console.log('[Adventure Store] Retrying last fetch...');
          void fetchStoryScene(
            lastFetchParamsForRetry.choiceText,
            lastFetchParamsForRetry.metadata,
            lastFetchParamsForRetry.voice
          );
        } else {
          console.warn('[Adventure Store] retryLastFetch called but no parameters stored.');
        }
      },
      startNewAdventure: (metadata) => {
        // Get fetchStoryScene before potentially modifying state
        const { fetchStoryScene, setCurrentMetadata } = get();

        // Reset core state but keep settings like voice
        set((/* removed unused state arg */) => ({
          isLoading: true,
          error: null,
          rateLimitError: null,
          currentNode: null,
          lastFetchParamsForRetry: null,
          storyHistory: [],
        }));

        setCurrentMetadata(metadata);

        // Fetch the initial node using the provided metadata
        void fetchStoryScene(undefined, metadata);
      },
      restartAdventure: () => {
        const { storyHistory, fetchStoryScene, currentMetadata } = get();
        if (storyHistory.length === 0 || !currentMetadata) {
          console.warn('[Store] Cannot restart, no history or metadata found.');
          return;
        }

        // Refetch the first node
        set({
          storyHistory: [],
          currentNode: null,
          isLoading: true,
          error: null,
          rateLimitError: null,
        });
        void fetchStoryScene();
      },
      resetAdventureState: () => {
        get().resetAdventure();
      },
    })),
    {
      name: 'adventure-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => {
        return {
          ...state,
          currentNode: state.currentNode
            ? { ...state.currentNode, imageUrl: undefined, audioBase64: undefined }
            : null,
          storyHistory: state.storyHistory.map((item) => ({
            ...item,
          })),
        };
      },
      onRehydrateStorage: (_state) => {
        console.log('[Store] Hydration starts');
        return (hydratedState, error) => {
          if (error) {
            console.error('[Store] Hydration failed:', error);
            return;
          }
          if (!hydratedState) {
            console.warn('[Store] Hydration finished but resulted in null state.');
            return;
          }
          try {
            const storedImageUrl = localStorage.getItem('current-story-image');
            const storedAudioBase64 = localStorage.getItem('current-story-audio');

            let updated = false;
            const tempCurrentNode = hydratedState.currentNode
              ? { ...hydratedState.currentNode }
              : null;

            if (storedImageUrl) {
              if (tempCurrentNode) {
                console.log('[Store] Restoring current image URL from separate storage.');
                tempCurrentNode.imageUrl = storedImageUrl;
                updated = true;
              } else if (hydratedState.storyHistory.length > 0) {
                // Attempt to restore to last history item if currentNode is somehow missing
                const lastItemIndex = hydratedState.storyHistory.length - 1;
                const lastItem = hydratedState.storyHistory[lastItemIndex];

                console.warn(
                  '[Store] currentNode missing on hydration, attempting to restore image to last history item.'
                );
                // Create a new object for the last history item
                hydratedState.storyHistory[lastItemIndex] = {
                  ...lastItem,
                };
              }
            }

            if (storedAudioBase64) {
              if (tempCurrentNode) {
                console.log('[Store] Restoring current audio Base64 from separate storage.');
                tempCurrentNode.audioBase64 = storedAudioBase64;
                updated = true;
              } else if (hydratedState.storyHistory.length > 0) {
                // Fallback for audio? Unlikely needed if image is the primary visual element
                console.warn('[Store] currentNode missing on hydration, cannot restore audio.');
              }
            }

            // If any updates were made, assign the new object to trigger change detection
            if (updated && tempCurrentNode) {
              hydratedState.currentNode = tempCurrentNode;
            }
          } catch (e) {
            console.error('[Store] Error restoring separate image/audio:', e);
          }
          console.log('[Store] Hydration finished');
        };
      },
    }
  )
);

export default useAdventureStore;
