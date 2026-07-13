import {
  TransactionRepository,
  AccountRepository,
  BlacklistRepository,
  IpReputationRepository,
  FraudPatternRepository,
  TransactionFraudMatchRepository,
  FraudScoreRepository,
  AlertRepository,
  AuditLogRepository,
  OtpVerificationRepository,
} from '../repositories';
import { Transaction } from '../models';

export interface FraudVerdict {
  verdict: 'approved' | 'review' | 'blocked' | 'rejected';
  score: number;
  matches: string[];
  /** Present when verdict === 'review': ID of the otp_verifications row to verify against */
  otp_verification_id?: string;
  /** Demo-only: OTP code (real prod sends via SMS, never returned to API client) */
  otp_demo?: string;
}


// ─── Pattern name → default id/score fallback ────────────────────────────────
const PATTERN_DEFAULTS: Record<string, { id: number; score: number }> = {
  velocity_check:           { id: 1, score: 40 },
  new_device_high_amount:   { id: 2, score: 50 },
  blacklisted_ip_match:     { id: 3, score: 100 },
  // impossible_travel removed: no GeoIP database available; re-add when MaxMind/ipapi integrated
  otp_brute_force:          { id: 5, score: 45 },
  high_balance_drawdown:    { id: 6, score: 35 },
  dormant_account_spike:    { id: 7, score: 40 },
  new_receiver_account:     { id: 8, score: 30 },
  device_rooted:            { id: 9, score: 55 },
  screen_sharing_active:    { id: 10, score: 50 },
  sim_carrier_mismatch:     { id: 11, score: 60 },
  recent_micro_credit_spike:{ id: 12, score: 45 },
  beneficiary_drain_pattern:{ id: 13, score: 65 },
  mule_ring_chain:          { id: 14, score: 60 },
};

