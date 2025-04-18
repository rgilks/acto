'use server';

import { z } from 'zod';
import { getActiveModel, getGoogleAIClient, openai, ModelConfig } from '@/lib/modelConfig';
import { AdventureNodeSchema, type AdventureNode } from '@/lib/domain/schemas';
import * as Sentry from '@sentry/nextjs';
import { GoogleGenAI } from '@google/genai';
import { type StoryHistoryItem } from '@/store/adventureStore';

export type RoomId = 'room1' | 'room2' | 'room3' | 'room4' | 'room5';

interface DungeonRoom {
  id: RoomId;
  name: string;
  description: string;
  connections: Partial<Record<RoomId, string>>;
}

const dungeonLayout: Record<RoomId, DungeonRoom> = {
  room1: {
    id: 'room1',
    name: 'Entrance Chamber',
    description:
      'Dust hangs thick in the air, illuminated by faint light filtering from cracks in the ceiling far above. Cobwebs drape broken stonework like macabre decorations. Directly ahead, the passage continues into darkness, while a heavy, warped wooden door stands slightly ajar to your right. The faint scent of mildew and decay fills the chamber.',
    connections: { room2: 'Straight Ahead', room3: 'Door to Right' },
  },
  room2: {
    id: 'room2',
    name: 'Damp Corridor',
    description:
      'You are in a narrow corridor. Water drips steadily from the ceiling, pooling on the uneven flagstones below. Empty torch sconces line the walls, their iron rusted. The passage stretches forward, leading to a chamber partially submerged in murky water. Behind you is the way back to the entrance chamber.',
    connections: { room1: 'Back to Entrance', room4: 'Forward to Water' },
  },
  room3: {
    id: 'room3',
    name: 'Ruined Guard Room',
    description:
      'This chamber was once a guard room, now fallen into disrepair. An overturned table lies amidst scattered debris. A rusted weapon rack stands against one wall, empty save for a single broken spear shaft. Another heavy wooden door, scarred and splintered, sits opposite the one you entered. The air is stale.',
    connections: { room1: 'Opposite Door', room5: 'Scarred Door' },
  },
  room4: {
    id: 'room4',
    name: 'Flooded Chamber',
    description:
      'Murky, stagnant water fills this chamber to about knee height, obscuring the floor below. Crumbling stepping stones offer a precarious path across the water towards an archway on the far side. The corridor you came from is behind you. The water ripples slightly, disturbed by unseen currents.',
    connections: { room2: 'Back to Corridor', room5: 'Across Water' },
  },
  room5: {
    id: 'room5',
    name: 'Treasure Room',
    description:
      'This small chamber glitters faintly. A stone pedestal stands in the center, though it is currently empty. Scattered copper coins and a few tarnished silver pieces lie amongst the dust on the floor. Two exits lead out: an archway filled with murky water, and a heavy, scarred wooden door.',
    connections: { room3: 'Scarred Door', room4: 'Archway Back' },
  },
};

const INITIAL_PLAYER_HEALTH = 10;
const INITIAL_OGRE_HEALTH = 20;
const OGRE_START_ROOM_ID: RoomId = 'room5';

const StoryHistoryItemSchema = z.object({
  passage: z.string(),
  choiceText: z.string().optional(),
  playerHealth: z.number().optional(),
  ogreHealth: z.number().optional(),
  ogreRoomId: z
    .union([
      z.custom<RoomId>((val) => Object.keys(dungeonLayout).includes(val as string)),
      z.null(),
    ])
    .optional(),
});

type StoryContext = {
  history: StoryHistoryItem[];
  currentRoomId: RoomId;
  playerHealth: number;
  playerWounds: string[];
  ogreHealth: number;
  ogreRoomId: RoomId | null;
  isPlayerDead: boolean;
};

type AdventureNodeWithCombatState = AdventureNode & {
  imageUrl?: string;
  playerHealth: number;
  playerWounds: string[];
  ogreHealth: number;
  ogreRoomId: RoomId | null;
  isPlayerDead?: boolean;
};

