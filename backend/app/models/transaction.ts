export interface Transaction {
  id: string; // UUID
  sender_account_id: string; // UUID
  receiver_account_id: string; // UUID
  amount: number; // NUMERIC mapped to number
  status: 'pending' | 'success' | 'failed' | 'flagged' | 'rejected' | string;
  ip_address: string;
  device_id?: string | null; // UUID
  rooted?: number;
  screen_share?: number;
  sim_mismatch?: number;
  created_at: Date;
}
