export interface Device {
  id: string; // UUID
  user_id: string; // UUID
  device_fingerprint: string;
  status: 'active' | 'blocked' | string;
  created_at: Date;
}
