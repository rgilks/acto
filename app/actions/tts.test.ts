import { describe, it, expect, vi, beforeEach } from 'vitest';
import { synthesizeSpeechAction, SynthesizeSpeechResult } from './tts';
import { TTS_VOICE_NAME } from '@/lib/constants';
// Import the modules directly for mocking
import { initializeTTSClient } from '@/lib/ttsClient';
import { getSession } from '@/app/auth';
import { checkTTSRateLimit } from '@/lib/rateLimitSqlite';
import type { TextToSpeechClient } from '@google-cloud/text-to-speech';
import type { Session } from 'next-auth';
import type { RateLimitResult } from '@/lib/rateLimitSqlite';

// Mock dependencies
vi.mock('@/lib/ttsClient', () => ({
  initializeTTSClient: vi.fn(),
}));
vi.mock('@/app/auth', () => ({
  getSession: vi.fn(),
}));
vi.mock('@/lib/rateLimitSqlite', () => ({
  checkTTSRateLimit: vi.fn(),
}));
vi.mock('@/lib/constants', () => ({
  TTS_VOICE_NAME: 'en-US-Standard-C',
}));

// Mock the Google Cloud client itself
const mockSynthesizeSpeech = vi.fn();
const mockTTSClient = {
  synthesizeSpeech: mockSynthesizeSpeech,
};

// --- Test Setup ---
describe('synthesizeSpeechAction', () => {
  const mockText = 'Hello, world!';
  const mockAudioBase64 = Buffer.from('mock audio content').toString('base64');

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();

    // Default mock implementations using imported functions
    vi.mocked(initializeTTSClient).mockReturnValue(mockTTSClient as any as TextToSpeechClient);
    vi.mocked(getSession).mockResolvedValue({
      user: { id: 'test-user' },
      expires: 'test-expires',
    } as Session);
    vi.mocked(checkTTSRateLimit).mockResolvedValue({
      success: true,
      reset: 0,
      limit: 10,
      remaining: 9,
    } as RateLimitResult);
    mockSynthesizeSpeech.mockResolvedValue([{ audioContent: Buffer.from('mock audio content') }]);
  });

  // --- Test Cases ---

  it('should return audioBase64 on successful synthesis with default voice', async () => {
    const result: SynthesizeSpeechResult = await synthesizeSpeechAction({
      text: mockText,
      voiceName: null,
    });

    expect(result.audioBase64).toBe(mockAudioBase64);
    expect(result.error).toBeUndefined();
    expect(result.rateLimitError).toBeUndefined();
    expect(vi.mocked(getSession)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(checkTTSRateLimit)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(initializeTTSClient)).toHaveBeenCalledTimes(1);
    expect(mockSynthesizeSpeech).toHaveBeenCalledWith({
      input: { text: mockText },
      voice: { name: TTS_VOICE_NAME, languageCode: 'en-US' },
      audioConfig: { audioEncoding: 'MP3' },
    });
  });

  it('should return audioBase64 on successful synthesis with a specific voice', async () => {
    const specificVoice = 'de-DE-Standard-F';
    const result: SynthesizeSpeechResult = await synthesizeSpeechAction({
      text: mockText,
      voiceName: specificVoice,
    });

    expect(result.audioBase64).toBe(mockAudioBase64);
    expect(result.error).toBeUndefined();
    expect(result.rateLimitError).toBeUndefined();
    expect(mockSynthesizeSpeech).toHaveBeenCalledWith({
      input: { text: mockText },
      voice: { name: specificVoice, languageCode: 'de-DE' },
      audioConfig: { audioEncoding: 'MP3' },
    });
  });

  it('should return an unauthorized error if user is not logged in', async () => {
    vi.mocked(getSession).mockResolvedValue(null);

    const result: SynthesizeSpeechResult = await synthesizeSpeechAction({
      text: mockText,
      voiceName: null,
    });

    expect(result.error).toBe('Unauthorized: User must be logged in.');
    expect(result.audioBase64).toBeUndefined();
    expect(result.rateLimitError).toBeUndefined();
    expect(vi.mocked(checkTTSRateLimit)).not.toHaveBeenCalled();
    expect(vi.mocked(initializeTTSClient)).not.toHaveBeenCalled();
    expect(mockSynthesizeSpeech).not.toHaveBeenCalled();
  });

  it('should return a rate limit error if rate limit is exceeded', async () => {
    const resetTimestamp = Date.now() + 60000;
    const rateLimitMessage = 'Too many requests';
    vi.mocked(checkTTSRateLimit).mockResolvedValue({
      success: false,
      errorMessage: rateLimitMessage,
      reset: resetTimestamp,
      limit: 10,
      remaining: 0,
    } as RateLimitResult);

    const result: SynthesizeSpeechResult = await synthesizeSpeechAction({
      text: mockText,
      voiceName: null,
    });

    expect(result.rateLimitError).toEqual({
      message: rateLimitMessage,
      resetTimestamp: resetTimestamp,
    });
    expect(result.audioBase64).toBeUndefined();
    expect(result.error).toBeUndefined();
    expect(vi.mocked(initializeTTSClient)).not.toHaveBeenCalled();
    expect(mockSynthesizeSpeech).not.toHaveBeenCalled();
  });

  it('should return an error if no text is provided', async () => {
    const result: SynthesizeSpeechResult = await synthesizeSpeechAction({
      text: '',
      voiceName: null,
    });

    expect(result.error).toBe('No text provided for synthesis.');
    expect(result.audioBase64).toBeUndefined();
    expect(result.rateLimitError).toBeUndefined();
    expect(vi.mocked(initializeTTSClient)).not.toHaveBeenCalled();
    expect(mockSynthesizeSpeech).not.toHaveBeenCalled();
  });

  it('should return an error if Google TTS API returns no audio content', async () => {
    mockSynthesizeSpeech.mockResolvedValue([{ audioContent: null }]);

    const result: SynthesizeSpeechResult = await synthesizeSpeechAction({
      text: mockText,
      voiceName: null,
    });

    expect(result.error).toBe('TTS synthesis failed: No audio content.');
    expect(result.audioBase64).toBeUndefined();
    expect(result.rateLimitError).toBeUndefined();
    expect(mockSynthesizeSpeech).toHaveBeenCalledTimes(1);
  });

  it('should return an error if Google TTS API call fails', async () => {
    const errorMessage = 'Google API Error';
    mockSynthesizeSpeech.mockRejectedValue(new Error(errorMessage));

    const result: SynthesizeSpeechResult = await synthesizeSpeechAction({
      text: mockText,
      voiceName: null,
    });

    expect(result.error).toBe(errorMessage);
    expect(result.audioBase64).toBeUndefined();
    expect(result.rateLimitError).toBeUndefined();
    expect(mockSynthesizeSpeech).toHaveBeenCalledTimes(1);
  });

  it('should return an error if TTS client initialization fails', async () => {
    const initErrorMessage = 'Initialization Failed';
    vi.mocked(initializeTTSClient).mockImplementation(() => {
      throw new Error(initErrorMessage);
    });

    const result: SynthesizeSpeechResult = await synthesizeSpeechAction({
      text: mockText,
      voiceName: null,
    });

    expect(result.error).toBe(initErrorMessage);
    expect(result.audioBase64).toBeUndefined();
    expect(result.rateLimitError).toBeUndefined();
    expect(mockSynthesizeSpeech).not.toHaveBeenCalled();
  });
});
