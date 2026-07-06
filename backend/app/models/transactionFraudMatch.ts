export interface TransactionFraudMatch {
  id: string; // UUID
  transaction_id: string; // UUID
  fraud_pattern_id: number;
  score_impact: number;
  details?: string | null;
  created_at: Date;
}
