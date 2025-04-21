'use client';

import React from 'react';
import { z } from 'zod';
import { StoryChoiceSchema } from '@/lib/domain/schemas';
import type { ErrorState } from '@/app/store/storyStore';
import ScenarioLoadingIndicator from './ScenarioLoadingIndicator';
import ScenarioErrorDisplay from './ScenarioErrorDisplay';
import NoScenariosMessage from './NoScenariosMessage';
import ScenarioListDisplay from './ScenarioListDisplay';

type Scenario = z.infer<typeof StoryChoiceSchema>;

// Scenario errors are likely 'text'

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
      return <ScenarioLoadingIndicator />;
    }

    if (fetchError) {
      return <ScenarioErrorDisplay fetchError={fetchError} />;
    }

    if (!scenariosToDisplay || scenariosToDisplay.length === 0) {
      return <NoScenariosMessage />;
    }

    // Display Scenarios using the new component
    return (
      <ScenarioListDisplay
        scenariosToDisplay={scenariosToDisplay}
        onScenarioSelect={onScenarioSelect}
        isLoadingSelection={isLoadingSelection}
        isUserLoggedIn={isUserLoggedIn}
        onFetchNewScenarios={onFetchNewScenarios}
        isLoadingScenarios={isLoadingScenarios}
        buttonBaseClasses={buttonBaseClasses}
        choiceButtonClasses={choiceButtonClasses}
      />
    );
  };

  return <div className="flex-grow flex flex-col w-full items-center">{renderContent()}</div>;
};

export default ScenarioSelector;
