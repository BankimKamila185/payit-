import { query } from '../db';
import { DeviceFingerprint } from '../models';

export class DeviceFingerprintRepository {
  static async create(fingerprint: {
    device_id: string;
    browser_info?: string | null;
    os_info?: string | null;
    ip_address?: string | null;
  }): Promise<DeviceFingerprint> {
    const sql = `
      INSERT INTO device_fingerprints (device_id, browser_info, os_info, ip_address)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
    `;
    const res = await query(sql, [
      fingerprint.device_id,
      fingerprint.browser_info || null,
      fingerprint.os_info || null,
      fingerprint.ip_address || null,
    ]);
    return res.rows[0];
  }

  static async findById(id: string): Promise<DeviceFingerprint | null> {
    const sql = 'SELECT * FROM device_fingerprints WHERE id = $1;';
    const res = await query(sql, [id]);
    return res.rows[0] || null;
  }
}
