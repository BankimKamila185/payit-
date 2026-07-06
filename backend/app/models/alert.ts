export interface Alert {
  id: string; // UUID
  transaction_id: string; // UUID
  status: 'open' | 'resolved' | 'ignored' | string;
  severity: 'low' | 'medium' | 'high' | 'critical' | string;
  created_at: Date;
}
