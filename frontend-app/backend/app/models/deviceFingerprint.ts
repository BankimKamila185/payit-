export interface DeviceFingerprint {
  id: string; // UUID
  device_id: string; // UUID
  browser_info?: string | null;
  os_info?: string | null;
  ip_address?: string | null;
  created_at: Date;
}
