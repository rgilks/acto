import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { persist, createJSONStorage, type StorageValue } from 'zustand/middleware';
import { type AdventureNode, AdventureChoiceSchema } from '@/lib/domain/schemas';
import { generateAdventureNodeAction, generateScenariosAction } from '@/app/actions/adventure';
import { buildAdventurePrompt } from '@/lib/promptUtils';
import { z } from 'zod';
import JSZip from 'jszip';

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
  prompt?: string;
  imagePrompt?: string;
  choices?: z.infer<typeof AdventureChoiceSchema>[];
}

// Parameters needed to retry fetchAdventureNode
interface FetchParams {
  choiceText?: string;
  metadata?: AdventureMetadata;
  voice?: string | null;
}

// Type for structured rate limit errors passed from the server
interface RateLimitError {
  message: string;
  resetTimestamp: number;
  apiType: 'text' | 'image' | 'tts';
}

// Type for the error state, which can be a string or a structured rate limit error
export type ErrorState = string | { rateLimitError: RateLimitError } | null;

type Scenario = z.infer<typeof AdventureChoiceSchema>;

// Type for the metadata to be stored and passed
interface AdventureMetadata {
  genre?: string;
  tone?: string;
  visualStyle?: string;
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
  imageFile?: string | undefined; // Explicitly allow undefined
  audioFile?: string | undefined; // Explicitly allow undefined
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
}

