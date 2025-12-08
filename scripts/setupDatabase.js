import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database configuration
const DB_NAME = process.env.DB_NAME || 'institute_exams';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = process.env.DB_PORT || 3306;

async function setupDatabase() {
  let connection;
  
  try {
    console.log('🔄 Connecting to MySQL server...');
    
    // Connect to MySQL server (without selecting database first)
    connection = await mysql.createConnection({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASSWORD,
      multipleStatements: true // Allow multiple SQL statements
    });

    console.log('✅ Connected to MySQL server');

    // Read SQL schema file
    const schemaPath = path.join(__dirname, '../../database_schema.sql');
    console.log(`📖 Reading schema file: ${schemaPath}`);
    
    if (!fs.existsSync(schemaPath)) {
      throw new Error(`Schema file not found at: ${schemaPath}`);
    }

    const sql = fs.readFileSync(schemaPath, 'utf8');
    console.log('✅ Schema file read successfully');

    // Execute SQL statements
    console.log('🚀 Executing database schema...');
    console.log('⏳ This may take a few moments...\n');

    await connection.query(sql);
    
    console.log('\n✅ Database schema executed successfully!');
    console.log(`✅ Database '${DB_NAME}' created/updated with all tables`);
    
    // Verify tables were created
    const [tables] = await connection.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?`,
      [DB_NAME]
    );

    console.log(`\n📊 Created ${tables.length} tables:`);
    tables.forEach((table, index) => {
      console.log(`   ${index + 1}. ${table.TABLE_NAME}`);
    });

    console.log('\n🎉 Database setup complete!');
    
  } catch (error) {
    console.error('\n❌ Error setting up database:');
    console.error(error.message);
    
    if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('\n💡 Tip: Check your MySQL credentials in .env file');
    } else if (error.code === 'ECONNREFUSED') {
      console.error('\n💡 Tip: Make sure MySQL server is running');
    } else if (error.code === 'ER_BAD_DB_ERROR') {
      console.error('\n💡 Tip: Database might not exist. The script will create it.');
    }
    
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('\n🔌 Database connection closed');
    }
  }
}

// Run the setup
setupDatabase();

