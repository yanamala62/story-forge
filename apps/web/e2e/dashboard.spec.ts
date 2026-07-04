import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test('loads and shows StoryForge AI heading', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('StoryForge AI', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });

  test('shows stat cards', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Active Stories')).toBeVisible();
    await expect(page.getByText('Total Triggered', { exact: true })).toBeVisible();
    await expect(page.getByText('Total Views')).toBeVisible();
  });

  test('sidebar navigation links are present', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: /Stories/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Pipeline/i })).toBeVisible();
  });

  test('system health card loads', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('System Health')).toBeVisible();
  });

  test('pipeline activity card shows status', async ({ page }) => {
    await page.goto('/');
    // Use the card title specifically (not the sidebar link)
    await expect(page.getByRole('main').getByText('Pipeline Activity')).toBeVisible();
  });
});
