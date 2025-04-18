import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';

export type ModelProvider = 'openai' | 'google';
export type ModelName = 'gpt-3.5-turbo' | 'gemini-2.0-flash-lite';

export interface ModelConfig {
  provider: ModelProvider;
  name: ModelName;
  displayName: string;
  maxTokens: number;
}

export const MODELS: Record<ModelName, ModelConfig> = {
  'gpt-3.5-turbo': {
    provider: 'openai',
    name: 'gpt-3.5-turbo',
    displayName: 'GPT-3.5 Turbo',
    maxTokens: 500,
  },
  'gemini-2.0-flash-lite': {
    provider: 'google',
    name: 'gemini-2.0-flash-lite',
    displayName: 'Gemini 2.0 Flash-Lite',
    maxTokens: 500,
  },
};

export const LanguageLevels = z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);

const envSchema = z.object({
  OPENAI_API_KEY: z.string().optional(),
  GOOGLE_AI_API_KEY: z.string().optional(),
  ACTIVE_MODEL: z.enum(Object.keys(MODELS) as [ModelName, ...ModelName[]]).optional(),
  OPENROUTER_API_KEY: z.string().optional(),
});

const envVars = envSchema.safeParse(process.env);

if (!envVars.success) {
  console.error(
    '❌ Invalid environment variables:',
    JSON.stringify(envVars.error.format(), null, 4)
  );
}

const validatedEnv = envVars.success ? envVars.data : {};

const activeModelName = validatedEnv.ACTIVE_MODEL;
const useOpenAI = activeModelName
  ? MODELS[activeModelName]?.provider === 'openai'
  : !!validatedEnv.OPENAI_API_KEY;

export const openai =
  useOpenAI && validatedEnv.OPENAI_API_KEY
    ? new OpenAI({ apiKey: validatedEnv.OPENAI_API_KEY })
    : null;

export const getGoogleAIClient = () => {
  const apiKey = validatedEnv.GOOGLE_AI_API_KEY;

  if (!apiKey) {
    console.warn('Warning: GOOGLE_AI_API_KEY is not set or invalid');
  }

  return new GoogleGenAI({ apiKey: apiKey || '' });
};

export const getActiveModel = (): ModelConfig => {
  const envModel = validatedEnv.ACTIVE_MODEL;

  if (envModel && MODELS[envModel]) {
    return MODELS[envModel];
  }

  console.warn(
    `Warning: ACTIVE_MODEL env var is not set or invalid. Falling back to default: ${MODELS['gemini-2.0-flash-lite'].displayName}`
  );
  return MODELS['gemini-2.0-flash-lite'];
};
