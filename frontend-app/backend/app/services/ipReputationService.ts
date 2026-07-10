import { IpReputationRepository } from '../repositories';

export class IpReputationService {
  /**
   * Ensures the IP is present in the ip_reputation table.
   * If it is not found, registers a new entry with a default score of 50.
   */
  static async ensureIpRegistered(ipAddress: string): Promise<void> {
    const existing = await IpReputationRepository.findByIpAddress(ipAddress);
    if (!existing) {
      console.log(`First-seen IP registered: ${ipAddress}`);
      await IpReputationRepository.create({
        ip_address: ipAddress,
        reputation_score: 50,
        is_blacklisted: false,
      });
    }
  }
}
