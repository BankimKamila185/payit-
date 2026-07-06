import express, { Request, Response } from 'express';
import {
  TransactionRepository,
  AccountRepository,
  AlertRepository
} from './repositories';
import { FraudService } from './services/fraudService';
import { IpReputationService } from './services/ipReputationService';

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

    // Step 2: Run fraud scoring service
    const fraudResult = await FraudService.evaluate(transaction);

    // Step 3: Act on verdict
    if (fraudResult.verdict === 'rejected') {
      // Update transaction status to rejected
      const updatedTx = await TransactionRepository.updateStatus(transaction.id, 'rejected');
      res.status(400).json({
        error: 'Transaction rejected due to security policy',
        transaction: updatedTx,
        fraudVerdict: fraudResult,
      });
      return;
    }

    // Verdict is approved, flagged, or alerted: proceed with balance transfer
    // Deduct sender balance
    await AccountRepository.updateBalance(sender_account_id, senderAccount.balance - parsedAmount);
    // Add receiver balance
    await AccountRepository.updateBalance(receiver_account_id, receiverAccount.balance + parsedAmount);

    // Update status to success (or flagged if we want to retain flagging info on txn)
    const finalStatus = fraudResult.verdict === 'approved' ? 'success' : 'flagged';
    const finalTx = await TransactionRepository.updateStatus(transaction.id, finalStatus);

    res.status(201).json({
      message: 'Transaction completed successfully',
      transaction: finalTx,
      fraudVerdict: fraudResult,
    });
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

export default app;
