import { test, expect } from '@playwright/test';

test.describe('Stories page', () => {
  test('navigates to stories page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /Stories/i }).first().click();
    await expect(page).toHaveURL(/\/stories/);
    await expect(page.getByRole('heading', { name: 'Stories' })).toBeVisible();
  });

  test('shows New Story button', async ({ page }) => {
    await page.goto('/stories');
    await expect(page.getByRole('button', { name: /New Story/i })).toBeVisible();
  });

  test('opens create story dialog', async ({ page }) => {
    await page.goto('/stories');
    await page.getByRole('button', { name: /New Story/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText('Create New Story')).toBeVisible();
    // Dialog has title, genre, language, synopsis fields
    await expect(page.getByPlaceholder(/Wandering Samurai/i)).toBeVisible();
  });

  test('create button is disabled when fields empty', async ({ page }) => {
    await page.goto('/stories');
    await page.getByRole('button', { name: /New Story/i }).click();
    const createBtn = page.getByRole('button', { name: /Create Story/i });
    await expect(createBtn).toBeDisabled();
  });

  test('create button enables when title and synopsis filled', async ({ page }) => {
    await page.goto('/stories');
    await page.getByRole('button', { name: /New Story/i }).click();
    await page.getByPlaceholder(/Wandering Samurai/i).fill('Test Story');
    await page.getByPlaceholder(/Brief story premise/i).fill('A test synopsis for playwright');
    const createBtn = page.getByRole('button', { name: /Create Story/i });
    await expect(createBtn).toBeEnabled();
  });
});
