import { test, expect, type Page } from '@playwright/test';

test.describe('Admin Panel Basic Navigation', () => {
  test.use({ storageState: 'test/e2e/auth/admin.storageState.json' });

  test.beforeEach(async ({ page }: { page: Page }) => {
    await page.goto('/admin');
    await expect(page.locator('h1')).toContainText(/acto admin/i, { timeout: 2000 });
  });

  async function checkTableLoads(page: Page, tableName: string) {
    await page.getByRole('button', { name: new RegExp(tableName, 'i') }).click();

    const firstRowLocator = page.locator('table tbody tr').first();
    await expect(firstRowLocator).toBeVisible({ timeout: 3000 });
  }

  test('should display the users table', async ({ page }) => {
    await checkTableLoads(page, 'users');
  });
});
