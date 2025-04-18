import { z } from 'zod';

// Add simplified Choice Schema back
export const AdventureChoiceSchema = z.object({
  text: z.string().describe('The text of the choice presented to the user'),
});

export const AdventureNodeSchema = z.object({
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
  imageUrl: z.string().url().optional().describe('URL of the AI-generated image for this node'),
  audioBase64: z.string().optional().describe('Base64 encoded MP3 audio data for the passage'),
});

export type AdventureNode = z.infer<typeof AdventureNodeSchema>;
