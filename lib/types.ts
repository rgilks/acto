export interface RateLimitError {
  message: string;
  resetTimestamp: number;
  apiType: 'text' | 'image' | 'tts'; // Keep apiType as defined in the store
}

// Add other shared types here as needed
