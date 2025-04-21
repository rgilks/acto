import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { callAIForAdventure, AIConfigOverrides } from './googleAiService';
import { getGoogleAIClient, ModelConfig } from '@/lib/modelConfig';
import { HarmCategory, HarmBlockThreshold } from '@google/genai';

// Mock the modelConfig module using Vitest
vi.mock('@/lib/modelConfig', () => ({
  getGoogleAIClient: vi.fn(),
  // Remove the mock ModelName object, it's just a type
}));

// Mock the @google/genai module parts used (if necessary, but mocking getGoogleAIClient might be enough)
const mockGenerateContent = vi.fn();
const mockGoogleGenAIInstance = {
  models: {
    generateContent: mockGenerateContent,
  },
};

// Mock implementation for getGoogleAIClient using Vitest
(getGoogleAIClient as Mock).mockReturnValue(mockGoogleGenAIInstance);

describe('callAIForAdventure', () => {
  const mockPrompt = 'Test prompt';
  const mockModelConfig: ModelConfig = {
    provider: 'google',
    name: 'gemini-2.0-flash',
    displayName: 'Gemini 2.0 Flash Mock',
    maxTokens: 500,
  };
  const baseConfig = {
    temperature: 1.0,
    topP: 0.95,
    topK: 40,
    frequencyPenalty: 0.3,
    presencePenalty: 0.6,
    candidateCount: 1,
    maxOutputTokens: 900,
  };
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

  beforeEach(() => {
    // Reset mocks before each test using Vitest
    vi.clearAllMocks();
    // Setup default mock implementation for successful response
    mockGenerateContent.mockResolvedValue({ text: 'Test AI response' });
  });

  it('should call the Google AI client with the correct parameters and return the response text', async () => {
    const expectedRequest = {
      model: mockModelConfig.name,
      contents: [{ role: 'user', parts: [{ text: mockPrompt }] }],
      generationConfig: baseConfig,
      safetySettings: safetySettings,
    };

    const response = await callAIForAdventure(mockPrompt, mockModelConfig);

    expect(getGoogleAIClient).toHaveBeenCalledTimes(1);
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    expect(mockGenerateContent).toHaveBeenCalledWith(expectedRequest);
    expect(response).toBe('Test AI response');
  });

  it('should merge config overrides with the base config', async () => {
    const overrides: AIConfigOverrides = {
      temperature: 0.5,
      maxOutputTokens: 500,
    };
    const expectedMergedConfig = { ...baseConfig, ...overrides };
    const expectedRequest = {
      model: mockModelConfig.name,
      contents: [{ role: 'user', parts: [{ text: mockPrompt }] }],
      generationConfig: expectedMergedConfig,
      safetySettings: safetySettings,
    };

    await callAIForAdventure(mockPrompt, mockModelConfig, overrides);

    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    expect(mockGenerateContent).toHaveBeenCalledWith(expectedRequest);
  });

  it('should throw an error if the AI response has no text', async () => {
    mockGenerateContent.mockResolvedValue({}); // Simulate response with no text property

    await expect(callAIForAdventure(mockPrompt, mockModelConfig)).rejects.toThrow(
      'No content received from Google AI or failed to extract text.'
    );

    expect(getGoogleAIClient).toHaveBeenCalledTimes(1);
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });

  it('should throw an error if the Google AI client call fails', async () => {
    const testError = new Error('Google AI API error');
    mockGenerateContent.mockRejectedValue(testError); // Simulate API error

    await expect(callAIForAdventure(mockPrompt, mockModelConfig)).rejects.toThrow(testError);

    expect(getGoogleAIClient).toHaveBeenCalledTimes(1);
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });

  it('should log the final config being used', async () => {
    // Use vi.spyOn for Vitest
    const consoleSpy = vi.spyOn(console, 'log');
    const overrides: AIConfigOverrides = { temperature: 0.7 };
    const finalConfig = { ...baseConfig, ...overrides };

    await callAIForAdventure(mockPrompt, mockModelConfig, overrides);

    expect(consoleSpy).toHaveBeenCalledWith(
      '[AI Service] Using final AI config:',
      JSON.stringify(finalConfig, null, 2)
    );
    consoleSpy.mockRestore(); // Clean up the spy
  });
});
