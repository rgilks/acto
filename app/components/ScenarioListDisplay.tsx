import React from 'react';
import { z } from 'zod';
import { StoryChoiceSchema } from '@/lib/domain/schemas';
import { ArrowPathIcon } from '@heroicons/react/24/solid';
import ScenarioChoiceButton from './ScenarioChoiceButton';
import { scenarioGenerateButtonClasses } from '@/app/styles/buttonStyles';

type Scenario = z.infer<typeof StoryChoiceSchema>;

interface ScenarioListDisplayProps {
  scenariosToDisplay: Scenario[];
  onScenarioSelect: (scenario: Scenario) => void;
  isLoadingSelection: boolean;
  isUserLoggedIn: boolean;
  onFetchNewScenarios: () => void;
  isLoadingScenarios: boolean;
  choiceButtonClasses: string;
}

const ScenarioListDisplay: React.FC<ScenarioListDisplayProps> = ({
  scenariosToDisplay,
  onScenarioSelect,
  isLoadingSelection,
  isUserLoggedIn,
  onFetchNewScenarios,
  isLoadingScenarios,
  choiceButtonClasses,
}) => {
  return (
    <div className="flex-grow flex flex-col items-center w-full">
      <h2
        data-testid="scenario-selector-heading"
        className="text-3xl font-semibold mb-8 font-serif bg-gradient-to-r from-amber-200 via-yellow-300 to-amber-200 bg-clip-text text-transparent"
      >
        Choose a scenario
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl w-full px-4">
        {scenariosToDisplay.map((scenario, index) => (
          <ScenarioChoiceButton
            key={index}
            scenario={scenario}
            onClick={onScenarioSelect}
            isLoading={isLoadingSelection}
            baseClasses={scenarioGenerateButtonClasses}
            choiceClasses={choiceButtonClasses}
          />
        ))}
      </div>
      {isUserLoggedIn && (
        <button
          onClick={onFetchNewScenarios}
          data-testid="scenario-generate-new-button"
          className={`${scenarioGenerateButtonClasses} font-semibold transition-all duration-150 ease-in-out mt-8 mb-4 text-lg px-6 py-3 ${isLoadingScenarios ? 'opacity-70 cursor-wait' : ''}`}
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
