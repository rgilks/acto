import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TARGET_URL = `${BASE_URL}/en`;

test.describe('Basic Workflow Test', () => {
  test('should load the page successfully', async ({ page }) => {
    await page.goto(TARGET_URL, { waitUntil: 'networkidle' });
    // Check if the page title is correct as a basic loading indicator
    await expect(page).toHaveTitle(/acto/, { timeout: 5000 });
  });
});
