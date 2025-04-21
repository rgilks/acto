'use server';

import { z } from 'zod';
import { getActiveModel, getGoogleAIClient, ModelConfig } from '@/lib/modelConfig';
import {
  AdventureNodeSchema,
  AdventureChoiceSchema,
  type AdventureNode,
} from '@/lib/domain/schemas';
import { GoogleGenAI, HarmCategory, HarmBlockThreshold, GenerationConfig } from '@google/genai';
import { synthesizeSpeechAction, type SynthesizeSpeechResult } from './tts';
import { TTS_VOICE_NAME } from '@/lib/constants';
import { getSession } from '@/app/auth';
import { checkTextRateLimit, checkImageRateLimit } from '@/lib/rateLimitSqlite';
import { buildAdventurePrompt } from '@/lib/promptUtils';

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

// Define a type for the config overrides
type AIConfigOverrides = Partial<GenerationConfig>;

async function callAIForAdventure(
  prompt: string,
  modelConfig: ModelConfig,
  configOverrides?: AIConfigOverrides
): Promise<string> {
  console.log('[Adventure] Calling AI...');

  try {
    const genAI: GoogleGenAI = getGoogleAIClient();

    // Base configuration
    const baseConfig: GenerationConfig = {
      temperature: 1.0,
      topP: 0.95,
      topK: 40,
      frequencyPenalty: 0.3,
      presencePenalty: 0.6,
      candidateCount: 1,
      maxOutputTokens: 900,
    };

    // Safety settings
    const safetySettings = [
      {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
      },
      {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
      },
      {
        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
      },
      {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
      },
    ];

    // Merge base config with overrides
    const finalConfig = { ...baseConfig, ...configOverrides };
    console.log('[Adventure] Using final AI config:', JSON.stringify(finalConfig, null, 2)); // Log the final config

    // Construct the request object directly without explicit type annotation
    const request = {
      model: modelConfig.name,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: finalConfig,
      safetySettings: safetySettings,
    };

    const result = await genAI.models.generateContent(request);
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
    throw error;
  }
}

async function generateImageWithGemini(
  imagePrompt: string,
  visualStyle?: string | null,
  genre?: string | null,
  tone?: string | null
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

  const styleDetails = [
    visualStyle ? `Style: ${visualStyle}` : null,
    genre ? `Genre: ${genre}` : null,
    tone ? `Tone: ${tone}` : null,
  ]
    .filter(Boolean)
    .join('. ');

  const finalImagePrompt = `Scene Description: ${imagePrompt}. ${styleDetails}.`;

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
        aspectRatio: '16:9',
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
    return {
      dataUri: undefined,
      error: error instanceof Error ? error.message : 'Failed to generate image.',
    };
  }
}

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
        '[Adventure] Failed to parse AI response JSON:',
        parseError,
        '\nRaw Response:\n',
        aiResponseContent
      );
      return { error: 'Failed to parse AI response.' };
    }

    const validationResult = AdventureNodeSchema.safeParse(parsedAiContent);
    if (!validationResult.success) {
      const validationErrors = validationResult.error.format();
      console.error('[Adventure] Schema validation failed:', validationErrors);
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

      if (audioResultAction.status === 'fulfilled') {
        const audioData = audioResultAction.value;
        if (audioData.audioBase64) {
          audioBase64 = audioData.audioBase64;
        } else if (audioData.error) {
          ttsError = audioData.error;
          console.error('[Adventure Action] TTS synthesis failed:', ttsError);
          if (audioData.rateLimitError) {
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
      }
    } catch (settleError) {
      console.error('[Adventure Action] Error settling promises:', settleError);
    }

    const finalNode: AdventureNode = {
      passage: validatedNode.passage,
      choices: validatedNode.choices,
      imagePrompt: imagePromptFromAI,
      imageUrl: imageUrl ?? validatedNode.imageUrl,
      audioBase64: audioBase64,
      updatedSummary: updatedSummary,
      generationPrompt: prompt,
    };

    console.log('[Adventure] Successfully generated node with summary and style context.');
    return { adventureNode: finalNode, prompt: prompt };
  } catch (error) {
    console.error('[Adventure] Error generating adventure node:', error);
    return { error: error instanceof Error ? error.message : 'An unexpected error occurred.' };
  }
};

const ScenariosSchema = z.array(AdventureChoiceSchema);

type GenerateScenariosResult = {
  scenarios?: z.infer<typeof ScenariosSchema>;
  error?: string;
  rateLimitError?: {
    message: string;
    resetTimestamp: number;
    apiType: 'text';
  };
};

function buildScenariosPrompt(): string {
  const jsonStructure = `[\n  {\n    "text": "(string) Engaging, highly imaginative starting scenario text (1-2 sentences max).",\n    "genre": "(string) Core genre or unique genre blend.",\n    "tone": "(string) Dominant tone or mood.",\n    "visualStyle": "(string) Evocative description of the visual aesthetic."
  }\n  /* Repeat structure for 4 scenarios */\n]`;

  return `You are an experimental generator of highly diverse and unexpected story scenarios.\n\n**Goal:** Generate a list of 4 radically different and unique starting scenarios for an interactive text adventure.\n\n**Key Requirements:**\n1.  **Extreme Diversity:** The 4 scenarios MUST be maximally different from each other across multiple dimensions: theme, setting, core concepts, mood, and visual aesthetic. Avoid predictable combinations.\n2.  **Imaginative Specificity:** Use vivid, concrete details in the scenario text and visual style description. Aim for unique and evocative descriptions, not just standard labels.\n3.  **Conciseness:** Keep the scenario text brief (1-2 sentences).\n4.  **Novelty:** Prioritize unusual combinations and unexpected juxtapositions in genre, tone, and visual style.\n5.  **Strict JSON Output:** Respond ONLY with a valid JSON array matching this structure:\n${jsonStructure}\n\nGenerate 4 highly diverse, unexpected, and imaginative scenarios now.`;
}

export const generateScenariosAction = async (): Promise<GenerateScenariosResult> => {
  console.log('[Adventure] Generating scenarios...');
  const session = await getSession();
  if (!session?.user?.id) {
    return { error: 'User not authenticated.' };
  }

  const limitCheck = await checkTextRateLimit();
  if (!limitCheck.success) {
    console.warn(`[Adventure] Rate limit exceeded for user ${session.user.id}.`);
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

    const aiResponseText = await callAIForAdventure(
      prompt,
      modelConfig,
      scenarioGenConfigOverrides
    );

    let parsedScenarios: unknown;
    try {
      const cleanedText = aiResponseText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      parsedScenarios = JSON.parse(cleanedText);
    } catch (parseError) {
      console.error(
        '[Adventure] Failed to parse scenarios JSON:',
        parseError,
        'Raw response:',
        aiResponseText
      );
      return { error: 'Failed to parse scenarios from AI response.' };
    }

    const validationResult = ScenariosSchema.safeParse(parsedScenarios);

    if (!validationResult.success) {
      console.error(
        '[Adventure] Scenarios validation failed:',
        validationResult.error.errors,
        'Parsed Data:',
        parsedScenarios
      );
      return { error: 'Received invalid scenario data structure from AI.' };
    }

    console.log('[Adventure] Successfully generated and validated scenarios.');
    return { scenarios: validationResult.data };
  } catch (error) {
    console.error('[Adventure] Error generating scenarios:', error);
    return {
      error:
        error instanceof Error
          ? error.message
          : 'An unknown error occurred while generating scenarios.',
    };
  }
};
