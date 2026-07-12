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

  // Count recent incoming transactions to this account below a threshold amount (unsolicited micro-credits)
  static async countRecentIncomingMicroCredits(accountId: string, minutes: number, maxAmount: number = 100): Promise<number> {
    const sql = `
      SELECT COUNT(*) as count
      FROM transactions
      WHERE receiver_account_id = $1
        AND status = 'success'
        AND amount < $2
        AND created_at >= NOW() - ($3 * INTERVAL '1 minute');
    `;
    const res = await query(sql, [accountId, maxAmount, minutes]);
    return parseInt(res.rows[0].count);
  }

  // Check if sender has previously sent money to this receiver successfully
  static async hasPaidBefore(senderAccountId: string, receiverAccountId: string): Promise<boolean> {
    const sql = `
      SELECT COUNT(*) as count
      FROM transactions
      WHERE sender_account_id = $1
        AND receiver_account_id = $2
        AND status = 'success';
    `;
    const res = await query(sql, [senderAccountId, receiverAccountId]);
    return parseInt(res.rows[0].count) > 0;
  }

  // Traces similar amounts backwards in time to find rapid multi-hop transfers (money forwarding / mule ring)
  static async detectMuleChain(senderAccountId: string, amount: number): Promise<string[]> {
    const windowMinutes = 10;
    const tolerance = 0.25;
    const path = [senderAccountId];
    let currentAccount = senderAccountId;
    
    for (let hop = 0; hop < 3; hop++) {
      const sql = `
        SELECT sender_account_id, amount, created_at
        FROM transactions
        WHERE receiver_account_id = $1
          AND status = 'success'
          AND amount BETWEEN $2 AND $3
          AND created_at >= NOW() - ($4 * INTERVAL '1 minute')
        ORDER BY created_at DESC
        LIMIT 1;
      `;
      const minAmount = amount * (1 - tolerance);
      const maxAmount = amount * (1 + tolerance);
      const res = await query(sql, [currentAccount, minAmount, maxAmount, windowMinutes * (hop + 1)]);
      if (res.rows.length === 0) {
        break;
      }
      const row = res.rows[0];
      const nextSender = row.sender_account_id;
      if (path.includes(nextSender)) {
        // Prevent cycle infinite loop
        break;
      }
      path.unshift(nextSender);
      currentAccount = nextSender;
    }
    return path.length >= 3 ? path : [];
  }
}