interface AdventureActions {
  fetchAdventureNode: (
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
  makeChoice: (choice: z.infer<typeof AdventureChoiceSchema>) => void;
  resetAdventure: () => void;
  triggerReset: () => void;
  saveStory: () => Promise<void>;
  retryLastFetch: () => void;
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

      fetchAdventureNode: async (choiceText, metadata, voice) => {
        set((state) => {
          state.isLoading = true;
          state.error = null;
          state.lastFetchParamsForRetry = null;
        });

        const currentVoice = voice !== undefined ? voice : get().currentVoice;
        // Store params *before* the call in case it fails retryably
        const currentFetchParams: FetchParams = { choiceText, metadata, voice: currentVoice };

        // Define variable to hold the prompt for logging and history update
        let fullPromptForLog: string | undefined = undefined;

        try {
          // --- CONSTRUCT PARAMS JUST BEFORE CALL ---
          const currentHistory = get().storyHistory; // Get the latest history state HERE
          const actionParams: Parameters<typeof generateAdventureNodeAction>[0] = {
            storyContext: { history: currentHistory }, // Use it here
            genre: metadata?.genre ?? get().currentGenre ?? undefined,
            tone: metadata?.tone ?? get().currentTone ?? undefined,
            visualStyle: metadata?.visualStyle ?? get().currentVisualStyle ?? undefined,
          };
          // --- Log prompt AFTER constructing params ---
          fullPromptForLog = buildAdventurePrompt(
            // Assign to the variable
            actionParams.storyContext, // Pass the correct context
            choiceText ? choiceText : undefined,
            actionParams.genre,
            actionParams.tone,
            actionParams.visualStyle
          );
          // --- END ---

          // Pass the parameter object and the voice to the action
          const result = await generateAdventureNodeAction(actionParams, currentVoice);

          // Handle rate limit errors first
          if (result.rateLimitError) {
            console.warn('[Adventure Store] Rate limit hit:', result.rateLimitError);
            set((state) => {
              state.error = { rateLimitError: result.rateLimitError! };
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
          if (!result.adventureNode) {
            throw new Error('No adventure node received from the server.');
          }

          // --- SUCCESS PATH ---
          const newNode = result.adventureNode;
          set((state) => {
            const lastHistoryIndex = state.storyHistory.length - 1;
            if (lastHistoryIndex >= 0) {
              state.storyHistory[lastHistoryIndex] = {
                ...state.storyHistory[lastHistoryIndex],
                passage: newNode.passage,
                summary: newNode.updatedSummary,
                imageUrl: newNode.imageUrl,
                audioBase64: newNode.audioBase64,
                prompt: fullPromptForLog,
                imagePrompt: newNode.imagePrompt,
                choices: newNode.choices,
              };
            }
            state.currentNode = newNode;
            state.isLoading = false;
            state.error = null;
            state.loginRequired = false;
            state.lastFetchParamsForRetry = null;
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
              state.lastFetchParamsForRetry = null;
            });
          }
        }
      },

      makeChoice: (choice: z.infer<typeof AdventureChoiceSchema>) => {
        const isInitialCall = get().storyHistory.length === 0;
        const previousNode = get().currentNode; // Get state *before* choice
        const { fetchAdventureNode, setCurrentMetadata } = get();

        // Store metadata if it's the first call (scenario selection)
        if (isInitialCall) {
          const metadata: AdventureMetadata = {
            genre: choice.genre,
            tone: choice.tone,
            visualStyle: choice.visualStyle,
          };
          setCurrentMetadata(metadata);
          // Store the chosen voice for the rest of the adventure
          set((state) => {
            state.currentVoice = choice.voice ?? null;
          });

          // Push initial placeholder history item for step 0
          set((state) => {
            state.storyHistory.push({
              passage: choice.text, // Use the scenario text as the first "passage"
              choiceText: '(Scenario Selection)', // Explicitly mark the choice type
              // Other fields (prompt, imagePrompt, summary, etc.) will be filled by fetchAdventureNode
            });
          });

          void fetchAdventureNode(choice.text, metadata); // Fetch first real node (step 1) using scenario text as initial context
        } else {
          // This is a subsequent choice within the adventure
          if (previousNode) {
            // Push a new history item representing the state *after* the choice is made,
            // but *before* the next node is fetched.
            set((state) => {
              const historyItem: StoryHistoryItem = {
                passage: '...', // Placeholder passage
                choiceText: choice.text, // Record the choice that leads *to* the next step
              };
              state.storyHistory.push(historyItem);
            });
          } else {
            console.warn('[makeChoice] Cannot record history step: previousNode is null.');
          }

          void fetchAdventureNode(choice.text); // Fetch next node based on the chosen text
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
          Object.assign(state, { ...initialState, ttsVolume: state.ttsVolume });
          state.dynamicScenarios = get().dynamicScenarios;
          state.isFetchingScenarios = false;
          state.fetchScenariosError = null;
          state.currentNode = null;
          state.storyHistory = [];
          state.isLoading = false;
          state.error = null;
          state.currentGenre = null;
          state.currentTone = null;
          state.currentVisualStyle = null;
          state.currentVoice = null;
          state.isSpeaking = false;
          state.ttsError = null;
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

          // Determine media file references
          const imageFileRef = item.imageUrl ? `media/image_${i}.png` : undefined; // Assuming png for simplicity
          const audioFileRef = item.audioBase64 ? `media/audio_${i}.mp3` : undefined;

          // Use the specific interface directly now
          const logEntry: PromptLogEntry = {
            step: i,
            prompt: item.prompt ?? 'Prompt not recorded',
            passage: item.passage,
            imagePrompt: item.imagePrompt ?? 'Image prompt not generated',
            choices: item.choices?.map((c) => c.text ?? '') ?? [],
            summary: item.summary ?? 'Summary not recorded',
            choiceMade: choiceMadeText,
          };

          // Conditionally add media file references
          if (imageFileRef) {
            logEntry.imageFile = imageFileRef;
          }
          if (audioFileRef) {
            logEntry.audioFile = audioFileRef;
          }

          // Push the typed object
          promptLog.push(logEntry);

          fullHistoryForJson.push({
            ...item,
            // Prepare item for story.json (removing unnecessary fields for this file)
            imageFile: item.imageUrl ? `media/image_${i}.png` : undefined,
            audioFile: item.audioBase64 ? `media/audio_${i}.mp3` : undefined,
            audioBase64: undefined,
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
            imageUrl: currentNode.imageUrl,
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

        // 2. Fetch images and add them to the zip (Use original storyHistory for image URLs)
        const imagePromises = storyHistory.map(async (item, index) => {
          if (item.imageUrl) {
            try {
              const response = await fetch(item.imageUrl);
              if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
              const blob = await response.blob();
              // Basic file extension check (can be improved)
              const extension = blob.type.split('/')[1] || 'png';
              mediaFolder.file(`image_${index}.${extension}`, blob);
              console.log(`[Save Story] Added image_${index}.${extension} to zip.`);
            } catch (error) {
              console.error(
                `[Save Story] Failed to fetch or add image ${index} (${item.imageUrl}):`,
                error
              );
            }
          }
        });

        // 3. Decode base64 audio and add it to the zip (Use original storyHistory for audio data)
        const audioPromises = storyHistory.map(async (item, index) => {
          if (item.audioBase64) {
            try {
              // Assuming audio is MP3 format as stored
              const fetchResponse = await fetch(`data:audio/mpeg;base64,${item.audioBase64}`);
              const blob = await fetchResponse.blob();
              mediaFolder.file(`audio_${index}.mp3`, blob);
              console.log(`[Save Story] Added audio_${index}.mp3 to zip.`);
            } catch (error) {
              console.error(`[Save Story] Failed to decode or add audio ${index}:`, error);
            }
          }
        });

        // Wait for all images and audio files to be processed
        await Promise.all([...imagePromises, ...audioPromises]);

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
        const { lastFetchParamsForRetry, fetchAdventureNode } = get();
        if (lastFetchParamsForRetry) {
          console.log('[Adventure Store] Retrying last fetch...');
          void fetchAdventureNode(
            lastFetchParamsForRetry.choiceText,
            lastFetchParamsForRetry.metadata,
            lastFetchParamsForRetry.voice
          );
        } else {
          console.warn('[Adventure Store] retryLastFetch called but no parameters stored.');
        }
      },
    })),
    {
      name: 'adventure-storage',
      storage: createJSONStorage(() => createPruningStorage(localStorage)),
      partialize: (state) =>
        Object.fromEntries(
          Object.entries(state).map(([key, value]) => {
            if (key === 'currentNode' && value) {
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              const { audioBase64: _audioBase64, ...rest } = value as AdventureNode;
              return [key, rest];
            }
            if (key === 'storyHistory') {
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              return [
                key,
                (value as StoryHistoryItem[]).map(({ audioBase64: _audioBase64, ...item }) => item),
              ];
            }
            return [key, value];
          })
        ) as Partial<AdventureState & AdventureActions>,
    }
  )
);

export default useAdventureStore;
