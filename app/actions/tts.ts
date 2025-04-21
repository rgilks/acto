'use server';

import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import { initializeTTSClient } from '@/lib/ttsClient';
import { TTS_VOICE_NAME } from '@/lib/constants';
import { getSession } from '@/app/auth';
import { checkTTSRateLimit } from '@/lib/rateLimitSqlite';

interface SynthesizeSpeechParams {
  text: string;
  voiceName: string | null;
}

export interface SynthesizeSpeechResult {
  audioBase64?: string;
  error?: string;
  rateLimitError?: {
    message: string;
    resetTimestamp: number;
  };
}

async function performSynthesis(
  ttsClient: TextToSpeechClient,
  text: string,
  voiceName: string | null,
  languageCode: string
): Promise<{ audioBase64?: string; error?: string }> {
  try {
    const request = {
      input: { text: text },
      voice: {
        name: voiceName || TTS_VOICE_NAME,
        languageCode: languageCode,
      },
      audioConfig: {
        audioEncoding: 'MP3' as const,
      },
    };

    console.log(
      `[TTS Core] Requesting synthesis with voice: ${voiceName || 'Default'}, lang: ${languageCode}`
    );

    const [response] = await ttsClient.synthesizeSpeech(request);

    if (!response.audioContent) {
      console.error('[TTS Core] No audio content received from Google.');
      return { error: 'TTS synthesis failed: No audio content.' };
    }

    const audioBase64 = Buffer.from(response.audioContent as Uint8Array).toString('base64');
    console.log('[TTS Core] Synthesis successful.');
    return { audioBase64: audioBase64 };
  } catch (error) {
    console.error('[TTS Core] Google Cloud TTS Error:', error);
    return { error: error instanceof Error ? error.message : 'TTS synthesis failed.' };
  }
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
    const ttsClient = initializeTTSClient();
    const languageCode = voiceName?.split('-').slice(0, 2).join('-') || 'en-US';
    const synthesisResult = await performSynthesis(ttsClient, text, voiceName, languageCode);
    return synthesisResult;
  } catch (error) {
    console.error('[TTS Action] Unexpected error during synthesis process:', error);
    return {
      error:
        error instanceof Error ? error.message : 'TTS synthesis failed due to an unexpected error.',
    };
  }
};
