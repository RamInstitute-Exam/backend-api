/**
 * Database Verification Script
 * Verifies that MySQL database schema matches Sequelize models
 * Run: node scripts/verifyDatabase.js
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

const expectedTables = [
  'admins',
  'students',
  'batches',
  'exams',
  'civil_questions',
  'gk_questions',
  'student_exam_reports',
  'answer_details',
  'notifications',
  'question_banks',
  'student_batch_access',
  'exam_requests',
  'roles',
  'admin_roles'
];

async function verifyDatabase() {
  try {
    console.log('🔍 Verifying MySQL Database Schema...\n');

    // Test connection
    await sequelize.authenticate();
    console.log('✅ Database connection successful\n');

    // Get all tables from database
    const [tables] = await sequelize.query(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_TYPE = 'BASE TABLE'
    `);

    const existingTables = tables.map(t => t.TABLE_NAME.toLowerCase());
    console.log('📊 Existing tables in database:');
    existingTables.forEach(table => console.log(`   - ${table}`));
    console.log('');

    // Check for missing tables
    const missingTables = expectedTables.filter(
      table => !existingTables.includes(table)
    );

    if (missingTables.length > 0) {
      console.log('⚠️  Missing tables:');
      missingTables.forEach(table => console.log(`   - ${table}`));
      console.log('\n❌ Some tables are missing. Please run database_schema.sql to create them.\n');
    } else {
      console.log('✅ All expected tables exist\n');
    }

    // Verify each model can sync
    console.log('🔧 Verifying model definitions...\n');
    
    const models = [
      { name: 'Admin', model: Admin, table: 'admins' },
      { name: 'Student', model: Student, table: 'students' },
      { name: 'Batch', model: Batch, table: 'batches' },
      { name: 'Exam', model: Exam, table: 'exams' },
      { name: 'CivilQuestion', model: CivilQuestion, table: 'civil_questions' },
      { name: 'GKQuestion', model: GKQuestion, table: 'gk_questions' },
      { name: 'StudentExamReport', model: StudentExamReport, table: 'student_exam_reports' },
      { name: 'AnswerDetail', model: AnswerDetail, table: 'answer_details' },
      { name: 'Notification', model: Notification, table: 'notifications' },
      { name: 'QuestionBank', model: QuestionBank, table: 'question_banks' },
      { name: 'StudentBatchAccess', model: StudentBatchAccess, table: 'student_batch_access' },
      { name: 'ExamRequest', model: ExamRequest, table: 'exam_requests' },
      { name: 'Role', model: Role, table: 'roles' },
      { name: 'AdminRole', model: AdminRole, table: 'admin_roles' }
    ];

    let allValid = true;
    for (const { name, model, table } of models) {
      try {
        // Try to describe the table
        await sequelize.getQueryInterface().describeTable(table);
        console.log(`✅ ${name} (${table}) - OK`);
      } catch (error) {
        console.log(`❌ ${name} (${table}) - ERROR: ${error.message}`);
        allValid = false;
      }
    }

    console.log('\n');

    // Check for foreign key constraints
    console.log('🔗 Checking foreign key constraints...\n');
    const [foreignKeys] = await sequelize.query(`
      SELECT 
        CONSTRAINT_NAME,
        TABLE_NAME,
        COLUMN_NAME,
        REFERENCED_TABLE_NAME,
        REFERENCED_COLUMN_NAME
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
      AND REFERENCED_TABLE_NAME IS NOT NULL
      ORDER BY TABLE_NAME, CONSTRAINT_NAME
    `);

    if (foreignKeys.length > 0) {
      console.log(`✅ Found ${foreignKeys.length} foreign key constraints:`);
      foreignKeys.forEach(fk => {
        console.log(`   ${fk.TABLE_NAME}.${fk.COLUMN_NAME} -> ${fk.REFERENCED_TABLE_NAME}.${fk.REFERENCED_COLUMN_NAME}`);
      });
    } else {
      console.log('⚠️  No foreign key constraints found');
    }

    console.log('\n');

    // Summary
    if (missingTables.length === 0 && allValid) {
      console.log('✅ Database verification complete! All tables and models are properly configured.\n');
      process.exit(0);
    } else {
      console.log('⚠️  Database verification found some issues. Please review above.\n');
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ Database verification failed:', error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

// Run verification
verifyDatabase();

