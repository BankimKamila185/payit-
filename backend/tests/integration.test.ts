import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import app from '../app/app';
import { pool } from '../app/db';
import {
  UserRepository,
  BankRepository,
  AccountRepository,
  BlacklistRepository,
  TransactionRepository,
  AlertRepository
} from '../app/repositories';

describe('Integration Tests (Database-Connected)', () => {
  let senderUser: any;
  let receiverUser: any;
  let senderAccount: any;
  let receiverAccount: any;
  let sbiBank: any;

  beforeAll(async () => {
    // Mock global fetch to isolate integration tests from Python ML server calls
    (global as any).fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ score: 0, reasons: [] }),
      } as any)
    );

    // Clear test tables to prevent overlap
    await pool.query('DELETE FROM blacklist;');
    await pool.query('DELETE FROM alerts;');
    await pool.query('DELETE FROM transaction_fraud_matches;');
    await pool.query('DELETE FROM fraud_scores;');
    await pool.query('DELETE FROM transactions;');
    await pool.query('DELETE FROM accounts;');
    await pool.query('DELETE FROM users;');

    // Retrieve or seed a bank
    sbiBank = await BankRepository.findByIfscPrefix('SBIN');
    if (!sbiBank) {
      sbiBank = await BankRepository.create({ name: 'State Bank of India', ifsc_prefix: 'SBIN' });
    }

    // Create sender user and account
    senderUser = await UserRepository.create({
      name: 'Sender User',
      phone: '9876543210',
      email: 'sender@payit.com',
    });
    senderAccount = await AccountRepository.create({
      user_id: senderUser.id,
      bank_id: sbiBank.id,
      account_number: 'ACT-SENDER-123',
      balance: 20000.00,
    });

    // Create receiver user and account
    receiverUser = await UserRepository.create({
      name: 'Receiver User',
      phone: '8765432109',
      email: 'receiver@payit.com',
    });
    receiverAccount = await AccountRepository.create({
      user_id: receiverUser.id,
      bank_id: sbiBank.id,
      account_number: 'ACT-RECEIVER-456',
      balance: 1000.00,
    });
  });

  afterAll(async () => {
    // Close connection pool
    await pool.end();
  });

  describe('POST /api/transactions', () => {
    it('should successfully complete a transaction and adjust balances when fraud score is 0', async () => {
      const payload = {
        sender_account_id: senderAccount.id,
        receiver_account_id: receiverAccount.id,
        amount: 5000,
        ip_address: '127.0.0.1',
      };

      const res = await request(app)
        .post('/api/transactions')
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.message).toBe('Transaction completed successfully');
      expect(res.body.fraudVerdict.verdict).toBe('approved');
      expect(res.body.fraudVerdict.score).toBe(0);

      // Verify balances updated in DB
      const updatedSender = await AccountRepository.findById(senderAccount.id);
      const updatedReceiver = await AccountRepository.findById(receiverAccount.id);

      expect(updatedSender?.balance).toBe(15000.00); // 20000 - 5000
      expect(updatedReceiver?.balance).toBe(6000.00); // 1000 + 5000

      // Update local variables for subsequent tests
      senderAccount = updatedSender;
      receiverAccount = updatedReceiver;
    });

    it('should reject transactions if the user has insufficient balance', async () => {
      const payload = {
        sender_account_id: senderAccount.id,
        receiver_account_id: receiverAccount.id,
        amount: 25000, // exceeds 15000
        ip_address: '127.0.0.1',
      };

      const res = await request(app)
        .post('/api/transactions')
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Insufficient balance');

      // Balances must remain unchanged
      const updatedSender = await AccountRepository.findById(senderAccount.id);
      expect(updatedSender?.balance).toBe(15000.00);
    });

    it('should auto-reject transactions if the sender is blacklisted', async () => {
      // Add sender to blacklist
      await BlacklistRepository.create({
        entity_type: 'user',
        entity_value: senderUser.id,
        reason: 'Testing blacklist auto-reject',
      });

      const payload = {
        sender_account_id: senderAccount.id,
        receiver_account_id: receiverAccount.id,
        amount: 100,
        ip_address: '127.0.0.1',
      };

      const res = await request(app)
        .post('/api/transactions')
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Transaction rejected due to security policy');
      expect(res.body.fraudVerdict.verdict).toBe('rejected');
      expect(res.body.fraudVerdict.score).toBe(100);

      // Verify balance did not change
      const updatedSender = await AccountRepository.findById(senderAccount.id);
      expect(updatedSender?.balance).toBe(15000.00);
    });
  });

  describe('GET /api/alerts', () => {
    it('should list open alerts', async () => {
      const res = await request(app).get('/api/alerts');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1); // must contain the alert from the blacklisted attempt above
      expect(res.body[0].status).toBe('open');
    });
  });

  describe('GET /api/users/:id/transactions', () => {
    it('should list transaction history for the user', async () => {
      const res = await request(app).get(`/api/users/${senderUser.id}/transactions`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(2); // 1 success, 1 rejected, 1 failed (insufficient balance)
    });
  });
});
