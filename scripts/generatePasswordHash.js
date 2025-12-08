import bcryptjs from 'bcryptjs';

/**
 * Script to generate bcrypt hash for passwords
 * Usage: node scripts/generatePasswordHash.js [password]
 */

const password = process.argv[2] || 'admin123';

async function generateHash() {
  try {
    const hash = await bcryptjs.hash(password, 10);
    console.log('\n========================================');
    console.log('Password Hash Generator');
    console.log('========================================');
    console.log(`Password: ${password}`);
    console.log(`Hash: ${hash}`);
    console.log('\nYou can use this hash in your SQL INSERT statement.');
    console.log('========================================\n');
  } catch (error) {
    console.error('Error generating hash:', error);
  }
}

generateHash();

