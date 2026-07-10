import { query } from '../db';
import { AuditLog } from '../models';

export class AuditLogRepository {
  static async create(log: {
    action: string;
    user_id?: string | null;
    details?: Record<string, any> | null;
  }): Promise<AuditLog> {
    const sql = `
      INSERT INTO audit_logs (action, user_id, details)
      VALUES ($1, $2, $3)
      RETURNING *;
    `;
    const res = await query(sql, [log.action, log.user_id || null, log.details ? JSON.stringify(log.details) : null]);
    return res.rows[0];
  }

  static async findById(id: string): Promise<AuditLog | null> {
    const sql = 'SELECT * FROM audit_logs WHERE id = $1;';
    const res = await query(sql, [id]);
    return res.rows[0] || null;
  }
}
