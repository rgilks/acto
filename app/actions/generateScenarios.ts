'use server';

import { z } from 'zod';
import { getActiveModel } from '@/lib/modelConfig';
import { StoryChoiceSchema } from '@/lib/domain/schemas';
import { getSession } from '@/app/auth';
import { checkTextRateLimit } from '@/lib/rateLimitSqlite';
import { callAIForStory, AIConfigOverrides } from '@/lib/ai/googleAiService';
import { buildScenariosPrompt } from '@/lib/promptUtils';

const ScenariosSchema = z.array(StoryChoiceSchema);

type GenerateScenariosResult = {
  scenarios?: z.infer<typeof ScenariosSchema>;
  error?: string;
  rateLimitError?: {
    message: string;
    resetTimestamp: number;
    apiType: 'text';
  };
};

export const generateScenariosAction = async (): Promise<GenerateScenariosResult> => {
  console.log('[Scenarios Action] Generating scenarios...');
  const session = await getSession();
  if (!session?.user.id) {
    return { error: 'User not authenticated.' };
  }

  const limitCheck = await checkTextRateLimit();
  if (!limitCheck.success) {
    console.warn(`[Scenarios Action] Rate limit exceeded for user ${session.user.id}.`);
    return {
      error: limitCheck.errorMessage ?? 'Rate limit exceeded.',
      rateLimitError: {
        message: limitCheck.errorMessage ?? 'Rate limit exceeded.',
        resetTimestamp: limitCheck.reset,
        apiType: 'text',
      },
    };
  }

  try {
    const modelConfig = getActiveModel();
    const prompt = buildScenariosPrompt();

    // Define specific overrides for scenario generation - aim for maximum creativity/diversity
    const scenarioGenConfigOverrides: AIConfigOverrides = {
      temperature: 1.0, // Maximize temperature
      topP: 0.9, // Slightly lower topP for less probable tokens
      topK: 60, // Increase topK to consider more options
      frequencyPenalty: 0.5, // Slightly increase penalties
      presencePenalty: 0.7, // Slightly increase penalties
    };

    const aiResponseText = await callAIForStory(prompt, modelConfig, scenarioGenConfigOverrides);

    let parsedScenarios: unknown;
    try {
      const cleanedText = aiResponseText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      parsedScenarios = JSON.parse(cleanedText);
    } catch (parseError) {
      console.error(
        '[Scenarios Action] Failed to parse scenarios JSON:',
        parseError,
        'Raw response:',
        aiResponseText
      );
      return { error: 'Failed to parse scenarios from AI response.' };
    }

    const validationResult = ScenariosSchema.safeParse(parsedScenarios);

    if (!validationResult.success) {
      console.error(
        '[Scenarios Action] Scenarios validation failed:',
        validationResult.error.errors,
        'Parsed Data:',
        parsedScenarios
      );
      return { error: 'Received invalid scenario data structure from AI.' };
    }

    console.log('[Scenarios Action] Successfully generated and validated scenarios.');
    return { scenarios: validationResult.data };
  } catch (error) {
    console.error('[Scenarios Action] Error generating scenarios:', error);
    return {
      error:
        error instanceof Error
          ? error.message
          : 'An unknown error occurred while generating scenarios.',
    };
  }
};
