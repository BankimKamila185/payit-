import express, { Request, Response } from 'express';
import {
  TransactionRepository,
  AccountRepository,
  AlertRepository,
  OtpVerificationRepository,
} from './repositories';
import { FraudService } from './services/fraudService';
import { IpReputationService } from './services/ipReputationService';
import { pool, query } from './db';


const app = express();
app.use(express.json());

// 1. POST /api/transactions
app.post('/api/transactions', async (req: Request, res: Response): Promise<void> => {
  const { sender_account_id, receiver_account_id, amount, ip_address, device_id } = req.body;

  // Basic validation
  if (!sender_account_id || !receiver_account_id || !amount || !ip_address) {
    res.status(400).json({ error: 'Missing required fields: sender_account_id, receiver_account_id, amount, ip_address' });
    return;
  }

  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    res.status(400).json({ error: 'Amount must be a positive number' });
    return;
  }

  try {
    // Ensure IP reputation is registered
    await IpReputationService.ensureIpRegistered(ip_address);

    // Check if accounts exist
    const senderAccount = await AccountRepository.findById(sender_account_id);
    const receiverAccount = await AccountRepository.findById(receiver_account_id);

    if (!senderAccount) {
      res.status(404).json({ error: `Sender account ${sender_account_id} not found` });
      return;
    }
    if (!receiverAccount) {
      res.status(404).json({ error: `Receiver account ${receiver_account_id} not found` });
      return;
    }

    // Balance check
    if (senderAccount.balance < parsedAmount) {
      // Create a failed transaction record
      const failedTx = await TransactionRepository.create({
        sender_account_id,
        receiver_account_id,
        amount: parsedAmount,
        status: 'failed',
        ip_address,
        device_id,
      });
      res.status(400).json({
        error: 'Insufficient balance',
        transaction: failedTx,
      });
      return;
    }

    // Step 1: Create transaction record in 'pending' status
    const transaction = await TransactionRepository.create({
      sender_account_id,
      receiver_account_id,
      amount: parsedAmount,
      status: 'pending',
      ip_address,
      device_id,
    });

    // Attach in-memory RASP properties for the ML / Fraud service evaluation
    transaction.rooted = req.body.rooted ? Number(req.body.rooted) : 0;
    transaction.screen_share = req.body.screen_share ? Number(req.body.screen_share) : 0;
    transaction.sim_mismatch = req.body.sim_mismatch ? Number(req.body.sim_mismatch) : 0;

    // Step 2: Run fraud scoring service
    const fraudResult = await FraudService.evaluate(transaction);

    // Step 3: Act on verdict
    if (fraudResult.verdict === 'rejected' || fraudResult.verdict === 'blocked') {
      // Rejected = blacklist auto-block; Blocked = score >= 60 hard-block
      await TransactionRepository.updateStatus(transaction.id, 'rejected');
      res.status(400).json({
        error: 'Transaction blocked by security policy — money not deducted',
        transaction: await TransactionRepository.findById(transaction.id),
        fraudVerdict: fraudResult,
      });
      return;
    }

    if (fraudResult.verdict === 'review') {
      // Score 35–59: hold the transaction, require OTP step-up before money moves
      await TransactionRepository.updateStatus(transaction.id, 'pending');
      res.status(202).json({
        message: 'Step-up verification required — enter the OTP sent to your registered mobile',
        transaction_id: transaction.id,
        otp_verification_id: fraudResult.otp_verification_id,
        otp_demo: fraudResult.otp_demo,   // demo-only; omit in real prod
        fraudVerdict: fraudResult,
      });
      return;
    }

    // APPROVED (score < 35): transfer proceeds via db transaction to ensure atomicity
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const debitResult = await AccountRepository.atomicDebit(sender_account_id, parsedAmount, client);
      if (!debitResult) {
        await client.query('ROLLBACK');
        const failedTx = await TransactionRepository.updateStatus(transaction.id, 'failed');
        res.status(400).json({
          error: 'Insufficient balance',
          transaction: failedTx,
        });
        return;
      }
      await AccountRepository.atomicCredit(receiver_account_id, parsedAmount, client);
      const finalTx = await TransactionRepository.updateStatus(transaction.id, 'success', client);
      await client.query('COMMIT');

      res.status(201).json({
        message: 'Transaction completed successfully',
        transaction: finalTx,
        fraudVerdict: fraudResult,
      });
    } catch (txErr: any) {
      await client.query('ROLLBACK');
      await TransactionRepository.updateStatus(transaction.id, 'failed');
      throw txErr;
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error('Error processing transaction:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 2. GET /api/alerts
app.get('/api/alerts', async (req: Request, res: Response): Promise<void> => {
  try {
    const openAlerts = await AlertRepository.findOpenAlerts();
    res.status(200).json(openAlerts);
  } catch (error: any) {
    console.error('Error fetching alerts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 3. GET /api/users/:id/transactions
app.get('/api/users/:id/transactions', async (req: Request, res: Response): Promise<void> => {
  const userId = req.params.id as string;

  try {
    const transactions = await TransactionRepository.findByUserId(userId);
    res.status(200).json(transactions);
  } catch (error: any) {
    console.error('Error fetching user transactions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 4. GET /health
app.get('/health', async (req: Request, res: Response): Promise<void> => {
  try {
    await query('SELECT 1');
    res.status(200).json({ status: 'ok', database: 'connected' });
  } catch (error: any) {
    console.error('Health check failed:', error);
    res.status(500).json({ status: 'error', error: 'Database connection failed' });
  }
});

// 5. POST /api/transactions/:id/verify-otp
// Completes a fraud-REVIEW-held transaction after OTP step-up verification.
app.post('/api/transactions/:id/verify-otp', async (req: Request, res: Response): Promise<void> => {
  const txId = String(req.params.id);
  const otp_verification_id = String(req.body.otp_verification_id ?? '');
  const otp = String(req.body.otp ?? '');

  if (!req.body.otp_verification_id || !req.body.otp) {
    res.status(400).json({ error: 'Missing otp_verification_id or otp' });
    return;
  }

  try {
    // Load the pending transaction
    const tx = await TransactionRepository.findById(txId);
    if (!tx || tx.status !== 'pending') {
      res.status(404).json({ error: 'Pending transaction not found' });
      return;
    }

    // Load the OTP record
    const otpRecord = await OtpVerificationRepository.findById(otp_verification_id);
    if (!otpRecord) {
      res.status(404).json({ error: 'OTP record not found' });
      return;
    }

    // Expiry check
    if (new Date(otpRecord.expires_at) < new Date()) {
      await OtpVerificationRepository.updateStatus(otp_verification_id, 'expired');
      await TransactionRepository.updateStatus(txId, 'rejected');
      res.status(400).json({ error: 'OTP expired. Transaction cancelled — please retry.' });
      return;
    }

    // Attempt-limit check (already at 3 = locked)
    if (otpRecord.attempts >= 3) {
      await OtpVerificationRepository.updateStatus(otp_verification_id, 'expired');
      await TransactionRepository.updateStatus(txId, 'rejected');
      res.status(423).json({ error: 'Too many wrong OTP attempts. Transaction cancelled.' });
      return;
    }

    // Wrong code
    if (otpRecord.code !== String(otp)) {
      const newAttempts = await OtpVerificationRepository.incrementAttempts(otp_verification_id);
      if (newAttempts >= 3) {
        await OtpVerificationRepository.updateStatus(otp_verification_id, 'expired');
        await TransactionRepository.updateStatus(txId, 'rejected');
        res.status(423).json({ error: 'Too many wrong OTP attempts. Transaction cancelled.' });
        return;
      }
      const left = 3 - newAttempts;
      res.status(400).json({ error: `Incorrect OTP. ${left} attempt(s) remaining.` });
      return;
    }

    // OTP verified — complete the transfer via transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await OtpVerificationRepository.updateStatus(otp_verification_id, 'verified', client);
      const debitResult = await AccountRepository.atomicDebit(tx.sender_account_id, tx.amount, client);
      if (!debitResult) {
        await client.query('ROLLBACK');
        const failedTx = await TransactionRepository.updateStatus(txId, 'failed');
        res.status(400).json({
          error: 'Insufficient balance at time of OTP verification',
          transaction: failedTx,
        });
        return;
      }
      await AccountRepository.atomicCredit(tx.receiver_account_id, tx.amount, client);
      const completedTx = await TransactionRepository.updateStatus(txId, 'success', client);
      await client.query('COMMIT');

      res.status(200).json({
        message: 'OTP verified — payment completed successfully',
        transaction: completedTx,
      });
    } catch (txErr: any) {
      await client.query('ROLLBACK');
      await TransactionRepository.updateStatus(txId, 'failed');
      throw txErr;
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error('Error in verify-otp:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default app;
