'use server';

import { z } from 'zod';
import { getActiveModel, getGoogleAIClient, ModelConfig } from '@/lib/modelConfig';
import {
  AdventureNodeSchema,
  AdventureChoiceSchema,
  type AdventureNode,
} from '@/lib/domain/schemas';
import * as Sentry from '@sentry/nextjs';
import { GoogleGenAI } from '@google/genai';
import { type StoryHistoryItem } from '@/store/adventureStore';
import { synthesizeSpeechAction, type SynthesizeSpeechResult } from './tts';
import { TTS_VOICE_NAME } from '@/lib/constants';
import { getSession } from '@/app/auth';
import { checkTextRateLimit, checkImageRateLimit } from '@/lib/rateLimitSqlite';

const StoryHistoryItemSchema = z.object({
  passage: z.string(),
  choiceText: z.string().optional(),
  summary: z.string().optional(),
});

type StoryContext = {
  history: StoryHistoryItem[];
};

const GenerateAdventureNodeParamsSchema = z.object({
  storyContext: z.object({
    history: z.array(StoryHistoryItemSchema),
  }),
  initialScenarioText: z.string().optional(),
  genre: z.string().optional(),
  tone: z.string().optional(),
  visualStyle: z.string().optional(),
});

type GenerateAdventureNodeParams = z.infer<typeof GenerateAdventureNodeParamsSchema>;

type GenerateAdventureNodeResult = {
  adventureNode?: AdventureNode;
  error?: string;
  rateLimitError?: {
    message: string;
    resetTimestamp: number;
    apiType: 'text' | 'image' | 'tts';
  };
};

