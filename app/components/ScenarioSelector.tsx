'use client';

import React from 'react';
import { z } from 'zod';
import { AdventureChoiceSchema } from '@/lib/domain/schemas';
import { ArrowPathIcon, ExclamationTriangleIcon } from '@heroicons/react/24/solid';

type Scenario = z.infer<typeof AdventureChoiceSchema>;

// Define RateLimitError and ErrorState types locally based on expected structure from the store
interface RateLimitError {
  message: string;
  resetTimestamp: number;
  apiType: 'text' | 'image' | 'tts'; // Scenario errors are likely 'text'
}
type ErrorState = string | { rateLimitError: RateLimitError } | null;

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

interface ScenarioSelectorProps {
  onScenarioSelect: (scenario: Scenario) => void;
  isLoadingSelection: boolean; // Indicates parent is processing the selection
  scenariosToDisplay: Scenario[] | null;
  isLoadingScenarios: boolean;
  fetchError: ErrorState;
  onFetchNewScenarios: () => void;
  isUserLoggedIn: boolean; // To show specific messages/button
}

const ScenarioSelector: React.FC<ScenarioSelectorProps> = ({
  onScenarioSelect,
  isLoadingSelection,
  scenariosToDisplay,
  isLoadingScenarios,
  fetchError,
  onFetchNewScenarios,
  isUserLoggedIn,
}) => {
  const buttonBaseClasses =
    'px-4 py-2 rounded-md border transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800';
  const choiceButtonClasses =
    'w-full text-left justify-start p-4 h-auto border-amber-800/50 bg-gradient-to-br from-amber-100/5 via-amber-100/10 to-amber-100/5 text-amber-100/80 hover:text-amber-100 hover:border-amber-700 hover:from-amber-100/10 hover:to-amber-100/10 focus:ring-amber-500 shadow-md hover:shadow-lg';

  const renderContent = () => {
    if (isLoadingScenarios) {
      return (
        <div className="flex-grow flex flex-col items-center justify-center">
          <ArrowPathIcon className="h-10 w-10 text-amber-300 animate-spin mb-4" />
          <p className="text-gray-400">Generating starting adventures...</p>
        </div>
      );
    }

    if (fetchError) {
      const rateLimitInfo =
        typeof fetchError === 'object' && fetchError !== null && 'rateLimitError' in fetchError
          ? fetchError.rateLimitError
          : null;
      const genericMessage = typeof fetchError === 'string' ? fetchError : null;

      return (
        <div className="flex-grow flex flex-col items-center justify-center text-center p-4">
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
          {isUserLoggedIn && (
            <button
              onClick={onFetchNewScenarios}
              className={`${buttonBaseClasses} border-red-500 text-red-300 hover:bg-red-500/20`}
              disabled={isLoadingScenarios}
            >
              {isLoadingScenarios ? (
                <ArrowPathIcon className="h-5 w-5 animate-spin" />
              ) : (
                'Try Again'
              )}
            </button>
          )}
        </div>
      );
    }

    if (!scenariosToDisplay || scenariosToDisplay.length === 0) {
      return (
        <div className="flex-grow flex flex-col items-center justify-center text-center p-4">
          <p className="text-xl font-semibold mb-4 text-gray-400">No Scenarios Available</p>
          <p className="mb-6 text-gray-400">
            Could not load any starting scenarios. Please try again later.
          </p>
          {isUserLoggedIn && (
            <button
              onClick={onFetchNewScenarios}
              className={`${buttonBaseClasses} border-amber-500 text-amber-300 hover:bg-amber-500/20`}
              disabled={isLoadingScenarios}
            >
              {isLoadingScenarios ? (
                <ArrowPathIcon className="h-5 w-5 animate-spin" />
              ) : (
                'Fetch New Scenarios'
              )}
            </button>
          )}
        </div>
      );
    }

    // Display Scenarios
    return (
      <div className="flex-grow flex flex-col items-center w-full">
        <h2 className="text-2xl font-semibold text-amber-100/90 mb-4 font-serif">
          Choose your starting scenario:
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-4xl mb-4">
          {scenariosToDisplay.map((scenario, index) => (
            <button
              key={index}
              onClick={() => onScenarioSelect(scenario)}
              className={`${buttonBaseClasses} ${choiceButtonClasses} ${isLoadingSelection ? 'opacity-60 cursor-wait' : ''}`}
              disabled={isLoadingSelection}
            >
              <span>{scenario.text}</span>
              <div className="text-xs mt-1 text-amber-200/50">
                {scenario.genre && <span>Genre: {scenario.genre}</span>}
                {scenario.tone && <span className="ml-2">Tone: {scenario.tone}</span>}
                {scenario.visualStyle && (
                  <span className="ml-2">Style: {scenario.visualStyle}</span>
                )}
              </div>
            </button>
          ))}
        </div>
        {isUserLoggedIn && (
          <button
            onClick={onFetchNewScenarios}
            className={`${buttonBaseClasses} border-sky-600 text-sky-300 hover:bg-sky-500/20 mt-2`}
            disabled={isLoadingScenarios || isLoadingSelection}
          >
            {isLoadingScenarios ? (
              <ArrowPathIcon className="h-5 w-5 animate-spin mx-auto" />
            ) : (
              'Generate New Scenarios'
            )}
          </button>
        )}
      </div>
    );
  };

  return <div className="flex-grow flex flex-col w-full">{renderContent()}</div>;
};

export default ScenarioSelector;
