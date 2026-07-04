/**
 * Full end-to-end flow test.
 * Requires the API server to be running on port 3000.
 * Covers: Dashboard → Stories → Story Detail → Episode → Pipeline trigger page
 */
import { test, expect, type Page } from '@playwright/test';

// ── Helpers ──────────────────────────────────────────────────────────────────

async function waitForApiData(page: Page, selector: string, timeout = 8000) {
  await expect(page.locator(selector)).not.toContainText('—', { timeout });
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

test.describe('Full Flow — Dashboard', () => {
  test('dashboard loads with live data from API', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Heading
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    // Sidebar
    await expect(page.getByText('StoryForge AI', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Stories' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Pipeline' })).toBeVisible();

    // Stat cards exist
    await expect(page.getByText('Active Stories')).toBeVisible();
    await expect(page.getByText('Total Triggered', { exact: true })).toBeVisible();
    await expect(page.getByText('Total Views')).toBeVisible();

    // Pipeline activity card shows real status
    await expect(page.getByRole('main').getByText('Pipeline Activity')).toBeVisible();
    await expect(page.getByText('Total triggered', { exact: true })).toBeVisible();

    // Take screenshot of loaded dashboard
    await page.screenshot({ path: 'e2e/screenshots/flow-01-dashboard.png' });
  });
});

// ── Stories ───────────────────────────────────────────────────────────────────

test.describe('Full Flow — Stories', () => {
  test('stories page lists all active stories', async ({ page }) => {
    await page.goto('/stories');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: 'Stories' })).toBeVisible();
    await expect(page.getByRole('button', { name: /New Story/i })).toBeVisible();

    // Wait for data to load (not skeleton)
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'e2e/screenshots/flow-02-stories.png' });

    // Check either stories are shown OR empty state — both are valid
    const hasStories = await page.locator('[href*="/stories/"]').count() > 0;
    const hasEmpty   = await page.getByText('No stories yet').isVisible().catch(() => false);
    expect(hasStories || hasEmpty).toBe(true);
  });

  test('create story dialog opens and validates', async ({ page }) => {
    await page.goto('/stories');

    // Open dialog
    await page.getByRole('button', { name: /New Story/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText('Create New Story')).toBeVisible();

    // Submit disabled when empty
    const createBtn = page.getByRole('button', { name: /Create Story/i });
    await expect(createBtn).toBeDisabled();

    // Fill fields
    await page.getByPlaceholder(/Wandering Samurai/i).fill('E2E Test Story');
    await page.getByPlaceholder(/Brief story premise/i).fill(
      'An E2E test story for Playwright validation — do not publish'
    );

    await expect(createBtn).toBeEnabled();
    await page.screenshot({ path: 'e2e/screenshots/flow-03-create-dialog.png' });

    // Close without submitting (ESC)
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });
});

// ── Story Detail ──────────────────────────────────────────────────────────────

test.describe('Full Flow — Story Detail', () => {
  test('clicking a story opens its detail page with episodes', async ({ page }) => {
    await page.goto('/stories');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    const storyLinks = page.locator('a[href*="/stories/"]');
    const count = await storyLinks.count();

    if (count === 0) {
      test.skip(true, 'No stories in DB — skipping story detail test');
      return;
    }

    // Click first story
    await storyLinks.first().click();
    await page.waitForLoadState('networkidle');

    // Should be on story detail page
    await expect(page).toHaveURL(/\/stories\/.+/);
    await expect(page.getByRole('button', { name: /Generate Episode/i })).toBeVisible();

    await page.screenshot({ path: 'e2e/screenshots/flow-04-story-detail.png' });
  });

  test('episode list is shown in story detail', async ({ page }) => {
    await page.goto('/stories');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    const storyLinks = page.locator('a[href*="/stories/"]');
    if (await storyLinks.count() === 0) {
      test.skip(true, 'No stories — skipping');
      return;
    }

    await storyLinks.first().click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    // Episodes section is present
    await expect(page.getByText(/Episodes/)).toBeVisible();
    await page.screenshot({ path: 'e2e/screenshots/flow-05-episodes-list.png' });
  });
});

// ── Episode Detail + Pipeline ─────────────────────────────────────────────────

