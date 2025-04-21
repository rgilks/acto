'use server';

import { z } from 'zod';
import { getActiveModel } from '@/lib/modelConfig';
import { AdventureNodeSchema, type AdventureNode } from '@/lib/domain/schemas';
import { synthesizeSpeechAction } from './tts'; // Assuming tts.ts is in the same dir
import { TTS_VOICE_NAME } from '@/lib/constants';
import { getSession } from '@/app/auth';
import { checkTextRateLimit } from '@/lib/rateLimitSqlite';
import { buildAdventurePrompt } from '@/lib/promptUtils';
import { callAIForAdventure, AIConfigOverrides } from '@/lib/ai/googleAiService';
import { generateImageWithGemini } from '@/lib/ai/imageGenerationService';

const GenerateAdventureNodeParamsSchema = z.object({
  storyContext: z.object({
    history: z.array(
      z.object({
        passage: z.string(),
        choiceText: z.string().optional(),
        summary: z.string().optional(),
      })
    ),
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
  prompt?: string;
};

// --- Helper Functions ---

const validateInput = (
  params: unknown
): { success: true; data: GenerateAdventureNodeParams } | { success: false; error: string } => {
  const validation = GenerateAdventureNodeParamsSchema.safeParse(params);
  if (!validation.success) {
    console.error('[Adventure Action] Invalid parameters:', validation.error.format());
    return {
      success: false,
      error: `Invalid input: ${validation.error.errors[0]?.message ?? 'Invalid parameters.'}`,
    };
  }
  return { success: true, data: validation.data };
};

type ValidatedAdventureContent = {
  validatedNode: AdventureNode;
  prompt: string;
};

const generateAndValidateAdventureContent = async (
  params: GenerateAdventureNodeParams
): Promise<{ data?: ValidatedAdventureContent; error?: string }> => {
  const { storyContext, initialScenarioText, genre, tone, visualStyle } = params;
  const prompt = buildAdventurePrompt(storyContext, initialScenarioText, genre, tone, visualStyle);
  const activeModel = getActiveModel();

  // Define specific overrides for node generation if needed, or leave empty for defaults
  const nodeGenConfigOverrides: AIConfigOverrides = {};

  try {
    const aiResponseContent = await callAIForAdventure(prompt, activeModel, nodeGenConfigOverrides);

    let parsedAiContent: unknown;
    try {
      const cleanedResponse = aiResponseContent
        .replace(/^```json\s*/, '')
        .replace(/```\s*$/, '')
        .trim();
      parsedAiContent = JSON.parse(cleanedResponse);
    } catch (parseError) {
      console.error(
        '[Adventure Action] Failed to parse AI response JSON:',
        parseError,
        '\nRaw Response:\n',
        aiResponseContent
      );
      return { error: 'Failed to parse AI response.' };
    }

    const validationResult = AdventureNodeSchema.safeParse(parsedAiContent);
    if (!validationResult.success) {
      const validationErrors = validationResult.error.format();
      console.error('[Adventure Action] Schema validation failed:', validationErrors);
      // Consider returning validationErrors string for more specific feedback
      return { error: 'AI response validation failed.' };
    }

    return { data: { validatedNode: validationResult.data, prompt } };
  } catch (error) {
    console.error('[Adventure Action] Error during AI call or processing:', error);
    return { error: error instanceof Error ? error.message : 'AI interaction failed.' };
  }
};

type ImageGenerationResult = {
  imageUrl?: string | undefined;
  error?: string;
  rateLimitResetTimestamp?: number;
};

const generateAdventureImage = async (
  imagePrompt: string | undefined,
  visualStyle?: string,
  genre?: string,
  tone?: string
): Promise<ImageGenerationResult> => {
  if (!imagePrompt) {
    console.warn('[Adventure Action] Skipping image generation: no prompt.');
    return {};
  }

  try {
    const result = await generateImageWithGemini(imagePrompt, visualStyle, genre, tone);
    if (result.error) {
      console.error('[Adventure Action] Image generation failed:', result.error);
      return {
        error: result.error,
        ...(result.rateLimitResetTimestamp !== undefined
          ? { rateLimitResetTimestamp: result.rateLimitResetTimestamp }
          : {}),
      };
    }
    return { imageUrl: result.dataUri };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown image generation error';
    console.error('[Adventure Action] Image generation promise rejected:', error);
    return { error: errorMessage };
  }
};

type TtsSynthesisResult = {
  audioBase64?: string | undefined;
  error?: string;
  // Consider adding rate limit info if tts action provides it
};

const synthesizeAdventureAudio = async (
  passage: string | undefined,
  voice: string | null | undefined
): Promise<TtsSynthesisResult> => {
  if (!passage) {
    console.warn('[Adventure Action] Skipping TTS generation: no passage.');
    return { error: 'No passage text' };
  }

  const voiceToUse = voice || TTS_VOICE_NAME;
  console.log('[Adventure Action] Starting TTS synthesis...');

  try {
    const result = await synthesizeSpeechAction({ text: passage, voiceName: voiceToUse });
    if (result.error) {
      console.error('[Adventure Action] TTS synthesis failed:', result.error);
      // Check if result.error provides specific rate limit info to pass along
      return { error: result.error };
    }
    return { audioBase64: result.audioBase64 };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown TTS error';
    console.error('[Adventure Action] TTS synthesis promise rejected:', error);
    return { error: errorMessage };
  }
};

// --- Main Action --- //

export const generateAdventureNodeAction = async (
  params: GenerateAdventureNodeParams,
  voice?: string | null
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
    // 1. Validate Input
    const validation = validateInput(params);
    if (!validation.success) {
      return { error: validation.error };
    }
    const validatedParams = validation.data;

    // 2. Generate AI Content
    const contentResult = await generateAndValidateAdventureContent(validatedParams);
    if (contentResult.error || !contentResult.data) {
      return { error: contentResult.error ?? 'Failed to generate adventure content.' };
    }
    const { validatedNode, prompt } = contentResult.data;
    const { passage, choices, imagePrompt, updatedSummary } = validatedNode;

    // 3. Initiate Image and Audio Generation (Parallel)
    const imagePromise = generateAdventureImage(
      imagePrompt,
      validatedParams.visualStyle,
      validatedParams.genre,
      validatedParams.tone
    );
    const audioPromise = synthesizeAdventureAudio(passage, voice);

    const [imageResult, audioResult] = await Promise.all([imagePromise, audioPromise]);

    // 4. Construct Final Node
    const finalNode: AdventureNode = {
      passage: passage,
      choices: choices,
      imagePrompt: imagePrompt,
      imageUrl: imageResult.imageUrl ?? validatedNode.imageUrl, // Fallback logic preserved
      audioBase64: audioResult.audioBase64,
      updatedSummary: updatedSummary,
      generationPrompt: prompt,
      // TODO: Consider adding specific imageError/ttsError fields if UI needs detailed feedback
      // imageError: imageResult.error,
      // ttsError: audioResult.error,
    };

    console.log('[Adventure Action] Successfully generated node.');

    // Note: Currently, only the *text* rate limit error is returned explicitly in the rateLimitError field.
    // Image/TTS errors are logged but not returned in that specific field.
    // If an image rate limit occurred, imageResult.error might contain info, but needs handling.
    return { adventureNode: finalNode, prompt: prompt };
  } catch (error) {
    console.error('[Adventure Action] Unexpected error in generateAdventureNodeAction:', error);
    return { error: error instanceof Error ? error.message : 'An unexpected error occurred.' };
  }
};
