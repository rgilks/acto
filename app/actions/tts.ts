'use server';

import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import * as Sentry from '@sentry/nextjs';
// Import constant from lib
import { TTS_VOICE_NAME } from '@/lib/constants';
import { getSession } from '@/app/auth';
import { checkTTSRateLimit } from '@/lib/rateLimitSqlite'; // Import TTS rate limit check

// Instantiate the client
// Make sure GOOGLE_APPLICATION_CREDENTIALS is set in your environment
const client = new TextToSpeechClient();

interface SynthesizeSpeechParams {
  text: string;
  voiceName: string | null;
}

// Export the type so it can be imported elsewhere
export interface SynthesizeSpeechResult {
  audioBase64?: string;
  error?: string;
  rateLimitError?: {
    message: string;
    resetTimestamp: number;
  };
}

export const synthesizeSpeechAction = async ({
  text,
  voiceName,
}: SynthesizeSpeechParams): Promise<SynthesizeSpeechResult> => {
  const session = await getSession();
  if (!session?.user) {
    console.warn('[TTS Action] Unauthorized attempt.');
    return { error: 'Unauthorized: User must be logged in.' };
  }

  const ttsLimitCheck = await checkTTSRateLimit();
  if (!ttsLimitCheck.success) {
    console.warn(`[TTS Action] Rate limit exceeded for user. Error: ${ttsLimitCheck.errorMessage}`);
    return {
      rateLimitError: {
        message: ttsLimitCheck.errorMessage ?? 'TTS rate limit exceeded.',
        resetTimestamp: ttsLimitCheck.reset,
      },
    };
  }

  if (!text) {
    return { error: 'No text provided for synthesis.' };
  }

  try {
    // Extract language code from voice name (e.g., "en-US-Wavenet-A" -> "en-US")
    // Fallback if name is null or doesn't fit pattern
    const languageCode = voiceName?.split('-').slice(0, 2).join('-') || 'en-US';

    const request = {
      input: { text: text },
      // Use the provided voice name, or the default constant
      voice: {
        name: voiceName || TTS_VOICE_NAME,
        languageCode: languageCode,
      },
      audioConfig: {
        audioEncoding: 'MP3' as const, // Ensure type safety
      },
    };

    console.log(
      `[TTS Action] Requesting synthesis with voice: ${voiceName || 'Default'}, lang: ${languageCode}`
    );

    // Performs the text-to-speech request
    const [response] = await client.synthesizeSpeech(request);

    if (!response.audioContent) {
      console.error('[TTS Action] No audio content received from Google.');
      return { error: 'TTS synthesis failed: No audio content.' };
    }

    // Convert the audio content to base64
    // Assert as Uint8Array as the Google Cloud API returns bytes
    const audioBase64 = Buffer.from(response.audioContent as Uint8Array).toString('base64');

    console.log('[TTS Action] Synthesis successful.');
    return { audioBase64: audioBase64 };
  } catch (error) {
    console.error('[TTS Action] Google Cloud TTS Error:', error);
    Sentry.captureException(error); // Log error to Sentry
    return { error: error instanceof Error ? error.message : 'TTS synthesis failed.' };
  }
};