const GenerateAdventureNodeParamsSchema = z.object({
  storyContext: z
    .object({
      history: z.array(StoryHistoryItemSchema),
      currentRoomId: z.custom<RoomId>((val) => Object.keys(dungeonLayout).includes(val as string)),
      playerHealth: z.number(),
      playerWounds: z.array(z.string()),
      ogreHealth: z.number(),
      ogreRoomId: z.union([
        z.custom<RoomId>((val) => Object.keys(dungeonLayout).includes(val as string)),
        z.null(),
      ]),
      isPlayerDead: z.boolean(),
    })
    .optional(),
});

type GenerateAdventureNodeParams = z.infer<typeof GenerateAdventureNodeParamsSchema>;

type GenerateAdventureNodeResult = {
  adventureNode?: AdventureNodeWithCombatState;
  error?: string;
};

function buildAdventurePrompt(context: StoryContext | undefined): string {
  const isInitialCall = !context;
  const currentRoomId = context?.currentRoomId ?? 'room1';
  const playerHealth = context?.playerHealth ?? INITIAL_PLAYER_HEALTH;
  const playerWounds = context?.playerWounds ?? [];
  const ogreHealth = context?.ogreHealth ?? INITIAL_OGRE_HEALTH;
  const ogreRoomId = context?.ogreRoomId ?? OGRE_START_ROOM_ID;
  const isPlayerDead = context?.isPlayerDead ?? false;

  if (isPlayerDead) {
    return `{
        "roomId": "${currentRoomId}",
        "imageUrl": "/images/game-over.png",
        "passage": "Darkness claims you. Your adventure ends here.",
        "choices": [],
        "playerHealth": 0,
        "playerWounds": ${JSON.stringify(playerWounds)},
        "ogreHealth": ${ogreHealth},
        "ogreRoomId": ${ogreRoomId ? `"${ogreRoomId}"` : 'null'},
        "isPlayerDead": true
      }`;
  }

  const room = dungeonLayout[currentRoomId];
  const isOgrePresent = ogreRoomId === currentRoomId && ogreHealth > 0;
  const lastStep = context?.history?.[context.history.length - 1];

  const jsonStructure = `{
  "roomId": "${room.id}",
  "imageUrl": "${isOgrePresent ? '/images/ogre-encounter.png' : ''}",
  "passage": "(string) Describe outcome of previous choice (if any) and current situation. ${isOgrePresent ? 'Focus on the ogre encounter!' : `Incorporate elements from room: ${room.description}`}",
  "choices": [ /* strings or objects like { text: string, targetRoomId?: string, actionType?: 'combat'|'examine'|'move' } */ ],
  "imagePrompt": "(string) Generate a concise, descriptive prompt for an image generation model (like Imagen) based *only* on the visual elements described in the 'passage'. Focus on key nouns, actions, and atmosphere. E.g., 'Ogre swinging a club in a dark, damp corridor'. Keep it under 50 words.",
  "playerHealth": ${playerHealth},
  "playerWounds": ${JSON.stringify(playerWounds)},
  "ogreHealth": ${ogreHealth},
  "ogreRoomId": ${ogreRoomId ? `"${ogreRoomId}"` : 'null'},
  "isPlayerDead": false
}`;

  const basePrompt = `You are a storyteller creating a 'choose your own adventure' game in a dungeon with a roaming ogre. Respond ONLY with a valid JSON object matching this structure, filling in the details:
${jsonStructure}
Ensure the entire output is a single, valid JSON object string without any surrounding text or markdown formatting. The player has ${playerHealth} HP. The ogre has ${ogreHealth} HP. Player wounds: ${playerWounds.length > 0 ? playerWounds.join(', ') : 'none'}.`;

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

  if (isInitialCall) {
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

async function callAIForAdventure(prompt: string, modelConfig: ModelConfig): Promise<string> {
  console.log('[Adventure] Calling AI...');

  if (modelConfig.provider === 'openai' && openai) {
    try {
      const completion = await openai.chat.completions.create({
        model: modelConfig.name,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        max_tokens: modelConfig.maxTokens,
      });
      const result = completion?.choices?.[0]?.message?.content;
      if (!result) throw new Error('No content received from OpenAI');
      console.log('[Adventure] Received response from OpenAI.');
      return result;
    } catch (error) {
      console.error('[Adventure] OpenAI API error:', error);
      Sentry.captureException(error);
      throw error;
    }
  } else if (modelConfig.provider === 'google') {
    try {
      const genAI: GoogleGenAI = getGoogleAIClient();
      const result = await genAI.models.generateContent({
        model: modelConfig.name,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      });
      const text = result.text;

      if (!text) {
        console.error(
          '[Adventure] Failed to extract text from Google AI response:',
          JSON.stringify(result, null, 2)
        );
        throw new Error('No content received from Google AI or failed to extract text.');
      }

      console.log('[Adventure] Received response from Google AI.');
      return text;
    } catch (error) {
      console.error('[Adventure] Google AI error:', error);
      Sentry.captureException(error);
      throw error;
    }
  } else {
    throw new Error(`Unsupported model provider or client not available: ${modelConfig.provider}`);
  }
}

async function generateImageWithGemini(imagePrompt: string): Promise<string | undefined> {
  const finalImagePrompt = `Fantasy tabletop RPG illustration, digital painting, detailed, atmospheric. ${imagePrompt}`;
  console.log('[Adventure Image] Sending final prompt to Imagen API:', finalImagePrompt);

  try {
    const genAI: GoogleGenAI = getGoogleAIClient();
    if (!genAI) {
      console.error('[Adventure Image] Google AI Client (@google/genai) failed to initialize.');
      throw new Error('Google AI Client (@google/genai) is not configured properly.');
    }

    const modelName = 'imagen-3.0-generate-002';
    const result = await genAI.models.generateImages({
      model: modelName,
      prompt: finalImagePrompt,
      config: {
        numberOfImages: 1,
      },
    });

    if (!result.generatedImages || result.generatedImages.length === 0) {
      console.error(
        '[Adventure Image] No images generated or invalid response structure:',
        JSON.stringify(result, null, 2)
      );
      throw new Error('No images found in the response from generateImages.');
    }

    const image = result.generatedImages[0];

    if (image.image?.imageBytes) {
      const base64Data = image.image.imageBytes;
      const mimeType = 'image/png';
      const dataUri = `data:${mimeType};base64,${base64Data}`;
      console.log('[Adventure Image] Generated Image as Data URI via @google/genai SDK.');
      return dataUri;
    } else {
      console.error(
        '[Adventure Image] No imageBytes found in the generated image response part:',
        JSON.stringify(image, null, 2)
      );
      throw new Error('No imageBytes found in the generateImages response.');
    }
  } catch (error) {
    console.error('[Adventure Image] Failed to generate image via @google/genai SDK:', error);
    Sentry.captureException(error, { extra: { imagePrompt: imagePrompt } });
    return undefined;
  }
}

export const generateAdventureNodeAction = async (
  params: GenerateAdventureNodeParams
): Promise<GenerateAdventureNodeResult> => {
  try {
    const validation = GenerateAdventureNodeParamsSchema.safeParse(params);
    if (!validation.success) {
      console.error('[Adventure] Invalid parameters:', validation.error.format());
      const errorMsg = validation.error.errors[0]?.message ?? 'Invalid parameters.';
      return { error: `Invalid input: ${errorMsg}` };
    }

    const storyContext = validation.data.storyContext ?? {
      history: [],
      currentRoomId: 'room1',
      playerHealth: INITIAL_PLAYER_HEALTH,
      playerWounds: [],
      ogreHealth: INITIAL_OGRE_HEALTH,
      ogreRoomId: OGRE_START_ROOM_ID,
      isPlayerDead: false,
    };

    if (storyContext.isPlayerDead) {
      console.log('[Adventure] Player already dead.');
      return {
        adventureNode: {
          roomId: storyContext.currentRoomId,
          imageUrl: '/images/game-over.png',
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
    const activeModel = getActiveModel();
    const aiResponseContent = await callAIForAdventure(prompt, activeModel);

    let parsedAiContent: unknown;
    try {
      const cleanedResponse = aiResponseContent
        .replace(/^```json\s*/, '')
        .replace(/```\s*$/, '')
        .trim();

      parsedAiContent = JSON.parse(cleanedResponse);
    } catch (parseError) {
      console.error(
        '[Adventure] Failed to parse AI response JSON:',
        parseError,
        '\nRaw Response:\n',
        aiResponseContent
      );
      Sentry.captureException(parseError, { extra: { aiResponseContent } });
      return { error: 'Failed to parse AI response.' };
    }

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

    const finalNode = parsedAiContent as AdventureNodeWithCombatState;

    interface AdventureNodeWithCombatAndImagePrompt extends AdventureNodeWithCombatState {
      imagePrompt?: string;
    }
    let finalNodeWithPrompt = finalNode as AdventureNodeWithCombatAndImagePrompt;

    finalNodeWithPrompt.playerHealth =
      finalNodeWithPrompt.playerHealth ?? storyContext.playerHealth;
    finalNodeWithPrompt.playerWounds =
      finalNodeWithPrompt.playerWounds ?? storyContext.playerWounds;
    finalNodeWithPrompt.ogreHealth = finalNodeWithPrompt.ogreHealth ?? storyContext.ogreHealth;
    finalNodeWithPrompt.ogreRoomId = finalNodeWithPrompt.ogreRoomId ?? storyContext.ogreRoomId;
    finalNodeWithPrompt.isPlayerDead =
      finalNodeWithPrompt.isPlayerDead ?? finalNodeWithPrompt.playerHealth <= 0;

    if (!finalNodeWithPrompt.isPlayerDead && finalNodeWithPrompt.imagePrompt) {
      try {
        console.log('Attempting image generation with prompt:', finalNodeWithPrompt.imagePrompt);
        const imageUrl = await generateImageWithGemini(finalNodeWithPrompt.imagePrompt);
        if (imageUrl) {
          finalNodeWithPrompt.imageUrl = imageUrl;
        } else {
          console.warn('[Adventure Action] Image generation failed or returned no URL.');
        }
      } catch (imageError) {
        console.error('[Adventure Action] Image generation encountered an error:', imageError);
        Sentry.captureException(imageError);
        finalNodeWithPrompt.imageUrl = undefined;
      }
    } else if (!finalNodeWithPrompt.isPlayerDead && !finalNodeWithPrompt.imagePrompt) {
      console.warn(
        '[Adventure Action] Skipping image generation because no imagePrompt was provided by the AI.'
      );
    } else {
      console.log('[Adventure Action] Skipping image generation because player is dead.');
    }

    if (finalNodeWithPrompt.playerHealth <= 0 && !finalNodeWithPrompt.isPlayerDead) {
      console.warn('[Adventure] AI returned health <= 0 but isPlayerDead=false. Correcting.');
      finalNodeWithPrompt = {
        ...finalNodeWithPrompt,
        isPlayerDead: true,
        passage: finalNodeWithPrompt.passage + '\\n\\nDarkness takes you. You have died.',
        choices: [],
        imageUrl: '/images/game-over.png',
      };
    }

    if (finalNodeWithPrompt.ogreHealth <= 0 && finalNodeWithPrompt.ogreRoomId !== null) {
      console.log('[Adventure] Ogre defeated!');
      finalNodeWithPrompt = {
        ...finalNodeWithPrompt,
        ogreRoomId: null,
      };
    }

    console.log(
      '[Adventure] Successfully generated node. Player Health:',
      finalNodeWithPrompt.playerHealth,
      'Ogre Health:',
      finalNodeWithPrompt.ogreHealth,
      'Ogre Room:',
      finalNodeWithPrompt.ogreRoomId
    );
    return { adventureNode: finalNodeWithPrompt };
  } catch (error) {
    console.error('[Adventure] Error generating adventure node:', error);
    return { error: error instanceof Error ? error.message : 'An unexpected error occurred.' };
  }
};
