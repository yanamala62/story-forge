import { BaseRepository } from './base.repository.js';

/**
 * System-wide (userId: null) key/value settings — used for things like the
 * YouTube OAuth refresh token, which needs to be updatable at runtime via the
 * "Reconnect YouTube" flow without a redeploy.
 */
export class SettingRepository extends BaseRepository {
  constructor() {
    super('setting-repository');
  }

  async get(key: string): Promise<string | null> {
    // findFirst (not findUnique on the compound key) — Prisma's generated
    // compound-unique input for [userId, key] doesn't accept null for a
    // nullable column, and these are all system settings (userId: null).
    const setting = await this.db.setting.findFirst({
      where: { userId: null, key },
    });
    if (!setting) return null;
    // Stored as a JSON string value — unwrap it back to a plain string.
    return typeof setting.value === 'string' ? setting.value : null;
  }

  async set(key: string, value: string): Promise<void> {
    const existing = await this.db.setting.findFirst({ where: { userId: null, key } });
    if (existing) {
      await this.db.setting.update({ where: { id: existing.id }, data: { value } });
    } else {
      await this.db.setting.create({ data: { userId: null, key, value, isSystem: true } });
    }
  }

  async delete(key: string): Promise<void> {
    const existing = await this.db.setting.findFirst({ where: { userId: null, key } });
    if (existing) {
      await this.db.setting.delete({ where: { id: existing.id } });
    }
  }
}
