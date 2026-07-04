import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test('sidebar is visible on all pages', async ({ page }) => {
    for (const path of ['/', '/stories', '/scheduler']) {
      await page.goto(path);
      await expect(page.getByText('StoryForge AI', { exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Stories' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Pipeline' })).toBeVisible();
    }
  });

  test('dashboard link is highlighted when on /', async ({ page }) => {
    await page.goto('/');
    const dashLink = page.getByRole('link', { name: 'Dashboard' });
    await expect(dashLink).toHaveClass(/text-primary/);
  });

  test('stories link is highlighted when on /stories', async ({ page }) => {
    await page.goto('/stories');
    const storiesLink = page.getByRole('link', { name: 'Stories' });
    await expect(storiesLink).toHaveClass(/text-primary/);
  });

  test('pipeline link is highlighted when on /scheduler', async ({ page }) => {
    await page.goto('/scheduler');
    const pipelineLink = page.getByRole('link', { name: 'Pipeline' });
    await expect(pipelineLink).toHaveClass(/text-primary/);
  });
});
