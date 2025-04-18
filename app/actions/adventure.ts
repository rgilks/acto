'use server';

import { z } from 'zod';
import { getActiveModel, getGoogleAIClient, openai, ModelConfig } from '@/lib/modelConfig';
import { AdventureNodeSchema, type AdventureNode } from '@/lib/domain/schemas'; // Base schema
import * as Sentry from '@sentry/nextjs';
// Import other necessary modules like rate limiting, session handling if needed
import { type StoryHistoryItem } from '@/store/adventureStore';

// --- Dungeon Definition ---
// Export RoomId type
export type RoomId = 'room1' | 'room2' | 'room3' | 'room4' | 'room5';

interface DungeonRoom {
  id: RoomId;
  name: string;
  description: string;
  imagePlaceholder: string;
  connections: Partial<Record<RoomId, string>>; // Maps connected room ID to a short description of the exit (e.g., "Door to Right")
}

const dungeonLayout: Record<RoomId, DungeonRoom> = {
  room1: {
    id: 'room1',
    name: 'Entrance Chamber',
    description:
      'Dust hangs thick in the air, illuminated by faint light filtering from cracks in the ceiling far above. Cobwebs drape broken stonework like macabre decorations. Directly ahead, the passage continues into darkness, while a heavy, warped wooden door stands slightly ajar to your right. The faint scent of mildew and decay fills the chamber.',
    imagePlaceholder: 'placeholder-entrance-chamber.png',
    connections: { room2: 'Straight Ahead', room3: 'Door to Right' },
  },
  room2: {
    id: 'room2',
    name: 'Damp Corridor',
    description:
      'You are in a narrow corridor. Water drips steadily from the ceiling, pooling on the uneven flagstones below. Empty torch sconces line the walls, their iron rusted. The passage stretches forward, leading to a chamber partially submerged in murky water. Behind you is the way back to the entrance chamber.',
    imagePlaceholder: 'placeholder-damp-corridor.png',
    connections: { room1: 'Back to Entrance', room4: 'Forward to Water' },
  },
  room3: {
    id: 'room3',
    name: 'Ruined Guard Room',
    description:
      'This chamber was once a guard room, now fallen into disrepair. An overturned table lies amidst scattered debris. A rusted weapon rack stands against one wall, empty save for a single broken spear shaft. Another heavy wooden door, scarred and splintered, sits opposite the one you entered. The air is stale.',
    imagePlaceholder: 'placeholder-guard-room.png',
    connections: { room1: 'Opposite Door', room5: 'Scarred Door' },
  },
  room4: {
    id: 'room4',
    name: 'Flooded Chamber',
    description:
      'Murky, stagnant water fills this chamber to about knee height, obscuring the floor below. Crumbling stepping stones offer a precarious path across the water towards an archway on the far side. The corridor you came from is behind you. The water ripples slightly, disturbed by unseen currents.',
    imagePlaceholder: 'placeholder-flooded-chamber.png',
    connections: { room2: 'Back to Corridor', room5: 'Across Water' },
  },
  room5: {
    id: 'room5',
    name: 'Treasure Room',
    description:
      'This small chamber glitters faintly. A stone pedestal stands in the center, though it is currently empty. Scattered copper coins and a few tarnished silver pieces lie amongst the dust on the floor. Two exits lead out: an archway filled with murky water, and a heavy, scarred wooden door.',
    imagePlaceholder: 'placeholder-treasure-room.png',
    connections: { room3: 'Scarred Door', room4: 'Archway Back' },
  },
};
// --- End Dungeon Definition ---

// --- Constants ---
const INITIAL_PLAYER_HEALTH = 10;
const INITIAL_OGRE_HEALTH = 20;
const OGRE_START_ROOM_ID: RoomId = 'room5';
// --- End Constants ---

// Re-define the schema locally for validation based on the type from the store
const StoryHistoryItemSchema = z.object({
  passage: z.string(),
  choiceText: z.string().optional(),
  // Include the state *before* this passage/choice for context
  playerHealth: z.number().optional(),
  ogreHealth: z.number().optional(),
  ogreRoomId: z
    .union([
      z.custom<RoomId>((val) => Object.keys(dungeonLayout).includes(val as string)),
      z.null(),
    ])
    .optional(),
});

// Define the actual structure for story context
// It now needs to include the full game state
type StoryContext = {
  history: StoryHistoryItem[];
  currentRoomId: RoomId;
  playerHealth: number;
  playerWounds: string[];
  ogreHealth: number;
  ogreRoomId: RoomId | null; // Ogre's current location, null if defeated/inactive
  isPlayerDead: boolean;
};

