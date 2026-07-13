import { query } from '../db';
import { OtpVerification } from '../models';

export class OtpVerificationRepository {
  static async create(otp: { user_id: string; code: string; expires_at: Date }): Promise<OtpVerification> {
    const sql = `
      INSERT INTO otp_verifications (user_id, code, expires_at)
      VALUES ($1, $2, $3)
      RETURNING *;
    `;
    const res = await query(sql, [otp.user_id, otp.code, otp.expires_at]);
    return res.rows[0];
  }

  static async findById(id: string): Promise<OtpVerification | null> {
    const sql = 'SELECT * FROM otp_verifications WHERE id = $1;';
    const res = await query(sql, [id]);
    return res.rows[0] || null;
  }

  static async findLatestPendingByUserId(userId: string): Promise<OtpVerification | null> {
    const sql = `
      SELECT * FROM otp_verifications
      WHERE user_id = $1 AND status = 'pending'
      ORDER BY created_at DESC
      LIMIT 1;
    `;
    const res = await query(sql, [userId]);
    return res.rows[0] || null;
  }

  static async incrementAttempts(id: string, client?: any): Promise<number> {
    const sql = `
      UPDATE otp_verifications
      SET attempts = attempts + 1
      WHERE id = $1
      RETURNING attempts;
    `;
    const executor = client ? client.query.bind(client) : query;
    const res = await executor(sql, [id]);
    return res.rows[0]?.attempts || 0;
  }

  static async updateStatus(id: string, status: string, client?: any): Promise<OtpVerification | null> {
    const sql = `
      UPDATE otp_verifications
      SET status = $1
      WHERE id = $2
      RETURNING *;
    `;
    const executor = client ? client.query.bind(client) : query;
    const res = await executor(sql, [status, id]);
    return res.rows[0] || null;
  }
}
