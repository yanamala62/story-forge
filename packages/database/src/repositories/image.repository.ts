import type { GeneratedImage, ImageStatus } from '@prisma/client';
import { BaseRepository } from './base.repository.js';

export interface CreateGeneratedImageInput {
  promptId: string;
  sceneId: string;
  filename: string;
  localPath: string;
  width: number;
  height: number;
  seed: number;
  model: string;
}

export class ImageRepository extends BaseRepository {
  constructor() {
    super('image-repository');
  }

  async create(input: CreateGeneratedImageInput): Promise<GeneratedImage> {
    const image = await this.db.generatedImage.upsert({
      where: { sceneId: input.sceneId },
      update: {
        filename: input.filename,
        localPath: input.localPath,
        seed: input.seed,
        status: 'COMPLETED',
      },
      create: {
        promptId: input.promptId,
        sceneId: input.sceneId,
        filename: input.filename,
        localPath: input.localPath,
        width: input.width,
        height: input.height,
        seed: input.seed,
        model: input.model,
        status: 'COMPLETED',
      },
    });

    this.logger.info('Generated image saved', { imageId: image.id, sceneId: input.sceneId });
    return image;
  }

  async updateStatus(id: string, status: ImageStatus): Promise<GeneratedImage> {
    return this.db.generatedImage.update({ where: { id }, data: { status } });
  }

  async findByEpisodeScenes(episodeId: string): Promise<GeneratedImage[]> {
    return this.db.generatedImage.findMany({
      where: { scene: { episodeId } },
      orderBy: { scene: { sceneNumber: 'asc' } },
      include: { scene: true },
    });
  }

  async findBySceneId(sceneId: string): Promise<GeneratedImage | null> {
    return this.db.generatedImage.findUnique({ where: { sceneId } });
  }
}