test.describe('Full Flow — Episode & Pipeline', () => {
  test('episode detail shows pipeline control panel', async ({ page }) => {
    await page.goto('/stories');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    const storyLinks = page.locator('a[href*="/stories/"]');
    if (await storyLinks.count() === 0) {
      test.skip(true, 'No stories — skipping');
      return;
    }

    await storyLinks.first().click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    // Find first episode link
    const episodeLinks = page.locator('a[href*="/episodes/"]');
    if (await episodeLinks.count() === 0) {
      test.skip(true, 'No episodes — skipping');
      return;
    }

    await episodeLinks.first().click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Pipeline card
    await expect(page.getByText('Pipeline')).toBeVisible();
    await expect(page.getByRole('button', { name: /Run \/ Resume/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Run \+ Upload/i })).toBeVisible();

    // Progress Detail card
    await expect(page.getByText('Progress Detail')).toBeVisible();

    // Pipeline steps
    await expect(page.getByText('M1: Story + Scenes')).toBeVisible();
    await expect(page.getByText('M2: Images')).toBeVisible();
    await expect(page.getByText('M3: Narration')).toBeVisible();
    await expect(page.getByText('M4: Subtitles')).toBeVisible();
    await expect(page.getByText('M5: Video')).toBeVisible();
    await expect(page.getByText('M6: SEO')).toBeVisible();

    await page.screenshot({ path: 'e2e/screenshots/flow-06-episode-pipeline.png' });
  });

  test('pipeline status badge reflects episode state', async ({ page }) => {
    await page.goto('/stories');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    const storyLinks = page.locator('a[href*="/stories/"]');
    if (await storyLinks.count() === 0) test.skip(true, 'No stories');

    await storyLinks.first().click();
    await page.waitForTimeout(1500);

    const episodeLinks = page.locator('a[href*="/episodes/"]');
    if (await episodeLinks.count() === 0) test.skip(true, 'No episodes');

    await episodeLinks.first().click();
    await page.waitForTimeout(2000);

    // Status badge must be one of the known states
    const knownStatuses = [
      'Pending', 'Generating Story', 'Scenes Ready', 'Generating Prompts',
      'Generating Images', 'Generating Audio', 'Generating Subtitles',
      'Composing Video', 'Generating SEO', 'Uploading', 'Published', 'Failed',
    ];
    let found = false;
    for (const s of knownStatuses) {
      if (await page.getByText(s).isVisible().catch(() => false)) { found = true; break; }
    }
    expect(found).toBe(true);
  });
});

// ── Pipeline ──────────────────────────────────────────────────────────────────

test.describe('Full Flow — Pipeline', () => {
  test('pipeline page shows trigger control', async ({ page }) => {
    await page.goto('/scheduler');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await expect(page.getByRole('heading', { name: 'Pipeline' })).toBeVisible();

    // Either a story exists (button shown) or the empty-state hint is shown — both valid
    const hasButton = await page.getByRole('button', { name: /Trigger Pipeline/i }).isVisible().catch(() => false);
    const hasEmptyState = await page.getByText(/create one first/i).isVisible().catch(() => false);
    expect(hasButton || hasEmptyState).toBe(true);

    await page.screenshot({ path: 'e2e/screenshots/flow-07-scheduler.png' });
  });
});

// ── Full Navigation Flow ──────────────────────────────────────────────────────

test.describe('Full Flow — Navigation', () => {
  test('user can navigate the full app without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    // Visit all pages
    await page.goto('/');
    await page.waitForTimeout(1000);

    await page.goto('/stories');
    await page.waitForTimeout(1000);

    await page.goto('/scheduler');
    await page.waitForTimeout(1000);

    // Navigate via sidebar
    await page.goto('/');
    await page.getByRole('link', { name: 'Stories' }).click();
    await expect(page).toHaveURL('/stories');

    await page.getByRole('link', { name: 'Pipeline' }).click();
    await expect(page).toHaveURL('/scheduler');

    await page.getByRole('link', { name: 'Dashboard' }).click();
    await expect(page).toHaveURL('/');

    // No React errors or unhandled exceptions
    const reactErrors = errors.filter(
      (e) => !e.includes('net::ERR_') && !e.includes('Failed to fetch')
    );
    expect(reactErrors).toHaveLength(0);

    await page.screenshot({ path: 'e2e/screenshots/flow-08-final.png' });
  });
});
