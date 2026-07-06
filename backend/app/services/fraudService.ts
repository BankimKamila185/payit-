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

export class FraudService {
  static async evaluate(transaction: Transaction): Promise<FraudVerdict> {
    const { id: txId, sender_account_id, amount, ip_address, device_id } = transaction;

    // 1. Retrieve sender user_id from sender account
    const account = await AccountRepository.findById(sender_account_id);
    if (!account) {
      throw new Error(`Sender account ${sender_account_id} not found`);
    }
    const senderUserId = account.user_id;

    // Fetch all fraud patterns from DB to map pattern names to IDs and scores
    const patterns = await FraudPatternRepository.listAll();
    const patternMap = new Map<string, { id: number; score: number }>();
    for (const p of patterns) {
      patternMap.set(p.pattern_name, { id: p.id, score: p.base_score });
    }

    // Default values if DB patterns are not loaded (fallback to seeded values)
    const getPattern = (name: string) => {
      return patternMap.get(name) || { id: name === 'velocity_check' ? 1 : name === 'new_device_high_amount' ? 2 : 3, score: name === 'velocity_check' ? 40 : name === 'new_device_high_amount' ? 50 : 100 };
    };

    // 2. BLACKLIST CHECK (Auto-reject rule)
    const isUserBlacklisted = await BlacklistRepository.checkExists('user', senderUserId);
    const isDeviceBlacklisted = device_id ? await BlacklistRepository.checkExists('device', device_id) : false;
    const isIpBlacklistedFromTable = await BlacklistRepository.checkExists('ip', ip_address);

    if (isUserBlacklisted || isDeviceBlacklisted || isIpBlacklistedFromTable) {
      // Create fraud score record of 100
      await FraudScoreRepository.create({
        transaction_id: txId,
        cumulative_score: 100,
      });

      // Find blacklisted pattern ID
      const blacklistPattern = getPattern('blacklisted_ip_match');
      await TransactionFraudMatchRepository.create({
        transaction_id: txId,
        fraud_pattern_id: blacklistPattern.id,
        score_impact: blacklistPattern.score,
        details: `Auto-rejected due to: ${
          [
            isUserBlacklisted && 'User in blacklist',
            isDeviceBlacklisted && 'Device in blacklist',
            isIpBlacklistedFromTable && 'IP in blacklist',
          ].filter(Boolean).join(', ')
        }`,
      });

      // Insert Alert with status 'open' and critical severity
      await AlertRepository.create({
        transaction_id: txId,
        status: 'open',
        severity: 'critical',
      });

      // Log to audit log
      await AuditLogRepository.create({
        action: 'transaction_auto_rejected',
        user_id: senderUserId,
        details: { transaction_id: txId, reason: 'Blacklist match' }
      });

      return {
        verdict: 'rejected',
        score: 100,
        matches: ['blacklisted_ip_match'],
      };
    }

    // 3. RUN OTHER FRAUD RULES
    let cumulativeScore = 0;
    const triggeredMatches: Array<{ patternName: string; score: number; details: string }> = [];

    // Rule A: Velocity Check
    // More than 5 transactions from the same sender_id in the last 10 minutes -> flag
    const txnWindowMinutes = 10;
    const recentTxCount = await TransactionRepository.countRecentTransactionsByUser(senderUserId, txnWindowMinutes);
    // Note: recentTxCount includes the current transaction if it is already inserted, but since evaluate is run before success/mark,
    // we check count > 5. Let's make sure it covers > 5.
    if (recentTxCount > 5) {
      const p = getPattern('velocity_check');
      triggeredMatches.push({
        patternName: 'velocity_check',
        score: p.score,
        details: `User completed ${recentTxCount} transactions in the last ${txnWindowMinutes} minutes (Threshold: > 5)`,
      });
      cumulativeScore += p.score;
    }

    // Rule B: New Device + High Amount Check
    // If the device_id has no prior successful transactions AND amount > 10000 -> flag
    if (device_id) {
      const priorSuccessfulTxCount = await TransactionRepository.countSuccessfulTransactionsByDevice(device_id);
      if (priorSuccessfulTxCount === 0 && amount > 10000) {
        const p = getPattern('new_device_high_amount');
        triggeredMatches.push({
          patternName: 'new_device_high_amount',
          score: p.score,
          details: `Transaction of ${amount} from new unrecognized device (0 prior successful transactions)`,
        });
        cumulativeScore += p.score;
      }
    }

    // Rule D: IP Reputation Check
    // if ip_reputation.is_blacklisted = true or reputation_score < 20 -> flag
    const ipRep = await IpReputationRepository.findByIpAddress(ip_address);
    if (ipRep && (ipRep.is_blacklisted || ipRep.reputation_score < 20)) {
      const p = getPattern('blacklisted_ip_match');
      triggeredMatches.push({
        patternName: 'blacklisted_ip_match',
        score: p.score,
        details: `IP ${ip_address} has reputation score ${ipRep.reputation_score} and blacklist status: ${ipRep.is_blacklisted}`,
      });
      cumulativeScore += p.score;
    }

    // 4. WRITE SCORES AND MATCHES
    if (cumulativeScore > 0) {
      await FraudScoreRepository.create({
        transaction_id: txId,
        cumulative_score: cumulativeScore,
      });

      for (const match of triggeredMatches) {
        const p = getPattern(match.patternName);
        await TransactionFraudMatchRepository.create({
          transaction_id: txId,
          fraud_pattern_id: p.id,
          score_impact: match.score,
          details: match.details,
        });
      }
    }

    // 5. EVALUATE VERDICT
    let verdict: 'approved' | 'flagged' | 'alerted' = 'approved';
    if (cumulativeScore > 70) {
      verdict = 'alerted';
      // If cumulative score > 70, insert a row into alerts with status 'open'
      await AlertRepository.create({
        transaction_id: txId,
        status: 'open',
        severity: 'high',
      });
    } else if (cumulativeScore > 0) {
      verdict = 'flagged';
    }

    // Audit logging for audit trail
    if (verdict !== 'approved') {
      await AuditLogRepository.create({
        action: 'transaction_fraud_detected',
        user_id: senderUserId,
        details: {
          transaction_id: txId,
          verdict,
          score: cumulativeScore,
          matches: triggeredMatches.map(m => m.patternName)
        }
      });
    }

    return {
      verdict,
      score: cumulativeScore,
      matches: triggeredMatches.map(m => m.patternName),
    };
  }
}
