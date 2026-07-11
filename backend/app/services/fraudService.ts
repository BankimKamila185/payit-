import {
  TransactionRepository,
  AccountRepository,
  BlacklistRepository,
  IpReputationRepository,
  FraudPatternRepository,
  TransactionFraudMatchRepository,
  FraudScoreRepository,
  AlertRepository,
  AuditLogRepository
} from '../repositories';
import { Transaction } from '../models';

export interface FraudVerdict {
  verdict: 'approved' | 'flagged' | 'alerted' | 'rejected';
  score: number;
  matches: string[];
}

// ─── Pattern name → default id/score fallback ────────────────────────────────
const PATTERN_DEFAULTS: Record<string, { id: number; score: number }> = {
  velocity_check:           { id: 1, score: 40 },
  new_device_high_amount:   { id: 2, score: 50 },
  blacklisted_ip_match:     { id: 3, score: 100 },
  impossible_travel:        { id: 4, score: 60 },
  otp_brute_force:          { id: 5, score: 45 },
  high_balance_drawdown:    { id: 6, score: 35 },
  dormant_account_spike:    { id: 7, score: 40 },
  new_receiver_account:     { id: 8, score: 30 },
};

export class FraudService {
  static async evaluate(transaction: Transaction): Promise<FraudVerdict> {
    const { id: txId, sender_account_id, receiver_account_id, amount, ip_address, device_id } = transaction;

    // ── 1. Resolve sender account & user id ───────────────────────────────────
    const account = await AccountRepository.findById(sender_account_id);
    if (!account) throw new Error(`Sender account ${sender_account_id} not found`);
    const senderUserId = account.user_id;

    // ── Resolve receiver account ───────────────────────────────────────────────
    const receiverAccount = receiver_account_id
      ? await AccountRepository.findById(receiver_account_id)
      : null;

    // ── Load DB fraud patterns ────────────────────────────────────────────────
    const patterns = await FraudPatternRepository.listAll();
    const patternMap = new Map<string, { id: number; score: number }>();
    for (const p of patterns) {
      patternMap.set(p.pattern_name, { id: p.id, score: p.base_score });
    }
    const getPattern = (name: string) =>
      patternMap.get(name) ?? PATTERN_DEFAULTS[name] ?? { id: 99, score: 30 };

    // ── 2. BLACKLIST — auto-reject ─────────────────────────────────────────────
    const [isUserBlacklisted, isDeviceBlacklisted, isIpBlacklisted] = await Promise.all([
      BlacklistRepository.checkExists('user', senderUserId),
      device_id ? BlacklistRepository.checkExists('device', device_id) : Promise.resolve(false),
      BlacklistRepository.checkExists('ip', ip_address),
    ]);

    if (isUserBlacklisted || isDeviceBlacklisted || isIpBlacklisted) {
      const blacklistPattern = getPattern('blacklisted_ip_match');
      await Promise.all([
        FraudScoreRepository.create({ transaction_id: txId, cumulative_score: 100 }),
        TransactionFraudMatchRepository.create({
          transaction_id: txId,
          fraud_pattern_id: blacklistPattern.id,
          score_impact: blacklistPattern.score,
          details: `Auto-rejected: ${[
            isUserBlacklisted && 'User in blacklist',
            isDeviceBlacklisted && 'Device in blacklist',
            isIpBlacklisted && 'IP in blacklist',
          ].filter(Boolean).join(', ')}`,
        }),
        AlertRepository.create({ transaction_id: txId, status: 'open', severity: 'critical' }),
        AuditLogRepository.create({
          action: 'transaction_auto_rejected',
          user_id: senderUserId,
          details: { transaction_id: txId, reason: 'Blacklist match' },
        }),
      ]);
      return { verdict: 'rejected', score: 100, matches: ['blacklisted_ip_match'] };
    }

    // ── 3. FRAUD RULES — accumulate score ─────────────────────────────────────
    let cumulativeScore = 0;
    const triggeredMatches: Array<{ patternName: string; score: number; details: string }> = [];

    const addMatch = (patternName: string, details: string) => {
      const p = getPattern(patternName);
      triggeredMatches.push({ patternName, score: p.score, details });
      cumulativeScore += p.score;
    };

    // ── Rule A: Velocity check ──────────────────────────────────────────────
    // >5 transactions from sender in last 10 minutes → likely bot/compromised
    const recentTxCount = await TransactionRepository.countRecentTransactionsByUser(senderUserId, 10);
    if (recentTxCount > 5) {
      addMatch('velocity_check',
        `Sender made ${recentTxCount} transactions in the last 10 minutes (threshold: >5)`);
    }

    // ── Rule B: New device + high amount ───────────────────────────────────
    // First-ever transaction from device AND amount is large → possible ATO
    if (device_id) {
      const priorDeviceTxCount = await TransactionRepository.countSuccessfulTransactionsByDevice(device_id);
      if (priorDeviceTxCount === 0 && amount > 10000) {
        addMatch('new_device_high_amount',
          `₹${amount.toLocaleString()} sent from a device with 0 prior successful transactions`);
      }
    }

    // ── Rule C: IP reputation (bad IP) ─────────────────────────────────────
    const ipRep = await IpReputationRepository.findByIpAddress(ip_address);
    if (ipRep && (ipRep.is_blacklisted || ipRep.reputation_score < 20)) {
      addMatch('blacklisted_ip_match',
        `IP ${ip_address} has reputation score ${ipRep.reputation_score} (threshold: <20)`);
    }

    // ── Rule D: High balance drawdown ──────────────────────────────────────
    // Sending >90% of balance in one shot → possible ATO account drain
    if (account.balance > 0) {
      const drawdown = amount / account.balance;
      if (drawdown >= 0.9) {
        addMatch('high_balance_drawdown',
          `Transaction drains ${Math.round(drawdown * 100)}% of sender's balance (threshold: ≥90%)`);
      }
    }

    // ── Rule E: Dormant account sudden large spike ──────────────────────────
    // Account with <5 lifetime successful txns making a very large transfer
    // → could be a compromised dormant account
    const senderLifetimeTxCount = await TransactionRepository.countRecentTransactionsByUser(senderUserId, 60 * 24 * 365);
    if (senderLifetimeTxCount < 5 && amount > 50000) {
      addMatch('dormant_account_spike',
        `Account with only ${senderLifetimeTxCount} lifetime transactions attempting ₹${amount.toLocaleString()}`);
    }

    // ── Rule F: New receiver account (<7 days) + high value ────────────────
    // Newly registered accounts receiving large sums is a strong fraud signal
    if (receiverAccount) {
      const receiverAgeDays = receiverAccount.account_age_days ?? 999;
      if (receiverAgeDays < 7 && amount > 5000) {
        addMatch('new_receiver_account',
          `Receiver account is only ${receiverAgeDays} day(s) old (threshold: <7) and receiving ₹${amount.toLocaleString()}`);
      }
    }

    // ── 4. WRITE SCORES + MATCHES to DB ───────────────────────────────────────
    if (cumulativeScore > 0) {
      await FraudScoreRepository.create({ transaction_id: txId, cumulative_score: cumulativeScore });
      await Promise.all(
        triggeredMatches.map(match => {
          const p = getPattern(match.patternName);
          return TransactionFraudMatchRepository.create({
            transaction_id: txId,
            fraud_pattern_id: p.id,
            score_impact: match.score,
            details: match.details,
          });
        })
      );
    }

    // ── 5. DETERMINE VERDICT ──────────────────────────────────────────────────
    //   approved  : score = 0
    //   flagged   : score 1–70 (logged, allowed through with monitoring)
    //   alerted   : score >70 (creates an open alert for analyst review)
    let verdict: 'approved' | 'flagged' | 'alerted' = 'approved';
    if (cumulativeScore > 70) {
      verdict = 'alerted';
      await AlertRepository.create({ transaction_id: txId, status: 'open', severity: 'high' });
    } else if (cumulativeScore > 0) {
      verdict = 'flagged';
    }

    if (verdict !== 'approved') {
      await AuditLogRepository.create({
        action: 'transaction_fraud_detected',
        user_id: senderUserId,
        details: {
          transaction_id: txId,
          verdict,
          score: cumulativeScore,
          matches: triggeredMatches.map(m => m.patternName),
        },
      });
    }

    return {
      verdict,
      score: cumulativeScore,
      matches: triggeredMatches.map(m => m.patternName),
    };
  }
}