// ─── Score thresholds (mirrors server/app.py SAFE/REVIEW/BLOCK) ───────────────
const SCORE_BLOCK  = 60;   // >= SCORE_BLOCK  → reject, money does NOT move
const SCORE_REVIEW = 35;   // >= SCORE_REVIEW → hold, OTP step-up required

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
    const receiverUserId = receiverAccount?.user_id;

    // ── Load DB fraud patterns ────────────────────────────────────────────────
    const patterns = await FraudPatternRepository.listAll();
    const patternMap = new Map<string, { id: number; score: number }>();
    for (const p of patterns) {
      patternMap.set(p.pattern_name, { id: p.id, score: p.base_score });
    }
    const getPattern = (name: string) =>
      patternMap.get(name) ?? PATTERN_DEFAULTS[name] ?? { id: 99, score: 30 };

    // ── 2. BLACKLIST — auto-reject ─────────────────────────────────────────────
    const [isUserBlacklisted, isDeviceBlacklisted, isIpBlacklisted, isReceiverBlacklisted] = await Promise.all([
      BlacklistRepository.checkExists('user', senderUserId),
      device_id ? BlacklistRepository.checkExists('device', device_id) : Promise.resolve(false),
      BlacklistRepository.checkExists('ip', ip_address),
      receiverUserId ? BlacklistRepository.checkExists('user', receiverUserId) : Promise.resolve(false),
    ]);

    if (isUserBlacklisted || isDeviceBlacklisted || isIpBlacklisted || isReceiverBlacklisted) {
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
            isReceiverBlacklisted && 'Receiver in blacklist',
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

    // ── Rule H: Device Rooted / Compromised ──────────────────────────────────
    if (transaction.rooted === 1) {
      addMatch('device_rooted', 'Rooted device / emulator detected. Potential security bypass.');
    }

    // ── Rule I: Screen Sharing Active ────────────────────────────────────────
    if (transaction.screen_share === 1) {
      addMatch('screen_sharing_active', 'Active screen sharing/remote access application detected (e.g. AnyDesk).');
    }

    // ── Rule J: SIM Carrier Mismatch ─────────────────────────────────────────
    if (transaction.sim_mismatch === 1) {
      addMatch('sim_carrier_mismatch', 'SIM reported carrier details mismatch. Possible SIM swap or clone.');
    }

    // ── Rule K: Jumped Deposit (Recent Micro-credit followed by large transfer)
    const microCreditCount = await TransactionRepository.countRecentIncomingMicroCredits(sender_account_id, 15);
    if (microCreditCount > 0 && amount > 1000) {
      addMatch('recent_micro_credit_spike', `Transaction preceded by ${microCreditCount} unsolicited micro-credits (₹<100) on sender account.`);
    }

    // ── Rule L: Beneficiary Drain (SIM Swap ATO) ─────────────────────────────
    if (receiver_account_id) {
      const hasPaid = await TransactionRepository.hasPaidBefore(sender_account_id, receiver_account_id);
      if (!hasPaid && amount > 20000) {
        addMatch('beneficiary_drain_pattern', `First-time transfer to a new payee with high value amount (₹${amount.toLocaleString()}).`);
      }
    }

    // ── Rule M: Mule Ring Graph Anomaly (Money Forwarding) ───────────────────
    const muleChain = await TransactionRepository.detectMuleChain(sender_account_id, amount);
    if (muleChain.length >= 3) {
      addMatch('mule_ring_chain', `MULE RING DETECTED: Money forwarded rapidly through chain: ${muleChain.join(' -> ')}`);
    }

    // ── Rule N: OTP Brute-Force Detection ────────────────────────────────────
    // If there is a pending OTP for this user with >= 3 failed attempts,
    // the account is being actively probed — escalate risk.
    const latestOtp = await OtpVerificationRepository.findLatestPendingByUserId(senderUserId);
    if (latestOtp && latestOtp.attempts >= 3) {
      addMatch('otp_brute_force',
        `OTP brute-force: ${latestOtp.attempts} failed attempts on pending OTP for user ${senderUserId}`);
    }

    // ── Rule G: Python ML Engine /score Integration ──────────────────────────
    // Contact Python ML server to get the ensemble score and SHAP reason codes
    try {
      const mlHost = process.env.ML_ENGINE_URL;
      if (!mlHost) {
        console.warn('[FraudService] ML_ENGINE_URL not set — skipping ML engine, local rules only');
      } else {
      const response = await fetch(`${mlHost}/score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender_vpa: account.account_number + "@payit",
          receiver_vpa: receiverAccount ? receiverAccount.account_number + "@payit" : "unknown@payit",
          amount,
          hour: new Date(transaction.created_at || new Date()).getHours(),
          type: "PAY",
          channel: transaction.ip_address === '127.0.0.1' ? 'MANUAL' : 'QR',
          device_id: device_id || "",
          rooted: transaction.rooted || 0,
          screen_share: transaction.screen_share || 0,
          sim_mismatch: transaction.sim_mismatch || 0,
        }),
      });

      if (response && response.ok) {
        const mlVerdict: any = await response.json();
        // Blend ML score with local rules
        if (mlVerdict && typeof mlVerdict.score === 'number') {
          cumulativeScore = Math.max(cumulativeScore, mlVerdict.score);
          // If ML engine triggered specific reasons, map them into triggeredMatches
          if (Array.isArray(mlVerdict.reasons)) {
            for (const reason of mlVerdict.reasons) {
              const lowerReason = reason.toLowerCase();
              let patternName = 'velocity_check'; // default fallback mapping
              if (lowerReason.includes('rooted')) patternName = 'device_rooted';
              else if (lowerReason.includes('screen') || lowerReason.includes('share')) patternName = 'screen_sharing_active';
              else if (lowerReason.includes('sim') || lowerReason.includes('carrier')) patternName = 'sim_carrier_mismatch';
              else if (lowerReason.includes('micro') || lowerReason.includes('deposit')) patternName = 'recent_micro_credit_spike';
              else if (lowerReason.includes('drain')) patternName = 'beneficiary_drain_pattern';
              else if (lowerReason.includes('ring') || lowerReason.includes('forward')) patternName = 'mule_ring_chain';
              else if (lowerReason.includes('device')) patternName = 'new_device_high_amount';
              else if (lowerReason.includes('blacklist') || lowerReason.includes('mule')) patternName = 'blacklisted_ip_match';
              else if (lowerReason.includes('travel') || lowerReason.includes('geo')) patternName = 'impossible_travel';
              else if (lowerReason.includes('drawdown') || lowerReason.includes('balance')) patternName = 'high_balance_drawdown';
              else if (lowerReason.includes('dormant') || lowerReason.includes('lifetime')) patternName = 'dormant_account_spike';
              else if (lowerReason.includes('receiver') || lowerReason.includes('old')) patternName = 'new_receiver_account';
              else if (lowerReason.includes('otp')) patternName = 'otp_brute_force';

              if (!triggeredMatches.some(m => m.details.includes(reason))) {
                const p = getPattern(patternName);
                triggeredMatches.push({
                  patternName,
                  score: p.score,
                  details: `[AI Engine] ${reason}`,
                });
              }
            }
          }
        }
      }
      } // end if (mlHost)
    } catch (err) {
      console.warn('[FraudService] Failed to contact Python ML Engine, falling back to local scoring:', err);
    }

    // ── 4. CAP SCORE + WRITE SCORES + MATCHES to DB ───────────────────────────
    // Cap before threshold comparison — stacking rules can push score above 100
    cumulativeScore = Math.min(cumulativeScore, 100);
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

    // ── 5. DETERMINE VERDICT (3-tier: approved / review / blocked) ───────────
    //   blocked  : score >= 60 → reject, money does NOT move, critical alert logged
    //   review   : score >= 35 → hold, OTP step-up required before money moves
    //   approved : score <  35 → transfer proceeds
    //
    // 'rejected' is only returned from the blacklist path above (score=100, immediate).
    const matchNames = triggeredMatches.map(m => m.patternName);

    if (cumulativeScore >= SCORE_BLOCK) {
      await AlertRepository.create({ transaction_id: txId, status: 'open', severity: 'critical' });
      await AuditLogRepository.create({
        action: 'transaction_blocked',
        user_id: senderUserId,
        details: { transaction_id: txId, verdict: 'blocked', score: cumulativeScore, matches: matchNames },
      });
      return { verdict: 'blocked', score: cumulativeScore, matches: matchNames };
    }

    if (cumulativeScore >= SCORE_REVIEW) {
      await AlertRepository.create({ transaction_id: txId, status: 'open', severity: 'high' });

      // Generate OTP step-up record (5-minute expiry)
      const otpCode = String(Math.floor(100000 + Math.random() * 900000));
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
      const otpRecord = await OtpVerificationRepository.create({
        user_id: senderUserId,
        code: otpCode,
        expires_at: expiresAt,
      });

      await AuditLogRepository.create({
        action: 'transaction_step_up_required',
        user_id: senderUserId,
        details: { transaction_id: txId, verdict: 'review', score: cumulativeScore, matches: matchNames },
      });

      // Production: send otpCode via SMS only — never expose in API response.
      // otp_demo mirrors server/app.py behaviour for the local demo environment.
      console.log(`[FraudService][OTP DEMO] txn=${txId} user=${senderUserId} OTP=${otpCode}`);
      return {
        verdict: 'review',
        score: cumulativeScore,
        matches: matchNames,
        otp_verification_id: String(otpRecord.id),
        otp_demo: otpCode,
      };
    }

    // APPROVED — score < 35
    if (cumulativeScore > 0) {
      // Low-risk flags are audit-logged but do not block the transfer
      await AuditLogRepository.create({
        action: 'transaction_low_risk_flagged',
        user_id: senderUserId,
        details: { transaction_id: txId, verdict: 'approved', score: cumulativeScore, matches: matchNames },
      });
    }

    return { verdict: 'approved', score: cumulativeScore, matches: matchNames };
  }
}
