import { query } from '../db';
import { Session } from '../models';

export class SessionRepository {
  static async create(session: { user_id: string; device_id?: string | null; token: string; expires_at: Date }): Promise<Session> {
    const sql = `
      INSERT INTO sessions (user_id, device_id, token, expires_at)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
    `;
    const res = await query(sql, [session.user_id, session.device_id || null, session.token, session.expires_at]);
    return res.rows[0];
  }

  static async findById(id: string): Promise<Session | null> {
    const sql = 'SELECT * FROM sessions WHERE id = $1;';
    const res = await query(sql, [id]);
    return res.rows[0] || null;
  }

  static async findByToken(token: string): Promise<Session | null> {
    const sql = 'SELECT * FROM sessions WHERE token = $1;';
    const res = await query(sql, [token]);
    return res.rows[0] || null;
  }

  static async delete(id: string): Promise<boolean> {
    const sql = 'DELETE FROM sessions WHERE id = $1;';
    const res = await query(sql, [id]);
    return (res.rowCount ?? 0) > 0;
  }
}
