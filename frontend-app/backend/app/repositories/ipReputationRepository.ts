import { query } from '../db';
import { IpReputation } from '../models';

export class IpReputationRepository {
  static async create(ipRep: {
    ip_address: string;
    reputation_score: number;
    is_blacklisted?: boolean;
  }): Promise<IpReputation> {
    const sql = `
      INSERT INTO ip_reputation (ip_address, reputation_score, is_blacklisted)
      VALUES ($1, $2, $3)
      RETURNING *;
    `;
    const isBlacklisted = ipRep.is_blacklisted || false;
    const res = await query(sql, [ipRep.ip_address, ipRep.reputation_score, isBlacklisted]);
    return res.rows[0];
  }

  static async findById(id: string): Promise<IpReputation | null> {
    const sql = 'SELECT * FROM ip_reputation WHERE id = $1;';
    const res = await query(sql, [id]);
    return res.rows[0] || null;
  }

  static async findByIpAddress(ipAddress: string): Promise<IpReputation | null> {
    const sql = 'SELECT * FROM ip_reputation WHERE ip_address = $1;';
    const res = await query(sql, [ipAddress]);
    return res.rows[0] || null;
  }

  static async updateReputation(
    ipAddress: string,
    score: number,
    isBlacklisted: boolean
  ): Promise<IpReputation | null> {
    const sql = `
      UPDATE ip_reputation
      SET reputation_score = $1, is_blacklisted = $2, last_updated = CURRENT_TIMESTAMP
      WHERE ip_address = $3
      RETURNING *;
    `;
    const res = await query(sql, [score, isBlacklisted, ipAddress]);
    return res.rows[0] || null;
  }
}
