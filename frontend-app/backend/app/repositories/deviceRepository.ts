import { query } from '../db';
import { Device } from '../models';

export class DeviceRepository {
  static async create(device: { user_id: string; device_fingerprint: string; status?: string }): Promise<Device> {
    const sql = `
      INSERT INTO devices (user_id, device_fingerprint, status)
      VALUES ($1, $2, $3)
      RETURNING *;
    `;
    const status = device.status || 'active';
    const res = await query(sql, [device.user_id, device.device_fingerprint, status]);
    return res.rows[0];
  }

  static async findById(id: string): Promise<Device | null> {
    const sql = 'SELECT * FROM devices WHERE id = $1;';
    const res = await query(sql, [id]);
    return res.rows[0] || null;
  }

  static async findByFingerprintAndUserId(fingerprint: string, userId: string): Promise<Device | null> {
    const sql = 'SELECT * FROM devices WHERE device_fingerprint = $1 AND user_id = $2;';
    const res = await query(sql, [fingerprint, userId]);
    return res.rows[0] || null;
  }

  static async updateStatus(id: string, status: string): Promise<Device | null> {
    const sql = `
      UPDATE devices
      SET status = $1
      WHERE id = $2
      RETURNING *;
    `;
    const res = await query(sql, [status, id]);
    return res.rows[0] || null;
  }

  static async delete(id: string): Promise<boolean> {
    const sql = 'DELETE FROM devices WHERE id = $1;';
    const res = await query(sql, [id]);
    return (res.rowCount ?? 0) > 0;
  }
}
