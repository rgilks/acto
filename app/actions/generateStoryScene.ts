'use server';

import { z } from 'zod';
import { getActiveModel } from '@/lib/modelConfig';
import { StorySceneSchema, type StoryScene } from '@/lib/domain/schemas';
import { synthesizeSpeechAction } from './tts'; // Assuming tts.ts is in the same dir
import { TTS_VOICE_NAME } from '@/lib/constants';
import { getSession } from '@/app/auth';
import { checkTextRateLimit } from '@/lib/rateLimitSqlite';
import { buildStoryPrompt } from '@/lib/promptUtils';
import { callAIForStory, AIConfigOverrides } from '@/lib/ai/googleAiService';
import { generateImageWithGemini } from '@/lib/ai/imageGenerationService';

const GenerateStorySceneParamsSchema = z.object({
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

type GenerateStorySceneParams = z.infer<typeof GenerateStorySceneParamsSchema>;

type GenerateStorySceneResult = {
  storyScene?: StoryScene;
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
): { success: true; data: GenerateStorySceneParams } | { success: false; error: string } => {
  const validation = GenerateStorySceneParamsSchema.safeParse(params);
  if (!validation.success) {
    console.error('[Story Action] Invalid parameters:', validation.error.format());
    return {
      success: false,
      error: `Invalid input: ${validation.error.errors[0]?.message ?? 'Invalid parameters.'}`,
    };
  }
  return { success: true, data: validation.data };
};

type ValidatedStoryContent = {
  validatedScene: StoryScene;
  prompt: string;
};

const generateAndValidateStoryContent = async (
  params: GenerateStorySceneParams
): Promise<{ data?: ValidatedStoryContent; error?: string }> => {
  const { storyContext, initialScenarioText, genre, tone, visualStyle } = params;
  const prompt = buildStoryPrompt(storyContext, initialScenarioText, genre, tone, visualStyle);
  const activeModel = getActiveModel();

  // Define specific overrides for node generation if needed, or leave empty for defaults
  const nodeGenConfigOverrides: AIConfigOverrides = {};

  try {
    const aiResponseContent = await callAIForStory(prompt, activeModel, nodeGenConfigOverrides);

    let parsedAiContent: unknown;
    try {
      const cleanedResponse = aiResponseContent
        .replace(/^```json\s*/, '')
        .replace(/```\s*$/, '')
        .trim();
      parsedAiContent = JSON.parse(cleanedResponse);
    } catch (parseError) {
      console.error(
        '[Story Action] Failed to parse AI response JSON:',
        parseError,
        '\nRaw Response:\n',
        aiResponseContent
      );
      return { error: 'Failed to parse AI response.' };
    }

    const validationResult = StorySceneSchema.safeParse(parsedAiContent);
    if (!validationResult.success) {
      const validationErrors = validationResult.error.format();
      console.error('[Story Action] Schema validation failed:', validationErrors);
      // Consider returning validationErrors string for more specific feedback
      return { error: 'AI response validation failed.' };
    }

    return { data: { validatedScene: validationResult.data, prompt } };
  } catch (error) {
    console.error('[Story Action] Error during AI call or processing:', error);
    return { error: error instanceof Error ? error.message : 'AI interaction failed.' };
  }
};

type ImageGenerationResult = {
  imageUrl?: string | undefined;
  error?: string;
  rateLimitResetTimestamp?: number;
};

const generateStoryImage = async (
  imagePrompt: string | undefined,
  visualStyle?: string,
  genre?: string,
  tone?: string
): Promise<ImageGenerationResult> => {
  if (!imagePrompt) {
    console.warn('[Story Action] Skipping image generation: no prompt.');
    return {};
  }

  try {
    const result = await generateImageWithGemini(imagePrompt, visualStyle, genre, tone);
    if (result.error) {
      console.error('[Story Action] Image generation failed:', result.error);
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
    console.error('[Story Action] Image generation promise rejected:', error);
    return { error: errorMessage };
  }
};

type TtsSynthesisResult = {
  audioBase64?: string | undefined;
  error?: string;
  // Consider adding rate limit info if tts action provides it
};

const synthesizeStoryAudio = async (
  passage: string | undefined,
  voice: string | null | undefined
): Promise<TtsSynthesisResult> => {
  if (!passage) {
    console.warn('[Story Action] Skipping TTS generation: no passage.');
    return { error: 'No passage text' };
  }

  const voiceToUse = voice || TTS_VOICE_NAME;
  console.log('[Story Action] Starting TTS synthesis...');

  try {
    const result = await synthesizeSpeechAction({ text: passage, voiceName: voiceToUse });
    if (result.error) {
      console.error('[Story Action] TTS synthesis failed:', result.error);
      // Check if result.error provides specific rate limit info to pass along
      return { error: result.error };
    }
    return { audioBase64: result.audioBase64 };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown TTS error';
    console.error('[Story Action] TTS synthesis promise rejected:', error);
    return { error: errorMessage };
  }
};

// --- Main Action --- //

export const generateStorySceneAction = async (
  params: GenerateStorySceneParams,
  voice?: string | null
): Promise<GenerateStorySceneResult> => {
  const session = await getSession();
  if (!session?.user) {
    console.warn('[Story Action] Unauthorized attempt.');
    return { error: 'Unauthorized: User must be logged in.' };
  }

  const textLimitCheck = await checkTextRateLimit();
  if (!textLimitCheck.success) {
    console.warn(
      `[Story Action] Text rate limit exceeded for user. Error: ${textLimitCheck.errorMessage}`
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
    const contentResult = await generateAndValidateStoryContent(validatedParams);
    if (contentResult.error || !contentResult.data) {
      return { error: contentResult.error ?? 'Failed to generate story content.' };
    }
    const { validatedScene, prompt } = contentResult.data;
    const { passage, choices, imagePrompt, updatedSummary } = validatedScene;

    // 3. Initiate Image and Audio Generation (Parallel)
    const imagePromise = generateStoryImage(
      imagePrompt,
      validatedParams.visualStyle,
      validatedParams.genre,
      validatedParams.tone
    );
    const audioPromise = synthesizeStoryAudio(passage, voice);

    const [imageResult, audioResult] = await Promise.all([imagePromise, audioPromise]);

    // 4. Construct Final Scene
    const finalScene: StoryScene = {
      passage: passage,
      choices: choices,
      imagePrompt: imagePrompt,
      imageUrl: imageResult.imageUrl ?? validatedScene.imageUrl,
      audioBase64: audioResult.audioBase64,
      updatedSummary: updatedSummary,
      generationPrompt: prompt,
      // TODO: Consider adding specific imageError/ttsError fields if UI needs detailed feedback
      // imageError: imageResult.error,
      // ttsError: audioResult.error,
    };

    console.log('[Story Action] Successfully generated scene.');

    // Note: Currently, only the *text* rate limit error is returned explicitly in the rateLimitError field.
    // Image/TTS errors are logged but not returned in that specific field.
    // If an image rate limit occurred, imageResult.error might contain info, but needs handling.
    return { storyScene: finalScene, prompt: prompt };
  } catch (error) {
    console.error('[Story Action] Unexpected error in generateStorySceneAction:', error);
    return { error: error instanceof Error ? error.message : 'An unexpected error occurred.' };
  }
};
