import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateImageWithGemini } from './imageGenerationService';
import { getGoogleAIClient } from '@/lib/modelConfig';
import { checkImageRateLimit } from '@/lib/rateLimitSqlite';

// Mock dependencies
vi.mock('@/lib/modelConfig');
vi.mock('@/lib/rateLimitSqlite');

// Mock the GoogleGenAI client and its methods
const mockGenerateImages = vi.fn();
const mockGetGoogleAIClient = vi.mocked(getGoogleAIClient);
const mockCheckImageRateLimit = vi.mocked(checkImageRateLimit);

describe('generateImageWithGemini', () => {
  const imagePrompt = 'A futuristic cityscape at sunset';
  const mockBase64Data = 'mockImageData';
  const mockDataUri = `data:image/png;base64,${mockBase64Data}`;

  beforeEach(() => {
    // Reset mocks before each test
    vi.resetAllMocks();

    // Setup default mock implementations
    mockGetGoogleAIClient.mockReturnValue({
      models: {
        generateImages: mockGenerateImages,
      },
    } as any);

    mockCheckImageRateLimit.mockResolvedValue({
      success: true,
      limit: 10,
      remaining: 9,
      reset: Date.now() + 3600000, // Add a dummy reset time
    });

    mockGenerateImages.mockResolvedValue({
      generatedImages: [
        {
          image: {
            imageBytes: mockBase64Data,
          },
        },
      ],
    });
  });

  afterEach(() => {
    // Verify mocks were called as expected if needed, or just clear them
    vi.clearAllMocks();
  });

  it('should return a data URI on successful image generation', async () => {
    const result = await generateImageWithGemini(imagePrompt);

    expect(result.error).toBeUndefined();
    expect(result.dataUri).toBe(mockDataUri);
    expect(mockCheckImageRateLimit).toHaveBeenCalledTimes(1);
    expect(mockGetGoogleAIClient).toHaveBeenCalledTimes(1);
    expect(mockGenerateImages).toHaveBeenCalledTimes(1);
    expect(mockGenerateImages).toHaveBeenCalledWith({
      model: 'imagen-3.0-generate-002',
      prompt: `Scene Description: ${imagePrompt}. .`, // Note the double dot when no style details
      config: {
        numberOfImages: 1,
        aspectRatio: '16:9',
      },
    });
  });

  it('should construct the prompt correctly with style details', async () => {
    const visualStyle = 'photorealistic'; // Non-illustrative example
    const genre = 'sci-fi';
    const tone = 'epic';
    const expectedPrompt = `${visualStyle}: Scene Description: ${imagePrompt}. Genre: ${genre}. Tone: ${tone}.`;

    await generateImageWithGemini(imagePrompt, visualStyle, genre, tone);

    expect(mockGenerateImages).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expectedPrompt,
      })
    );

    // Test illustrative style
    const illustrativeStyle = 'watercolor';
    const expectedIllustrativePrompt = `${illustrativeStyle}: ${imagePrompt}. Genre: ${genre}. Tone: ${tone}. illustration, artwork. avoid photorealism, photograph, photo, real life.`;
    await generateImageWithGemini(imagePrompt, illustrativeStyle, genre, tone);
    expect(mockGenerateImages).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expectedIllustrativePrompt,
      })
    );
  });

  it('should construct the prompt correctly with only some style details', async () => {
    const visualStyle = 'low poly'; // Illustrative example
    const expectedPrompt = `${visualStyle}: ${imagePrompt}.   illustration, artwork. avoid photorealism, photograph, photo, real life.`;

    await generateImageWithGemini(imagePrompt, visualStyle, null, null);

    expect(mockGenerateImages).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expectedPrompt,
      })
    );

    // Test non-illustrative
    const nonIllustrativeStyle = 'cinematic';
    const expectedNonIllustrativePrompt = `${nonIllustrativeStyle}: Scene Description: ${imagePrompt}. .`; // Note double dot
    await generateImageWithGemini(imagePrompt, nonIllustrativeStyle, null, null);
    expect(mockGenerateImages).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expectedNonIllustrativePrompt,
      })
    );
  });

  it('should return an error if rate limit is exceeded', async () => {
    const rateLimitError = 'Rate limit exceeded';
    const resetTimestamp = Date.now() + 60000;
    mockCheckImageRateLimit.mockResolvedValue({
      success: false,
      errorMessage: rateLimitError,
      reset: resetTimestamp,
      limit: 10, // Add missing property
      remaining: 0, // Add missing property
    });

    const result = await generateImageWithGemini(imagePrompt);

    expect(result.dataUri).toBeUndefined();
    expect(result.error).toBe(rateLimitError);
    // Use type assertion to bypass optional check in this specific test context
    expect((result as any).rateLimitResetTimestamp).toBe(resetTimestamp);
    expect(mockGetGoogleAIClient).not.toHaveBeenCalled();
    expect(mockGenerateImages).not.toHaveBeenCalled();
  });

  it('should return an error if the API call fails', async () => {
    const apiError = new Error('API failure');
    mockGenerateImages.mockRejectedValue(apiError);

    const result = await generateImageWithGemini(imagePrompt);

    expect(result.dataUri).toBeUndefined();
    expect(result.error).toBe(apiError.message);
    expect(mockCheckImageRateLimit).toHaveBeenCalledTimes(1);
    expect(mockGetGoogleAIClient).toHaveBeenCalledTimes(1);
    expect(mockGenerateImages).toHaveBeenCalledTimes(1);
  });

  it('should return an error if the API response contains no images', async () => {
    mockGenerateImages.mockResolvedValue({ generatedImages: [] });

    const result = await generateImageWithGemini(imagePrompt);

    expect(result.dataUri).toBeUndefined();
    expect(result.error).toBe('No images found in the response from generateImages.');
  });

  it('should return an error if the API response contains no imageBytes', async () => {
    mockGenerateImages.mockResolvedValue({
      generatedImages: [{ image: {} }], // Missing imageBytes
    });

    const result = await generateImageWithGemini(imagePrompt);

    expect(result.dataUri).toBeUndefined();
    expect(result.error).toBe('No imageBytes found in the generateImages response.');
  });

  it('should handle non-Error objects thrown during API call', async () => {
    const nonErrorObject = { message: 'Something weird happened' };
    mockGenerateImages.mockRejectedValue(nonErrorObject);

    const result = await generateImageWithGemini(imagePrompt);

    expect(result.dataUri).toBeUndefined();
    expect(result.error).toBe('Failed to generate image.'); // Default error message
  });
});
