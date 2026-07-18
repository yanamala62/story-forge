import type {
  ClipForgeProject,
  ClipForgePart,
  ClipForgeContinuityValidation,
  ClipForgeProjectStatus,
  ClipForgePartStatus,
  Prisma,
} from '@prisma/client';
import { BaseRepository, type FindManyOptions, type PaginatedResult } from './base.repository.js';

// ── Project ──────────────────────────────────────────────────────────────────

export interface CreateClipForgeProjectInput {
  userId: string;
  sourceUrl: string;
  sourceVideoId: string;
  sourceTitle: string;
  targetShortDuration?: number;
}

export interface UpdateClipForgeProjectSourceInput {
  sourceTitle?: string;
  sourceDuration?: number;
  sourceWidth?: number;
  sourceHeight?: number;
  sourceFps?: number;
  sourceHasAudio?: boolean;
  sourceStoragePath?: string | null;
  sourceFingerprint?: string;
}

export class ClipForgeProjectRepository extends BaseRepository {
  constructor() {
    super('clip-forge-project-repository');
  }

  async create(input: CreateClipForgeProjectInput): Promise<ClipForgeProject> {
    const project = await this.db.clipForgeProject.create({
      data: {
        userId: input.userId,
        sourceUrl: input.sourceUrl,
        sourceVideoId: input.sourceVideoId,
        sourceTitle: input.sourceTitle,
        targetShortDuration: input.targetShortDuration ?? 60,
        status: 'CREATED',
      },
    });

    this.logger.info('Clip Forge project created', { projectId: project.id, userId: input.userId });
    return project;
  }

  async findById(id: string): Promise<ClipForgeProject | null> {
    return this.db.clipForgeProject.findUnique({ where: { id } });
  }

  /** Ownership-scoped lookup — a user must never access another user's project. */
  async findByIdForUser(id: string, userId: string): Promise<ClipForgeProject | null> {
    return this.db.clipForgeProject.findFirst({ where: { id, userId } });
  }

  async findByUser(userId: string, options: FindManyOptions = {}): Promise<PaginatedResult<ClipForgeProject>> {
    const { skip, take } = this.buildPagination(options);

    const [data, total] = await Promise.all([
      this.db.clipForgeProject.findMany({
        where: { userId },
        orderBy: options.orderBy ?? { createdAt: 'desc' },
        skip,
        take,
      }),
      this.db.clipForgeProject.count({ where: { userId } }),
    ]);

    return this.buildPaginatedResult(data, total, options);
  }

  async updateSource(id: string, data: UpdateClipForgeProjectSourceInput): Promise<ClipForgeProject> {
    return this.db.clipForgeProject.update({ where: { id }, data });
  }

  async updateStatus(
    id: string,
    status: ClipForgeProjectStatus,
    extra: Partial<{
      failureReason: string | null;
      startedAt: Date;
      completedAt: Date;
      failedAt: Date;
      continuityValidated: boolean;
      lastSuccessfulPartNumber: number;
      totalParts: number;
    }> = {},
  ): Promise<ClipForgeProject> {
    return this.db.clipForgeProject.update({
      where: { id },
      data: { status, ...extra },
    });
  }

  async setTotalParts(id: string, totalParts: number): Promise<ClipForgeProject> {
    return this.db.clipForgeProject.update({ where: { id }, data: { totalParts } });
  }

  async setLastSuccessfulPart(id: string, partNumber: number): Promise<ClipForgeProject> {
    return this.db.clipForgeProject.update({
      where: { id },
      data: { lastSuccessfulPartNumber: partNumber },
    });
  }

  /**
   * Marks any project left in a transient/active status at boot as FAILED —
   * it was orphaned by the previous process dying mid-run (crash, restart,
   * deploy, OOM). Without this, such a project's UI spins on "SOURCE
   * VALIDATING"/"PROCESSING" forever with no in-memory run backing it. FAILED
   * is fully resumable (the pipeline is idempotent), so the user just clicks
   * Resume/Retry. CONTINUITY_VALIDATION_FAILED / WAITING_FOR_YOUTUBE_QUOTA /
   * PARTIALLY_COMPLETED are deliberately left alone — those are real resting
   * states, not orphans.
   */
  async reconcileOrphanedProjects(): Promise<number> {
    const result = await this.db.clipForgeProject.updateMany({
      where: {
        status: {
          in: ['SOURCE_VALIDATING', 'SOURCE_READY', 'SPLIT_PLANNING', 'CONTINUITY_VALIDATING', 'PROCESSING', 'UPLOADING'],
        },
      },
      data: { status: 'FAILED', failureReason: 'Interrupted by server restart — click Resume to continue', failedAt: new Date() },
    });
    return result.count;
  }

  /**
   * Frees the source-video storage reference once the whole project has
   * completed (every part successfully uploaded to YouTube) — the huge
   * source file no longer needs to exist locally or in Supabase Storage.
   */
  async clearSourceStoragePath(id: string): Promise<ClipForgeProject> {
    return this.db.clipForgeProject.update({ where: { id }, data: { sourceStoragePath: null } });
  }

  async delete(id: string): Promise<void> {
    await this.db.clipForgeProject.delete({ where: { id } });
  }
}

// ── Part ─────────────────────────────────────────────────────────────────────

export interface CreateClipForgePartInput {
  projectId: string;
  partNumber: number;
  partLabel: string;
  totalParts: number;
  startTime: number;
  endTime: number;
  duration: number;
}

