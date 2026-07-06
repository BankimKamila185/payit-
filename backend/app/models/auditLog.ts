export interface AuditLog {
  id: string; // UUID
  action: string;
  user_id?: string | null; // UUID
  details?: Record<string, any> | null; // JSONB
  created_at: Date;
}
