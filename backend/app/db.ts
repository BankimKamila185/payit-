import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const isTest = process.env.NODE_ENV === 'test';
let connectionString = process.env.DATABASE_URL;

if (isTest && connectionString) {
  if (connectionString.endsWith('/payit')) {
    connectionString = connectionString.replace(/\/payit$/, '/payit_test');
  } else if (connectionString.endsWith('/payit/')) {
    connectionString = connectionString.replace(/\/payit\/$/, '/payit_test');
  }
}

export const pool = connectionString
  ? new Pool({ connectionString })
  : new Pool({
      host: process.env.PGHOST || 'localhost',
      port: parseInt(process.env.PGPORT || '5432'),
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD || 'postgres',
      database: isTest
        ? (process.env.PGDATABASE_TEST || 'payit_test')
        : (process.env.PGDATABASE || 'payit'),
    });

export const query = (text: string, params?: any[]) => {
  return pool.query(text, params);
};
