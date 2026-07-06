export interface User {
  id: string; // UUID
  phone: string;
  name: string;
  email?: string | null;
  created_at: Date; // TIMESTAMPTZ
}
