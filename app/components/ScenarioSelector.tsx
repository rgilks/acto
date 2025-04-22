'use client';

import React from 'react';
import { z } from 'zod';
import { StoryChoiceSchema } from '@/lib/domain/schemas';
import type { ErrorState } from '@/app/store/storyStore';
import ScenarioLoadingIndicator from './ScenarioLoadingIndicator';
import ScenarioErrorDisplay from './ScenarioErrorDisplay';
import NoScenariosMessage from './NoScenariosMessage';
import ScenarioListDisplay from './ScenarioListDisplay';
import { choiceButtonClasses } from '@/app/styles/buttonStyles';

type Scenario = z.infer<typeof StoryChoiceSchema>;

interface ScenarioSelectorProps {
  onScenarioSelect: (scenario: Scenario) => void;
  isLoadingSelection: boolean;
  scenariosToDisplay: Scenario[] | null;
  isLoadingScenarios: boolean;
  fetchError: ErrorState;
  onFetchNewScenarios: () => void;
  isUserLoggedIn: boolean;
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

    return (
      <ScenarioListDisplay
        scenariosToDisplay={scenariosToDisplay}
        onScenarioSelect={onScenarioSelect}
        isLoadingSelection={isLoadingSelection}
        isUserLoggedIn={isUserLoggedIn}
        onFetchNewScenarios={onFetchNewScenarios}
        isLoadingScenarios={isLoadingScenarios}
        choiceButtonClasses={choiceButtonClasses}
      />
    );
  };

  return <div className="flex-grow flex flex-col w-full items-center p-4">{renderContent()}</div>;
};

export default ScenarioSelector;
