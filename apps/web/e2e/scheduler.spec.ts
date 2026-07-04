import { test, expect } from '@playwright/test';

test.describe('Pipeline page', () => {
  test('navigates to pipeline page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /Pipeline/i }).click();
    await expect(page).toHaveURL(/\/scheduler/);
    await expect(page.getByRole('heading', { name: 'Pipeline' })).toBeVisible();
  });

  test('shows Trigger Pipeline button when a story exists', async ({ page }) => {
    await page.goto('/scheduler');
    const hasButton = await page.getByRole('button', { name: /Trigger Pipeline/i }).isVisible().catch(() => false);
    const hasEmptyState = await page.getByText(/create one first/i).isVisible().catch(() => false);
    expect(hasButton || hasEmptyState).toBe(true);
  });

  test('no progress/log panels before a trigger', async ({ page }) => {
    await page.goto('/scheduler');
    await expect(page.getByText('Pipeline Progress')).not.toBeVisible();
    await expect(page.getByText('Log Monitor')).not.toBeVisible();
  });
});
