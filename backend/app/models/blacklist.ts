export interface Blacklist {
  id: string; // UUID
  entity_type: 'user' | 'device' | 'ip' | string;
  entity_value: string;
  reason?: string | null;
  created_at: Date;
}
