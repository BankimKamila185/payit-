import { query } from '../db';
import { FraudScore } from '../models';

export class FraudScoreRepository {
  static async create(score: { transaction_id: string; cumulative_score: number }): Promise<FraudScore> {
    const sql = `
      INSERT INTO fraud_scores (transaction_id, cumulative_score)
      VALUES ($1, $2)
      RETURNING *;
    `;
    const res = await query(sql, [score.transaction_id, score.cumulative_score]);
    return res.rows[0];
  }

  static async findById(id: string): Promise<FraudScore | null> {
    const sql = 'SELECT * FROM fraud_scores WHERE id = $1;';
    const res = await query(sql, [id]);
    return res.rows[0] || null;
  }

  static async findByTransactionId(transactionId: string): Promise<FraudScore | null> {
    const sql = 'SELECT * FROM fraud_scores WHERE transaction_id = $1;';
    const res = await query(sql, [transactionId]);
    return res.rows[0] || null;
  }

  static async updateScore(transactionId: string, cumulativeScore: number): Promise<FraudScore | null> {
    const sql = `
      UPDATE fraud_scores
      SET cumulative_score = $1
      WHERE transaction_id = $2
      RETURNING *;
    `;
    const res = await query(sql, [cumulativeScore, transactionId]);
    return res.rows[0] || null;
  }
}
