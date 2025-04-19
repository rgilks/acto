'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { z } from 'zod';
import { AdventureChoiceSchema } from '@/lib/domain/schemas';
import { generateStartingScenariosAction } from '../actions/adventure';
import { ArrowPathIcon } from '@heroicons/react/24/solid';

type Scenario = z.infer<typeof AdventureChoiceSchema>;
type SelectorPhase = 'loading' | 'selecting' | 'error';

// Define RateLimitError type locally based on expected structure from actions
interface RateLimitError {
  message: string;
  resetTimestamp: number;
  apiType: 'text'; // Starting scenarios only deal with text limit
}

const SCENARIO_CACHE_KEY = 'adventureGame_startingScenarios';

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
  hardcodedScenarios: Scenario[];
}

const ScenarioSelector: React.FC<ScenarioSelectorProps> = ({
  onScenarioSelect,
  isLoadingSelection,
  hardcodedScenarios,
}) => {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [selectorPhase, setSelectorPhase] = useState<SelectorPhase>('loading');
  const [isUnauthorized, setIsUnauthorized] = useState(false);
  const [rateLimitError, setRateLimitError] = useState<RateLimitError | null>(null);
  const [genericError, setGenericError] = useState<string | null>(null);

  const fetchScenarios = useCallback(async () => {
    setSelectorPhase('loading');
    setIsUnauthorized(false);
    setRateLimitError(null);
    setGenericError(null);

    try {
      const cachedData = sessionStorage.getItem(SCENARIO_CACHE_KEY);
      if (cachedData) {
        const parsedData = JSON.parse(cachedData) as Scenario[];
        setScenarios(parsedData);
        setSelectorPhase('selecting');
        setIsUnauthorized(false);
        return;
      }
    } catch (error) {
      console.error('Error reading scenarios from sessionStorage:', error);
      sessionStorage.removeItem(SCENARIO_CACHE_KEY);
    }

    try {
      const result = await generateStartingScenariosAction();

      if (result.error === 'Unauthorized: User must be logged in.') {
        setScenarios(hardcodedScenarios);
        setSelectorPhase('selecting');
        setIsUnauthorized(true);
        return;
      }

      if (result.rateLimitError) {
        setRateLimitError(result.rateLimitError as RateLimitError);
        setSelectorPhase('error');
        return;
      }

      if (!result.scenarios) {
        throw new Error('No scenarios generated.');
      }

      setScenarios(result.scenarios);
      try {
        sessionStorage.setItem(SCENARIO_CACHE_KEY, JSON.stringify(result.scenarios));
      } catch (error) {
        console.error('Error saving scenarios to sessionStorage:', error);
      }
      setSelectorPhase('selecting');
      setIsUnauthorized(false);
    } catch (err) {
      console.error('Error fetching scenarios:', err);
      const errorMsg = err instanceof Error ? err.message : 'Failed to load starting scenarios.';
      setGenericError(errorMsg);
      setSelectorPhase('error');
    }
  }, [hardcodedScenarios]);

  useEffect(() => {
    void fetchScenarios();
  }, [fetchScenarios]);

  const buttonBaseClasses =
    'px-4 py-2 rounded-md border transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800';
  const choiceButtonClasses =
    'w-full text-left justify-start p-4 h-auto border-amber-800/50 bg-gradient-to-br from-amber-100/5 via-amber-100/10 to-amber-100/5 text-amber-100/80 hover:text-amber-100 hover:border-amber-700 hover:from-amber-100/10 hover:to-amber-100/10 focus:ring-amber-500 shadow-md hover:shadow-lg';

  if (selectorPhase === 'loading') {
    return (
      <div className="flex-grow flex flex-col items-center justify-center">
        <ArrowPathIcon className="h-10 w-10 text-amber-300 animate-spin mb-4" />
        <p className="text-gray-400">Generating starting adventures...</p>
      </div>
    );
  }

  if (selectorPhase === 'error') {
    return (
      <div className="flex-grow flex flex-col items-center justify-center text-center absolute inset-0 bg-slate-800/90 z-10 rounded-lg p-4">
        {isUnauthorized ? (
          <>
            <p className="text-xl font-semibold mb-4 text-amber-100/90">Please Sign In</p>
            <p className="mb-6 text-gray-400">
              Please sign in to join the waiting list. Once approved, you can start your adventure!
            </p>
            {/* Optionally add a sign-in button here */}
          </>
        ) : rateLimitError ? (
          <>
            <p className="text-xl font-semibold mb-4 text-amber-300">Time for a Break?</p>
            <p className="mb-6 text-gray-400">
              You&apos;ve been adventuring hard! Maybe take a short break and come back{' '}
              {/* Add null check for safety, though should always exist if rateLimitError is truthy */}
              {formatResetTime(rateLimitError?.resetTimestamp)}?
            </p>
          </>
        ) : (
          <>
            <p className="text-xl font-semibold mb-4 text-red-400">An Error Occurred</p>
            <p className="mb-6 text-gray-400">
              {genericError || 'An unknown error occurred loading scenarios.'}
            </p>
            <button
              onClick={fetchScenarios}
              className={`${buttonBaseClasses} border-red-500 text-red-300 hover:bg-red-500/20`}
            >
              Try Again
            </button>
          </>
        )}
      </div>
    );
  }

  // selectorPhase === 'selecting'
  return (
    <div className="flex-grow flex flex-col items-center w-full">
      <h2 className="text-2xl font-semibold text-amber-100/90 mb-6 font-serif">
        Choose your starting scenario:
      </h2>
      {isUnauthorized && (
        <p className="text-sm text-amber-300/80 mb-4 -mt-2 text-center max-w-xl">
          You are seeing default scenarios. Please sign in for personalized options and to save your
          progress.
        </p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-4xl">
        {scenarios.map((scenario, index) => (
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
              {scenario.visualStyle && <span className="ml-2">Style: {scenario.visualStyle}</span>}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default ScenarioSelector;
