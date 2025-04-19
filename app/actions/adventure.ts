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
  const maxHistoryItems = 3;

  const latestSummary = history.length > 0 ? history[history.length - 1]?.summary : null;

  const initialContextText =
    history.length === 0 && initialScenarioText
      ? initialScenarioText
      : history.length > 0
        ? history[0]?.passage
        : null;

  const jsonStructure = `{\n  "passage": "(string) Next part of the adventure, describing outcome of last choice and current situation.",\n  "choices": [ /* Array of 3-4 { "text": string } objects for player choices. */ ],\n  "imagePrompt": "(string) Concise visual prompt (max 50 words) based ONLY on the \\\"passage\\\" but strongly reflecting the specified Adventure Style (Genre: ${genre ?? 'any'}, Tone: ${tone ?? 'any'}, Visual Style: ${visualStyle ?? 'any'}). **Crucially, describe the scene from a first-person perspective; do NOT show the player character or hands.** E.g., for sci-fi/mysterious/digital painting: \\\"Dim alien spaceship corridor, digital painting\\\"",\n  "updatedSummary": "(string) A brief (1-2 sentence) summary encompassing the entire story so far, updated with the events of this new 'passage'.\n}`;

  const initialContextSection = initialContextText
    ? `Initial Scenario Context/Goal:\n${initialContextText}`
    : 'No initial scenario provided.';

  let adventureStyleSection = 'Adventure Style:\n';
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

  let recentHistoryText = 'Most Recent Steps:\n';
  if (history.length === 0) {
    recentHistoryText += '(No steps taken yet. Refer to Initial Scenario Context.)\\n';
  } else {
    const recentHistory = history.length <= 1 ? [] : history.slice(-maxHistoryItems);
    if (recentHistory.length > 0) {
      recentHistory.forEach((item, index) => {
        const isInitialPassageIncludedInRecent =
          history.length <= maxHistoryItems && history.length > 1;
        const stepNum = isInitialPassageIncludedInRecent
          ? index + 1
          : history.length - recentHistory.length + index + 1;

        if (index === 0 && isInitialPassageIncludedInRecent && stepNum === 1) {
          recentHistoryText += `Step 1 Choice: ${item.choiceText ?? '(Choice made)'}\\n`;
        } else {
          recentHistoryText += `Step ${stepNum} Passage: ${item.passage}\\n`;
          if (item.choiceText) {
            recentHistoryText += `Step ${stepNum} Choice: ${item.choiceText}\\n`;
          } else {
            recentHistoryText += `Step ${stepNum} (Result of previous choice)\\n`;
          }
        }
      });
      if (history.length > maxHistoryItems) {
        recentHistoryText = `(Older steps summarized below)\\n` + recentHistoryText;
      }
    } else if (history.length === 1 && history[0].choiceText) {
      recentHistoryText += `Step 1 Choice: ${history[0].choiceText}\\n`;
    } else if (history.length === 1) {
      recentHistoryText += '(First passage generated. Awaiting first choice.)\\n';
    } else {
      recentHistoryText += '(Processing history...)\\n';
    }
  }

  const storySummarySection = latestSummary
    ? `Summary of story before recent steps:\n${latestSummary}`
    : 'No summary yet.';

  const basePrompt = `You are a storyteller for an interactive text adventure, focused on creating a cohesive and engaging narrative arc **that builds towards a satisfying conclusion**. Adhere strictly to the specified Adventure Style (Genre, Tone, Visual Style). Maintain the tone and details from the **Initial Scenario Context/Goal**. Continue the story based on the provided Summary and Most Recent Steps, ensuring choices have meaningful consequences.

**Key Directives:**
1.  **Narrative Cohesion & Arc:** Ensure the story develops logically, building upon previous events. Guide the narrative towards **resolving the core conflict or goal** established in the **Initial Scenario Context/Goal**. Think in terms of setup, rising action, and eventual resolution. Avoid indefinite meandering.
2.  **Summary Guidance:** The next passage **MUST** logically follow from and build upon the \`updatedSummary\`. Maintain consistency and narrative direction using this summary.
3.  **Meaningful Choices:** Choices offered should ideally provide distinct paths, potentially influencing the direction towards resolution.
4.  **Strict JSON Output:** Respond ONLY with a valid JSON object matching this structure:
${jsonStructure}
Output only the JSON object. Provide an 'updatedSummary' reflecting the entire story including the new 'passage'. **Crucially, ensure the 'imagePrompt' is based on the current passage, strongly reflects the required Genre, Tone, and Visual Style, and describes the scene from a first-person perspective (do not show the protagonist).**`;

  return `${basePrompt}
\n${adventureStyleSection}
\n${initialContextSection}
\n${storySummarySection}
\n${recentHistoryText}
\nGenerate the next JSON step, adhering to the Adventure Style, Initial Context, Summary, and Recent Steps. Ensure 'updatedSummary' is included and 'imagePrompt' strongly matches the Genre, Tone, and Visual Style.`;
}

