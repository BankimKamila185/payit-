export interface FraudScore {
  id: string; // UUID
  transaction_id: string; // UUID
  cumulative_score: number;
  created_at: Date;
}