function buildAdventurePrompt(
  context: StoryContext | undefined,
  initialScenarioText?: string | null,
  genre?: string | null,
  tone?: string | null,
  visualStyle?: string | null
): string {
  const history = context?.history ?? [];
  const maxHistoryItems = 3; // Number of recent steps to include text for

  // Get the summary from the *very last* history item
  const latestSummary = history.length > 0 ? history[history.length - 1]?.summary : null;

  // Determine the initial context: use provided text if history is empty, else use first passage
  const initialContextText =
    history.length === 0 && initialScenarioText
      ? initialScenarioText
      : history.length > 0
        ? history[0]?.passage
        : null;

  const jsonStructure = `{\n  \"passage\": \"(string) Next part of the adventure, describing outcome of last choice and current situation.\",\n  \"choices\": [ /* Array of 3-4 { \"text\": string } objects for player choices. */ ],\n  \"imagePrompt\": \"(string) Concise visual prompt (max 50 words) based ONLY on the \\\"passage\\\" but strongly reflecting the specified Adventure Style (Genre: ${genre ?? 'any'}, Tone: ${tone ?? 'any'}, Visual Style: ${visualStyle ?? 'any'}). E.g., for sci-fi/mysterious/digital painting: \\\"Dim alien spaceship corridor, digital painting\\\"\",\n  \"updatedSummary\": \"(string) A brief (1-2 sentence) summary encompassing the entire story so far, updated with the events of this new \'passage\'.\"\n}`;

  // Build the initial scenario context section
  const initialContextSection = initialContextText
    ? `Initial Scenario Context:\\n${initialContextText}`
    : 'No initial scenario provided.';

  // Build the Adventure Style section
  let adventureStyleSection = 'Adventure Style:\\n';
  let styleDefined = false;
  if (genre) {
    adventureStyleSection += `Genre: ${genre}\\n`;
    styleDefined = true;
  }
  if (tone) {
    adventureStyleSection += `Tone: ${tone}\\n`;
    styleDefined = true;
  }
  if (visualStyle) {
    adventureStyleSection += `Visual Style (for image prompts): ${visualStyle}\\n`;
    styleDefined = true;
  }
  if (!styleDefined) {
    adventureStyleSection += '(Not specified)\\n';
  }

  // Build the recent history text section
  let recentHistoryText = 'Most Recent Steps:\\n';
  if (history.length === 0) {
    // If history is empty, the initial context is handled above. No recent steps yet.
    recentHistoryText += '(No steps taken yet. Refer to Initial Scenario Context.)\\n';
  } else {
    // Exclude the initial passage if it's the only one for recent steps display
    const recentHistory = history.length <= 1 ? [] : history.slice(-maxHistoryItems);
    if (recentHistory.length > 0) {
      recentHistory.forEach((item, index) => {
        // Adjust step numbering if the initial passage is part of the 'recent' slice
        const isInitialPassageIncludedInRecent =
          history.length <= maxHistoryItems && history.length > 1;
        const stepNum = isInitialPassageIncludedInRecent
          ? index + 1 // Starts from 1 if initial is included
          : history.length - recentHistory.length + index + 1; // Regular calculation

        // Don't repeat the initial passage text here if it was already shown
        if (index === 0 && isInitialPassageIncludedInRecent && stepNum === 1) {
          // If the first item in recent history is the actual first step (history[0])
          // And we've already displayed it as initial context, just show the choice
          recentHistoryText += `Step 1 Choice: ${item.choiceText ?? '(Choice made)'}\\n`;
        } else {
          // Add passage/choice for subsequent steps
          recentHistoryText += `Step ${stepNum} Passage: ${item.passage}\\n`;
          if (item.choiceText) {
            recentHistoryText += `Step ${stepNum} Choice: ${item.choiceText}\\n`;
          } else {
            // Indicate a choice was made leading to this passage, even if text isn't stored/needed here
            recentHistoryText += `Step ${stepNum} (Result of previous choice)\\n`;
          }
        }
      });
      if (history.length > maxHistoryItems) {
        recentHistoryText = `(Older steps summarized below)\\n` + recentHistoryText;
      }
    } else if (history.length === 1 && history[0].choiceText) {
      // Handle the case where only the initial passage and its choice exist
      // The initial passage itself is covered by initialContextSection
      recentHistoryText += `Step 1 Choice: ${history[0].choiceText}\\n`;
    } else if (history.length === 1) {
      // Only the first passage exists, no choice made *after* it yet.
      recentHistoryText += '(First passage generated. Awaiting first choice.)\\n';
    } else {
      // Should not happen if history.length > 0
      recentHistoryText += '(Processing history...)\\n';
    }
  }

  const storySummarySection = latestSummary
    ? `Summary of story before recent steps:\\n${latestSummary}`
    : 'No summary yet.';

  // Updated base prompt reinforcing image prompt requirements
  const basePrompt = `You are a storyteller for an interactive text adventure. Adhere strictly to the specified Adventure Style (Genre, Tone, Visual Style). Maintain the tone and details from the Initial Scenario Context. Continue the story based on the provided Summary and Most Recent Steps. Respond ONLY with a valid JSON object matching this structure:
${jsonStructure}
Output only the JSON object. Provide an \'updatedSummary\' reflecting the entire story including the new \'passage\'. **Crucially, ensure the 'imagePrompt' is based on the current passage and strongly reflects the required Genre, Tone, and Visual Style.**`;

  // Assemble the final prompt
  return `${basePrompt}
\n${adventureStyleSection}
\n${initialContextSection}
\n${storySummarySection}
\n${recentHistoryText}
\nGenerate the next JSON step, adhering to the Adventure Style, Initial Context, Summary, and Recent Steps. Ensure \'updatedSummary\' is included and 'imagePrompt' strongly matches the Genre, Tone, and Visual Style.`;
}

async function callAIForAdventure(prompt: string, modelConfig: ModelConfig): Promise<string> {
  console.log('[Adventure] Calling AI...');

  // Rate limit check is handled before calling this function

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
}

async function generateImageWithGemini(
  imagePrompt: string
): Promise<
  | { dataUri: string; error: undefined }
  | { dataUri: undefined; error: string; rateLimitResetTimestamp?: number }
