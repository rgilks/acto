import type { StoryHistoryItem } from '@/store/adventureStore';

// Define StoryContext based on StoryHistoryItem
type StoryContext = {
  history: StoryHistoryItem[];
};

// Copied from app/actions/adventure.ts
export function buildAdventurePrompt(
  context: StoryContext | undefined,
  initialScenarioText: string | undefined = undefined,
  genre: string | undefined = undefined,
  tone: string | undefined = undefined,
  visualStyle: string | undefined = undefined
): string {
  const history = context?.history ?? [];
  const maxHistoryItems = 5;

  const latestSummary = history.length > 0 ? history[history.length - 1]?.summary : null;

  const initialContextText =
    history.length === 0 && initialScenarioText
      ? initialScenarioText
      : history.length > 0
        ? history[0]?.passage // Use passage from the very first history item
        : null;

  const jsonStructure = `{\n  "passage": "(string) The next part of the story, describing the current situation and outcome of the last choice.",\n  "choices": [ { "text": string }, ... ], /* Array of 3 distinct player choices */\n  "imagePrompt": "(string) A visual description for an image based *only* on the "passage". Describe the scene, reflecting the specified Visual Style: ${visualStyle ?? 'any'}.",
  "updatedSummary": "(string) A brief (1-2 sentence) summary of the entire story up to and including this new "passage"."
}`;

  const initialContextSection = initialContextText
    ? `Initial Scenario Context/Goal: ${initialContextText}`
    : '';

  let adventureStyleSection = 'Adventure Style Hints:\n';
  if (genre) adventureStyleSection += `- Genre: ${genre}\n`;
  if (tone) adventureStyleSection += `- Tone: ${tone}\n`;
  if (visualStyle) adventureStyleSection += `- Visual Style (for image prompts): ${visualStyle}\n`;
  if (!genre && !tone && !visualStyle) adventureStyleSection += '(None specified)\n';

  let recentHistoryText = 'Recent Events:\n';
  if (history.length === 0) {
    recentHistoryText += '(This is the first step after the Initial Scenario Context.)\n';
  } else {
    // Use the actual history passed in context, don't re-fetch or assume structure
    const recentHistory = history.slice(-maxHistoryItems);
    recentHistory.forEach((item, index) => {
      if (index === 0 && history.length > maxHistoryItems) {
        recentHistoryText += `(...earlier events summarized below...)\n`;
      }
      // Ensure item and item.passage exist before accessing
      recentHistoryText += `Previously: ${item.passage}\n`;
      if (item.choiceText) {
        recentHistoryText += `Choice Made: ${item.choiceText}\n`;
      } else if (index === 0 && history.length === 1 && !item.choiceText) {
        // This condition might need review based on how step 0 is handled
        // If step 0 *always* has '(Scenario Selection)' as choiceText, this might not be needed
        // Or, adjust based on actual data structure for step 0/1 transition
        // Let's keep the original logic for now which seemed to work
        recentHistoryText += `(Generated from initial scenario text)\n`;
      }
    });
  }

  const storySummarySection = latestSummary ? `Previous Summary: ${latestSummary}` : '';

  const basePrompt = `You are a storyteller creating an interactive adventure.

**Your Goal:** Write the next part of the story based on the history and summary. Provide 3 distinct choices. Create an image prompt that visually describes the new "passage" reflecting the specified styles. Update the story summary.

**Instructions:**
1.  **Continue the Story:** Write an engaging and descriptive "passage" that flows logically from the "Previous Summary" (for overall context) and the "Recent Events" (for immediate action). Maintain the specified "Adventure Style Hints" (Genre, Tone) in the writing.
2.  **Offer Choices:** Provide exactly 3 distinct "choices" for the player.
3.  **Image Prompt:** Write an "imagePrompt" describing ONLY the scene detailed in the NEW "passage" above. The mood and content of the image prompt should align with the specified Genre and Tone. Do not describe elements from previous steps unless they are explicitly visible in the new passage. Crucially, the prompt must visually match the "passage" and reflect the "Visual Style": ${visualStyle ?? 'any'}.
4.  **Update Summary:** Write a concise "updatedSummary" covering the whole story so far, including the new "passage".
5.  **Output Format:** Respond ONLY with a valid JSON object matching this structure:
${jsonStructure}

**Context for Next Step:**`;

  const promptParts = [
    basePrompt,
    adventureStyleSection,
    history.length <= 1 ? initialContextSection : '', // Only include initial context for first step(s)
    storySummarySection,
    recentHistoryText,
    '\nGenerate the JSON for the next step:',
  ];

  return promptParts.filter(Boolean).join('\n\n');
}
