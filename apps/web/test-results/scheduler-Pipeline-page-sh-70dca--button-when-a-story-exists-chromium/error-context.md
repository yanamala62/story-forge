# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: scheduler.spec.ts >> Pipeline page >> shows Trigger Pipeline button when a story exists
- Location: e2e\scheduler.spec.ts:11:3

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - generic [ref=e3]:
    - complementary [ref=e4]:
      - generic [ref=e5]:
        - img [ref=e6]
        - generic [ref=e8]: StoryForge AI
      - navigation [ref=e9]:
        - link "Dashboard" [ref=e10] [cursor=pointer]:
          - /url: /
          - img [ref=e11]
          - text: Dashboard
        - link "Stories" [ref=e16] [cursor=pointer]:
          - /url: /stories
          - img [ref=e17]
          - text: Stories
        - link "Pipeline" [ref=e19] [cursor=pointer]:
          - /url: /scheduler
          - img [ref=e20]
          - text: Pipeline
    - main [ref=e23]:
      - generic [ref=e25]:
        - heading "Pipeline" [level=1] [ref=e26]
        - paragraph [ref=e27]: Trigger the full content pipeline for a story's next episode
  - generic [ref=e30]:
    - img [ref=e32]
    - button "Open Tanstack query devtools" [ref=e80] [cursor=pointer]:
      - img [ref=e81]
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('Pipeline page', () => {
  4  |   test('navigates to pipeline page', async ({ page }) => {
  5  |     await page.goto('/');
  6  |     await page.getByRole('link', { name: /Pipeline/i }).click();
  7  |     await expect(page).toHaveURL(/\/scheduler/);
  8  |     await expect(page.getByRole('heading', { name: 'Pipeline' })).toBeVisible();
  9  |   });
  10 | 
  11 |   test('shows Trigger Pipeline button when a story exists', async ({ page }) => {
  12 |     await page.goto('/scheduler');
  13 |     const hasButton = await page.getByRole('button', { name: /Trigger Pipeline/i }).isVisible().catch(() => false);
  14 |     const hasEmptyState = await page.getByText(/create one first/i).isVisible().catch(() => false);
> 15 |     expect(hasButton || hasEmptyState).toBe(true);
     |                                        ^ Error: expect(received).toBe(expected) // Object.is equality
  16 |   });
  17 | 
  18 |   test('no progress/log panels before a trigger', async ({ page }) => {
  19 |     await page.goto('/scheduler');
  20 |     await expect(page.getByText('Pipeline Progress')).not.toBeVisible();
  21 |     await expect(page.getByText('Log Monitor')).not.toBeVisible();
  22 |   });
  23 | });
  24 | 
```