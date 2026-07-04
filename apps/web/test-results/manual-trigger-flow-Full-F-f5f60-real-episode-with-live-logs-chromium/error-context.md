# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: manual-trigger-flow.spec.ts >> Full Flow — Trigger Pipeline drives the entire pipeline >> clicking Trigger Pipeline runs M1 through M7 for a real episode with live logs
- Location: e2e\manual-trigger-flow.spec.ts:19:3

# Error details

```
Error: pipeline did not reach a terminal status: {"episodeId":"e74967f5-ac81-4346-9000-2dc4b4f41288","status":"FAILED","processingError":"Agent [seo-agent] error: LLM call failed: OpenRouter error: Empty response from model","completedSteps":["M1: Story + Scenes","M2: Images","M3: Narration","M4: Subtitles","M5: Video"],"pendingSteps":["M6: SEO","M7: YouTube Upload"],"steps":[{"id":"M1","name":"M1: Story + Scenes","status":"completed"},{"id":"M2","name":"M2: Images","status":"completed"},{"id":"M3","name":"M3: Narration","status":"completed"},{"id":"M4","name":"M4: Subtitles","status":"completed"},{"id":"M5","name":"M5: Video","status":"completed"},{"id":"M6","name":"M6: SEO","status":"failed","error":"Agent [seo-agent] error: LLM call failed: OpenRouter error: Empty response from model"},{"id":"M7","name":"M7: YouTube Upload","status":"pending"}],"detail":{"sceneCount":6,"imageCount":6,"hasAudio":true,"hasSubtitles":true,"hasVideo":true,"hasSeo":false,"uploads":[]},"updatedAt":"2026-07-04T16:09:31.615Z","isRunning":false}

expect(received).toBe(expected) // Object.is equality

Expected: "PUBLISHED"
Received: "FAILED"
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
      - generic [ref=e24]:
        - generic [ref=e25]:
          - heading "Pipeline" [level=1] [ref=e26]
          - paragraph [ref=e27]: Trigger the full content pipeline for a story's next episode
        - button "Trigger Pipeline" [ref=e31] [cursor=pointer]:
          - img [ref=e32]
          - text: Trigger Pipeline
        - generic [ref=e36]: Pipeline Progress
        - generic [ref=e54]:
          - generic [ref=e56]: Log Monitor
          - generic [ref=e58]:
            - generic [ref=e59]: "21:28:09 Pipeline triggered for episode 4 (current status: PENDING)"
            - generic [ref=e60]: "21:28:09 Upload to YouTube: yes"
            - generic [ref=e61]: "21:28:09 M1: Story + Scenes → calling OpenRouter LLM..."
            - generic [ref=e62]: "21:28:56 M1: Story + Scenes done in 47.8s — moving to next step"
            - generic [ref=e63]: "21:28:56 M2: Image Generation → calling Pollinations.ai × 6 scenes..."
            - generic [ref=e64]: "21:32:48 M2: Image Generation done in 231.3s — moving to next step"
            - generic [ref=e65]: "21:32:48 M3: Narration (TTS) → calling edge-tts subprocess..."
            - generic [ref=e66]: "21:32:51 M3: Narration (TTS) done in 3.2s — moving to next step"
            - generic [ref=e67]: "21:32:51 M4: Subtitles (Whisper) → calling faster-whisper subprocess..."
            - generic [ref=e68]: "21:33:00 M4: Subtitles (Whisper) done in 9.5s — moving to next step"
            - generic [ref=e69]: "21:33:00 M5: Video Composition → calling FFmpeg two-pass..."
            - generic [ref=e70]: "21:34:03 M5: Video Composition done in 63.0s — moving to next step"
            - generic [ref=e71]: "21:34:03 M6: SEO Generation → calling OpenRouter LLM..."
            - generic [ref=e72]: "21:36:05 M6: SEO Generation retry 1/3 (RETRYABLE) — waiting 15s"
            - generic [ref=e73]: "21:37:57 M6: SEO Generation retry 2/3 (RETRYABLE) — waiting 15s"
            - generic [ref=e74]: "21:39:31 M6: SEO Generation failed after 327.7s — Agent [seo-agent] error: LLM call failed: OpenRouter error: Empty response from model"
            - generic [ref=e75]: 21:39:31 Pipeline failed — status FAILED after 682.6s
  - generic [ref=e76]:
    - img [ref=e78]
    - button "Open Tanstack query devtools" [ref=e126] [cursor=pointer]:
      - img [ref=e127]
```

# Test source