// --- Local Extended Type --- (because AdventureNodeSchema in lib/domain/schemas might not be updated yet)
// This represents the full data structure we *expect* the AI to return, including combat state.
type AdventureNodeWithCombatState = AdventureNode & {
  playerHealth: number;
  playerWounds: string[];
  ogreHealth: number;
  ogreRoomId: RoomId | null;
  isPlayerDead?: boolean; // Allow optional here, handle default/check later
};
// --- End Local Extended Type ---

// Define the input schema for the action, using the locally defined schema
const GenerateAdventureNodeParamsSchema = z.object({
  storyContext: z
    .object({
      history: z.array(StoryHistoryItemSchema),
      currentRoomId: z.custom<RoomId>((val) => Object.keys(dungeonLayout).includes(val as string)),
      // Validate the incoming state
      playerHealth: z.number(),
      playerWounds: z.array(z.string()),
      ogreHealth: z.number(),
      ogreRoomId: z.union([
        z.custom<RoomId>((val) => Object.keys(dungeonLayout).includes(val as string)),
        z.null(),
      ]),
      isPlayerDead: z.boolean(),
    })
    .optional(), // Optional only for the very first call
});

type GenerateAdventureNodeParams = z.infer<typeof GenerateAdventureNodeParamsSchema>;

// Define the result type
type GenerateAdventureNodeResult = {
  adventureNode?: AdventureNodeWithCombatState; // Return the extended type
  error?: string;
};

