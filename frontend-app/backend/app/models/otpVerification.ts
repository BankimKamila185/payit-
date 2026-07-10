export interface OtpVerification {
  id: string; // UUID
  user_id: string; // UUID
  code: string;
  status: 'pending' | 'verified' | 'expired' | string;
  attempts: number;
  expires_at: Date;
  created_at: Date;
}