```ts
  1   | /**
  2   |  * Real, end-to-end verification of the Pipeline page's "Trigger Pipeline" button.
  3   |  *
  4   |  * Unlike scheduler.spec.ts (UI-presence only), this test drives the actual
  5   |  * pipeline to completion: it clicks Trigger Pipeline, confirms the live SSE
  6   |  * log panel receives entries and the M0-M7 step tracker updates, then polls
  7   |  * the API until the episode finishes every stage (M1 story -> M2 images ->
  8   |  * M3 narration -> M4 subtitles -> M5 video -> M6 SEO -> M7 YouTube upload).
  9   |  *
  10  |  * This depends on live external services (OpenRouter, Pollinations, edge-tts,
  11  |  * faster-whisper, ffmpeg, YouTube) and can take several minutes.
  12  |  */
  13  | import { test, expect } from '@playwright/test';
  14  | 
  15  | const API_BASE = 'http://localhost:3000/api';
  16  | const TERMINAL_STATUSES = new Set(['PUBLISHED', 'FAILED']);
  17  | 
  18  | test.describe('Full Flow — Trigger Pipeline drives the entire pipeline', () => {
  19  |   test('clicking Trigger Pipeline runs M1 through M7 for a real episode with live logs', async ({ page, request }) => {
  20  |     test.setTimeout(20 * 60 * 1000);
  21  | 
  22  |     // Ensure there's at least one active story for the trigger to act on.
  23  |     const storiesRes = await request.get(`${API_BASE}/stories?limit=100`);
  24  |     expect(storiesRes.ok()).toBe(true);
  25  |     const storiesBody = await storiesRes.json();
  26  | 
  27  |     if (storiesBody.data.total === 0) {
  28  |       const createRes = await request.post(`${API_BASE}/stories`, {
  29  |         data: {
  30  |           title: `E2E Trigger Pipeline Story ${Date.now()}`,
  31  |           genre: 'ADVENTURE',
  32  |           synopsis: 'A lone explorer uncovers an ancient secret buried beneath the city.',
  33  |         },
  34  |       });
  35  |       expect(createRes.ok()).toBe(true);
  36  |     }
  37  | 
  38  |     await page.goto('/scheduler');
  39  |     await page.waitForLoadState('networkidle');
  40  | 
  41  |     const [triggerResponse] = await Promise.all([
  42  |       page.waitForResponse(
  43  |         (res) => res.url().includes('/api/scheduler/trigger-next') && res.request().method() === 'POST',
  44  |       ),
  45  |       page.getByRole('button', { name: /Trigger Pipeline/i }).click(),
  46  |     ]);
  47  | 
  48  |     expect(triggerResponse.ok()).toBe(true);
  49  |     const triggerBody = await triggerResponse.json();
  50  |     const episodeId = triggerBody.data.episodeId as string;
  51  |     expect(episodeId).toBeTruthy();
  52  | 
  53  |     // Step tracker and live log panel should both appear.
  54  |     await expect(page.getByText('Pipeline Progress')).toBeVisible();
  55  |     await expect(page.getByText('Log Monitor')).toBeVisible();
  56  | 
  57  |     // The SSE stream should push at least one real log line quickly.
  58  |     await expect(page.getByText(/Pipeline triggered for episode/i)).toBeVisible({ timeout: 10_000 });
  59  | 
  60  |     // Poll the real pipeline status until it reaches a terminal state.
  61  |     let finalStatus: string | undefined;
  62  |     let lastPayload: Record<string, unknown> | undefined;
  63  |     const deadline = Date.now() + 18 * 60 * 1000;
  64  | 
  65  |     while (Date.now() < deadline) {
  66  |       const statusRes = await request.get(`${API_BASE}/episodes/${episodeId}/pipeline/status`);
  67  |       expect(statusRes.ok()).toBe(true);
  68  |       const statusBody = await statusRes.json();
  69  |       lastPayload = statusBody.data;
  70  |       finalStatus = statusBody.data.status;
  71  | 
  72  |       if (TERMINAL_STATUSES.has(finalStatus!)) break;
  73  | 
  74  |       await new Promise((resolve) => setTimeout(resolve, 10_000));
  75  |     }
  76  | 
> 77  |     expect(finalStatus, `pipeline did not reach a terminal status: ${JSON.stringify(lastPayload)}`).toBe(
      |                                                                                                     ^ Error: pipeline did not reach a terminal status: {"episodeId":"e74967f5-ac81-4346-9000-2dc4b4f41288","status":"FAILED","processingError":"Agent [seo-agent] error: LLM call failed: OpenRouter error: Empty response from model","completedSteps":["M1: Story + Scenes","M2: Images","M3: Narration","M4: Subtitles","M5: Video"],"pendingSteps":["M6: SEO","M7: YouTube Upload"],"steps":[{"id":"M1","name":"M1: Story + Scenes","status":"completed"},{"id":"M2","name":"M2: Images","status":"completed"},{"id":"M3","name":"M3: Narration","status":"completed"},{"id":"M4","name":"M4: Subtitles","status":"completed"},{"id":"M5","name":"M5: Video","status":"completed"},{"id":"M6","name":"M6: SEO","status":"failed","error":"Agent [seo-agent] error: LLM call failed: OpenRouter error: Empty response from model"},{"id":"M7","name":"M7: YouTube Upload","status":"pending"}],"detail":{"sceneCount":6,"imageCount":6,"hasAudio":true,"hasSubtitles":true,"hasVideo":true,"hasSeo":false,"uploads":[]},"updatedAt":"2026-07-04T16:09:31.615Z","isRunning":false}
  78  |       'PUBLISHED',
  79  |     );
  80  | 
  81  |     const detail = lastPayload!['detail'] as {
  82  |       sceneCount: number;
  83  |       imageCount: number;
  84  |       hasAudio: boolean;
  85  |       hasSubtitles: boolean;
  86  |       hasVideo: boolean;
  87  |       hasSeo: boolean;
  88  |       uploads: Array<{ platform: string; status: string }>;
  89  |     };
  90  | 
  91  |     expect(detail.sceneCount).toBeGreaterThan(0);
  92  |     expect(detail.imageCount).toBeGreaterThan(0);
  93  |     expect(detail.hasAudio).toBe(true);
  94  |     expect(detail.hasSubtitles).toBe(true);
  95  |     expect(detail.hasVideo).toBe(true);
  96  |     expect(detail.hasSeo).toBe(true);
  97  |     expect(detail.uploads.some((u) => u.platform === 'YOUTUBE' && u.status === 'PUBLISHED')).toBe(true);
  98  |   });
  99  | });
  100 | 
```