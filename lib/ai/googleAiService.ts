'use server';

import { getGoogleAIClient, ModelConfig } from '@/lib/modelConfig';
import { GoogleGenAI, HarmCategory, HarmBlockThreshold, GenerationConfig } from '@google/genai';

// Define a type for the config overrides
export type AIConfigOverrides = Partial<GenerationConfig>;

export async function callAIForAdventure(
  prompt: string,
  modelConfig: ModelConfig,
  configOverrides?: AIConfigOverrides
): Promise<string> {
  console.log('[AI Service] Calling AI...');

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
    console.log('[AI Service] Using final AI config:', JSON.stringify(finalConfig, null, 2)); // Log the final config

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
        '[AI Service] Failed to extract text from Google AI response:',
        JSON.stringify(result, null, 2)
      );
      throw new Error('No content received from Google AI or failed to extract text.');
    }

    console.log('[AI Service] Received response from Google AI.');
    return text;
  } catch (error) {
    console.error('[AI Service] Google AI error:', error);
    throw error;
  }
}
