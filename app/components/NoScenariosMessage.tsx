import React from 'react';

const NoScenariosMessage: React.FC = () => {
  return (
    <div
      data-testid="scenario-selector-no-scenarios"
      className="flex-grow flex flex-col items-center justify-center text-center p-4"
    >
      <p className="text-xl font-semibold mb-4 text-gray-400">No Scenarios Available</p>
      <p className="mb-6 text-gray-400">
        Could not load any starting scenarios. Please try again later.
      </p>
    </div>
  );
};

export default NoScenariosMessage;
