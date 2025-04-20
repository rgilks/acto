'use server';

import { z } from 'zod';
import { Storage } from '@google-cloud/storage';
import { getActiveModel, getGoogleAIClient, ModelConfig } from '@/lib/modelConfig';
import {
  AdventureNodeSchema,
  AdventureChoiceSchema,
  type AdventureNode,
} from '@/lib/domain/schemas';
import * as Sentry from '@sentry/nextjs';
import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from '@google/genai';
import { synthesizeSpeechAction, type SynthesizeSpeechResult } from './tts';
import { TTS_VOICE_NAME } from '@/lib/constants';
import { getSession } from '@/app/auth';
import { checkTextRateLimit, checkImageRateLimit } from '@/lib/rateLimitSqlite';
import { buildAdventurePrompt } from '@/lib/promptUtils';

let storage: Storage | undefined;
try {
  const credentialsJson = process.env.GOOGLE_APP_CREDS_JSON;
  if (credentialsJson) {
    console.log(
      '[GCS] Initializing Storage client using GOOGLE_APP_CREDS_JSON environment variable.'
    );
    const credentials = JSON.parse(credentialsJson);
    storage = new Storage({ credentials });
  } else {
    console.log(
      '[GCS] GOOGLE_APP_CREDS_JSON not found, initializing Storage client using default credentials (e.g., GOOGLE_APPLICATION_CREDENTIALS or ADC).'
    );
    // Fallback to default ADC (e.g., GOOGLE_APPLICATION_CREDENTIALS file path or workload identity)
    storage = new Storage();
  }
} catch (error) {
  console.error('[GCS] Failed to initialize Google Cloud Storage client:', error);
  if (error instanceof SyntaxError) {
    console.error('[GCS] Check if GOOGLE_APP_CREDS_JSON contains valid JSON.');
  }
  Sentry.captureException(error);
}
const GCS_BUCKET_NAME = process.env.GCS_BUCKET_NAME;

async function uploadBase64ToGCS(
  base64Data: string,
  destinationFilename: string,
  contentType: string
): Promise<string | null> {
  if (!storage) {
    console.error('[GCS Upload] Storage client not initialized.');
    return null;
  }
  if (!GCS_BUCKET_NAME) {
    console.error('[GCS Upload] GCS_BUCKET_NAME environment variable not set.');
    return null;
  }

  try {
    const buffer = Buffer.from(base64Data, 'base64');
    const bucket = storage.bucket(GCS_BUCKET_NAME);
    const file = bucket.file(destinationFilename);

    // Upload without making the file public
    await file.save(buffer, {
      metadata: {
        contentType: contentType,
        // Optional: Set cache control if desired
        // cacheControl: 'private, max-age=3600', // e.g., cache for 1 hour
      },
      // REMOVED: public: true,
    });

    console.log(`[GCS Upload] Successfully uploaded ${destinationFilename} (privately).`);

    // Generate a Signed URL for read access (e.g., valid for 1 day)
    const options = {
      version: 'v4' as const, // Use v4 signing process
      action: 'read' as const,
      expires: Date.now() + 24 * 60 * 60 * 1000, // 1 day in milliseconds
    };

    const [signedUrl] = await file.getSignedUrl(options);
    console.log(
      `[GCS Upload] Generated signed URL for ${destinationFilename}: ${signedUrl.substring(0, 100)}...`
    ); // Log truncated URL
    return signedUrl;
  } catch (error) {
    console.error(`[GCS Upload] Failed to upload ${destinationFilename} or get signed URL:`, error);
    Sentry.captureException(error, { extra: { filename: destinationFilename } });
    return null;
  }
}

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

