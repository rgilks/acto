import { z } from 'zod';

// Add simplified Choice Schema back
export const AdventureChoiceSchema = z.object({
  text: z.string().describe('The text of the choice presented to the user'),
  genre: z.string().optional().describe('Suggested genre (e.g., fantasy, sci-fi, mystery)'),
  tone: z.string().optional().describe('Suggested tone (e.g., dark, humorous, adventurous)'),
  visualStyle: z
    .string()
    .optional()
    .describe('Suggested visual style (e.g., oil painting, cartoon, photorealistic)'),
  voice: z.string().optional().describe('The TTS voice to use for this adventure.'),
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
  updatedSummary: z
    .string()
    .optional()
    .describe('A brief summary of the entire story up to and including this passage.'),
  imageUrl: z.string().url().optional().describe('URL of the AI-generated image for this node'),
  audioUrl: z.string().url().optional().describe('URL of the AI-generated audio for this node'),
  audioBase64: z.string().optional().describe('Base64 encoded MP3 audio data for the passage'),
  generationPrompt: z
    .string()
    .optional()
    .describe('The exact text prompt sent to the LLM to generate this node.'),
});

export type AdventureNode = z.infer<typeof AdventureNodeSchema>;
