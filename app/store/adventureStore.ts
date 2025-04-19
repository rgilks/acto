import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { type AdventureNode, AdventureChoiceSchema } from '@/lib/domain/schemas';
import { generateAdventureNodeAction, generateStartingScenariosAction } from '../actions/adventure';
import { z } from 'zod';

// Simplified History Item
export interface StoryHistoryItem {
  passage: string;
  choiceText?: string;
  summary?: string;
}

// Type for structured rate limit errors passed from the server
interface RateLimitError {
  message: string;
  resetTimestamp: number;
  apiType: 'text' | 'image' | 'tts';
}

// Type for the error state, which can be a string or a structured rate limit error
type ErrorState = string | { rateLimitError: RateLimitError } | null;

type Scenario = z.infer<typeof AdventureChoiceSchema>;

// Type for the metadata to be stored and passed
interface AdventureMetadata {
  genre?: string | null;
  tone?: string | null;
  visualStyle?: string | null;
}

// Simplified State
interface AdventureState {
  currentNode: AdventureNode | null;
  storyHistory: StoryHistoryItem[];
  isLoading: boolean;
  error: ErrorState;
  currentGenre: string | null;
  currentTone: string | null;
  currentVisualStyle: string | null;

  // State for dynamic starting scenarios
  dynamicScenarios: Scenario[] | null;
  isFetchingScenarios: boolean;
  fetchScenariosError: ErrorState;

  // --- TTS State --- (Keep)
  isSpeaking: boolean;
  ttsError: string | null;
  ttsVolume: number;
  // --- End TTS State ---
}

interface AdventureActions {
  fetchAdventureNode: (choiceText?: string, metadata?: AdventureMetadata) => Promise<void>;
  fetchStartingScenarios: () => Promise<void>;
  setCurrentMetadata: (metadata: AdventureMetadata) => void;
  // TTS Actions (Keep)
  stopSpeaking: () => void;
  setSpeaking: (isSpeaking: boolean) => void;
  setTTSError: (error: string | null) => void;
  setTTSVolume: (volume: number) => void;
  makeChoice: (choice: z.infer<typeof AdventureChoiceSchema>) => void;
  resetAdventure: () => void;
  triggerReset: () => void;
}

// Simplified Initial State
const initialState: AdventureState = {
  currentNode: null,
  storyHistory: [],
  isLoading: false,
  error: null,
  currentGenre: null,
  currentTone: null,
  currentVisualStyle: null,

  // State for dynamic starting scenarios
  dynamicScenarios: null,
  isFetchingScenarios: false,
  fetchScenariosError: null,

  // --- Initial TTS State --- (Keep)
  isSpeaking: false,
  ttsError: null,
  ttsVolume: 1,
  // --- End Initial TTS State ---
};

export const useAdventureStore = create<AdventureState & AdventureActions>()(
  immer((set, get) => ({
    ...initialState,

    setCurrentMetadata: (metadata) => {
      set((state) => {
        state.currentGenre = metadata.genre ?? null;
        state.currentTone = metadata.tone ?? null;
        state.currentVisualStyle = metadata.visualStyle ?? null;
      });
    },

    fetchStartingScenarios: async () => {
      set((state) => {
        state.isFetchingScenarios = true;
        state.fetchScenariosError = null;
        // Optionally clear old scenarios immediately
        // state.dynamicScenarios = null;
      });

      try {
        const result = await generateStartingScenariosAction();

        if (result.rateLimitError) {
          console.warn('Rate limit hit fetching scenarios:', result.rateLimitError);
          set((state) => {
            state.fetchScenariosError = { rateLimitError: result.rateLimitError! };
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
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to fetch starting scenarios.';
        console.error('Error fetching starting scenarios:', error);
        set((state) => {
          state.fetchScenariosError = errorMessage;
          state.isFetchingScenarios = false;
        });
      }
    },

    fetchAdventureNode: async (choiceText, metadata) => {
      set((state) => {
        state.isLoading = true;
        state.error = null;
      });

      try {
        const currentHistory = get().storyHistory;
        const isInitialCall = currentHistory.length === 0;

        // Prepare history for the action call
        const historyForAction = [...currentHistory];
        if (choiceText && !isInitialCall) {
          historyForAction[historyForAction.length - 1] = {
            ...historyForAction[historyForAction.length - 1],
            choiceText: choiceText,
          };
        }

        const storyContextForAction = {
          history: historyForAction,
        };

        // Determine metadata to send
        let metadataToSend: AdventureMetadata = {};
        if (isInitialCall && metadata) {
          get().setCurrentMetadata(metadata);
          metadataToSend = metadata;
        } else if (!isInitialCall) {
          metadataToSend = {
            genre: get().currentGenre,
            tone: get().currentTone,
            visualStyle: get().currentVisualStyle,
          };
        }

        // Prepare parameters for the action
        const actionParams: Parameters<typeof generateAdventureNodeAction>[0] = {
          storyContext: storyContextForAction,
          genre: metadataToSend.genre ?? undefined,
          tone: metadataToSend.tone ?? undefined,
          visualStyle: metadataToSend.visualStyle ?? undefined,
        };

        // Add initial scenario text only on the first call
        if (isInitialCall && choiceText) {
          actionParams.initialScenarioText = choiceText;
        } else if (!isInitialCall) {
        }

        const result = await generateAdventureNodeAction(actionParams);

        if (result.rateLimitError) {
          console.warn('Rate limit hit:', result.rateLimitError);
          set((state) => {
            state.error = { rateLimitError: result.rateLimitError! };
            state.isLoading = false;
          });
          return;
        }

        if (result.error) {
          throw new Error(result.error);
        }
        if (!result.adventureNode) {
          throw new Error('No adventure node received from the server.');
        }

        const newNode = result.adventureNode;

        // Always push the new node's passage to the history
        set((state) => {
          state.storyHistory.push({ passage: newNode.passage, summary: newNode.updatedSummary });
          state.currentNode = newNode;
          state.isLoading = false;
          state.error = null;
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to fetch adventure node.';
        if (errorMessage === 'Unauthorized: User must be logged in.') {
          console.info('[Adventure Store] Unauthorized: User must be logged in.');
        } else {
          console.error('Error fetching adventure node:', error);
        }
        set((state) => {
          state.error = errorMessage;
          state.isLoading = false;
        });
      }
    },

    makeChoice: (choice) => {
      const { isLoading, stopSpeaking, storyHistory } = get();
      if (isLoading) return;
      stopSpeaking();

      const isInitialChoice = storyHistory.length === 0;
      let metadataToPass: AdventureMetadata | undefined = undefined;

      if (isInitialChoice) {
        metadataToPass = {
          genre: choice.genre,
          tone: choice.tone,
          visualStyle: choice.visualStyle,
        };
      }

      void get().fetchAdventureNode(choice.text, metadataToPass);
    },

    resetAdventure: () => {
      const currentVolume = get().ttsVolume;
      set((state) => {
        // Reset all state fields to their initial values
        Object.assign(state, initialState);
        // Keep the current TTS volume
        state.ttsVolume = currentVolume;
      });
    },

    triggerReset: () => {
      const { resetAdventure } = get();
      resetAdventure();
      // Clear the scenario cache from session storage
      if (typeof window !== 'undefined') {
        try {
          sessionStorage.removeItem('adventureGame_startingScenarios');
        } catch (error) {
          console.error('[Store] Error clearing scenario cache from sessionStorage:', error);
        }
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
  }))
);

export default useAdventureStore;
