import { query } from '../db';
import { Bank } from '../models';

export class BankRepository {
  static async create(bank: { name: string; ifsc_prefix: string }): Promise<Bank> {
    const sql = `
      INSERT INTO banks (name, ifsc_prefix)
      VALUES ($1, $2)
      RETURNING *;
    `;
    const res = await query(sql, [bank.name, bank.ifsc_prefix]);
    return res.rows[0];
  }

  static async findById(id: number): Promise<Bank | null> {
    const sql = 'SELECT * FROM banks WHERE id = $1;';
    const res = await query(sql, [id]);
    return res.rows[0] || null;
  }

  static async findByIfscPrefix(ifscPrefix: string): Promise<Bank | null> {
    const sql = 'SELECT * FROM banks WHERE ifsc_prefix = $1;';
    const res = await query(sql, [ifscPrefix]);
    return res.rows[0] || null;
  }

  static async listAll(): Promise<Bank[]> {
    const sql = 'SELECT * FROM banks ORDER BY name;';
    const res = await query(sql);
    return res.rows;
  }

  static async delete(id: number): Promise<boolean> {
    const sql = 'DELETE FROM banks WHERE id = $1;';
    const res = await query(sql, [id]);
    return (res.rowCount ?? 0) > 0;
  }
}
