import { Router, type Request, type Response } from 'express';
import { StoryService } from '../services/story.service.js';
import type { ApiResponse } from '@storyforge/shared';
import type { ContentLanguage } from '@storyforge/database';

const router = Router();

// Temporary: hardcoded system user until auth is built (M13)
const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001';

/**
 * @swagger
 * /api/stories:
 *   post:
 *     summary: Create a new story
 *     tags: [Stories]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, genre, synopsis]
 *             properties:
 *               title:
 *                 type: string
 *                 example: "The Last Dragon Keeper"
 *               genre:
 *                 type: string
 *                 enum: [ACTION, ADVENTURE, ROMANCE, HORROR, MYSTERY, FANTASY, SCI_FI, DRAMA, COMEDY, THRILLER]
 *               style:
 *                 type: string
 *                 enum: [ANIME, CARTOON, CINEMATIC, REALISTIC]
 *                 default: ANIME
 *               synopsis:
 *                 type: string
 *                 example: "A young girl discovers she is the last guardian of an ancient dragon..."
 *               targetAudience:
 *                 type: string
 *                 default: "13-35"
 *               initialCharacters:
 *                 type: array
 *     responses:
 *       201:
 *         description: Story created
 *       422:
 *         description: Validation error
 */
router.post('/', async (req: Request, res: Response) => {
  const story = await StoryService.createStory({
    ...req.body,
    userId: SYSTEM_USER_ID,
  });

  const response: ApiResponse = {
    success: true,
    data: story,
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
  };

  res.status(201).json(response);
});

/**
 * @swagger
 * /api/stories:
 *   get:
 *     summary: List all stories
 *     tags: [Stories]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: language
 *         schema: { type: string, enum: [EN, HI, TE] }
 *         description: Filter to stories in this language only
 *     responses:
 *       200:
 *         description: Paginated list of stories
 */
router.get('/', async (req: Request, res: Response) => {
  const page = Number(req.query['page'] ?? 1);
  const limit = Number(req.query['limit'] ?? 20);
  const language = req.query['language'] as ContentLanguage | undefined;

  // Single-operator mode — list all active stories regardless of userId
  const result = await StoryService.listAllStories(page, limit, language);

  const response: ApiResponse = {
    success: true,
    data: {
      data: result.data,
      total: result.total,
      page: result.page,
      limit: result.limit,
    },
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
  };

  res.json(response);
});

/**
 * @swagger
 * /api/stories/{id}:
 *   get:
 *     summary: Get story by ID
 *     tags: [Stories]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 */
router.get('/:id', async (req: Request, res: Response) => {
  const story = await StoryService.getStory(req.params['id'] as string);

  res.json({
    success: true,
    data: story,
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
  } satisfies ApiResponse);
});

/**
 * @swagger
 * /api/stories/{id}/episodes:
 *   post:
 *     summary: Generate the next episode for a story
 *     description: Triggers the Story Agent to generate a new episode using OpenRouter LLM
 *     tags: [Stories, Episodes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       201:
 *         description: Episode generated successfully
 *       404:
 *         description: Story not found
 *       502:
 *         description: OpenRouter/AI service error
 */
router.post('/:id/episodes', async (req: Request, res: Response) => {
  const result = await StoryService.generateEpisode(req.params['id'] as string);

  res.status(201).json({
    success: true,
    data: result,
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
  } satisfies ApiResponse);
});

/**
 * @swagger
 * /api/stories/{id}/episodes:
 *   get:
 *     summary: List episodes for a story
 *     tags: [Stories, Episodes]
 */
router.get('/:id/episodes', async (req: Request, res: Response) => {
  const page = Number(req.query['page'] ?? 1);
  const limit = Number(req.query['limit'] ?? 20);

  const result = await StoryService.listEpisodes(req.params['id'] as string, page, limit);

  res.json({
    success: true,
    data: result.data,
    meta: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
      hasNext: result.hasNext,
      hasPrev: result.hasPrev,
    },
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
  } satisfies ApiResponse);
});

/**
 * @swagger
 * /api/stories/{id}/episodes/in-flight:
 *   get:
 *     summary: Get the episode currently mid-pipeline for a story, if any
 *     description: Used by the frontend to resume tracking a running pipeline after navigating away and back.
 *     tags: [Stories, Episodes]
 *     responses:
 *       200:
 *         description: The in-flight episode, or null if nothing is running
 */
router.get('/:id/episodes/in-flight', async (req: Request, res: Response) => {
  const episode = await StoryService.getInFlightEpisode(req.params['id'] as string);

  res.json({
    success: true,
    data: episode,
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
  } satisfies ApiResponse);
});

export { router as storiesRouter };
