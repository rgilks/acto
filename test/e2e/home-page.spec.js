import { test, expect } from '@playwright/test';

// Use the home page URL
const TARGET_URL = process.env.BASE_URL || 'http://localhost:3000/';

test.describe('Home Page Checks (Unauthenticated)', () => {
  // This test now specifically checks the unauthenticated state
  test('should load essential elements for unauthenticated users', async ({ page }) => {
    await page.goto(TARGET_URL);

    // Check if the "Join the Adventure!" heading is visible
    await expect(page.getByTestId('auth-heading')).toBeVisible();
    await expect(page.getByTestId('auth-heading')).toHaveText('Join the Adventure!');

    // Check if the waitlist message is visible
    await expect(page.getByTestId('auth-waitlist-message')).toBeVisible();

    // Verify the page title
    await expect(page).toHaveTitle(/acto/);
  });

  // This test now checks the auth buttons in the unauthenticated view
  test('should display authentication provider buttons', async ({ page }) => {
    await page.goto(TARGET_URL);

    // Wait for the auth section to be potentially visible
    await page.waitForSelector('[data-testid="auth-section"]', {
      state: 'visible',
      timeout: 10000,
    });

    // Check for Sign In buttons using data-testid
    await expect(page.getByTestId('signin-google-button')).toBeVisible();
    await expect(page.getByTestId('signin-discord-button')).toBeVisible();
    // Ensure GitHub button IS visible
    await expect(page.getByTestId('signin-github-button')).toBeVisible();
  });

  // This test now checks the footer links in the unauthenticated view
  test('should display correct footer links', async ({ page }) => {
    await page.goto(TARGET_URL);

    // Wait for the auth section to be potentially visible
    await page.waitForSelector('[data-testid="auth-section"]', {
      state: 'visible',
      timeout: 10000,
    });

    // Locate the footer links within the auth section using test IDs
    const authFooter = page.getByTestId('auth-footer');

    // Check Gemini link
    const geminiLink = authFooter.getByTestId('gemini-link');
    await expect(geminiLink).toBeVisible();
    await expect(geminiLink).toHaveAttribute('target', '_blank');

    // Check GitHub link
    const githubLink = authFooter.getByTestId('github-link');
    await expect(githubLink).toBeVisible();

    // Check Ko-fi link
    const kofiLink = authFooter.getByTestId('kofi-link');
    await expect(kofiLink).toBeVisible();
    await expect(kofiLink).toHaveAttribute('target', '_blank');
    await expect(kofiLink.locator('img')).toBeVisible();
  });

  // Note: We might need separate tests for the authenticated state,
  // potentially using Playwright's authentication features to log in first.
  // For now, these tests cover the unauthenticated view based on the refactor.
});
