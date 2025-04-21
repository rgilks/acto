import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateScenariosAction } from './generateScenarios';
import * as auth from '@/app/auth';
import * as rateLimit from '@/lib/rateLimitSqlite';
import * as modelConfig from '@/lib/modelConfig';
import * as promptUtils from '@/lib/promptUtils';
import * as aiService from '@/lib/ai/googleAiService';
import { Session } from 'next-auth';
import { RateLimitResult } from '@/lib/rateLimitSqlite';
import { ModelConfig } from '@/lib/modelConfig';

// Mock dependencies
vi.mock('@/app/auth');
vi.mock('@/lib/rateLimitSqlite');
vi.mock('@/lib/modelConfig');
vi.mock('@/lib/promptUtils');
vi.mock('@/lib/ai/googleAiService');

// --- Mock Data ---
const mockSession: Session = {
  user: {
    id: 'test-user-id',
    dbId: 123,
    name: 'Test User',
    email: 'test@example.com',
    image: null,
    isAdmin: false,
    provider: 'credentials',
  },
  expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Required by Session type
};
const mockNoSession = null;

const mockRateLimitSuccess: RateLimitResult = {
  success: true,
  limit: 100,
  remaining: 99,
  reset: Date.now() + 1000 * 60 * 60, // Example reset time
};

const mockRateLimitFailure: RateLimitResult = {
  success: false,
  limit: 100,
  remaining: 0,
  reset: Date.now() + 1000 * 60,
  errorType: 'RateLimitExceeded',
  errorMessage: 'Rate limit exceeded',
};

const mockModelConfig: ModelConfig = {
  provider: 'google',
  name: 'gemini-2.0-flash',
  displayName: 'Gemini 2.0 Flash',
  maxTokens: 500,
};

const mockPrompt = 'Test prompt';

const mockValidAIScenarios = [
  { text: 'Scenario 1 Text' },
  { text: 'Scenario 2 Text', genre: 'Fantasy', tone: 'Epic' }, // Example with optional fields
];
const mockValidAIResponse = JSON.stringify(mockValidAIScenarios);
const mockInvalidAIResponse = 'This is not JSON';
const mockInvalidStructureAIResponse = JSON.stringify([{ name: 'Wrong Field' }]);
// --- End Mock Data ---

describe('generateScenariosAction', () => {
  beforeEach(() => {
    vi.resetAllMocks();

    // Setup default successful mocks (using specific types)
    vi.mocked(auth.getSession).mockResolvedValue(mockSession);
    vi.mocked(rateLimit.checkTextRateLimit).mockResolvedValue(mockRateLimitSuccess);
    vi.mocked(modelConfig.getActiveModel).mockReturnValue(mockModelConfig);
    vi.mocked(promptUtils.buildScenariosPrompt).mockReturnValue(mockPrompt);
    vi.mocked(aiService.callAIForStory).mockResolvedValue(mockValidAIResponse);

    // Mock console methods
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return scenarios successfully when all checks pass', async () => {
    const result = await generateScenariosAction();

    expect(auth.getSession).toHaveBeenCalledTimes(1);
    expect(rateLimit.checkTextRateLimit).toHaveBeenCalledTimes(1);
    expect(modelConfig.getActiveModel).toHaveBeenCalledTimes(1);
    expect(promptUtils.buildScenariosPrompt).toHaveBeenCalledTimes(1);
    expect(aiService.callAIForStory).toHaveBeenCalledWith(
      mockPrompt,
      mockModelConfig,
      expect.objectContaining({ temperature: 1.0 }) // Check overrides
    );
    expect(result.scenarios).toEqual(mockValidAIScenarios);
    expect(result.error).toBeUndefined();
    expect(result.rateLimitError).toBeUndefined();
  });

  it('should handle AI response wrapped in markdown code blocks', async () => {
    const markdownResponse = `\`\`\`json\n${mockValidAIResponse}\n\`\`\``;
    vi.mocked(aiService.callAIForStory).mockResolvedValue(markdownResponse);

    const result = await generateScenariosAction();

    expect(result.scenarios).toEqual(mockValidAIScenarios);
    expect(result.error).toBeUndefined();
  });

  it('should return error if user is not authenticated', async () => {
    vi.mocked(auth.getSession).mockResolvedValue(mockNoSession);

    const result = await generateScenariosAction();

    expect(result.error).toBe('User not authenticated.');
    expect(result.scenarios).toBeUndefined();
    expect(rateLimit.checkTextRateLimit).not.toHaveBeenCalled();
    expect(aiService.callAIForStory).not.toHaveBeenCalled();
  });

  it('should return rate limit error if rate limit is exceeded', async () => {
    vi.mocked(rateLimit.checkTextRateLimit).mockResolvedValue(mockRateLimitFailure);

    const result = await generateScenariosAction();

    expect(result.error).toBe(mockRateLimitFailure.errorMessage);
    expect(result.rateLimitError).toEqual({
      message: mockRateLimitFailure.errorMessage,
      resetTimestamp: mockRateLimitFailure.reset,
      apiType: 'text',
    });
    expect(result.scenarios).toBeUndefined();
    expect(aiService.callAIForStory).not.toHaveBeenCalled();
  });

  it('should return error if AI call fails', async () => {
    const aiError = new Error('AI service unavailable');
    vi.mocked(aiService.callAIForStory).mockRejectedValue(aiError);

    const result = await generateScenariosAction();

    expect(result.error).toBe(aiError.message);
    expect(result.scenarios).toBeUndefined();
  });

  it('should return error if AI response is not valid JSON', async () => {
    vi.mocked(aiService.callAIForStory).mockResolvedValue(mockInvalidAIResponse);

    const result = await generateScenariosAction();

    expect(result.error).toMatch(/Could not find valid JSON array delimiters/);
    expect(result.scenarios).toBeUndefined();
  });

  it('should return error if AI response JSON structure is invalid (missing delimiters)', async () => {
    const missingDelimitersResponse = '{"title": "Scenario 1", "description": "Desc 1"}'; // Missing []
    vi.mocked(aiService.callAIForStory).mockResolvedValue(missingDelimitersResponse);

    const result = await generateScenariosAction();

    expect(result.error).toMatch(/Could not find valid JSON array delimiters/);
    expect(result.scenarios).toBeUndefined();
  });

  it('should return error if AI response fails Zod validation', async () => {
    vi.mocked(aiService.callAIForStory).mockResolvedValue(mockInvalidStructureAIResponse);

    const result = await generateScenariosAction();

    expect(result.error).toBe('Received invalid scenario data structure from AI.');
    expect(result.scenarios).toBeUndefined();
  });

  it('should return a generic error for unknown errors', async () => {
    const unknownError = { message: 'Something weird happened' }; // Not an instance of Error
    vi.mocked(aiService.callAIForStory).mockRejectedValue(unknownError);

    const result = await generateScenariosAction();

    expect(result.error).toBe('An unknown error occurred while generating scenarios.');
    expect(result.scenarios).toBeUndefined();
  });
});
