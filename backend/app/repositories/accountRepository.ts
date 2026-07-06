import { query } from '../db';
import { Account } from '../models';

export class AccountRepository {
  static async create(account: { user_id: string; bank_id: number; account_number: string; balance?: number }): Promise<Account> {
    const sql = `
      INSERT INTO accounts (user_id, bank_id, account_number, balance)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
    `;
    const balance = account.balance !== undefined ? account.balance : 0.00;
    const res = await query(sql, [account.user_id, account.bank_id, account.account_number, balance]);
    const row = res.rows[0];
    return {
      ...row,
      balance: parseFloat(row.balance),
    };
  }

  static async findById(id: string): Promise<Account | null> {
    const sql = 'SELECT * FROM accounts WHERE id = $1;';
    const res = await query(sql, [id]);
    if (!res.rows[0]) return null;
    const row = res.rows[0];
    return {
      ...row,
      balance: parseFloat(row.balance),
    };
  }

  static async findByAccountNumber(accountNumber: string): Promise<Account | null> {
    const sql = 'SELECT * FROM accounts WHERE account_number = $1;';
    const res = await query(sql, [accountNumber]);
    if (!res.rows[0]) return null;
    const row = res.rows[0];
    return {
      ...row,
      balance: parseFloat(row.balance),
    };
  }

  static async findByUserId(userId: string): Promise<Account[]> {
    const sql = 'SELECT * FROM accounts WHERE user_id = $1;';
    const res = await query(sql, [userId]);
    return res.rows.map(row => ({
      ...row,
      balance: parseFloat(row.balance),
    }));
  }

  static async updateBalance(id: string, newBalance: number): Promise<Account | null> {
    const sql = `
      UPDATE accounts
      SET balance = $1
      WHERE id = $2
      RETURNING *;
    `;
    const res = await query(sql, [newBalance, id]);
    if (!res.rows[0]) return null;
    const row = res.rows[0];
    return {
      ...row,
      balance: parseFloat(row.balance),
    };
  }

  static async delete(id: string): Promise<boolean> {
    const sql = 'DELETE FROM accounts WHERE id = $1;';
    const res = await query(sql, [id]);
    return (res.rowCount ?? 0) > 0;
  }
}
