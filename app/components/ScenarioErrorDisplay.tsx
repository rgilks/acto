import React from 'react';
import { ExclamationTriangleIcon } from '@heroicons/react/24/solid';
import type { ErrorState } from '@/app/store/storyStore';

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

interface ScenarioErrorDisplayProps {
  fetchError: ErrorState;
}

const ScenarioErrorDisplay: React.FC<ScenarioErrorDisplayProps> = ({ fetchError }) => {
  const rateLimitInfo =
    typeof fetchError === 'object' && fetchError !== null ? fetchError.rateLimitError : null;
  const genericMessage = typeof fetchError === 'string' ? fetchError : null;

  return (
    <div
      data-testid="scenario-selector-error"
      className="flex-grow flex flex-col items-center justify-center text-center p-4"
    >
      <ExclamationTriangleIcon className="h-12 w-12 text-red-400 mb-4" />
      {rateLimitInfo ? (
        <>
          <p className="text-xl font-semibold mb-4 text-amber-300">Time for a Break?</p>
          <p className="mb-6 text-gray-400">
            {rateLimitInfo.message} Try again {formatResetTime(rateLimitInfo.resetTimestamp)}?
          </p>
        </>
      ) : (
        <>
          <p className="text-xl font-semibold mb-4 text-red-400">Error Loading Scenarios</p>
          <p className="mb-6 text-gray-400">{genericMessage || 'An unknown error occurred.'}</p>
        </>
      )}
    </div>
  );
};

export default ScenarioErrorDisplay;
