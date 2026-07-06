import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { FraudService } from '../app/services/fraudService';
import {
  AccountRepository,
  BlacklistRepository,
  TransactionRepository,
  IpReputationRepository,
  FraudPatternRepository,
  TransactionFraudMatchRepository,
  FraudScoreRepository,
  AlertRepository,
  AuditLogRepository
} from '../app/repositories';
import { Transaction } from '../app/models';

// Tell Jest to auto-mock the repositories module
jest.mock('../app/repositories');

describe('FraudService', () => {
  const mockTransaction: Transaction = {
    id: 'tx-uuid-123',
    sender_account_id: 'sender-acc-uuid',
    receiver_account_id: 'receiver-acc-uuid',
    amount: 500,
    status: 'pending',
    ip_address: '192.168.1.1',
    device_id: 'device-uuid-1',
    created_at: new Date(),
  };

  const mockAccount = {
    id: 'sender-acc-uuid',
    user_id: 'user-uuid-1',
    bank_id: 1,
    account_number: '1234567890',
    balance: 5000,
    created_at: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock behaviors
    (AccountRepository.findById as any).mockResolvedValue(mockAccount);
    (BlacklistRepository.checkExists as any).mockResolvedValue(false);
    (TransactionRepository.countRecentTransactionsByUser as any).mockResolvedValue(0);
    (TransactionRepository.countSuccessfulTransactionsByDevice as any).mockResolvedValue(2);
    (IpReputationRepository.findByIpAddress as any).mockResolvedValue(null);
    (FraudPatternRepository.listAll as any).mockResolvedValue([
      { id: 1, pattern_name: 'velocity_check', base_score: 40 },
      { id: 2, pattern_name: 'new_device_high_amount', base_score: 50 },
      { id: 3, pattern_name: 'blacklisted_ip_match', base_score: 100 },
      { id: 4, pattern_name: 'impossible_travel', base_score: 60 },
      { id: 5, pattern_name: 'otp_brute_force', base_score: 45 },
    ]);
    (TransactionFraudMatchRepository.create as any).mockResolvedValue({});
    (FraudScoreRepository.create as any).mockResolvedValue({});
    (AlertRepository.create as any).mockResolvedValue({});
    (AuditLogRepository.create as any).mockResolvedValue({});
  });

  describe('Blacklist Check', () => {
    it('should auto-reject the transaction and return verdict rejected if the user is blacklisted', async () => {
      // Mock user is blacklisted
      (BlacklistRepository.checkExists as any).mockImplementation((type: string, value: string) => {
        if (type === 'user' && value === 'user-uuid-1') return Promise.resolve(true);
        return Promise.resolve(false);
      });

      const result = await FraudService.evaluate(mockTransaction);

      expect(result.verdict).toBe('rejected');
      expect(result.score).toBe(100);
      expect(result.matches).toContain('blacklisted_ip_match');

      // Verify DB recording calls
      expect(FraudScoreRepository.create as any).toHaveBeenCalledWith({
        transaction_id: mockTransaction.id,
        cumulative_score: 100,
      });
      expect(TransactionFraudMatchRepository.create as any).toHaveBeenCalled();
      expect(AlertRepository.create as any).toHaveBeenCalledWith({
        transaction_id: mockTransaction.id,
        status: 'open',
        severity: 'critical',
      });
    });

    it('should auto-reject if the device is blacklisted', async () => {
      (BlacklistRepository.checkExists as any).mockImplementation((type: string, value: string) => {
        if (type === 'device' && value === 'device-uuid-1') return Promise.resolve(true);
        return Promise.resolve(false);
      });

      const result = await FraudService.evaluate(mockTransaction);

      expect(result.verdict).toBe('rejected');
      expect(result.score).toBe(100);
      expect(result.matches).toContain('blacklisted_ip_match');
    });

    it('should auto-reject if the IP is blacklisted', async () => {
      (BlacklistRepository.checkExists as any).mockImplementation((type: string, value: string) => {
        if (type === 'ip' && value === '192.168.1.1') return Promise.resolve(true);
        return Promise.resolve(false);
      });

      const result = await FraudService.evaluate(mockTransaction);

      expect(result.verdict).toBe('rejected');
      expect(result.score).toBe(100);
      expect(result.matches).toContain('blacklisted_ip_match');
    });
  });

  describe('Velocity Check', () => {
    it('should flag the transaction and add to score if sender exceeds 5 transactions in the last 10 minutes', async () => {
      // Mock 6 recent transactions
      (TransactionRepository.countRecentTransactionsByUser as any).mockResolvedValue(6);

      const result = await FraudService.evaluate(mockTransaction);

      expect(result.verdict).toBe('flagged');
      expect(result.score).toBe(40); // velocity_check has a base score of 40
      expect(result.matches).toContain('velocity_check');

      // Verify matches logging
      expect(FraudScoreRepository.create as any).toHaveBeenCalledWith({
        transaction_id: mockTransaction.id,
        cumulative_score: 40,
      });
      expect(TransactionFraudMatchRepository.create as any).toHaveBeenCalledWith(expect.objectContaining({
        transaction_id: mockTransaction.id,
        fraud_pattern_id: 1, // velocity_check ID
        score_impact: 40,
      }));
    });

    it('should approve transaction normally if sender has 5 or fewer transactions', async () => {
      (TransactionRepository.countRecentTransactionsByUser as any).mockResolvedValue(5);

      const result = await FraudService.evaluate(mockTransaction);

      expect(result.verdict).toBe('approved');
      expect(result.score).toBe(0);
      expect(result.matches).toHaveLength(0);
    });
  });

  describe('Cumulative scoring and Alerts', () => {
    it('should trigger alert with status open and verdict alerted if score > 70', async () => {
      // Trigger multiple rules to exceed score 70 (e.g. velocity + new device high amount)
      (TransactionRepository.countRecentTransactionsByUser as any).mockResolvedValue(6); // +40
      (TransactionRepository.countSuccessfulTransactionsByDevice as any).mockResolvedValue(0); // new device
      
      const highValueTransaction = {
        ...mockTransaction,
        amount: 15000, // triggers new_device_high_amount since amount > 10000 (+50)
      };

      const result = await FraudService.evaluate(highValueTransaction);

      expect(result.score).toBe(90); // 40 (velocity) + 50 (new device high amount)
      expect(result.verdict).toBe('alerted');
      expect(result.matches).toContain('velocity_check');
      expect(result.matches).toContain('new_device_high_amount');

      // Verify that alert was inserted
      expect(AlertRepository.create as any).toHaveBeenCalledWith({
        transaction_id: highValueTransaction.id,
        status: 'open',
        severity: 'high',
      });
    });
  });
});
