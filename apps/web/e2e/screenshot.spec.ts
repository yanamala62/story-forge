import { test } from '@playwright/test';

test('capture all pages', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'e2e/screenshots/dashboard.png', fullPage: true });

  await page.goto('/stories');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'e2e/screenshots/stories.png', fullPage: true });

  await page.goto('/scheduler');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'e2e/screenshots/scheduler.png', fullPage: true });
});
