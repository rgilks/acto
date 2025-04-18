import { z } from 'zod';

export const AdventureChoiceSchema = z.object({
  text: z.string().describe('The text of the choice presented to the user'),
  targetRoomId: z.string().optional().describe('The ID of the room this choice leads to, if any'),
});

export const AdventureNodeSchema = z.object({
  roomId: z.string().describe('The ID of the current room'),
  passage: z.string().describe('The current passage of the story'),
  choices: z
    .array(AdventureChoiceSchema)
    .min(1)
    .max(5)
    .describe('The choices available to the user for the next step'),
  imagePrompt: z
    .string()
    .optional()
    .describe('AI-generated prompt for image generation based on the passage'),
  imageUrl: z.string().optional().describe('URL of the AI-generated image for this node'),
  playerHealth: z.number().describe('Current player health points'),
  playerWounds: z.array(z.string()).describe('List of active wounds or negative effects'),
  ogreHealth: z.number().describe('Current ogre health points'),
  ogreRoomId: z
    .string()
    .nullable()
    .describe('The ID of the room the ogre is currently in, or null if inactive/defeated'),
  isPlayerDead: z.boolean().default(false).describe('Whether the player is currently dead'),
});

export type AdventureNode = z.infer<typeof AdventureNodeSchema>;
