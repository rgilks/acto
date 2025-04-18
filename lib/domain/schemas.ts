import { z } from 'zod';

export const AdventureChoiceSchema = z.object({
  text: z.string().describe('The text of the choice presented to the user'),
  targetRoomId: z.string().optional().describe('The ID of the room this choice leads to, if any'),
});

export const AdventureNodeSchema = z.object({
  roomId: z.string().describe('The ID of the current room'),
  imagePlaceholder: z.string().describe("Filename for the room's placeholder image"),
  passage: z.string().describe('The current passage of the story'),
  choices: z
    .array(AdventureChoiceSchema)
    .min(1)
    .max(5)
    .describe('The choices available to the user for the next step'),
});

export type AdventureNode = z.infer<typeof AdventureNodeSchema>;
