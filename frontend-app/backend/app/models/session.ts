export interface Session {
  id: string; // UUID
  user_id: string; // UUID
  device_id?: string | null; // UUID
  token: string;
  expires_at: Date;
  created_at: Date;
}
