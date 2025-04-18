import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { type AdventureNode, AdventureChoiceSchema } from '@/lib/domain/schemas';
import { generateAdventureNodeAction, type RoomId } from '../actions/adventure';
import { z } from 'zod';

// Use imported RoomId type
// type RoomId = string; // Remove generic type

// Re-define StoryHistoryItem type locally
// Include state *before* this passage/choice was made for context
export interface StoryHistoryItem {
  passage: string;
  choiceText?: string;
  // State snapshot *before* this step
  playerHealth?: number;
  playerWounds?: string[];
  ogreHealth?: number;
  ogreRoomId?: RoomId | null;
}

interface AdventureState {
  currentNode: AdventureNode | null;
  storyHistory: StoryHistoryItem[];
  isLoading: boolean;
  error: string | null;
  // Use imported RoomId type
  currentRoomId: RoomId | null;
  currentImagePlaceholder: string | null;

  // --- New State Fields ---
  playerHealth: number;
  playerWounds: string[];
  ogreHealth: number;
  ogreRoomId: RoomId | null; // Track the ogre's location
  isPlayerDead: boolean;
  isOgreDefeated: boolean; // Derived from ogreHealth <= 0
  // --- End New State Fields ---

  // --- TTS State ---
  isSpeaking: boolean;
  ttsError: string | null;
  ttsVolume: number; // Add volume state (0 to 1)
  // --- End TTS State ---
}

// Update Action types if necessary (parameters might change)
interface AdventureActions {
  // Fetches the very first node, or based on the current state + a chosen action
  fetchAdventureNode: (choiceText?: string) => Promise<void>;
  // TTS Actions
  stopSpeaking: () => void;
  // Internal setters called by TTS hook
  setSpeaking: (isSpeaking: boolean) => void;
  setTTSError: (error: string | null) => void;
  setTTSVolume: (volume: number) => void;
  // Choice type uses the updated schema
  makeChoice: (choice: z.infer<typeof AdventureChoiceSchema>) => void;
  resetAdventure: () => void;
}

const initialState: AdventureState = {
  currentNode: null,
  storyHistory: [],
  isLoading: false,
  error: null,
  // Initial room state
  currentRoomId: null, // Will be set on first fetch
  currentImagePlaceholder: null,

  // --- Initial Game State --- Need actual constants potentially
  playerHealth: 10, // TODO: Use constant from actions if exported
  playerWounds: [],
  ogreHealth: 20, // TODO: Use constant from actions if exported
  ogreRoomId: 'room5', // TODO: Use constant from actions if exported
  isPlayerDead: false,
  isOgreDefeated: false,
  // --- End Initial Game State ---

  // --- Initial TTS State ---
  isSpeaking: false,
  ttsError: null,
  ttsVolume: 1, // Default volume to max
  // --- End Initial TTS State ---
};

export const useAdventureStore = create<AdventureState & AdventureActions>()(
  immer((set, get) => ({
    ...initialState,

    fetchAdventureNode: async (choiceText) => {
      // Set loading state immediately before the async call
      set((state) => {
        state.isLoading = true;
        state.error = null;
        // Don't clear the node here, keep showing the last one until new arrives
      });

      try {
        // Prepare the full context for the server action
        const currentState = get();

        // Add the *choice* made to the history *before* sending
        const historyWithChoice = [...currentState.storyHistory];
        if (choiceText && historyWithChoice.length > 0) {
          // Get the last history item (state *before* the choice)
          const lastHistoryItem = historyWithChoice[historyWithChoice.length - 1];

          // Create a *new* object to avoid mutating the frozen state object
          const updatedLastHistoryItem: StoryHistoryItem = {
            ...lastHistoryItem, // Copy existing properties
            choiceText: choiceText, // Add the choice text
            // Also capture the state *before* this choice was made
            playerHealth: currentState.playerHealth,
            playerWounds: [...currentState.playerWounds], // Deep copy wounds array
            ogreHealth: currentState.ogreHealth,
            ogreRoomId: currentState.ogreRoomId,
          };

          // Replace the last item in the array with the new, updated object
          historyWithChoice[historyWithChoice.length - 1] = updatedLastHistoryItem;
        }

        // Context for the server action, representing the state *before* this turn
        const storyContextForAction = {
          history: historyWithChoice,
          currentRoomId: currentState.currentRoomId ?? 'room1', // Use initial if null
          playerHealth: currentState.playerHealth,
          playerWounds: currentState.playerWounds,
          ogreHealth: currentState.ogreHealth,
          ogreRoomId: currentState.ogreRoomId,
          isPlayerDead: currentState.isPlayerDead,
        };

        console.log('Sending context to action:', storyContextForAction);

        const result = await generateAdventureNodeAction({ storyContext: storyContextForAction });

        if (result.error) {
          throw new Error(result.error);
        }
        if (!result.adventureNode) {
          throw new Error('No adventure node received from the server.');
        }

        // Action returns the *new* state after processing the choice
        const newNode = result.adventureNode; // This now includes playerHealth, ogreHealth etc.

        // Single state update after successful fetch
        set((state) => {
          // Add the *new* passage to history (without choiceText initially)
          // We only add choiceText *before* sending the next request
          state.storyHistory.push({ passage: newNode.passage });

          // Update current state with results from the action
          state.currentNode = newNode;
          state.currentRoomId = newNode.roomId as RoomId;
          state.currentImagePlaceholder = newNode.imagePlaceholder;
          state.playerHealth = newNode.playerHealth;
          state.playerWounds = newNode.playerWounds;
          state.ogreHealth = newNode.ogreHealth;
          state.ogreRoomId = newNode.ogreRoomId;
          state.isPlayerDead = newNode.isPlayerDead ?? newNode.playerHealth <= 0;
          state.isOgreDefeated = newNode.ogreHealth <= 0;
          state.isLoading = false;
          state.error = null;
        });
      } catch (error) {
        console.error('Error fetching adventure node:', error);
        set((state) => {
          state.error = error instanceof Error ? error.message : 'Failed to fetch adventure node.';
          state.isLoading = false;
          // Don't null out currentNode on error, keep showing the last valid state
        });
      }
    },

    makeChoice: (choice: z.infer<typeof AdventureChoiceSchema>) => {
      const { isLoading, isPlayerDead, stopSpeaking } = get();

      if (isLoading || isPlayerDead) {
        console.log('Cannot make choice while loading or dead.');
        return;
      }

      // Stop any current TTS playback immediately
      stopSpeaking();

      void get().fetchAdventureNode(choice.text); // Pass the chosen text
    },

    resetAdventure: () => {
      set(initialState);
      void get().fetchAdventureNode(); // Fetch the initial node without a choice text
    },

    // TTS Actions
    stopSpeaking: () => {
      // This only updates state. The component will handle stopping the <audio> element.
      get().setSpeaking(false);
    },
    // Internal setters called by TTS hook
    setSpeaking: (speaking: boolean) => {
      set((state) => {
        state.isSpeaking = speaking;
        if (!speaking) {
          state.ttsError = null; // Clear error when stopping
        }
      });
    },
    setTTSError: (error: string | null) => {
      set((state) => {
        state.ttsError = error;
        state.isSpeaking = false; // Stop speaking on error
      });
    },
    setTTSVolume: (volume: number) => {
      // Clamp volume between 0 and 1
      const clampedVolume = Math.max(0, Math.min(1, volume));
      set((state) => {
        state.ttsVolume = clampedVolume;
      });
    },
  }))
);

export default useAdventureStore;
