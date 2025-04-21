import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import { z } from 'zod'; // Import Zod

const ServiceAccountCredentialsSchema = z.object({
  type: z.string(),
  project_id: z.string(),
  private_key_id: z.string(),
  private_key: z.string(),
  client_email: z.string().email(),
  client_id: z.string(),
  auth_uri: z.string().url(),
  token_uri: z.string().url(),
  auth_provider_x509_cert_url: z.string().url(),
  client_x509_cert_url: z.string().url(),
  universe_domain: z.string(),
});

let client: TextToSpeechClient | null = null;

export const initializeTTSClient = (): TextToSpeechClient => {
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

    const validationResult = ServiceAccountCredentialsSchema.safeParse(parsedJson);

    if (!validationResult.success) {
      console.error(
        '[TTS Client] Invalid GOOGLE_APP_CREDS_JSON structure or types:',
        validationResult.error.errors
      );
      throw new Error(
        '[TTS Client] Invalid service account credentials structure. Check console for details.'
      );
    }

    const credentials = validationResult.data;

    console.log('[TTS Client] Initializing with credentials from GOOGLE_APP_CREDS_JSON');
    client = new TextToSpeechClient({ credentials });
    return client;
  } catch (error) {
    console.error('[TTS Client] Failed to initialize TextToSpeechClient:', error);
    throw error;
  }
};