// Function to build the prompt using the dungeon layout and game state
function buildAdventurePrompt(context: StoryContext | undefined): string {
  // --- State Initialization for First Call ---
  const isInitialCall = !context;
  const currentRoomId = context?.currentRoomId ?? 'room1';
  const playerHealth = context?.playerHealth ?? INITIAL_PLAYER_HEALTH;
  const playerWounds = context?.playerWounds ?? [];
  const ogreHealth = context?.ogreHealth ?? INITIAL_OGRE_HEALTH;
  const ogreRoomId = context?.ogreRoomId ?? OGRE_START_ROOM_ID;
  const isPlayerDead = context?.isPlayerDead ?? false; // Start alive

  // If player is already dead, force a game over state (should ideally be handled client-side too)
  if (isPlayerDead) {
    return `{
        "roomId": "${currentRoomId}",
        "imagePlaceholder": "placeholder-game-over.png",
        "passage": "Darkness claims you. Your adventure ends here.",
        "choices": [],
        "playerHealth": 0,
        "playerWounds": ${JSON.stringify(playerWounds)},
        "ogreHealth": ${ogreHealth},
        "ogreRoomId": ${ogreRoomId ? `"${ogreRoomId}"` : 'null'},
        "isPlayerDead": true
      }`;
  }

  // --- Determine Current Situation ---
  const room = dungeonLayout[currentRoomId];
  const isOgrePresent = ogreRoomId === currentRoomId && ogreHealth > 0;
  const lastStep = context?.history?.[context.history.length - 1];

  // --- Base JSON structure for the AI response ---
  // Now includes the full game state to be updated by the AI
  const jsonStructure = `{
  "roomId": "${room.id}",
  "imagePlaceholder": "${isOgrePresent ? 'placeholder-ogre-encounter.png' : room.imagePlaceholder}",
  "passage": "(string) Describe outcome of previous choice (if any) and current situation. ${isOgrePresent ? 'Focus on the ogre encounter!' : `Incorporate elements from room: ${room.description}`}",
  "choices": [ /* strings or objects like { text: string, targetRoomId?: string, actionType?: 'combat'|'examine'|'move' } */ ],
  "playerHealth": ${playerHealth}, // AI should update this based on combat/events
  "playerWounds": ${JSON.stringify(playerWounds)}, // AI should update this array
  "ogreHealth": ${ogreHealth}, // AI should update this if ogre takes damage
  "ogreRoomId": ${ogreRoomId ? `"${ogreRoomId}"` : 'null'}, // AI *could* potentially change this (e.g., if ogre flees), null if defeated
  "isPlayerDead": false // AI should set this to true if player dies
}`;

  const basePrompt = `You are a storyteller creating a 'choose your own adventure' game in a dungeon with a roaming ogre. Respond ONLY with a valid JSON object matching this structure, filling in the details:
${jsonStructure}
Ensure the entire output is a single, valid JSON object string without any surrounding text or markdown formatting. The player has ${playerHealth} HP. The ogre has ${ogreHealth} HP. Player wounds: ${playerWounds.length > 0 ? playerWounds.join(', ') : 'none'}.`;

  // --- Build History Summary ---
  let historySummary = '';
  if (lastStep) {
    historySummary = `The story so far (last step):
Previous Passage: ${lastStep.passage}
Choice Made: ${lastStep.choiceText ?? 'None (start of game)'}
`;
  }
  historySummary += `Current Location: ${room.name} (${room.id}). Player HP: ${playerHealth}. Wounds: ${playerWounds.join(', ') || 'none'}.`;
  if (ogreHealth > 0) {
    historySummary += ` Ogre HP: ${ogreHealth}. Ogre Location: ${ogreRoomId ? dungeonLayout[ogreRoomId].name : 'Unknown/Defeated'}.`;
  }

  // --- Construct Final Prompt based on Combat/Exploration ---
  if (isInitialCall) {
    // Initial prompt - Player starts, ogre is elsewhere (unless starting in room5)
    const connectionChoices = Object.entries(room.connections).map(([roomId, exitDesc]) => {
      return `{ "text": "Go: ${exitDesc} (to ${dungeonLayout[roomId as RoomId].name})", "targetRoomId": "${roomId}" }`;
    });
    return `
      ${basePrompt}

      Start a new fantasy adventure in a dungeon. The player begins in the ${room.name}.
      Room Description: ${room.description}.
      An ogre lurks somewhere in this dungeon (currently in ${dungeonLayout[ogreRoomId].name}).
      Write the first passage describing the starting room.
      Provide ${connectionChoices.length + 1} choices:
      - Include choices for ALL connected rooms: ${connectionChoices.join(', ')}
      - Include 1 additional choice for an action relevant to the room.
      Set initial state in the JSON response: playerHealth=${INITIAL_PLAYER_HEALTH}, playerWounds=[], ogreHealth=${INITIAL_OGRE_HEALTH}, ogreRoomId="${ogreRoomId}", isPlayerDead=false.
    `;
  } else if (isOgrePresent) {
    // Combat prompt
    const fleeChoices = Object.entries(room.connections).map(([roomId, exitDesc]) => {
      return `{ "text": "Attempt to Flee: ${exitDesc} (to ${dungeonLayout[roomId as RoomId].name})", "targetRoomId": "${roomId}" }`;
    });
    return `
      ${basePrompt}

      ${historySummary}

      COMBAT! The player is facing the ogre in ${room.name}!
      Player chose '${lastStep?.choiceText}'. Describe the outcome of that choice (e.g., damage dealt/taken, wounds gained, status effects). UPDATE playerHealth, playerWounds, ogreHealth, isPlayerDead in the JSON based on the outcome. Wounds (${playerWounds.join(', ') || 'none'}) should impact the description and potentially the effectiveness of actions.
      Then, describe the ogre's current action/state.
      Provide 3-4 tactical choices for the player:
      - Examples: "Attack the ogre's legs", "Try to dodge behind cover", "Look for something to use as a weapon", "Throw dust in its eyes", etc. Make choices relevant to the room and player wounds.
      - Include flee choices: ${fleeChoices.join(', ')}
      If playerHealth drops to 0 or less, set isPlayerDead to true and write a death passage.
      If ogreHealth drops to 0 or less, describe its defeat and set ogreRoomId to null.
    `;
  } else {
    // Exploration prompt
    const connectionChoices = Object.entries(room.connections).map(([roomId, exitDesc]) => {
      return `{ "text": "Go: ${exitDesc} (to ${dungeonLayout[roomId as RoomId].name})", "targetRoomId": "${roomId}" }`;
    });
    return `
      ${basePrompt}

      ${historySummary}

      The player chose '${lastStep?.choiceText}'. Describe the outcome/observation based on that choice.
      ***IMPORTANT***: If the choice resulted in moving to a new room (e.g., the choice text was 'Go: Door to Right (to Ruined Guard Room)'), update the top-level "roomId" field in your JSON response to the ID of the *destination* room (e.g., "room3"). Otherwise, keep the "roomId" as the current room (${room.id}). Describe the *new* room (${room.description} is for the *current* room, look up the description for the destination if needed).
      The ogre is currently in ${ogreRoomId ? dungeonLayout[ogreRoomId].name : 'an unknown location or defeated'}. ${ogreRoomId && Math.abs(Object.keys(dungeonLayout).indexOf(currentRoomId) - Object.keys(dungeonLayout).indexOf(ogreRoomId)) === 1 ? 'You might hear sounds of its presence nearby.' : ''}
      UPDATE playerHealth, playerWounds, etc. in the JSON if the previous action had lasting effects (e.g., triggered a trap). isPlayerDead should remain false unless a non-combat event killed the player.
      Provide ${connectionChoices.length + 1} to ${connectionChoices.length + 2} choices:
      - Include choices for ALL connected rooms, ensuring each has a "targetRoomId" field: ${connectionChoices.join(', ')}
      - Include 1-2 additional choices for actions relevant to the current room (${room.name}) or the last action.
    `;
  }
}

