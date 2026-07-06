import { query } from '../db';
import { TransactionFraudMatch } from '../models';

export class TransactionFraudMatchRepository {
  static async create(match: {
    transaction_id: string;
    fraud_pattern_id: number;
    score_impact: number;
    details?: string | null;
  }): Promise<TransactionFraudMatch> {
    const sql = `
      INSERT INTO transaction_fraud_matches (transaction_id, fraud_pattern_id, score_impact, details)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
    `;
    const res = await query(sql, [
      match.transaction_id,
      match.fraud_pattern_id,
      match.score_impact,
      match.details || null,
    ]);
    return res.rows[0];
  }

  static async findByTransactionId(transactionId: string): Promise<TransactionFraudMatch[]> {
    const sql = 'SELECT * FROM transaction_fraud_matches WHERE transaction_id = $1;';
    const res = await query(sql, [transactionId]);
    return res.rows;
  }
}
