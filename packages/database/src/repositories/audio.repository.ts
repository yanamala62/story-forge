import type { AudioFile, AudioStatus } from '@prisma/client';
import { BaseRepository } from './base.repository.js';

export interface CreateAudioFileInput {
  episodeId: string;
  filename: string;
  localPath: string;
  s3Key?: string | null;
  s3Url?: string | null;
  duration: number;
  voice: string;
  sampleRate?: number;
}

export class AudioRepository extends BaseRepository {
  constructor() {
    super('audio-repository');
  }

  async upsert(input: CreateAudioFileInput): Promise<AudioFile> {
    const record = await this.db.audioFile.upsert({
      where: { episodeId: input.episodeId },
      update: {
        filename: input.filename,
        localPath: input.localPath,
        s3Key: input.s3Key ?? null,
        s3Url: input.s3Url ?? null,
        duration: input.duration,
        voice: input.voice,
        status: 'COMPLETED',
      },
      create: {
        episodeId: input.episodeId,
        filename: input.filename,
        localPath: input.localPath,
        s3Key: input.s3Key ?? null,
        s3Url: input.s3Url ?? null,
        duration: input.duration,
        voice: input.voice,
        sampleRate: input.sampleRate ?? 24000,
        status: 'COMPLETED',
      },
    });

    this.logger.info('Audio file saved', { episodeId: input.episodeId, duration: input.duration });
    return record;
  }

  async findByEpisodeId(episodeId: string): Promise<AudioFile | null> {
    return this.db.audioFile.findUnique({ where: { episodeId } });
  }

  async updateStatus(episodeId: string, status: AudioStatus): Promise<void> {
    await this.db.audioFile.update({ where: { episodeId }, data: { status } });
  }
}