export class ClipForgePartRepository extends BaseRepository {
  constructor() {
    super('clip-forge-part-repository');
  }

  async createMany(inputs: CreateClipForgePartInput[]): Promise<ClipForgePart[]> {
    // Idempotent bulk insert used by split planning — skips rows that already
    // exist for (projectId, partNumber), so re-running split planning after a
    // crash never duplicates parts.
    await this.db.clipForgePart.createMany({
      data: inputs.map((i) => ({ ...i, status: 'PENDING' as ClipForgePartStatus })),
      skipDuplicates: true,
    });

    return this.findByProjectId(inputs[0]?.projectId ?? '');
  }

  async findById(id: string): Promise<ClipForgePart | null> {
    return this.db.clipForgePart.findUnique({ where: { id } });
  }

  async findByIdForProject(id: string, projectId: string): Promise<ClipForgePart | null> {
    return this.db.clipForgePart.findFirst({ where: { id, projectId } });
  }

  async findByProjectId(projectId: string): Promise<ClipForgePart[]> {
    return this.db.clipForgePart.findMany({
      where: { projectId },
      orderBy: { partNumber: 'asc' },
    });
  }

  async findByProjectAndPartNumber(projectId: string, partNumber: number): Promise<ClipForgePart | null> {
    return this.db.clipForgePart.findUnique({
      where: { projectId_partNumber: { projectId, partNumber } },
    });
  }

  /** First part that isn't UPLOADED/COMPLETED yet, in part-number order — the resume cursor. */
  async findNextPending(projectId: string): Promise<ClipForgePart | null> {
    return this.db.clipForgePart.findFirst({
      where: { projectId, status: { notIn: ['UPLOADED', 'COMPLETED'] } },
      orderBy: { partNumber: 'asc' },
    });
  }

  async findFailed(projectId: string): Promise<ClipForgePart[]> {
    return this.db.clipForgePart.findMany({
      where: { projectId, status: 'FAILED' },
      orderBy: { partNumber: 'asc' },
    });
  }

  async updateStatus(
    id: string,
    status: ClipForgePartStatus,
    extra: Partial<{
      lastUploadError: string | null;
      renderStartedAt: Date;
      renderCompletedAt: Date;
      uploadedAt: Date;
    }> = {},
  ): Promise<ClipForgePart> {
    return this.db.clipForgePart.update({ where: { id }, data: { status, ...extra } });
  }

  async setRendered(id: string, renderedStoragePath: string): Promise<ClipForgePart> {
    return this.db.clipForgePart.update({
      where: { id },
      data: { status: 'STORED', renderedStoragePath, renderCompletedAt: new Date() },
    });
  }

  /**
   * Frees the stored-video reference once its part has been successfully
   * uploaded to YouTube — the rendered file no longer needs to exist locally,
   * in Supabase Storage, or referenced in the DB, since YouTube is now the
   * canonical copy. Does NOT touch status/youtubeVideoId/seoTitle — those
   * stay for idempotency (resumability) and the parts-table UI.
   */
  async clearRenderedStoragePath(id: string): Promise<ClipForgePart> {
    return this.db.clipForgePart.update({ where: { id }, data: { renderedStoragePath: null } });
  }

  async setSeoTitle(id: string, seoTitle: string, description: string): Promise<ClipForgePart> {
    return this.db.clipForgePart.update({
      where: { id },
      data: { status: 'SEO_TITLE_READY', seoTitle, description },
    });
  }

  async setUploaded(id: string, youtubeVideoId: string, youtubeVideoUrl: string): Promise<ClipForgePart> {
    return this.db.clipForgePart.update({
      where: { id },
      data: {
        status: 'UPLOADED',
        youtubeVideoId,
        youtubeVideoUrl,
        uploadedAt: new Date(),
      },
    });
  }

  async incrementUploadAttempts(id: string): Promise<ClipForgePart> {
    return this.db.clipForgePart.update({
      where: { id },
      data: { uploadAttempts: { increment: 1 } },
    });
  }

  async markFailed(id: string, error: string): Promise<ClipForgePart> {
    return this.db.clipForgePart.update({
      where: { id },
      data: { status: 'FAILED', lastUploadError: error },
    });
  }
}

// ── Continuity validation ────────────────────────────────────────────────────

export interface CreateContinuityValidationInput {
  projectId: string;
  valid: boolean;
  sourceDuration: number;
  coveredDuration: number;
  missingRanges: Array<{ start: number; end: number }>;
  overlapRanges: Array<{ start: number; end: number }>;
  duplicateRanges: Array<{ start: number; end: number }>;
  validationDetails: Record<string, unknown>;
}

export class ClipForgeContinuityValidationRepository extends BaseRepository {
  constructor() {
    super('clip-forge-continuity-repository');
  }

  async create(input: CreateContinuityValidationInput): Promise<ClipForgeContinuityValidation> {
    return this.db.clipForgeContinuityValidation.create({
      data: {
        projectId: input.projectId,
        valid: input.valid,
        sourceDuration: input.sourceDuration,
        coveredDuration: input.coveredDuration,
        missingRangesJson: input.missingRanges as unknown as Prisma.InputJsonValue,
        overlapRangesJson: input.overlapRanges as unknown as Prisma.InputJsonValue,
        duplicateRangesJson: input.duplicateRanges as unknown as Prisma.InputJsonValue,
        validationDetailsJson: input.validationDetails as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async findLatestByProjectId(projectId: string): Promise<ClipForgeContinuityValidation | null> {
    return this.db.clipForgeContinuityValidation.findFirst({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