> {
  const imageLimitCheck = await checkImageRateLimit();
  if (!imageLimitCheck.success) {
    console.warn(
      `[Adventure Image] Rate limit exceeded for user. Error: ${imageLimitCheck.errorMessage}`
    );
    return {
      dataUri: undefined,
      error: imageLimitCheck.errorMessage ?? 'Image generation rate limit exceeded.',
      rateLimitResetTimestamp: imageLimitCheck.reset,
    };
  }

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
      return { dataUri: dataUri, error: undefined };
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
    return {
      dataUri: undefined,
      error: error instanceof Error ? error.message : 'Failed to generate image.',
    };
  }
}

export const generateAdventureNodeAction = async (
  params: GenerateAdventureNodeParams
): Promise<GenerateAdventureNodeResult> => {
  const session = await getSession();
  if (!session?.user) {
    console.warn('[Adventure Action] Unauthorized attempt.');
    return { error: 'Unauthorized: User must be logged in.' };
  }

  const textLimitCheck = await checkTextRateLimit();
  if (!textLimitCheck.success) {
    console.warn(
      `[Adventure Action] Text rate limit exceeded for user. Error: ${textLimitCheck.errorMessage}`
    );
    return {
      rateLimitError: {
        message: textLimitCheck.errorMessage ?? 'Text generation rate limit exceeded.',
        resetTimestamp: textLimitCheck.reset,
        apiType: 'text',
      },
    };
  }

  try {
    const validation = GenerateAdventureNodeParamsSchema.safeParse(params);
    if (!validation.success) {
      console.error('[Adventure] Invalid parameters:', validation.error.format());
      return {
        error: `Invalid input: ${validation.error.errors[0]?.message ?? 'Invalid parameters.'}`,
      };
    }

    const { storyContext, initialScenarioText, genre, tone, visualStyle } = validation.data;
    const prompt = buildAdventurePrompt(
      storyContext,
      initialScenarioText,
      genre,
      tone,
      visualStyle
    );
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
    const passage = validatedNode.passage;
    const updatedSummary = validatedNode.updatedSummary;

    // --- Generate Image and TTS in Parallel ---
    let imageUrl: string | undefined = undefined;
    let audioBase64: string | undefined = undefined;
    let imageError: string | undefined = undefined;
    let ttsError: string | undefined = undefined;

    const promisesToSettle = [];

    if (imagePrompt) {
      promisesToSettle.push(generateImageWithGemini(imagePrompt));
    } else {
      console.warn('[Adventure Action] Skipping image generation: no prompt.');
      promisesToSettle.push(Promise.resolve({ dataUri: undefined, error: undefined }));
    }

    if (passage) {
      promisesToSettle.push(synthesizeSpeechAction({ text: passage, voiceName: TTS_VOICE_NAME }));
    } else {
      console.warn('[Adventure Action] Skipping TTS generation: no passage.');
      promisesToSettle.push(Promise.resolve({ error: 'No passage text' }));
    }

    try {
      const results = (await Promise.allSettled(promisesToSettle)) as [
        PromiseSettledResult<
          | { dataUri: string; error: undefined }
          | { dataUri: undefined; error: string; rateLimitResetTimestamp?: number }
        >,
        PromiseSettledResult<SynthesizeSpeechResult>,
      ];

      const imageResult = results[0];
      const audioResultAction = results[1];

      // Process Image Result (Index 0)
      if (imageResult.status === 'fulfilled') {
        if (imageResult.value.dataUri) {
          imageUrl = imageResult.value.dataUri;
        } else if (imageResult.value.error) {
          imageError = imageResult.value.error;
          console.error('[Adventure Action] Image generation failed:', imageError);
          if (imageResult.value.rateLimitResetTimestamp) {
            imageError = imageResult.value.error;
          }
        }
      } else if (imageResult.status === 'rejected') {
        imageError =
          imageResult.reason instanceof Error
            ? imageResult.reason.message
            : 'Unknown image generation error';
        console.error('[Adventure Action] Image generation promise rejected:', imageResult.reason);
      }

      // Process Audio Result (Index 1)
      if (audioResultAction.status === 'fulfilled') {
        const audioData = audioResultAction.value;
        if (audioData.audioBase64) {
          audioBase64 = audioData.audioBase64;
        } else if (audioData.error) {
          ttsError = audioData.error;
          console.error('[Adventure Action] TTS synthesis failed:', ttsError);
          if (audioData.rateLimitError) {
            // ttsRateLimitHit = true; // Removed
          }
        }
      } else if (audioResultAction.status === 'rejected') {
        ttsError =
          audioResultAction.reason instanceof Error
            ? audioResultAction.reason.message
            : 'Unknown TTS error';
        console.error(
          '[Adventure Action] TTS synthesis promise rejected:',
          audioResultAction.reason
        );
        Sentry.captureException(audioResultAction.reason);
      }
    } catch (settleError) {
      console.error('[Adventure Action] Error settling promises:', settleError);
      Sentry.captureException(settleError);
    }
    // --- End Parallel Generation ---

    const finalNode: AdventureNode = {
      passage: validatedNode.passage,
      choices: validatedNode.choices,
      imageUrl: imageUrl ?? validatedNode.imageUrl,
      audioBase64: audioBase64,
      updatedSummary: updatedSummary,
    };

    console.log('[Adventure] Successfully generated node with summary and style context.');
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
  rateLimitError?: {
    message: string;
    resetTimestamp: number;
    apiType: 'text';
  };
};

export const generateStartingScenariosAction =
  async (): Promise<GenerateStartingScenariosResult> => {
    const session = await getSession();
    if (!session?.user) {
      console.warn('[Adventure Scenarios] Unauthorized attempt.');
      return { error: 'Unauthorized: User must be logged in.' };
    }

    const textLimitCheck = await checkTextRateLimit();
    if (!textLimitCheck.success) {
      console.warn(
        `[Adventure Scenarios] Text rate limit exceeded for user. Error: ${textLimitCheck.errorMessage}`
      );
      return {
        rateLimitError: {
          message: textLimitCheck.errorMessage ?? 'Starting scenario rate limit exceeded.',
          resetTimestamp: textLimitCheck.reset,
          apiType: 'text',
        },
      };
    }

    console.log('[Adventure Scenarios] Generating starting scenarios with metadata...');
    try {
      // Updated JSON structure definition to include new fields
      const jsonStructure = `[\n  { \"text\": \"(string) Brief (1-2 sentence) starting scenario description.\", \"genre\": \"(string) e.g., Sci-Fi\", \"tone\": \"(string) e.g., Mysterious\", \"visualStyle\": \"(string) e.g., Realistic Digital Painting\" },\n  { \"text\": \"...\", \"genre\": \"...\", \"tone\": \"...\", \"visualStyle\": \"...\" },\n  ...
]`;

      // Updated prompt to request metadata
      const prompt = `You are an AI creating starting points for a text adventure. Generate 3-4 diverse starting scenarios across different genres (sci-fi, fantasy, mystery, etc.). For each scenario, provide a brief description ('text'), a suitable 'genre', 'tone', and 'visualStyle'.
Respond ONLY with a valid JSON array matching this structure, filling in all details:
${jsonStructure}
Ensure the output is only the JSON array string. Examples for text field: "Awake on an alien spaceship medical table.", "Standing at a dark forest entrance with a map.", "Coded message hints at 1920s Paris conspiracy."
Examples for other fields: genre: "Fantasy", tone: "Epic", visualStyle: "Impressionist Oil Painting"`;

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
          '[Adventure Scenarios] Failed to parse AI response JSON:',
          parseError,
          '\nRaw Response:\n',
          aiResponseContent
        );
        Sentry.captureException(parseError, { extra: { aiResponseContent } });
        return { error: 'Failed to parse AI starting scenarios response.' };
      }

      // Validate the response against the schema (which now includes metadata)
      const validationResult = StartingScenariosSchema.safeParse(parsedAiContent);
      if (!validationResult.success) {
        console.error(
          '[Adventure Scenarios] Schema validation failed (with metadata):',
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

      console.log('[Adventure Scenarios] Successfully generated starting scenarios with metadata.');
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
