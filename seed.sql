-- Seed Data for Payit

-- Insert Banks
INSERT INTO banks (name, ifsc_prefix) VALUES
('State Bank of India', 'SBIN'),
('HDFC Bank', 'HDFC'),
('ICICI Bank', 'ICIC'),
('Axis Bank', 'UTIB'),
('Kotak Mahindra Bank', 'KKBK'),
('Punjab National Bank', 'PUNB')
ON CONFLICT (ifsc_prefix) DO NOTHING;

-- Insert Fraud Patterns
INSERT INTO fraud_patterns (pattern_name, description, base_score) VALUES
('velocity_check',          'Velocity check: More than 5 transactions in the last 10 minutes from the same sender', 40),
('new_device_high_amount',  'New device + high amount: Amount greater than 10,000 INR on a new unrecognized device', 50),
('blacklisted_ip_match',    'Blacklisted IP match: Transaction initiated from an IP in the blacklist', 100),
('impossible_travel',       'Impossible travel: Login or transaction from two far-apart locations in a short time frame', 60),
('otp_brute_force',         'OTP brute force: Multiple failed OTP validation attempts in a short duration', 45),
('high_balance_drawdown',   'High balance drawdown: Transaction drains ≥90% of sender balance in one shot', 35),
('dormant_account_spike',   'Dormant account spike: Account with <5 lifetime transactions attempting a very large transfer', 40),
('new_receiver_account',    'New receiver account: Newly registered account (<7 days old) receiving a high-value transfer', 30),
('device_rooted',           'Device rooted: Rooted device or emulator detected during transaction', 55),
('screen_sharing_active',   'Screen sharing active: Active remote access/screen sharing app detected', 50),
('sim_carrier_mismatch',    'SIM carrier mismatch: SIM reported details do not match carrier records', 60),
('recent_micro_credit_spike','Recent micro-credit spike: Transaction preceded by unsolicited small credit deposits', 45),
('beneficiary_drain_pattern','Beneficiary drain: First-time transfer to a new payee draining balance', 65),
('mule_ring_chain',         'Mule ring chain: Money forwarded through a rapid multi-hop chain', 60)
ON CONFLICT (pattern_name) DO NOTHING;


