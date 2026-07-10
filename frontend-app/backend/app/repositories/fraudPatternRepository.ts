import { query } from '../db';
import { FraudPattern } from '../models';

export class FraudPatternRepository {
  static async create(pattern: { pattern_name: string; description?: string | null; base_score: number }): Promise<FraudPattern> {
    const sql = `
      INSERT INTO fraud_patterns (pattern_name, description, base_score)
      VALUES ($1, $2, $3)
      RETURNING *;
    `;
    const res = await query(sql, [pattern.pattern_name, pattern.description || null, pattern.base_score]);
    return res.rows[0];
  }

  static async findById(id: number): Promise<FraudPattern | null> {
    const sql = 'SELECT * FROM fraud_patterns WHERE id = $1;';
    const res = await query(sql, [id]);
    return res.rows[0] || null;
  }

  static async findByPatternName(patternName: string): Promise<FraudPattern | null> {
    const sql = 'SELECT * FROM fraud_patterns WHERE pattern_name = $1;';
    const res = await query(sql, [patternName]);
    return res.rows[0] || null;
  }

  static async listAll(): Promise<FraudPattern[]> {
    const sql = 'SELECT * FROM fraud_patterns;';
    const res = await query(sql);
    return res.rows;
  }
}
