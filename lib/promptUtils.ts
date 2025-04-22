import type { StoryHistoryItem } from '@/store/storyStore';

// Define StoryContext based on StoryHistoryItem
type StoryContext = {
  history: StoryHistoryItem[];
};

// Copied from app/actions/story.ts
export function buildStoryPrompt(
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

  // Define the structure as a JS object
  const structureObject = {
    passage:
      '(string) The next part of the story, describing the current situation and outcome of the last choice.',
    choices: [{ text: '(string)' }, { text: '(string)' }, { text: '(string)' }], // Array of 3 distinct player choices
    imagePrompt: `(string) A visual description for an image based *only* on the "passage". Describe the scene, clearly and strongly reflecting the specified Visual Style: ${visualStyle ?? 'any'}. Emphasize the unique characteristics of this style.`,
    updatedSummary:
      '(string) A brief (1-2 sentence) summary of the entire story up to and including this new "passage".',
  };
  // Stringify the object for the prompt
  const jsonStructure = JSON.stringify(structureObject, null, 2);

  const initialContextSection = initialContextText
    ? `Initial Scenario Context/Goal: ${initialContextText}`
    : '';

  let storyStyleSection = 'Story Style Hints:\n';
  if (genre) storyStyleSection += `- Genre: ${genre}\n`;
  if (tone) storyStyleSection += `- Tone: ${tone}\n`;
  if (visualStyle) storyStyleSection += `- Visual Style (for image prompts): ${visualStyle}\n`;
  if (!genre && !tone && !visualStyle) storyStyleSection += '(None specified)\n';

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

  const basePrompt = `You are a storyteller creating an interactive story.

**Your Goal:** Write the next part of the story based on the history and summary. Provide 3 distinct choices. Create an image prompt that visually describes the new "passage" reflecting the specified styles. Update the story summary.

**Instructions:**
1.  **Continue the Story:** Write an engaging and descriptive "passage" that flows logically from the "Previous Summary" (for overall context) and the "Recent Events" (for immediate action). Maintain the specified "Story Style Hints" (Genre, Tone) in the writing. **Keep the passage concise, ideally 2-3 sentences.**
2.  **Offer Choices:** Provide exactly 3 distinct "choices" for the player.
3.  **Image Prompt:** Write an "imagePrompt" describing ONLY the scene detailed in the NEW "passage" above. The mood and content of the image prompt should align with the specified Genre and Tone. Do not describe elements from previous steps unless they are explicitly visible in the new passage. Crucially, the prompt must visually match the "passage" and strongly reflect the distinct characteristics of the "Visual Style": ${visualStyle ?? 'any'}.
4.  **Update Summary:** Write a concise "updatedSummary" covering the whole story so far, including the new "passage".
5.  **Output Format:** Respond ONLY with a valid JSON object matching this structure:
${jsonStructure}

**Context for Next Step:**`;

  const promptParts = [
    basePrompt,
    storyStyleSection,
    history.length <= 1 ? initialContextSection : '', // Only include initial context for first step(s)
    storySummarySection,
    recentHistoryText,
    '\nGenerate the JSON for the next step:',
  ];

  return promptParts.filter(Boolean).join('\n\n');
}

export function buildScenariosPrompt(): string {
  // Define the structure as a JS object array
  const structureObject = [
    {
      text: '(string) Engaging starting scenario text (1-2 sentences max).',
      genre: '(string) Core genre or unique genre blend.',
      tone: '(string) Dominant tone or mood.',
      visualStyle:
        "(string) Specific art style with 1-2 defining characteristics/exemplars (e.g., 'Oil Painting: Impressionist style with thick, visible brushstrokes capturing light', 'Pixel Art: Retro 16-bit RPG style, limited color palette', 'Art Nouveau Illustration: Flowing organic lines, decorative patterns, similar to Mucha', 'Low Poly 3D: Faceted geometric shapes, vibrant flat shading', 'Charcoal Sketch: Expressive, rough texture with heavy smudging'). Avoid generic terms.",
    },
    // Placeholder comment for repetition
    /* Repeat structure for 4 scenarios */
  ];
  // Stringify the object for the prompt, adding comment manually
  const jsonStructure = `[
${JSON.stringify(structureObject[0], null, 2)}
  /* Repeat structure for 4 scenarios */
]`;

  return `You are a versatile generator of diverse story scenarios.\n\n**Goal:** Generate a list of 4 varied starting scenarios for an interactive text story, offering a good range of choices.\n\n**Key Requirements:**\n1.  **Variety:** The 4 scenarios should offer a good mix. Include some imaginative and unexpected scenarios alongside some more classic or conventional ones. Aim for variety in theme, setting, concepts, mood, and visual style.\n2.  **Imaginative Specificity:** Use vivid, concrete details in the scenario text. For the 'visualStyle', provide a *specific art style name plus 1-2 defining characteristics or exemplars* to clearly convey the aesthetic (see examples in the JSON structure). Avoid generic terms like 'realistic' or 'detailed'.\n3.  **Conciseness:** Keep the scenario text brief (1-2 sentences).\n4.  **Balance:** Ensure a balance between highly creative/unusual ideas and more grounded/familiar starting points.\n5.  **Strict JSON Output:** Respond ONLY with a valid JSON array matching this structure:\n${jsonStructure}\n\nGenerate 4 diverse scenarios offering a range of conventional and imaginative starting points now.`;
}
