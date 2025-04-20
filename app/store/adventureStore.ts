import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { persist, createJSONStorage, type StorageValue } from 'zustand/middleware';
import { type AdventureNode, AdventureChoiceSchema } from '@/lib/domain/schemas';
import { generateAdventureNodeAction, generateScenariosAction } from '../actions/adventure';
import { z } from 'zod';

// --- Custom Storage with Pruning ---

const MAX_PRUNE_ATTEMPTS = 10;

const createPruningStorage = (storage = localStorage, maxAttempts = MAX_PRUNE_ATTEMPTS) => ({
  getItem: (name: string): string | null => {
    return storage.getItem(name);
  },
  setItem: (name: string, value: string): void => {
    let attempts = 0;
    let currentValue = value;

    while (attempts < maxAttempts) {
      try {
        storage.setItem(name, currentValue);

        return;
      } catch (e: unknown) {
        if (
          e instanceof DOMException &&
          (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') // Firefox
        ) {
          console.warn(
            `LocalStorage quota exceeded (attempt ${attempts + 1}). Pruning oldest history item.`
          );
          attempts++;

          try {
            const stateWithValue = JSON.parse(currentValue) as StorageValue<AdventureState>;
            const state = stateWithValue.state;

            if (state?.storyHistory && state.storyHistory.length > 0) {
              state.storyHistory.shift();

              currentValue = JSON.stringify(stateWithValue);
              console.log(
                `Pruned state. New history length: ${state.storyHistory.length}. Retrying save.`
              );
            } else {
              console.error(
                'Quota exceeded, but no story history found or history is empty. Cannot prune further. Giving up.'
              );

              return;
            }
          } catch (parseError) {
            console.error('Error parsing state during pruning:', parseError);

            return;
          }
        } else {
          console.error('Error saving to localStorage (not quota related):', e);
        }
      }
    }
    console.error(`Failed to save state to localStorage after ${maxAttempts} pruning attempts.`);
  },
  removeItem: (name: string): void => {
    storage.removeItem(name);
  },
});

// --- End Custom Storage ---

// Simplified History Item
export interface StoryHistoryItem {
  passage: string;
  choiceText?: string;
  summary?: string;
  imageUrl?: string | null;
  audioBase64?: string | null;
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
  loginRequired: boolean;
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
  fetchScenarios: () => Promise<void>;
  setCurrentMetadata: (metadata: AdventureMetadata) => void;
  setLoginRequired: (required: boolean) => void;
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
  loginRequired: false,
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
  persist(
    immer((set, get) => ({
      ...initialState,

      setCurrentMetadata: (metadata) => {
        set((state) => {
          state.currentGenre = metadata.genre ?? null;
          state.currentTone = metadata.tone ?? null;
          state.currentVisualStyle = metadata.visualStyle ?? null;
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
            set((state) => {
              state.fetchScenariosError = { rateLimitError: result.rateLimitError! };
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
          if (choiceText && !isInitialCall && historyForAction.length > 0) {
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

          set((state) => {
            state.storyHistory.push({
              passage: newNode.passage,
              summary: newNode.updatedSummary,
              imageUrl: newNode.imageUrl,
              audioBase64: newNode.audioBase64,
            });
            state.currentNode = newNode;
            state.isLoading = false;
            state.error = null;
            state.loginRequired = false;
          });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Failed to fetch adventure node.';
          if (errorMessage === 'Unauthorized: User must be logged in.') {
            console.info('[Adventure Store] Unauthorized: User must be logged in.');
            set((state) => {
              state.loginRequired = true;
              state.error = null;
              state.isLoading = false;
            });
          } else {
            console.error('Error fetching adventure node:', error);
            set((state) => {
              state.error = errorMessage;
              state.loginRequired = false;
              state.isLoading = false;
            });
          }
        }
      },

      makeChoice: (choice) => {
        void get().fetchAdventureNode(choice.text, {
          genre: choice.genre ?? get().currentGenre,
          tone: choice.tone ?? get().currentTone,
          visualStyle: choice.visualStyle ?? get().currentVisualStyle,
        });
      },

      setLoginRequired: (required) => {
        set((state) => {
          state.loginRequired = required;
        });
      },

      resetAdventure: () => {
        console.log('Resetting adventure store state...');
        set((state) => {
          Object.assign(state, { ...initialState, ttsVolume: state.ttsVolume });
          state.dynamicScenarios = get().dynamicScenarios;
          state.isFetchingScenarios = false;
          state.fetchScenariosError = null;
        });
      },

      triggerReset: () => {
        get().resetAdventure();
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
    })),
    {
      name: 'adventure-storage',
      storage: createJSONStorage(() => createPruningStorage(localStorage)),
    }
  )
);

export default useAdventureStore;
