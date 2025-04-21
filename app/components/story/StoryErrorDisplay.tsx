import React from 'react';
import { ArrowPathIcon } from '@heroicons/react/24/solid';
import { type ErrorState } from '@/store/storyStore';
import { type RateLimitError } from '@/lib/types';

// Helper function moved here
function formatResetTime(timestamp: number): string {
  if (!timestamp) return 'an unknown time';
  const now = Date.now();
  const resetDate = new Date(timestamp);
  const diffSeconds = Math.round((timestamp - now) / 1000);

  if (diffSeconds <= 0) return 'shortly';
  if (diffSeconds < 60) return `in ${diffSeconds} second${diffSeconds > 1 ? 's' : ''}`;
  if (diffSeconds < 3600) {
    const minutes = Math.ceil(diffSeconds / 60);
    return `in about ${minutes} minute${minutes > 1 ? 's' : ''}`;
  }
  return `at ${resetDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

interface StoryErrorDisplayProps {
  error: ErrorState | { rateLimitError: RateLimitError } | null;
  onRestart: () => void;
}

const StoryErrorDisplay: React.FC<StoryErrorDisplayProps> = ({ error, onRestart }) => {
  if (!error) {
    return null;
  }

  // Rate Limit Error
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (typeof error === 'object' && error?.rateLimitError) {
    const rateLimitInfo = error.rateLimitError;
    const resetTime = formatResetTime(rateLimitInfo.resetTimestamp);
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-4">
        <h2 className="text-2xl font-bold text-red-500 mb-4">Rate Limit Reached</h2>
        <p className="mb-4">{rateLimitInfo.message}</p>
        <p className="text-sm text-gray-400 mb-6">
          Please try again {resetTime}. You can continue playing then!
        </p>
        <button
          onClick={onRestart}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white flex items-center"
        >
          <ArrowPathIcon className="h-5 w-5 mr-2" />
          Start Over
        </button>
      </div>
    );
  }

  // Re-add the AI Response Format error block as it seems ErrorState CAN be this string
  // Linter rule might be incorrect or too aggressive here.
  if (error === 'AI_RESPONSE_FORMAT_ERROR') {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-4">
        <h2 className="text-2xl font-bold text-yellow-400 mb-4">Storyteller Hiccup</h2>
        <p className="mb-6 text-gray-300">
          The storyteller seems to have gotten a bit confused. Please try starting over.
        </p>
        <button
          onClick={onRestart}
          className="mt-4 text-sm text-gray-400 hover:text-white underline"
        >
          Start Over
        </button>
      </div>
    );
  }

  // Generic Error Catch-all
  if (typeof error === 'string') {
    let friendlyMessage = 'Something went wrong. Please try starting over.';
    if (error === 'Failed to fetch') {
      friendlyMessage =
        'Could not connect to the server. Please check your connection or click Start Over.';
    }

    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-4">
        <h2 className="text-2xl font-bold text-orange-400 mb-4">Oops! Something Went Wrong</h2>
        <p className="mb-6 text-gray-300">{friendlyMessage}</p>
        <button
          onClick={onRestart}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white flex items-center"
        >
          <ArrowPathIcon className="h-5 w-5 mr-2" />
          Start Over
        </button>
      </div>
    );
  }

  // Should not be reached if error prop is typed correctly, but good fallback
  console.warn('Unknown error type received in StoryErrorDisplay:', error);
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-4">
      <h2 className="text-2xl font-bold text-orange-400 mb-4">Oops! An Unknown Error Occurred</h2>
      <button
        onClick={onRestart}
        className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white flex items-center"
      >
        <ArrowPathIcon className="h-5 w-5 mr-2" />
        Start Over
      </button>
    </div>
  );
};

export default StoryErrorDisplay;
