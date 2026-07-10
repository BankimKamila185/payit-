import { query } from '../db';
import { User } from '../models';

export class UserRepository {
  static async create(user: { phone: string; name: string; email?: string | null }): Promise<User> {
    const sql = `
      INSERT INTO users (phone, name, email)
      VALUES ($1, $2, $3)
      RETURNING *;
    `;
    const res = await query(sql, [user.phone, user.name, user.email || null]);
    return res.rows[0];
  }

  static async findById(id: string): Promise<User | null> {
    const sql = 'SELECT * FROM users WHERE id = $1;';
    const res = await query(sql, [id]);
    return res.rows[0] || null;
  }

  static async findByPhone(phone: string): Promise<User | null> {
    const sql = 'SELECT * FROM users WHERE phone = $1;';
    const res = await query(sql, [phone]);
    return res.rows[0] || null;
  }

  static async update(id: string, user: Partial<Omit<User, 'id' | 'created_at'>>): Promise<User | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (user.phone !== undefined) {
      fields.push(`phone = $${idx++}`);
      values.push(user.phone);
    }
    if (user.name !== undefined) {
      fields.push(`name = $${idx++}`);
      values.push(user.name);
    }
    if (user.email !== undefined) {
      fields.push(`email = $${idx++}`);
      values.push(user.email);
    }

    if (fields.length === 0) return this.findById(id);

    values.push(id);
    const sql = `
      UPDATE users
      SET ${fields.join(', ')}
      WHERE id = $${idx}
      RETURNING *;
    `;
    const res = await query(sql, values);
    return res.rows[0] || null;
  }

  static async delete(id: string): Promise<boolean> {
    const sql = 'DELETE FROM users WHERE id = $1;';
    const res = await query(sql, [id]);
    return (res.rowCount ?? 0) > 0;
  }
}
