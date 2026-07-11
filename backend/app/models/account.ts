export interface Account {
  id: string; // UUID
  user_id: string; // UUID
  bank_id: number;
  account_number: string;
  balance: number; // NUMERIC mapped to number
  account_age_days?: number; // Computed: days since account creation (optional — derived field)
  created_at: Date;
}
