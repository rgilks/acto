import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockSynthesizeSpeech = vi.fn();
const mockTextToSpeechClient = vi.fn(() => ({
  synthesizeSpeech: mockSynthesizeSpeech,
}));

vi.mock('@google-cloud/text-to-speech', () => ({
  TextToSpeechClient: mockTextToSpeechClient,
}));

const validCredentials = {
  type: 'service_account',
  project_id: 'test-project',
  private_key_id: 'test-key-id',
  private_key: '-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n',
  client_email: 'test-client@test-project.iam.gserviceaccount.com',
  client_id: '1234567890',
  auth_uri: 'https://accounts.google.com/o/oauth2/auth',
  token_uri: 'https://oauth2.googleapis.com/token',
  auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
  client_x509_cert_url:
    'https://www.googleapis.com/robot/v1/metadata/x509/test-client%40test-project.iam.gserviceaccount.com',
  universe_domain: 'googleapis.com',
};

const validCredentialsJson = JSON.stringify(validCredentials);

const originalEnv = { ...process.env };

describe('initializeTTSClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.resetModules();
  });

  it('should throw an error if GOOGLE_APP_CREDS_JSON is not set', () => {
    delete process.env.GOOGLE_APP_CREDS_JSON;
    return import('./ttsClient').then((module) => {
      expect(() => module.initializeTTSClient()).toThrow(
        '[TTS Client] GOOGLE_APP_CREDS_JSON environment variable not set.'
      );
    });
  });

  it('should throw an error if GOOGLE_APP_CREDS_JSON is invalid JSON', () => {
    process.env.GOOGLE_APP_CREDS_JSON = '{ invalid json';
    return import('./ttsClient').then((module) => {
      expect(() => module.initializeTTSClient()).toThrow(
        '[TTS Client] Failed to parse service account credentials. Ensure it is valid JSON.'
      );
    });
  });

  it('should throw an error if GOOGLE_APP_CREDS_JSON has invalid structure', () => {
    const invalidCreds = { ...validCredentials, project_id: undefined };
    process.env.GOOGLE_APP_CREDS_JSON = JSON.stringify(invalidCreds);
    return import('./ttsClient').then((module) => {
      expect(() => module.initializeTTSClient()).toThrow(
        '[TTS Client] Invalid service account credentials structure. Check console for details.'
      );
      expect(mockTextToSpeechClient).not.toHaveBeenCalled();
    });
  });

  it('should initialize TextToSpeechClient with valid credentials', () => {
    process.env.GOOGLE_APP_CREDS_JSON = validCredentialsJson;
    return import('./ttsClient').then((module) => {
      const client = module.initializeTTSClient();
      expect(client).toBeDefined();
      expect(mockTextToSpeechClient).toHaveBeenCalledTimes(1);
      expect(mockTextToSpeechClient).toHaveBeenCalledWith({ credentials: validCredentials });
    });
  });

  it('should return the cached client instance on subsequent calls', () => {
    process.env.GOOGLE_APP_CREDS_JSON = validCredentialsJson;
    return import('./ttsClient').then((module) => {
      const client1 = module.initializeTTSClient();
      const client2 = module.initializeTTSClient();

      expect(client1).toBe(client2);
      expect(mockTextToSpeechClient).toHaveBeenCalledTimes(1);
    });
  });
});
