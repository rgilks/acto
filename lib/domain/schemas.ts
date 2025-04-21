import { z } from 'zod';

// Add simplified Choice Schema back
export const StoryChoiceSchema = z.object({
  text: z.string().describe('The text of the choice presented to the user'),
  genre: z.string().optional().describe('Suggested genre (e.g., fantasy, sci-fi, mystery)'),
  tone: z.string().optional().describe('Suggested tone (e.g., dark, humorous, adventurous)'),
  visualStyle: z
    .string()
    .optional()
    .describe('Suggested visual style (e.g., oil painting, cartoon, photorealistic)'),
  voice: z.string().optional().describe('The TTS voice to use for this story.'),
  updatedSummary: z.string().optional(),
});

// Represents a single node (passage, choices, image, audio) in the story
export const StorySceneSchema = z.object({
  passage: z.string().describe('The current passage of the story'),
  choices: z
    .array(StoryChoiceSchema)
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
    .describe(
      'An optional updated summary of the story so far, reflecting the events of this node.'
    ),
  imageUrl: z.string().url().optional().describe('URL of the generated image, if any.'),
  audioBase64: z.string().optional().describe('Base64 encoded audio data for the passage text.'),
  generationPrompt: z
    .string()
    .optional()
    .describe('The exact prompt used to generate this node content.'),
});

export type StoryScene = z.infer<typeof StorySceneSchema>;

export const StoryChoice = z.object({
  text: z.string().describe('The text of the choice presented to the user'),
  voice: z.string().optional().describe('The TTS voice to use for this story.'),
});

export type StoryChoice = z.infer<typeof StoryChoice>;

// Represents the state of the entire story