async function callAIForAdventure(prompt: string, modelConfig: ModelConfig): Promise<string> {
  console.log('[Adventure] Calling AI...');

  try {
    const genAI: GoogleGenAI = getGoogleAIClient();
    const result = await genAI.models.generateContent({
      model: modelConfig.name,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        temperature: 1.0,
        topP: 0.95,
        topK: 40,
        frequencyPenalty: 0.3,
        presencePenalty: 0.6,
        candidateCount: 1,
        maxOutputTokens: 900,
        safetySettings: [
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
        ],
      },
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
  imagePrompt: string,
  visualStyle?: string | null,
  genre?: string | null,
  tone?: string | null
): Promise<
  | { imageUrl: string; error: undefined }
  | { imageUrl: undefined; error: string; rateLimitResetTimestamp?: number }
> {
  const imageLimitCheck = await checkImageRateLimit();
  if (!imageLimitCheck.success) {
    console.warn(
      `[Adventure Image] Rate limit exceeded for user. Error: ${imageLimitCheck.errorMessage}`
    );
    return {
      imageUrl: undefined,
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

      const timestamp = Date.now();
      const filename = `adventure-images/image_${timestamp}.png`;
      const gcsUrl = await uploadBase64ToGCS(base64Data, filename, mimeType);

      if (gcsUrl) {
        console.log('[Adventure Image] Generated Image and uploaded to GCS.');
        return { imageUrl: gcsUrl, error: undefined };
      } else {
        console.error('[Adventure Image] Failed to upload image to GCS.');
        throw new Error('Failed to upload generated image to cloud storage.');
      }
    } else {
      console.error(
        '[Adventure Image] No imageBytes found in the generated image response part:',
        JSON.stringify(image, null, 2)
      );
      throw new Error('No imageBytes found in the generateImages response.');
    }
  } catch (error) {
    console.error('[Adventure Image] Failed to generate or upload image:', error);
    Sentry.captureException(error, { extra: { imagePrompt: imagePrompt } });
    return {
      imageUrl: undefined,
      error: error instanceof Error ? error.message : 'Failed to generate image.',
    };
  }
}

export const generateAdventureNodeAction = async (
  params: GenerateAdventureNodeParams,
  voice?: string | null
): Promise<GenerateAdventureNodeResult> => {
  const session = await getSession();
  if (!session?.user?.id) {
    console.warn('[Adventure Action] Unauthorized attempt.');
    return { error: 'Unauthorized: User must be logged in.' };
  }
  const userId = session.user.id;

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
      const validationErrors = validationResult.error.format();
      console.error('[Adventure] Schema validation failed:', validationErrors);
      Sentry.captureException(new Error('Adventure AI Response Validation Failed'), {
        extra: {
          validationErrors: validationErrors,
        },
      });
      return { error: 'AI response validation failed.' };
    }

    const validatedNode = validationResult.data;
    const imagePromptFromAI = validatedNode.imagePrompt;
    const passage = validatedNode.passage;
    const updatedSummary = validatedNode.updatedSummary;

    let finalImageUrl: string | undefined = undefined;
    let finalAudioUrl: string | undefined = undefined;
    let audioBase64: string | undefined = undefined;
    let imageError: string | undefined = undefined;
    let ttsError: string | undefined = undefined;

    const promisesToSettle = [];

    if (imagePromptFromAI) {
      promisesToSettle.push(generateImageWithGemini(imagePromptFromAI, visualStyle, genre, tone));
    } else {
      console.warn('[Adventure Action] Skipping image generation: no prompt.');
      promisesToSettle.push(Promise.resolve({ imageUrl: undefined, error: undefined }));
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
          | { imageUrl: string; error: undefined }
          | { imageUrl: undefined; error: string; rateLimitResetTimestamp?: number }
        >,
        PromiseSettledResult<SynthesizeSpeechResult>,
      ];

      const imageResult = results[0];
      const audioResultAction = results[1];

      if (imageResult.status === 'fulfilled') {
        if (imageResult.value.imageUrl) {
          finalImageUrl = imageResult.value.imageUrl;
        } else if (imageResult.value.error) {
          imageError = imageResult.value.error;
          console.error('[Adventure Action] Image generation/upload failed:', imageError);
          if (imageResult.value.rateLimitResetTimestamp) {
          }
        }
      } else if (imageResult.status === 'rejected') {
        imageError =
          imageResult.reason instanceof Error
            ? imageResult.reason.message
            : 'Unknown image generation/upload error';
        console.error('[Adventure Action] Image promise rejected:', imageResult.reason);
        Sentry.captureException(imageResult.reason);
      }

      if (audioResultAction.status === 'fulfilled') {
        const audioData = audioResultAction.value;
        if (audioData.audioBase64) {
          audioBase64 = audioData.audioBase64;

          const timestamp = Date.now();
          const audioFilename = `adventure-audio/audio_${userId}_${timestamp}.mp3`;
          const audioMimeType = 'audio/mpeg';
          const gcsAudioUrl = await uploadBase64ToGCS(audioBase64, audioFilename, audioMimeType);

          if (gcsAudioUrl) {
            finalAudioUrl = gcsAudioUrl;
            console.log('[Adventure Action] TTS successful and audio uploaded to GCS.');
          } else {
            console.error('[Adventure Action] TTS successful but failed to upload audio to GCS.');
            ttsError = 'Failed to upload audio to cloud storage.';
            Sentry.captureException(new Error(ttsError));
          }
        } else if (audioData.error) {
          ttsError = audioData.error;
          console.error('[Adventure Action] TTS synthesis failed:', ttsError);
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

    const finalNode: AdventureNode = {
      passage: validatedNode.passage,
      choices: validatedNode.choices,
      imagePrompt: imagePromptFromAI,
      imageUrl: finalImageUrl ?? validatedNode.imageUrl,
      audioUrl: finalAudioUrl,
      audioBase64: audioBase64,
      updatedSummary: updatedSummary,
      generationPrompt: prompt,
    };

    if (imageError || ttsError) {
      console.warn(
        `[Adventure] Node generated with errors. ImageError: ${imageError}, TTSError: ${ttsError}`
      );
    }

    console.log('[Adventure] Successfully generated node with GCS URLs (if applicable).');
    return { adventureNode: finalNode, prompt: prompt };
  } catch (error) {
    console.error('[Adventure] Error generating adventure node:', error);
    Sentry.captureException(error);
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
  const jsonStructure = `[\n  {\n    "text": "(string) Engaging, specific, and imaginative scenario text (1-2 sentences max).",\n    "genre": "(string) Specific Genre (e.g., Sci-Fi Horror, Mythic Fantasy, Noir Mystery).",\n    "tone": "(string) Specific Tone (e.g., Absurdist, Melancholic, Suspenseful, Whimsical).",\n    "visualStyle": "(string) Specific and descriptive Visual Style (e.g., Impressionist Oil Painting, Low-Poly 3D, Ukiyo-e Woodblock Print, Art Deco Poster)."\n  }\n  /* Repeat this structure for 4 highly diverse scenarios */\n]`;

  return `You are a creative generator of diverse story scenarios.\n\n**Goal:** Generate a list of 4 compelling and unique starting scenarios for an interactive text adventure.\n\n**Key Requirements:**\n1.  **Maximum Diversity:** The 4 scenarios MUST be significantly different from each other in theme, setting, genre, tone, and visual style.\n2.  **Specificity:** Use concrete details in the scenario text, genre, tone, and visual style. Make the styles distinct and evocative.\n3.  **Conciseness:** Keep the scenario text brief (1-2 sentences).\n4.  **Strict JSON Output:** Respond ONLY with a valid JSON array matching this structure:\n${jsonStructure}\n\nGenerate 4 diverse scenarios now. Focus on variety and clear visual styles.`;
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
    const aiResponseText = await callAIForAdventure(prompt, modelConfig);

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
      Sentry.captureException(parseError, {
        extra: { aiResponse: aiResponseText, prompt: prompt },
      });
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
      Sentry.captureException(new Error('AI response validation failed for scenarios'), {
        extra: {
          errors: validationResult.error.errors,
          aiResponse: parsedScenarios,
          prompt: prompt,
        },
      });
      return { error: 'Received invalid scenario data structure from AI.' };
    }

    console.log('[Adventure] Successfully generated and validated scenarios.');
    return { scenarios: validationResult.data };
  } catch (error) {
    console.error('[Adventure] Error generating scenarios:', error);
    Sentry.captureException(error);
    return {
      error:
        error instanceof Error
          ? error.message
          : 'An unknown error occurred while generating scenarios.',
    };
  }
};
