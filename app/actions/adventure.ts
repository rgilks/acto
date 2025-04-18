'use server';

import { z } from 'zod';
import { getActiveModel, getGoogleAIClient, openai, ModelConfig } from '@/lib/modelConfig';
import {
  AdventureNodeSchema,
  AdventureChoiceSchema,
  type AdventureNode,
} from '@/lib/domain/schemas';
import * as Sentry from '@sentry/nextjs';
import { GoogleGenAI } from '@google/genai';
import { type StoryHistoryItem } from '@/store/adventureStore';

const StoryHistoryItemSchema = z.object({
  passage: z.string(),
  choiceText: z.string().optional(),
});

type StoryContext = {
  history: StoryHistoryItem[];
};

const GenerateAdventureNodeParamsSchema = z.object({
  storyContext: z.object({
    history: z.array(StoryHistoryItemSchema),
  }),
});

type GenerateAdventureNodeParams = z.infer<typeof GenerateAdventureNodeParamsSchema>;

type GenerateAdventureNodeResult = {
  adventureNode?: AdventureNode;
  error?: string;
};

function buildAdventurePrompt(context: StoryContext | undefined): string {
  const history = context?.history ?? [];

  const jsonStructure = `{
  "passage": "(string) Write the next part of the adventure, describing the outcome of the player's last choice (if any) and the current situation. Be creative and engaging.",
  "choices": [ /* Array of { "text": string } objects. Provide 3-4 relevant choices for the player based on the passage. */ ],
  "imagePrompt": "(string) Generate a concise, descriptive prompt for an image generation model based *only* on the visual elements described in the \"passage\". Focus on key nouns, actions, and atmosphere. E.g., \"Dimly lit spaceship corridor\", \"Overgrown jungle temple entrance\". Keep it under 50 words."
}`;

  let historySummary = 'Story so far:\n';
  if (history.length === 0) {
    historySummary += 'The adventure begins...';
  } else {
    history.forEach((item, index) => {
      historySummary += `Step ${index + 1} Passage: ${item.passage}\n`;
      if (item.choiceText) {
        historySummary += `Step ${index + 1} Choice: ${item.choiceText}\n`;
      }
    });
  }

  const basePrompt = `You are a creative storyteller for an interactive text adventure game. Continue the story based on the history provided. Respond ONLY with a valid JSON object matching this structure:
${jsonStructure}
Ensure the entire output is a single, valid JSON object string without any surrounding text or markdown formatting.`;

  return `
${basePrompt}

${historySummary}

Generate the next step:
- Read the "Story so far".
- If a "Choice" was made in the last step, write a "passage" describing the outcome.
- If it's the beginning, write an engaging starting "passage".
- Provide 3-4 relevant "choices" (as { "text": string } objects) for the player to make next.
- Create a concise "imagePrompt" based *only* on the visual elements of the generated "passage".
`;
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
  const finalImagePrompt = `Digital painting, detailed, atmospheric illustration. ${imagePrompt}`;
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

    const storyContext = validation.data.storyContext;

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
      console.error('[Adventure] Schema validation failed:', validationResult.error.format());
      console.error('[Adventure] Failing AI Response Content (raw):', aiResponseContent);
      console.error('[Adventure] Failing AI Response Content (parsed): ', parsedAiContent);
      Sentry.captureException(new Error('Adventure AI Response Validation Failed'), {
        extra: {
          validationErrors: validationResult.error.format(),
          aiResponseContent: parsedAiContent,
        },
      });
      return { error: 'AI response validation failed.' };
    }

    const validatedNode = validationResult.data;

    const imagePrompt = validatedNode.imagePrompt;

    const finalNode: AdventureNode = {
      passage: validatedNode.passage,
      choices: validatedNode.choices,
      imageUrl: validatedNode.imageUrl,
    };

    if (imagePrompt) {
      try {
        console.log('Attempting image generation with prompt:', imagePrompt);
        const imageUrl = await generateImageWithGemini(imagePrompt);
        if (imageUrl) {
          finalNode.imageUrl = imageUrl;
        } else {
          console.warn('[Adventure Action] Image generation failed or returned no URL.');
        }
      } catch (imageError) {
        console.error('[Adventure Action] Image generation encountered an error:', imageError);
        Sentry.captureException(imageError);
        finalNode.imageUrl = undefined;
      }
    } else {
      console.warn(
        '[Adventure Action] Skipping image generation because no imagePrompt was provided by the AI.'
      );
    }

    console.log('[Adventure] Successfully generated node.');
    return { adventureNode: finalNode };
  } catch (error) {
    console.error('[Adventure] Error generating adventure node:', error);
    Sentry.captureException(error);
    return { error: error instanceof Error ? error.message : 'An unexpected error occurred.' };
  }
};

// --- New action for generating starting scenarios ---

// Schema for the result of the starting scenarios action
const StartingScenariosSchema = z.array(AdventureChoiceSchema).min(3).max(5);

// Define the result type for the new action
type GenerateStartingScenariosResult = {
  scenarios?: z.infer<typeof StartingScenariosSchema>;
  error?: string;
};

export const generateStartingScenariosAction =
  async (): Promise<GenerateStartingScenariosResult> => {
    console.log('[Adventure Scenarios] Generating starting scenarios...');
    try {
      // Define the specific JSON structure for starting scenarios
      const jsonStructure = `[
  { "text": "(string) A brief (1-2 sentence) description of a starting scenario for an adventure (any genre)." },
  { "text": "(string) Another different starting scenario description." },
  { "text": "(string) A third distinct starting scenario description." },
  { "text": "(string) Optionally, a fourth scenario description." }
]`;

      // Prompt asking for diverse starting scenarios
      const prompt = `You are an AI assistant creating starting points for an interactive text adventure game. Generate 3 to 4 diverse and intriguing starting scenarios across *different genres and settings* (e.g., sci-fi, fantasy, mystery, historical, modern-day).
    Respond ONLY with a valid JSON array matching this structure, filling in the details:
${jsonStructure}
Ensure the entire output is a single, valid JSON array string containing 3 or 4 objects, without any surrounding text or markdown formatting. Examples: "You awake on a sterile medical table aboard an alien spaceship.", "You stand at the entrance to a dark forest, clutching a weathered map.", "A coded message arrives, hinting at a conspiracy in 1920s Paris."
`;

      const activeModel = getActiveModel();
      // Use the existing callAIForAdventure function
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
          '[Adventure Scenarios] Failed to parse AI response JSON:',
          parseError,
          '\nRaw Response:\n',
          aiResponseContent
        );
        Sentry.captureException(parseError, { extra: { aiResponseContent } });
        return { error: 'Failed to parse AI starting scenarios response.' };
      }

      // Validate the response against the schema
      const validationResult = StartingScenariosSchema.safeParse(parsedAiContent);
      if (!validationResult.success) {
        console.error(
          '[Adventure Scenarios] Schema validation failed:',
          validationResult.error.format()
        );
        console.error(
          '[Adventure Scenarios] Failing AI Response Content (parsed): ',
          parsedAiContent
        );
        Sentry.captureException(new Error('Starting Scenarios AI Response Validation Failed'), {
          extra: {
            validationErrors: validationResult.error.format(),
            aiResponseContent: parsedAiContent,
          },
        });
        return { error: 'Starting scenarios AI response validation failed.' };
      }

      console.log('[Adventure Scenarios] Successfully generated starting scenarios.');
      return { scenarios: validationResult.data };
    } catch (error) {
      console.error('[Adventure Scenarios] Error generating starting scenarios:', error);
      Sentry.captureException(error);
      return {
        error:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred while generating scenarios.',
      };
    }
  };