// Placeholder function to call the LLM (adapt from exercise.ts)
async function callAIForAdventure(prompt: string, modelConfig: ModelConfig): Promise<string> {
  console.log('[Adventure] Calling AI...');
  console.log('[Adventure] Prompt:\n', prompt); // Log the prompt for debugging

  if (modelConfig.provider === 'openai' && openai) {
    try {
      const completion = await openai.chat.completions.create({
        model: modelConfig.name,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        max_tokens: modelConfig.maxTokens, // Adjust if needed
      });
      const result = completion?.choices?.[0]?.message?.content;
      if (!result) throw new Error('No content received from OpenAI');
      console.log('[Adventure] Received response from OpenAI.');
      return result;
    } catch (error) {
      console.error('[Adventure] OpenAI API error:', error);
      Sentry.captureException(error);
      throw error; // Re-throw for handling in the main action
    }
  } else if (modelConfig.provider === 'google') {
    try {
      const genAI = getGoogleAIClient();
      const model = genAI.getGenerativeModel({ model: modelConfig.name });
      const result = await model.generateContent(prompt);
      const response = result.response;
      const text = response.text();
      if (!text) throw new Error('No content received from Google AI');
      console.log('[Adventure] Received response from Google AI.');
      return text;
    } catch (error) {
      console.error('[Adventure] Google AI error:', error);
      Sentry.captureException(error);
      throw error; // Re-throw for handling in the main action
    }
  } else {
    throw new Error(`Unsupported model provider or client not available: ${modelConfig.provider}`);
  }
}

