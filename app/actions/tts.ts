'use server';

import { TextToSpeechClient } from '@google-cloud/text-to-speech';
// Import constant from lib
import { TTS_VOICE_NAME } from '@/lib/constants';
import { getSession } from '@/app/auth';
import { checkTTSRateLimit } from '@/lib/rateLimitSqlite'; // Import TTS rate limit check

// Interface for expected service account structure
interface ServiceAccountCredentials {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
  universe_domain: string;
}

// Type guard to check if an object matches the ServiceAccountCredentials interface
function isServiceAccountCredentials(obj: unknown): obj is ServiceAccountCredentials {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof (obj as ServiceAccountCredentials).project_id === 'string' &&
    typeof (obj as ServiceAccountCredentials).private_key === 'string' &&
    typeof (obj as ServiceAccountCredentials).client_email === 'string'
    // Add checks for other essential fields if needed
  );
}

let client: TextToSpeechClient | null = null;

const initializeTTSClient = () => {
  if (client) return client;

  try {
    const credsJson = process.env.GOOGLE_APP_CREDS_JSON;
    if (!credsJson) {
      throw new Error('[TTS Client] GOOGLE_APP_CREDS_JSON environment variable not set.');
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(credsJson);
    } catch (parseError) {
      console.error('[TTS Client] Failed to parse GOOGLE_APP_CREDS_JSON:', parseError);
      throw new Error(
        '[TTS Client] Failed to parse service account credentials. Ensure it is valid JSON.'
      );
    }

    // Validate the parsed JSON using the type guard
    if (!isServiceAccountCredentials(parsedJson)) {
      console.error(
        '[TTS Client] Parsed GOOGLE_APP_CREDS_JSON is invalid or missing required fields.'
      );
      throw new Error('[TTS Client] Invalid service account credentials structure.');
    }

    // Now parsedJson is safely typed as ServiceAccountCredentials
    const credentials = parsedJson;

    console.log('[TTS Client] Initializing with credentials from GOOGLE_APP_CREDS_JSON');
    client = new TextToSpeechClient({ credentials });
    return client;
  } catch (error) {
    // Catch errors from initialization or the type guard check
    console.error('[TTS Client] Failed to initialize TextToSpeechClient:', error);
    // Re-throw or handle appropriately - for now, let it bubble up
    throw error;
  }
};

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

    // Ensure client is initialized
    const ttsClient = initializeTTSClient();

    // Performs the text-to-speech request
    const [response] = await ttsClient.synthesizeSpeech(request);

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
    return { error: error instanceof Error ? error.message : 'TTS synthesis failed.' };
  }
};
