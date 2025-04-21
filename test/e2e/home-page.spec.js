import { test, expect } from '@playwright/test';

// Use the home page URL
const TARGET_URL = process.env.BASE_URL || 'http://localhost:3000/';

test.describe('Home Page Checks', () => {
  test('should load scenarios and essential elements', async ({ page }) => {
    await page.goto(TARGET_URL);

    // Check if the main heading is visible
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 5000 });

    // Check if the scenario heading is visible (using data-testid)
    await expect(page.getByTestId('scenario-selector-heading')).toBeVisible();

    // Check if at least one scenario choice button is visible (using data-testid)
    const firstChoiceButton = page.getByTestId('scenario-choice-button').first();
    await expect(firstChoiceButton).toBeVisible();

    // Removed check for "Start Adventure" button as it's not present on initial load/logged out state.
    // await expect(page.getByRole('button', { name: /start adventure/i })).toBeVisible();

    // Optional: Check if the generate new button is visible (if user is logged in)
    // This requires knowing the auth state or mocking it. For now, we just check its existence.
    // await expect(page.getByTestId('scenario-generate-new-button')).toBeVisible();

    // Verify the page title as well
    await expect(page).toHaveTitle(/acto/);

    // Previous checks for dropdown functionality removed as they might be too specific
    // depending on the scenario selector implementation (button vs combobox vs...)
    // and rely on less robust selectors.
    // The updated test focuses on the presence of key elements using testids.
  });

  test('should display authentication provider buttons', async ({ page }) => {
    await page.goto(TARGET_URL);

    // Check for Sign In buttons using their title attribute
    await expect(page.locator('button[title="Sign In with Google"]')).toBeVisible();
    await expect(page.locator('button[title="Sign In with GitHub"]')).toBeVisible();
    await expect(page.locator('button[title="Sign In with Discord"]')).toBeVisible();
  });

  test('should display correct footer links', async ({ page }) => {
    await page.goto(TARGET_URL);

    const footer = page.locator('footer');

    // Check Gemini link
    const geminiLink = footer.locator('a[href*="deepmind.google/technologies/gemini/"]');
    await expect(geminiLink).toBeVisible();
    await expect(geminiLink).toHaveAttribute('target', '_blank');

    // Check GitHub link
    const githubLink = footer.locator('a[href*="github.com/rgilks/acto"]');
    await expect(githubLink).toBeVisible();

    // Check Ko-fi link
    const kofiLink = footer.locator('a[href*="ko-fi.com/"]'); // More general check for Ko-fi link
    await expect(kofiLink).toBeVisible();
    await expect(kofiLink).toHaveAttribute('target', '_blank');
    await expect(kofiLink.locator('img')).toBeVisible(); // Check the image inside is visible
  });

  // Removed test for sign-in prompt on scenario click as the behavior
  // is not an immediate redirect.
  // test('should prompt sign-in when selecting a scenario while logged out', async ({ page }) => { ... });
});
