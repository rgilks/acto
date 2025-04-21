import React from 'react';
import { z } from 'zod';
import { StoryChoiceSchema } from '@/lib/domain/schemas';
import { ArrowPathIcon } from '@heroicons/react/24/solid';
import ScenarioChoiceButton from './ScenarioChoiceButton';

type Scenario = z.infer<typeof StoryChoiceSchema>;

interface ScenarioListDisplayProps {
  scenariosToDisplay: Scenario[];
  onScenarioSelect: (scenario: Scenario) => void;
  isLoadingSelection: boolean;
  isUserLoggedIn: boolean;
  onFetchNewScenarios: () => void;
  isLoadingScenarios: boolean;
  buttonBaseClasses: string;
  choiceButtonClasses: string;
}

const ScenarioListDisplay: React.FC<ScenarioListDisplayProps> = ({
  scenariosToDisplay,
  onScenarioSelect,
  isLoadingSelection,
  isUserLoggedIn,
  onFetchNewScenarios,
  isLoadingScenarios,
  buttonBaseClasses,
  choiceButtonClasses,
}) => {
  return (
    <div className="flex-grow flex flex-col items-center w-full">
      <h2
        data-testid="scenario-selector-heading"
        className="text-2xl font-semibold text-amber-100/90 mb-4 font-serif"
      >
        Choose a scenario
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl m-4">
        {scenariosToDisplay.map((scenario, index) => (
          <ScenarioChoiceButton
            key={index}
            scenario={scenario}
            onClick={onScenarioSelect}
            isLoading={isLoadingSelection}
            baseClasses={buttonBaseClasses}
            choiceClasses={choiceButtonClasses}
          />
        ))}
      </div>
      {isUserLoggedIn && (
        <button
          onClick={onFetchNewScenarios}
          data-testid="scenario-generate-new-button"
          className={`${buttonBaseClasses} flex items-center justify-center border-sky-500 text-sky-300 hover:bg-sky-500/10 hover:border-sky-400 hover:text-sky-200 mt-6 px-5 py-2.5 text-base shadow-md hover:shadow-lg`}
          disabled={isLoadingScenarios}
        >
          <ArrowPathIcon className={`h-5 w-5 mr-2 ${isLoadingScenarios ? 'animate-spin' : ''}`} />
          {isLoadingScenarios ? 'Generating...' : 'Generate New Scenarios'}
        </button>
      )}
    </div>
  );
};

export default ScenarioListDisplay;
