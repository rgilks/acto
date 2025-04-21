import React from 'react';
import { type StoryChoice } from '@/lib/domain/schemas'; // Assuming StoryChoice is exported

// Re-define needed constants locally or pass as props if preferred
const buttonBaseClasses =
  'px-4 py-2 rounded-md border transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800';
const choiceButtonClasses =
  'w-full text-left justify-start p-2 text-sm sm:p-3 sm:text-base md:p-5 md:text-xl lg:p-7 lg:text-2xl xl:p-10 xl:text-4xl border-amber-800/50 bg-gradient-to-br from-amber-100/5 via-amber-100/10 to-amber-100/5 text-amber-100/80 shadow-[0_0_10px_rgba(252,211,77,0.3)] hover:shadow-[0_0_15px_rgba(252,211,77,0.5)] hover:text-amber-100 hover:border-amber-700 hover:from-amber-100/10 hover:to-amber-100/10 focus:ring-amber-500 flex items-center';

interface StoryChoicesProps {
  choices: StoryChoice[];
  onChoiceClick: (choice: StoryChoice, index: number) => void;
  isNodeLoading: boolean; // Keep both for clarity, maybe rename later
  clickedChoiceIndex: number | null;
  focusedChoiceIndex: number | null;
  showChoices: boolean;
}

const StoryChoices: React.FC<StoryChoicesProps> = ({
  choices,
  onChoiceClick,
  isNodeLoading, // Specific loading state for the next node after a choice
  clickedChoiceIndex,
  focusedChoiceIndex,
  showChoices,
}) => {
  return (
    <div
      className={`
        absolute bottom-0 left-0 right-0 p-2 pt-10 sm:p-3 sm:pt-12 md:p-4 md:pt-16 z-10
        bg-gradient-to-t from-black/80 via-black/60 to-transparent backdrop-blur-sm
        transition-opacity ease-in-out [transition-duration:2000ms]
        ${showChoices ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}
      `}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3 w-full">
        {choices.map((choice, index) => {
          const isClicked = index === clickedChoiceIndex;
          // Disable buttons if the node is currently loading after a choice was made
          const isDisabled = isNodeLoading;
          const isLoadingChoice = isNodeLoading && isClicked;
          const isFocused = index === focusedChoiceIndex;

          let currentChoiceClasses = `${buttonBaseClasses} ${choiceButtonClasses}`;
          if (isDisabled && !isLoadingChoice) {
            currentChoiceClasses += ' opacity-50 cursor-not-allowed';
          }
          if (isLoadingChoice) {
            currentChoiceClasses = currentChoiceClasses
              .replace(/shadow-\[.*?\]]/g, '')
              .replace(/hover:shadow-\[.*?\]]/g, '');
            currentChoiceClasses += ' border-amber-500 bg-amber-100/20 animate-pulse-glow';
          }
          if (isFocused && !isLoadingChoice) {
            currentChoiceClasses += ' ring-2 ring-offset-2 ring-offset-black/50 ring-amber-300/80';
          }

          return (
            <button
              key={index}
              onClick={() => {
                onChoiceClick(choice, index);
              }}
              className={currentChoiceClasses}
              disabled={isDisabled} // Disable if node is loading
              data-testid={`choice-button-${index}`}
            >
              <span>{choice.text}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default StoryChoices;
