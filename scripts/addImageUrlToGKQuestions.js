// Migration script: Add image_url column to gk_questions table
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database configuration
const DB_NAME = process.env.DB_NAME || 'institute_exams';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = process.env.DB_PORT || 3306;

async function addImageUrlColumn() {
  let connection;
  
  try {
    console.log('🔄 Connecting to MySQL server...');
    
    // Connect to MySQL database
    connection = await mysql.createConnection({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
      multipleStatements: true
    });

    console.log('✅ Connected to MySQL database');

    // Check if column already exists
    const [columns] = await connection.query(
      `SELECT COLUMN_NAME 
       FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = ? 
       AND TABLE_NAME = 'gk_questions' 
       AND COLUMN_NAME = 'image_url'`,
      [DB_NAME]
    );

    if (columns.length > 0) {
      console.log('✅ Column image_url already exists in gk_questions table');
      return;
    }

    // Add the column
    console.log('🚀 Adding image_url column to gk_questions table...');
    await connection.query(
      `ALTER TABLE gk_questions 
       ADD COLUMN image_url VARCHAR(500) AFTER has_image`
    );

    console.log('✅ Successfully added image_url column to gk_questions table');
    console.log('🎉 Migration complete!');
    
  } catch (error) {
    console.error('\n❌ Error running migration:');
    console.error(error.message);
    
    if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('\n💡 Tip: Check your MySQL credentials in .env file');
    } else if (error.code === 'ECONNREFUSED') {
      console.error('\n💡 Tip: Make sure MySQL server is running');
    } else if (error.code === 'ER_DUP_FIELDNAME') {
      console.error('\n💡 Column already exists (this is okay)');
    }
    
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('\n🔌 Database connection closed');
    }
  }
}

// Run the migration
addImageUrlColumn();

