import { Client } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

async function ensureTestDb() {
  const connectionString = process.env.DATABASE_URL;
  let clientConfig: any = {};

  if (connectionString) {
    const lastSlashIndex = connectionString.lastIndexOf('/');
    const baseUrl = connectionString.substring(0, lastSlashIndex);
    clientConfig.connectionString = `${baseUrl}/postgres`;
  } else {
    clientConfig = {
      host: process.env.PGHOST || 'localhost',
      port: parseInt(process.env.PGPORT || '5432'),
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD || 'postgres',
      database: 'postgres',
    };
  }

  const client = new Client(clientConfig);

  try {
    await client.connect();
    const res = await client.query("SELECT 1 FROM pg_database WHERE datname = 'payit_test'");
    if (res.rowCount === 0) {
      console.log("Database 'payit_test' does not exist. Creating it...");
      await client.query("CREATE DATABASE payit_test");
      console.log("Database 'payit_test' created successfully.");
    } else {
      console.log("Database 'payit_test' already exists.");
    }
  } catch (error) {
    console.error("Error ensuring test database exists:", error);
  } finally {
    await client.end();
  }
}

ensureTestDb();
