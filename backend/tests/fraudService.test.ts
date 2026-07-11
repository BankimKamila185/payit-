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

  const mockSenderAccount = {
    id: 'sender-acc-uuid',
    user_id: 'user-uuid-1',
    bank_id: 1,
    account_number: '1234567890',
    balance: 100000,
    account_age_days: 365,
    created_at: new Date(),
  };

  const mockReceiverAccount = {
    id: 'receiver-acc-uuid',
    user_id: 'user-uuid-2',
    bank_id: 1,
    account_number: '0987654321',
    balance: 5000,
    account_age_days: 365,
    created_at: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Default: clean slate — no fraud signals
    (AccountRepository.findById as any).mockImplementation((id: string) => {
      if (id === 'sender-acc-uuid') return Promise.resolve(mockSenderAccount);
      if (id === 'receiver-acc-uuid') return Promise.resolve(mockReceiverAccount);
      return Promise.resolve(null);
    });
    (BlacklistRepository.checkExists as any).mockResolvedValue(false);
    (TransactionRepository.countRecentTransactionsByUser as any).mockResolvedValue(0);
    (TransactionRepository.countSuccessfulTransactionsByDevice as any).mockResolvedValue(2);
    (IpReputationRepository.findByIpAddress as any).mockResolvedValue(null);
    (FraudPatternRepository.listAll as any).mockResolvedValue([
      { id: 1, pattern_name: 'velocity_check',         base_score: 40 },
      { id: 2, pattern_name: 'new_device_high_amount',  base_score: 50 },
      { id: 3, pattern_name: 'blacklisted_ip_match',    base_score: 100 },
      { id: 4, pattern_name: 'impossible_travel',       base_score: 60 },
      { id: 5, pattern_name: 'otp_brute_force',         base_score: 45 },
      { id: 6, pattern_name: 'high_balance_drawdown',   base_score: 35 },
      { id: 7, pattern_name: 'dormant_account_spike',   base_score: 40 },
      { id: 8, pattern_name: 'new_receiver_account',    base_score: 30 },
    ]);
    (TransactionFraudMatchRepository.create as any).mockResolvedValue({});
    (FraudScoreRepository.create as any).mockResolvedValue({});
    (AlertRepository.create as any).mockResolvedValue({});
    (AuditLogRepository.create as any).mockResolvedValue({});
  });

  // ─── Blacklist ───────────────────────────────────────────────────────────────
  describe('Blacklist Check', () => {
    it('should auto-reject when the sender user is blacklisted', async () => {
      (BlacklistRepository.checkExists as any).mockImplementation((type: string, value: string) => {
        if (type === 'user' && value === 'user-uuid-1') return Promise.resolve(true);
        return Promise.resolve(false);
      });

      const result = await FraudService.evaluate(mockTransaction);

      expect(result.verdict).toBe('rejected');
      expect(result.score).toBe(100);
      expect(result.matches).toContain('blacklisted_ip_match');
      expect(FraudScoreRepository.create as any).toHaveBeenCalledWith({
        transaction_id: mockTransaction.id,
        cumulative_score: 100,
      });
      expect(AlertRepository.create as any).toHaveBeenCalledWith({
        transaction_id: mockTransaction.id,
        status: 'open',
        severity: 'critical',
      });
    });

    it('should auto-reject when the device is blacklisted', async () => {
      (BlacklistRepository.checkExists as any).mockImplementation((type: string, value: string) => {
        if (type === 'device' && value === 'device-uuid-1') return Promise.resolve(true);
        return Promise.resolve(false);
      });

      const result = await FraudService.evaluate(mockTransaction);
      expect(result.verdict).toBe('rejected');
      expect(result.score).toBe(100);
    });

    it('should auto-reject when the IP is blacklisted', async () => {
      (BlacklistRepository.checkExists as any).mockImplementation((type: string, value: string) => {
        if (type === 'ip' && value === '192.168.1.1') return Promise.resolve(true);
        return Promise.resolve(false);
      });

      const result = await FraudService.evaluate(mockTransaction);
      expect(result.verdict).toBe('rejected');
      expect(result.score).toBe(100);
    });
  });

  // ─── Velocity ────────────────────────────────────────────────────────────────
  describe('Velocity Check', () => {
    it('should flag and score when sender exceeds 5 transactions in 10 minutes', async () => {
      (TransactionRepository.countRecentTransactionsByUser as any).mockResolvedValue(6);

      const result = await FraudService.evaluate(mockTransaction);

      expect(result.verdict).toBe('flagged');
      expect(result.score).toBe(40);
      expect(result.matches).toContain('velocity_check');
      expect(TransactionFraudMatchRepository.create as any).toHaveBeenCalledWith(
        expect.objectContaining({
          transaction_id: mockTransaction.id,
          fraud_pattern_id: 1,
          score_impact: 40,
        })
      );
    });

    it('should approve when sender has 5 or fewer transactions', async () => {
      (TransactionRepository.countRecentTransactionsByUser as any).mockResolvedValue(5);

      const result = await FraudService.evaluate(mockTransaction);
      expect(result.verdict).toBe('approved');
      expect(result.score).toBe(0);
      expect(result.matches).toHaveLength(0);
    });
  });

  // ─── New Device + High Amount ────────────────────────────────────────────────
  describe('New Device High Amount Check', () => {
    it('should flag when device is new (0 prior txns) and amount > 10,000', async () => {
      (TransactionRepository.countSuccessfulTransactionsByDevice as any).mockResolvedValue(0);
      const bigTx = { ...mockTransaction, amount: 15000 };

      const result = await FraudService.evaluate(bigTx);

      expect(result.matches).toContain('new_device_high_amount');
      expect(result.score).toBeGreaterThanOrEqual(50);
    });

    it('should NOT flag when device is new but amount is small (<=10,000)', async () => {
      (TransactionRepository.countSuccessfulTransactionsByDevice as any).mockResolvedValue(0);
      const smallTx = { ...mockTransaction, amount: 5000 };

      const result = await FraudService.evaluate(smallTx);
      expect(result.matches).not.toContain('new_device_high_amount');
    });
  });

  // ─── High Balance Drawdown ───────────────────────────────────────────────────
  describe('High Balance Drawdown Check', () => {
    it('should flag when transaction drains >=90% of sender balance', async () => {
      // Balance = 100,000. Sending 95,000 = 95% drawdown
      const drainTx = { ...mockTransaction, amount: 95000 };

      const result = await FraudService.evaluate(drainTx);

      expect(result.matches).toContain('high_balance_drawdown');
      expect(result.score).toBeGreaterThanOrEqual(35);
    });

    it('should NOT flag for a normal partial withdrawal (<90%)', async () => {
      const normalTx = { ...mockTransaction, amount: 50000 }; // 50% of 100k balance

      const result = await FraudService.evaluate(normalTx);
      expect(result.matches).not.toContain('high_balance_drawdown');
    });
  });

  // ─── Dormant Account Spike ───────────────────────────────────────────────────
  describe('Dormant Account Spike Check', () => {
    it('should flag when account has <5 lifetime txns and sends large amount (>50,000)', async () => {
      // Mock low lifetime activity for this user (first call = 10min window, second = yearly check)
      (TransactionRepository.countRecentTransactionsByUser as any).mockResolvedValue(2);
      const largeTx = { ...mockTransaction, amount: 75000 };

      const result = await FraudService.evaluate(largeTx);

      expect(result.matches).toContain('dormant_account_spike');
    });

    it('should NOT flag when account has normal activity (>=5 lifetime txns)', async () => {
      (TransactionRepository.countRecentTransactionsByUser as any).mockResolvedValue(10);
      const largeTx = { ...mockTransaction, amount: 75000 };

      const result = await FraudService.evaluate(largeTx);
      expect(result.matches).not.toContain('dormant_account_spike');
    });
  });

  // ─── New Receiver Account ────────────────────────────────────────────────────
  describe('New Receiver Account Check', () => {
    it('should flag when receiver account is <7 days old and receiving >5,000', async () => {
      (AccountRepository.findById as any).mockImplementation((id: string) => {
        if (id === 'sender-acc-uuid') return Promise.resolve(mockSenderAccount);
        if (id === 'receiver-acc-uuid') return Promise.resolve({
          ...mockReceiverAccount,
          account_age_days: 3, // 3 days old — very new
        });
        return Promise.resolve(null);
      });

      const tx = { ...mockTransaction, amount: 10000 };
      const result = await FraudService.evaluate(tx);

      expect(result.matches).toContain('new_receiver_account');
    });

    it('should NOT flag when receiver account is established (>=7 days)', async () => {
      (AccountRepository.findById as any).mockImplementation((id: string) => {
        if (id === 'sender-acc-uuid') return Promise.resolve(mockSenderAccount);
        if (id === 'receiver-acc-uuid') return Promise.resolve({
          ...mockReceiverAccount,
          account_age_days: 30,
        });
        return Promise.resolve(null);
      });

      const tx = { ...mockTransaction, amount: 10000 };
      const result = await FraudService.evaluate(tx);
      expect(result.matches).not.toContain('new_receiver_account');
    });
  });

  // ─── Cumulative Scoring + Alerts ─────────────────────────────────────────────
  describe('Cumulative Scoring and Alerts', () => {
    it('should create an alert with severity high when score > 70', async () => {
      // Velocity (+40) + new device high amount (+50) = 90 → alerted
      (TransactionRepository.countRecentTransactionsByUser as any).mockResolvedValue(6); // +40
      (TransactionRepository.countSuccessfulTransactionsByDevice as any).mockResolvedValue(0); // new device

      const highValueTx = { ...mockTransaction, amount: 15000 };
      const result = await FraudService.evaluate(highValueTx);

      expect(result.score).toBe(90);
      expect(result.verdict).toBe('alerted');
      expect(result.matches).toContain('velocity_check');
      expect(result.matches).toContain('new_device_high_amount');

      expect(AlertRepository.create as any).toHaveBeenCalledWith({
        transaction_id: highValueTx.id,
        status: 'open',
        severity: 'high',
      });
    });

    it('should approve with zero score when no fraud signals are present', async () => {
      const result = await FraudService.evaluate(mockTransaction);

      expect(result.verdict).toBe('approved');
      expect(result.score).toBe(0);
      expect(result.matches).toHaveLength(0);
      expect(AlertRepository.create as any).not.toHaveBeenCalled();
    });
  });
});
