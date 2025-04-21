import React from 'react';
import { z } from 'zod';
import { StoryChoiceSchema } from '@/lib/domain/schemas';

type Scenario = z.infer<typeof StoryChoiceSchema>;

interface ScenarioChoiceButtonProps {
  scenario: Scenario;
  onClick: (scenario: Scenario) => void;
  isLoading: boolean;
  baseClasses: string;
  choiceClasses: string;
}

const ScenarioChoiceButton: React.FC<ScenarioChoiceButtonProps> = ({
  scenario,
  onClick,
  isLoading,
  baseClasses,
  choiceClasses,
}) => {
  return (
    <button
      data-testid="scenario-choice-button"
      onClick={() => {
        onClick(scenario);
      }}
      className={`${baseClasses} ${choiceClasses} ${isLoading ? 'opacity-60 cursor-wait' : ''}`}
      disabled={isLoading}
    >
      <span>{scenario.text}</span>
      <div className="text-xs mt-1 text-amber-200/50">
        {scenario.genre && <span>Genre: {scenario.genre}</span>}
        {scenario.tone && <span className="ml-2">Tone: {scenario.tone}</span>}
        {scenario.visualStyle && <span className="ml-2">Style: {scenario.visualStyle}</span>}
      </div>
    </button>
  );
};

export default ScenarioChoiceButton;
