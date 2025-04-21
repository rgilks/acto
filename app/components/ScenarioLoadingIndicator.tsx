import React from 'react';
import { ArrowPathIcon } from '@heroicons/react/24/solid';

const ScenarioLoadingIndicator: React.FC = () => {
  return (
    <div
      data-testid="scenario-selector-loading"
      className="flex-grow flex flex-col items-center justify-center text-center p-4"
    >
      <ArrowPathIcon className="h-8 w-8 text-gray-400 animate-spin mb-4" />
      <p className="text-gray-400">Generating scenarios...</p>
    </div>
  );
};

export default ScenarioLoadingIndicator;
