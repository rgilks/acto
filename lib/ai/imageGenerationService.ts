'use server';

import { getGoogleAIClient } from '@/lib/modelConfig';
import { GoogleGenAI } from '@google/genai';
import { checkImageRateLimit } from '@/lib/rateLimitSqlite';

export async function generateImageWithGemini(
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
      `[Image Service] Rate limit exceeded for user. Error: ${imageLimitCheck.errorMessage}`
    );
    return {
      dataUri: undefined,
      error: imageLimitCheck.errorMessage ?? 'Image generation rate limit exceeded.',
      rateLimitResetTimestamp: imageLimitCheck.reset,
    };
  }

  const illustrativeKeywords = [
    'painting',
    'sketch',
    'anime',
    'cartoon',
    'illustration',
    'pixel art',
    'watercolor',
    'comic',
    'drawing',
    'graphic',
    'line art',
    'cel shaded',
    'vector',
    'art nouveau',
    'art deco',
    'impressionist',
    'cubist',
    'surrealist',
    'abstract',
    'charcoal',
    'ink',
    'low poly',
    'claymation',
    'manga',
  ];

  const lowerVisualStyle = visualStyle?.toLowerCase() || '';
  const isIllustrative = illustrativeKeywords.some((keyword) => lowerVisualStyle.includes(keyword));

  let finalImagePrompt = '';

  if (isIllustrative && visualStyle) {
    finalImagePrompt = `${visualStyle}: ${imagePrompt}. ${genre ? `Genre: ${genre}.` : ''} ${tone ? `Tone: ${tone}.` : ''} illustration, artwork. avoid photorealism, photograph, photo, real life.`;
  } else {
    const stylePrefix = visualStyle ? `${visualStyle}: ` : '';
    const details = [genre ? `Genre: ${genre}` : null, tone ? `Tone: ${tone}` : null]
      .filter(Boolean)
      .join('. ');
    finalImagePrompt = `${stylePrefix}Scene Description: ${imagePrompt}. ${details}.`;
  }

  console.log('[Image Service] Sending final prompt to Imagen API:', finalImagePrompt);

  try {
    const genAI: GoogleGenAI = getGoogleAIClient();

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
        '[Image Service] No images generated or invalid response structure:',
        JSON.stringify(result, null, 2)
      );
      throw new Error('No images found in the response from generateImages.');
    }

    const image = result.generatedImages[0];

    if (image.image?.imageBytes) {
      const base64Data = image.image.imageBytes;
      const mimeType = 'image/png';
      const dataUri = `data:${mimeType};base64,${base64Data}`;
      console.log('[Image Service] Generated Image as Data URI via @google/genai SDK.');
      return { dataUri: dataUri, error: undefined };
    } else {
      console.error(
        '[Image Service] No imageBytes found in the generated image response part:',
        JSON.stringify(image, null, 2)
      );
      throw new Error('No imageBytes found in the generateImages response.');
    }
  } catch (error) {
    console.error('[Image Service] Failed to generate image via @google/genai SDK:', error);
    return {
      dataUri: undefined,
      error: error instanceof Error ? error.message : 'Failed to generate image.',
    };
  }
}
