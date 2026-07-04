/**
 * Real, end-to-end verification of the Pipeline page's "Trigger Pipeline" button.
 *
 * Unlike scheduler.spec.ts (UI-presence only), this test drives the actual
 * pipeline to completion: it clicks Trigger Pipeline, confirms the live SSE
 * log panel receives entries and the M0-M7 step tracker updates, then polls
 * the API until the episode finishes every stage (M1 story -> M2 images ->
 * M3 narration -> M4 subtitles -> M5 video -> M6 SEO -> M7 YouTube upload).
 *
 * This depends on live external services (OpenRouter, Pollinations, edge-tts,
 * faster-whisper, ffmpeg, YouTube) and can take several minutes.
 */
import { test, expect } from '@playwright/test';

const API_BASE = 'http://localhost:3000/api';
const TERMINAL_STATUSES = new Set(['PUBLISHED', 'FAILED']);

test.describe('Full Flow — Trigger Pipeline drives the entire pipeline', () => {
  test('clicking Trigger Pipeline runs M1 through M7 for a real episode with live logs', async ({ page, request }) => {
    test.setTimeout(20 * 60 * 1000);

    // Ensure there's at least one active story for the trigger to act on.
    const storiesRes = await request.get(`${API_BASE}/stories?limit=100`);
    expect(storiesRes.ok()).toBe(true);
    const storiesBody = await storiesRes.json();

    if (storiesBody.data.total === 0) {
      const createRes = await request.post(`${API_BASE}/stories`, {
        data: {
          title: `E2E Trigger Pipeline Story ${Date.now()}`,
          genre: 'ADVENTURE',
          synopsis: 'A lone explorer uncovers an ancient secret buried beneath the city.',
        },
      });
      expect(createRes.ok()).toBe(true);
    }

    await page.goto('/scheduler');
    await page.waitForLoadState('networkidle');

    const [triggerResponse] = await Promise.all([
      page.waitForResponse(
        (res) => res.url().includes('/api/scheduler/trigger-next') && res.request().method() === 'POST',
      ),
      page.getByRole('button', { name: /Trigger Pipeline/i }).click(),
    ]);

    expect(triggerResponse.ok()).toBe(true);
    const triggerBody = await triggerResponse.json();
    const episodeId = triggerBody.data.episodeId as string;
    expect(episodeId).toBeTruthy();

    // Step tracker and live log panel should both appear.
    await expect(page.getByText('Pipeline Progress')).toBeVisible();
    await expect(page.getByText('Log Monitor')).toBeVisible();

    // The SSE stream should push at least one real log line quickly.
    await expect(page.getByText(/Pipeline triggered for episode/i)).toBeVisible({ timeout: 10_000 });

    // Poll the real pipeline status until it reaches a terminal state.
    let finalStatus: string | undefined;
    let lastPayload: Record<string, unknown> | undefined;
    const deadline = Date.now() + 18 * 60 * 1000;

    while (Date.now() < deadline) {
      const statusRes = await request.get(`${API_BASE}/episodes/${episodeId}/pipeline/status`);
      expect(statusRes.ok()).toBe(true);
      const statusBody = await statusRes.json();
      lastPayload = statusBody.data;
      finalStatus = statusBody.data.status;

      if (TERMINAL_STATUSES.has(finalStatus!)) break;

      await new Promise((resolve) => setTimeout(resolve, 10_000));
    }

    expect(finalStatus, `pipeline did not reach a terminal status: ${JSON.stringify(lastPayload)}`).toBe(
      'PUBLISHED',
    );

    const detail = lastPayload!['detail'] as {
      sceneCount: number;
      imageCount: number;
      hasAudio: boolean;
      hasSubtitles: boolean;
      hasVideo: boolean;
      hasSeo: boolean;
      uploads: Array<{ platform: string; status: string }>;
    };

    expect(detail.sceneCount).toBeGreaterThan(0);
    expect(detail.imageCount).toBeGreaterThan(0);
    expect(detail.hasAudio).toBe(true);
    expect(detail.hasSubtitles).toBe(true);
    expect(detail.hasVideo).toBe(true);
    expect(detail.hasSeo).toBe(true);
    expect(detail.uploads.some((u) => u.platform === 'YOUTUBE' && u.status === 'PUBLISHED')).toBe(true);
  });
});
