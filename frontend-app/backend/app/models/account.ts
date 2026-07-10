export interface Account {
  id: string; // UUID
  user_id: string; // UUID
  bank_id: number;
  account_number: string;
  balance: number; // NUMERIC mapped to number
  created_at: Date;
}
