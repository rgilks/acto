import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';

export type ModelProvider = 'google';
export type ModelName = 'gemini-2.0-flash' | 'gemini-2.0-flash-lite' | 'gemini-2.5-flash-preview-04-17';

export interface ModelConfig {
  provider: ModelProvider;
  name: ModelName;
  displayName: string;
  maxTokens: number;
}

export const MODELS: Record<ModelName, ModelConfig> = {
  'gemini-2.0-flash-lite': {
    provider: 'google',
    name: 'gemini-2.0-flash-lite',
    displayName: 'Gemini 2.0 Flash-Lite',
    maxTokens: 500,
  },
  'gemini-2.0-flash': {
    provider: 'google',
    name: 'gemini-2.0-flash',
    displayName: 'Gemini 2.0 Flash',
    maxTokens: 500,
  },
  'gemini-2.5-flash-preview-04-17': {
    provider: 'google',
    name: 'gemini-2.5-flash-preview-04-17',
    displayName: 'Gemini 2.5 Flash',
    maxTokens: 500,
  },
};

export const LanguageLevels = z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);

// Keep schema definition for potential other uses (like OpenRouter)
const envSchema = z.object({
  // GOOGLE_AI_API_KEY is now read directly in getGoogleAIClient
  // GOOGLE_AI_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
});

// Parse only relevant env vars if needed elsewhere
const envVars = envSchema.safeParse(process.env);

if (!envVars.success) {
  console.error(
    '❌ Invalid environment variables for non-Google keys:',
    JSON.stringify(envVars.error.format(), null, 4)
  );
}

// const validatedEnv = envVars.success ? envVars.data : {}; // Removed as GOOGLE_AI_API_KEY usage was removed

// --- Lazy Client Initialization ---
let genAIClient: GoogleGenAI | null = null;

export const getGoogleAIClient = (): GoogleGenAI => {
  // Return existing client if already initialized
  if (genAIClient) {
    return genAIClient;
  }

  // Read API key from environment at runtime
  const apiKey = process.env.GOOGLE_AI_API_KEY;

  if (!apiKey) {
    const errorMsg =
      '[GoogleAI Client] CRITICAL: GOOGLE_AI_API_KEY environment variable is not set. Cannot initialize client.';
    console.error(errorMsg);
    // Throw an error to prevent proceeding without a key
    throw new Error(errorMsg);
  }

  console.log('[GoogleAI Client] Initializing GoogleGenAI client...');
  try {
    genAIClient = new GoogleGenAI({ apiKey });
    return genAIClient;
  } catch (error) {
    console.error('[GoogleAI Client] Failed to initialize GoogleGenAI client:', error);
    // Re-throw the error to indicate failure
    throw error;
  }
};

export const getActiveModel = (): ModelConfig => {
  return MODELS['gemini-2.5-flash-preview-04-17'];
};
