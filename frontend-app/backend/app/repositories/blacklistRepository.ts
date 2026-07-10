import { query } from '../db';
import { Blacklist } from '../models';

export class BlacklistRepository {
  static async create(item: {
    entity_type: 'user' | 'device' | 'ip' | string;
    entity_value: string;
    reason?: string | null;
  }): Promise<Blacklist> {
    const sql = `
      INSERT INTO blacklist (entity_type, entity_value, reason)
      VALUES ($1, $2, $3)
      ON CONFLICT (entity_type, entity_value) DO UPDATE
        SET reason = EXCLUDED.reason, created_at = CURRENT_TIMESTAMP
      RETURNING *;
    `;
    const res = await query(sql, [item.entity_type, item.entity_value, item.reason || null]);
    return res.rows[0];
  }

  static async checkExists(type: string, value: string): Promise<boolean> {
    const sql = 'SELECT 1 FROM blacklist WHERE entity_type = $1 AND entity_value = $2;';
    const res = await query(sql, [type, value]);
    return (res.rowCount ?? 0) > 0;
  }

  static async findById(id: string): Promise<Blacklist | null> {
    const sql = 'SELECT * FROM blacklist WHERE id = $1;';
    const res = await query(sql, [id]);
    return res.rows[0] || null;
  }

  static async remove(type: string, value: string): Promise<boolean> {
    const sql = 'DELETE FROM blacklist WHERE entity_type = $1 AND entity_value = $2;';
    const res = await query(sql, [type, value]);
    return (res.rowCount ?? 0) > 0;
  }
}