export const generateAdventureNodeAction = async (
  params: GenerateAdventureNodeParams
): Promise<GenerateAdventureNodeResult> => {
  // TODO: Add validation, rate limiting, session check similar to generateExerciseResponse

  try {
    const validation = GenerateAdventureNodeParamsSchema.safeParse(params);
    if (!validation.success) {
      console.error('[Adventure] Invalid parameters:', validation.error.format());
      // Provide more specific error message if possible
      const errorMsg = validation.error.errors[0]?.message ?? 'Invalid parameters.';
      return { error: `Invalid input: ${errorMsg}` };
    }

    console.log('[Adventure Action] Received Params:', JSON.stringify(params, null, 2)); // Log raw params
    const storyContext = validation.data.storyContext ?? {
      history: [],
      currentRoomId: 'room1', // Starting room
      playerHealth: INITIAL_PLAYER_HEALTH,
      playerWounds: [],
      ogreHealth: INITIAL_OGRE_HEALTH,
      ogreRoomId: OGRE_START_ROOM_ID,
      isPlayerDead: false,
    };

    console.log('[Adventure Action] Using Story Context:', JSON.stringify(storyContext, null, 2)); // Log context being used

    // If player is already marked dead in context, return game over immediately
    if (storyContext.isPlayerDead) {
      console.log('[Adventure] Player already dead.');
      // Return a specific game over node
      return {
        adventureNode: {
          roomId: storyContext.currentRoomId,
          imagePlaceholder: 'placeholder-game-over.png',
          passage: 'You are already dead. The adventure ended.',
          choices: [],
          playerHealth: 0,
          playerWounds: storyContext.playerWounds,
          ogreHealth: storyContext.ogreHealth,
          ogreRoomId: storyContext.ogreRoomId,
          isPlayerDead: true,
        },
      };
    }

    const prompt = buildAdventurePrompt(storyContext);
    console.log('[Adventure Action] Generated Prompt:', prompt); // Log the prompt

    const activeModel = getActiveModel();

    const aiResponseContent = await callAIForAdventure(prompt, activeModel);

    console.log('[Adventure Action] Raw AI Response:', aiResponseContent); // Log raw response

    let parsedAiContent: unknown;
    try {
      // Clean the response string: remove markdown fences and trim whitespace
      const cleanedResponse = aiResponseContent
        .replace(/^```json\s*/, '') // Remove starting ```json
        .replace(/```\s*$/, '') // Remove ending ```
        .trim(); // Trim whitespace

      parsedAiContent = JSON.parse(cleanedResponse); // Parse the cleaned string
      console.log(
        '[Adventure Action] Parsed AI Content:',
        JSON.stringify(parsedAiContent, null, 2)
      ); // Log parsed content
    } catch (parseError) {
      console.error(
        '[Adventure] Failed to parse AI response JSON:',
        parseError,
        '\nRaw Response:\n',
        aiResponseContent // Log the original raw response for debugging
      );
      Sentry.captureException(parseError, { extra: { aiResponseContent } });
      return { error: 'Failed to parse AI response.' };
    }

    // --- IMPORTANT: Use the updated AdventureNodeSchema ---
    // This assumes AdventureNodeSchema in lib/domain/schemas.ts has been updated
    // with playerHealth, playerWounds, ogreHealth, ogreRoomId, isPlayerDead
    const validationResult = AdventureNodeSchema.safeParse(parsedAiContent);
    if (!validationResult.success) {
      console.error('[Adventure] Base schema validation failed:', validationResult.error.format());
      console.error('[Adventure] Failing AI Response Content (raw):', aiResponseContent);
      console.error('[Adventure] Failing AI Response Content (parsed):', parsedAiContent);
      Sentry.captureException(new Error('Adventure AI Response Validation Failed'), {
        extra: {
          validationErrors: validationResult.error.format(),
          aiResponseContent: parsedAiContent,
        },
      });
      return { error: 'AI response validation failed.' };
    }

    // Base validation passed. Now, treat the parsed content as our extended type.
    // We trust the prompt engineers the AI to include the extra fields.
    let finalNode = parsedAiContent as AdventureNodeWithCombatState;

    // Ensure default values for safety if AI somehow omits optional fields
    finalNode.playerHealth = finalNode.playerHealth ?? storyContext.playerHealth; // Default to previous health if missing
    finalNode.playerWounds = finalNode.playerWounds ?? storyContext.playerWounds;
    finalNode.ogreHealth = finalNode.ogreHealth ?? storyContext.ogreHealth;
    finalNode.ogreRoomId = finalNode.ogreRoomId ?? storyContext.ogreRoomId;
    finalNode.isPlayerDead = finalNode.isPlayerDead ?? finalNode.playerHealth <= 0;

    console.log(
      '[Adventure Action] Final Node before post-checks:',
      JSON.stringify(finalNode, null, 2)
    ); // Log node before corrections

    // --- Post-AI State Checks (using the correctly typed finalNode) ---

    // Double-check player death condition based on returned health
    if (finalNode.playerHealth <= 0 && !finalNode.isPlayerDead) {
      console.warn('[Adventure] AI returned health <= 0 but isPlayerDead=false. Correcting.');
      finalNode = {
        ...finalNode,
        isPlayerDead: true,
        passage: finalNode.passage + '\n\nDarkness takes you. You have died.', // Append death message
        choices: [], // No choices if dead
      };
    }

    // Check if Ogre was defeated
    if (finalNode.ogreHealth <= 0 && finalNode.ogreRoomId !== null) {
      console.log('[Adventure] Ogre defeated!');
      finalNode = {
        ...finalNode,
        ogreRoomId: null, // Mark ogre as inactive/defeated
        // Optionally add flavor text to passage:
        // passage: finalNode.passage + "\n\nThe ogre collapses, defeated.",
      };
    }

    // --- TODO: Implement Ogre Movement (Optional Enhancement) ---
    // If the ogre is alive (!finalNode.ogreRoomId) and not in the same room as the player
    // you could add logic here to potentially move the ogre to an adjacent room *after* the AI turn.
    // Example:
    // if (finalNode.ogreRoomId && finalNode.ogreRoomId !== finalNode.roomId && Math.random() < 0.3) { // 30% chance to move
    //    const currentOgreRoom = dungeonLayout[finalNode.ogreRoomId];
    //    const possibleMoves = Object.keys(currentOgreRoom.connections);
    //    if (possibleMoves.length > 0) {
    //       const nextOgreRoomId = possibleMoves[Math.floor(Math.random() * possibleMoves.length)] as RoomId;
    //       console.log(`[Adventure] Ogre moves from ${finalNode.ogreRoomId} to ${nextOgreRoomId}`);
    //       finalNode.ogreRoomId = nextOgreRoomId;
    //    }
    // }

    console.log(
      '[Adventure] Successfully generated node. Player Health:',
      finalNode.playerHealth,
      'Ogre Health:',
      finalNode.ogreHealth,
      'Ogre Room:',
      finalNode.ogreRoomId
    );
    console.log('[Adventure Action] Returning Final Node:', JSON.stringify(finalNode, null, 2)); // Log the final returned node
    return { adventureNode: finalNode };
  } catch (error) {
    console.error('[Adventure] Error generating adventure node:', error);
    // Sentry.captureException(error); // Already captured in callAIForAdventure or lower levels
    return { error: error instanceof Error ? error.message : 'An unexpected error occurred.' };
  }
};
