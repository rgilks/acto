import React, { useState } from 'react';
import { z } from 'zod';
import { StoryChoiceSchema } from '@/lib/domain/schemas';
import { InformationCircleIcon } from '@heroicons/react/24/outline';

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
  const [showDetails, setShowDetails] = useState(false);

  const handleSelectClick = () => {
    if (!isLoading) {
      onClick(scenario);
    }
  };

  const handleInfoClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDetails(!showDetails);
  };

  return (
    <div
      data-testid="scenario-card"
      onClick={handleSelectClick}
      className={`${baseClasses} ${choiceClasses} ${isLoading ? 'opacity-60 cursor-wait' : 'cursor-pointer hover:border-cyan-400/80 hover:shadow-cyan-500/20 hover:shadow-md hover:scale-[1.01]'} relative flex flex-col p-6 rounded-xl transition-all duration-200 ease-in-out`}
    >
      <button
        onClick={handleInfoClick}
        className="absolute top-3 right-3 p-1 text-gray-400 hover:text-cyan-300 transition-colors duration-150 z-10"
        aria-label="Show details"
        data-testid="scenario-info-button"
      >
        <InformationCircleIcon className="h-6 w-6" />
      </button>

      <div className="flex-grow">
        {showDetails ? (
          <div className="transition-all duration-300 ease-in-out animate-fade-in">
            <div className="text-sm mt-2 text-left text-amber-200/70 pt-2">
              {scenario.genre && (
                <p>
                  <strong>Genre:</strong> {scenario.genre}
                </p>
              )}
              {scenario.tone && (
                <p className="mt-1">
                  <strong>Tone:</strong> {scenario.tone}
                </p>
              )}
              {scenario.visualStyle && (
                <p className="mt-1">
                  <strong>Style:</strong> {scenario.visualStyle}
                </p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-lg text-left mr-6">{scenario.text}</p>
        )}
      </div>
    </div>
  );
};

export default ScenarioChoiceButton;
