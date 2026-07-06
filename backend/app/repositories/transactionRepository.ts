import { query } from '../db';
import { Transaction } from '../models';

export class TransactionRepository {
  static async create(tx: {
    sender_account_id: string;
    receiver_account_id: string;
    amount: number;
    status?: string;
    ip_address: string;
    device_id?: string | null;
  }): Promise<Transaction> {
    const sql = `
      INSERT INTO transactions (sender_account_id, receiver_account_id, amount, status, ip_address, device_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `;
    const status = tx.status || 'pending';
    const res = await query(sql, [
      tx.sender_account_id,
      tx.receiver_account_id,
      tx.amount,
      status,
      tx.ip_address,
      tx.device_id || null,
    ]);
    const row = res.rows[0];
    return {
      ...row,
      amount: parseFloat(row.amount),
    };
  }

  static async findById(id: string): Promise<Transaction | null> {
    const sql = 'SELECT * FROM transactions WHERE id = $1;';
    const res = await query(sql, [id]);
    if (!res.rows[0]) return null;
    const row = res.rows[0];
    return {
      ...row,
      amount: parseFloat(row.amount),
    };
  }

  static async updateStatus(id: string, status: string): Promise<Transaction | null> {
    const sql = `
      UPDATE transactions
      SET status = $1
      WHERE id = $2
      RETURNING *;
    `;
    const res = await query(sql, [status, id]);
    if (!res.rows[0]) return null;
    const row = res.rows[0];
    return {
      ...row,
      amount: parseFloat(row.amount),
    };
  }

  static async findByUserId(userId: string): Promise<Transaction[]> {
    const sql = `
      SELECT t.* 
      FROM transactions t
      JOIN accounts a ON t.sender_account_id = a.id OR t.receiver_account_id = a.id
      WHERE a.user_id = $1
      ORDER BY t.created_at DESC;
    `;
    const res = await query(sql, [userId]);
    return res.rows.map(row => ({
      ...row,
      amount: parseFloat(row.amount),
    }));
  }

  static async countRecentTransactionsByUser(userId: string, minutes: number): Promise<number> {
    const sql = `
      SELECT COUNT(*) as count
      FROM transactions t
      JOIN accounts a ON t.sender_account_id = a.id
      WHERE a.user_id = $1
        AND t.created_at >= NOW() - ($2 * INTERVAL '1 minute');
    `;
    const res = await query(sql, [userId, minutes]);
    return parseInt(res.rows[0].count);
  }

  // Count prior successful transactions for a device_id to check if it's new
  static async countSuccessfulTransactionsByDevice(deviceId: string): Promise<number> {
    const sql = `
      SELECT COUNT(*) as count
      FROM transactions
      WHERE device_id = $1 AND status = 'success';
    `;
    const res = await query(sql, [deviceId]);
    return parseInt(res.rows[0].count);
  }
}
