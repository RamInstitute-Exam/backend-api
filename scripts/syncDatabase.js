/**
 * Database Sync Script
 * Syncs Sequelize models with MySQL database (creates missing tables)
 * WARNING: This will create tables but won't modify existing ones
 * Run: node scripts/syncDatabase.js
 */

import { sequelize } from '../config/MySQLConfig.js';
import {
  Admin,
  Student,
  Batch,
  Exam,
  CivilQuestion,
  GKQuestion,
  StudentExamReport,
  AnswerDetail,
  Notification,
  QuestionBank,
  StudentBatchAccess,
  ExamRequest,
  Role,
  AdminRole
} from '../models/mysql/index.js';

async function syncDatabase() {
  try {
    console.log('🔄 Syncing MySQL Database with Sequelize Models...\n');

    // Test connection
    await sequelize.authenticate();
    console.log('✅ Database connection successful\n');

    // Sync all models
    // force: false - won't drop existing tables
    // alter: true - will alter tables to match models (adds missing columns)
    console.log('📊 Syncing models...\n');

    await sequelize.sync({ 
      alter: false, // Set to true to add missing columns (be careful!)
      force: false  // Never set to true in production!
    });

    console.log('✅ Database sync complete!\n');
    console.log('📝 Note: This script only creates missing tables.');
    console.log('   For schema changes, use migrations or run database_schema.sql\n');

    process.exit(0);

  } catch (error) {
    console.error('❌ Database sync failed:', error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

// Run sync
syncDatabase();

