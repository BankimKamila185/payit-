import fs from 'fs';
import path from 'path';
import { pool } from './db';

const resetQuery = `
  DROP TABLE IF EXISTS audit_logs, blacklist, device_fingerprints, ip_reputation, alerts, 
                       transaction_fraud_matches, fraud_scores, fraud_patterns, 
                       otp_verifications, transactions, sessions, devices, accounts, 
                       banks, users CASCADE;
`;

async function initDb() {
  const isReset = process.argv.includes('--reset');

  try {
    console.log('Connecting to database...');
    
    if (isReset) {
      console.log('Reset flag detected. Dropping existing tables...');
      await pool.query(resetQuery);
      console.log('Tables dropped successfully.');
    }

    // Read schema.sql from repo root
    const schemaPath = path.resolve(process.cwd(), '../schema.sql');
    console.log(`Reading schema from ${schemaPath}...`);
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    // Execute schema
    console.log('Applying schema...');
    await pool.query(schemaSql);
    console.log('Schema applied successfully.');

    // Read seed.sql from repo root
    const seedPath = path.resolve(process.cwd(), '../seed.sql');
    console.log(`Reading seed data from ${seedPath}...`);
    const seedSql = fs.readFileSync(seedPath, 'utf8');

    // Execute seed
    console.log('Applying seed data...');
    await pool.query(seedSql);
    console.log('Database seeded successfully.');

  } catch (error) {
    console.error('Error during database initialization:', error);
    process.exit(1);
  } finally {
    await pool.end();
    console.log('Database connection pool closed.');
  }
}

initDb();
