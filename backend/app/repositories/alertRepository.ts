import { query } from '../db';
import { Alert } from '../models';

export class AlertRepository {
  static async create(alert: {
    transaction_id: string;
    status?: string;
    severity?: string;
  }): Promise<Alert> {
    const sql = `
      INSERT INTO alerts (transaction_id, status, severity)
      VALUES ($1, $2, $3)
      RETURNING *;
    `;
    const status = alert.status || 'open';
    const severity = alert.severity || 'medium';
    const res = await query(sql, [alert.transaction_id, status, severity]);
    return res.rows[0];
  }

  static async findById(id: string): Promise<Alert | null> {
    const sql = 'SELECT * FROM alerts WHERE id = $1;';
    const res = await query(sql, [id]);
    return res.rows[0] || null;
  }

  static async findOpenAlerts(): Promise<Alert[]> {
    const sql = "SELECT * FROM alerts WHERE status = 'open' ORDER BY created_at DESC;";
    const res = await query(sql);
    return res.rows;
  }

  static async updateStatus(id: string, status: string): Promise<Alert | null> {
    const sql = `
      UPDATE alerts
      SET status = $1
      WHERE id = $2
      RETURNING *;
    `;
    const res = await query(sql, [status, id]);
    return res.rows[0] || null;
  }
}
