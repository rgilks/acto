'use server';

import { z } from 'zod';
import { getActiveModel } from '@/lib/modelConfig';
import { AdventureNodeSchema, type AdventureNode } from '@/lib/domain/schemas';
import { synthesizeSpeechAction, type SynthesizeSpeechResult } from './tts'; // Assuming tts.ts is in the same dir
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
    const validation = GenerateAdventureNodeParamsSchema.safeParse(params);
    if (!validation.success) {
      console.error('[Adventure Action] Invalid parameters:', validation.error.format());
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

    // Define specific overrides for node generation if needed, or leave empty for defaults
    const nodeGenConfigOverrides: AIConfigOverrides = {};

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
      return { error: 'AI response validation failed.' };
    }

    const validatedNode = validationResult.data;
    const imagePromptFromAI = validatedNode.imagePrompt;
    const passage = validatedNode.passage;
    const updatedSummary = validatedNode.updatedSummary;

    let imageUrl: string | undefined = undefined;
    let audioBase64: string | undefined = undefined;
    let imageError: string | undefined = undefined;
    let ttsError: string | undefined = undefined;

    const promisesToSettle = [];

    if (imagePromptFromAI) {
      promisesToSettle.push(generateImageWithGemini(imagePromptFromAI, visualStyle, genre, tone));
    } else {
      console.warn('[Adventure Action] Skipping image generation: no prompt.');
      promisesToSettle.push(Promise.resolve({ dataUri: undefined, error: undefined }));
    }

    if (passage) {
      console.log('[Adventure Action] Adding TTS promise...');
      const voiceToUse = voice || TTS_VOICE_NAME;
      promisesToSettle.push(synthesizeSpeechAction({ text: passage, voiceName: voiceToUse }));
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

      if (imageResult.status === 'fulfilled') {
        if (imageResult.value.dataUri) {
          imageUrl = imageResult.value.dataUri;
        } else if (imageResult.value.error) {
          imageError = imageResult.value.error;
          console.error('[Adventure Action] Image generation failed:', imageError);
          // Note: We are logging the image error but not returning it in the rateLimitError field specifically
          // unless it *was* a rate limit error from generateImageWithGemini. Consider if the UI needs
          // separate image-specific errors.
        }
      } else {
        imageError =
          imageResult.reason instanceof Error
            ? imageResult.reason.message
            : 'Unknown image generation error';
        console.error('[Adventure Action] Image generation promise rejected:', imageResult.reason);
      }

      if (audioResultAction.status === 'fulfilled') {
        const audioData = audioResultAction.value;
        if (audioData.audioBase64) {
          audioBase64 = audioData.audioBase64;
        } else if (audioData.error) {
          ttsError = audioData.error;
          console.error('[Adventure Action] TTS synthesis failed:', ttsError);
          // Similar to image errors, consider how TTS errors (including potential rate limits) should be surfaced.
        }
      } else {
        ttsError =
          audioResultAction.reason instanceof Error
            ? audioResultAction.reason.message
            : 'Unknown TTS error';
        console.error(
          '[Adventure Action] TTS synthesis promise rejected:',
          audioResultAction.reason
        );
      }
    } catch (settleError) {
      console.error('[Adventure Action] Error settling promises:', settleError);
      // Decide if this specific error needs to be surfaced or just logged
    }

    const finalNode: AdventureNode = {
      passage: validatedNode.passage,
      choices: validatedNode.choices,
      imagePrompt: imagePromptFromAI,
      imageUrl: imageUrl ?? validatedNode.imageUrl, // Keep original AI image URL if new one failed?
      audioBase64: audioBase64,
      updatedSummary: updatedSummary,
      generationPrompt: prompt,
      // Potentially include imageError/ttsError here if the UI needs to display them
    };

    console.log('[Adventure Action] Successfully generated node.');
    // TODO: Consider returning imageError/ttsError if they occurred, alongside the node
    return { adventureNode: finalNode, prompt: prompt };
  } catch (error) {
    console.error('[Adventure Action] Error generating adventure node:', error);
    return { error: error instanceof Error ? error.message : 'An unexpected error occurred.' };
  }
};