async function callAIForAdventure(prompt: string, modelConfig: ModelConfig): Promise<string> {
  console.log('[Adventure] Calling AI...');

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

  let stylePrefix = visualStyle ? visualStyle + ' style. ' : 'Detailed, atmospheric illustration. ';
  if (genre) {
    stylePrefix += `Genre: ${genre}. `;
  }
  if (tone) {
    stylePrefix += `Tone: ${tone}. `;
  }

  // Add constraint to exclude the player character and hands
  const sceneConstraint =
    " The image should represent the scene from the protagonist's point of view. Do NOT depict the protagonist, player character, player's hands, or any representation of 'self'.";

  const finalImagePrompt = `${stylePrefix}${imagePrompt}${sceneConstraint}`;

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
      console.error('[Adventure] Failing AI Response Content (raw): ', aiResponseContent);
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
        Sentry.captureException(audioResultAction.reason);
      }
    } catch (settleError) {
      console.error('[Adventure Action] Error settling promises:', settleError);
      Sentry.captureException(settleError);
    }

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

// Schema for the array of starting scenarios
const StartingScenariosSchema = z.array(AdventureChoiceSchema);

type GenerateStartingScenariosResult = {
  scenarios?: z.infer<typeof StartingScenariosSchema>;
  error?: string;
  rateLimitError?: {
    message: string;
    resetTimestamp: number;
    apiType: 'text';
  };
};

// Helper function to build the prompt for generating starting scenarios
function buildStartingScenariosPrompt(): string {
  const jsonStructure = `[
  {
    "text": "(string) Engaging, specific, and imaginative starting situation text, often surreal or dreamlike. **Keep concise (1-2 sentences max).**",
    "genre": "(string) Genre (e.g., Surreal Sci-Fi, Dreamlike Fantasy, Psychedelic Mystery, 70s Space Opera). Be specific.",
    "tone": "(string) Tone (e.g., Eerie, Oneiric, Hypnagogic, Cosmic Horror, Retrofuturistic, Whimsical yet unsettling). Be specific.",
    "visualStyle": "(string) Visual style (e.g., 70s Sci-Fi Book Cover Art, Psychedelic Illustration, Surrealist Painting, Retro Anime, Vintage Fantasy Art). Be specific."
  }
  /* Repeat this structure for 4 highly diverse scenarios, leaning into the requested themes */
]`;

  return `You are an extremely creative storyteller specializing in crafting unique adventure hooks. Generate a **highly diverse list of 4 compelling and unique** starting scenarios for an interactive text adventure. Each scenario must include specific, evocative text describing the initial situation, a well-defined genre, a distinct tone, and a specific visual style for potential images.

**Desired Styles & Themes (Include Among the Diverse Options):**
*   Incorporate **surreal, dreamlike, weird, or psychedelic themes** in some scenarios.
*   Include options inspired by **70s-era science fiction and fantasy aesthetics** (e.g., Moebius, Frazetta, vintage book covers) for visual style or genre.
*   Aim for **evocative, specific, and unconventional** starting situations across all scenarios.

**Key Requirements:**
1.  **High Variation:** The **most important goal** is that the 4 scenarios are significantly different from each other in theme, setting, genre, tone, and style. Do not repeat patterns.
2.  **Specificity & Conciseness:** Use concrete, unusual details in the scenario text, **keeping it brief (1-2 sentences)**. Instead of "a mysterious artifact", try "a pulsating obsidian orb humming discordant energy".
3.  **Creative Styles:** Use varied and specific genres, tones, and visual styles, drawing inspiration from the desired themes above where appropriate.
4.  **Strict JSON Output:** Respond ONLY with a valid JSON array matching this exact structure (do not add any text before or after the JSON):
${jsonStructure}
Output only the JSON array. Focus on **maximum diversity, uniqueness, and detail** across the 4 scenarios.`;
}

export const generateStartingScenariosAction =
  async (): Promise<GenerateStartingScenariosResult> => {
    console.log('[Adventure] Generating starting scenarios...');
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
      const prompt = buildStartingScenariosPrompt();
      const aiResponseText = await callAIForAdventure(prompt, modelConfig);

      // Attempt to parse the AI response
      let parsedScenarios: unknown;
      try {
        // Clean the response text if necessary (remove potential markdown backticks)
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

      // Validate the parsed response against the Zod schema
      const validationResult = StartingScenariosSchema.safeParse(parsedScenarios);

      if (!validationResult.success) {
        console.error(
          '[Adventure] Scenarios validation failed:',
          validationResult.error.errors,
          'Parsed Data:',
          parsedScenarios
        );
        Sentry.captureException(new Error('AI response validation failed for starting scenarios'), {
          extra: {
            errors: validationResult.error.errors,
            aiResponse: parsedScenarios,
            prompt: prompt,
          },
        });
        return { error: 'Received invalid scenario data structure from AI.' };
      }

      console.log('[Adventure] Successfully generated and validated starting scenarios.');
      return { scenarios: validationResult.data };
    } catch (error) {
      console.error('[Adventure] Error generating starting scenarios:', error);
      Sentry.captureException(error);
      return {
        error:
          error instanceof Error
            ? error.message
            : 'An unknown error occurred while generating scenarios.',
      };
    }
  };
