export interface IpReputation {
  id: string; // UUID
  ip_address: string;
  reputation_score: number;
  is_blacklisted: boolean;
  last_updated: Date;
}
