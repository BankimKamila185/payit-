import { UserRepository, BankRepository, AccountRepository, DeviceRepository } from './repositories';
import { pool } from './db';

async function seed() {
  try {
    console.log('Seeding sanity check users, devices, & accounts...');
    
    // Clear existing for clean run
    await pool.query('DELETE FROM accounts;');
    await pool.query('DELETE FROM devices;');
    await pool.query('DELETE FROM users;');

    const bank = await BankRepository.findByIfscPrefix('SBIN');
    if (!bank) {
      throw new Error('SBI Bank not found. Did you run db:init?');
    }

    const alice = await UserRepository.create({
      name: 'Alice',
      phone: '1111111111',
      email: 'alice@payit.com',
    });

    const bob = await UserRepository.create({
      name: 'Bob',
      phone: '2222222222',
      email: 'bob@payit.com',
    });

    // Register Alice's devices
    const aliceRegDevice = await pool.query(`
      INSERT INTO devices (id, user_id, device_fingerprint, status)
      VALUES ('319c5c93-9c88-4cbb-9543-15967bd59bb1', $1, 'alice-fingerprint-reg', 'active')
      RETURNING *;
    `, [alice.id]);

    const aliceNewDevice = await pool.query(`
      INSERT INTO devices (id, user_id, device_fingerprint, status)
      VALUES ('a8db346b-871d-4eb6-91b5-8851c2780e1c', $1, 'alice-fingerprint-new', 'active')
      RETURNING *;
    `, [alice.id]);

    const aliceAccount = await AccountRepository.create({
      user_id: alice.id,
      bank_id: bank.id,
      account_number: 'ACC-ALICE-111',
      balance: 50000.00,
    });

    const bobAccount = await AccountRepository.create({
      user_id: bob.id,
      bank_id: bank.id,
      account_number: 'ACC-BOB-222',
      balance: 1000.00,
    });

    // To make sure aliceRegDevice has a "prior successful transaction" so it is not marked as new
    // We will insert a successful mock transaction for aliceRegDevice
    const mockTx = await pool.query(`
      INSERT INTO transactions (sender_account_id, receiver_account_id, amount, status, ip_address, device_id)
      VALUES ($1, $2, 100.00, 'success', '127.0.0.1', '319c5c93-9c88-4cbb-9543-15967bd59bb1')
      RETURNING id;
    `, [aliceAccount.id, bobAccount.id]);

    console.log('--- SEED RESULTS ---');
    console.log(`Alice User ID:   ${alice.id}`);
    console.log(`Alice Account ID: ${aliceAccount.id} (Balance: ₹${aliceAccount.balance})`);
    console.log(`Bob User ID:     ${bob.id}`);
    console.log(`Bob Account ID:   ${bobAccount.id} (Balance: ₹${bobAccount.balance})`);
    console.log(`Alice Reg Device ID: 319c5c93-9c88-4cbb-9543-15967bd59bb1 (Has 1 prior successful txn)`);
    console.log(`Alice New Device ID: a8db346b-871d-4eb6-91b5-8851c2780e1c (Has 0 prior successful txns)`);
    console.log('--------------------');

  } catch (err) {
    console.error('Seeding failed:', err);
  } finally {
    await pool.end();
  }
}

seed();
