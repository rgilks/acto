export const buttonBaseClasses =
  'px-4 py-2 rounded-md border transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800';

export const choiceButtonClasses =
  'w-full text-left justify-start p-4 h-auto border-amber-800/50 bg-gradient-to-br from-amber-100/5 via-amber-100/10 to-amber-100/5 text-amber-100/80 hover:text-amber-100 hover:border-amber-700 hover:from-amber-100/10 hover:to-amber-100/10 focus:ring-amber-500 shadow-md hover:shadow-lg';

export const generateButtonClasses =
  'flex items-center justify-center border-sky-500 text-sky-300 hover:bg-sky-500/10 hover:border-sky-400 hover:text-sky-200 mt-6 px-5 py-2.5 text-base shadow-md hover:shadow-lg';

// Combining base and generate for the specific button in ScenarioListDisplay
export const scenarioGenerateButtonClasses = `${buttonBaseClasses} ${generateButtonClasses}`;
