export interface FraudPattern {
  id: number; // SERIAL
  pattern_name: 'velocity_check' | 'new_device_high_amount' | 'blacklisted_ip_match' | 'impossible_travel' | 'otp_brute_force' | string;
  description?: string | null;
  base_score: number;
  created_at: Date;
}
