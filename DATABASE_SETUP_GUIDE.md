# Database Setup Guide

## Overview

This guide helps you set up and verify the MySQL database for the Institute Examination System after removing MongoDB.

## Prerequisites

1. MySQL Server installed and running
2. Database credentials configured in `.env` file
3. Node.js and npm installed

## Database Configuration

Ensure your `.env` file has the following MySQL configuration:

```env
DB_HOST=localhost
DB_PORT=3306
DB_NAME=institute_exams
DB_USER=your_username
DB_PASSWORD=your_password
```

## Setup Steps

### 1. Create Database Schema

Run the SQL schema file to create all tables:

```bash
# Option 1: Using MySQL command line
mysql -u your_username -p < database_schema.sql

# Option 2: Using MySQL Workbench or phpMyAdmin
# Open database_schema.sql and execute it
```

### 2. Verify Database Setup

Run the verification script to check if all tables exist:

```bash
npm run verify-db
```

This will:
- ✅ Test database connection
- ✅ Check if all required tables exist
- ✅ Verify model definitions
- ✅ Check foreign key constraints

### 3. Sync Database (Optional)

If you need to create missing tables (without modifying existing ones):

```bash
npm run sync-db
```

**Warning**: This only creates missing tables. It won't modify existing tables or add missing columns.

## Database Tables

The system uses the following MySQL tables:

### Core Tables
- `admins` - Admin users
- `students` - Student users
- `batches` - Exam batches
- `exams` - Exams
- `civil_questions` - Civil engineering questions
- `gk_questions` - General knowledge questions

### Report & Access Tables
- `student_exam_reports` - Exam submission reports
- `answer_details` - Detailed answer records
- `student_batch_access` - Batch access requests
- `exam_requests` - Exam access requests

### Other Tables
- `notifications` - System notifications
- `question_banks` - Question bank
- `roles` - User roles
- `admin_roles` - Admin role assignments

## Verification Checklist

After setup, verify:

- [ ] Database connection works
- [ ] All 14 tables exist
- [ ] Foreign key constraints are set up
- [ ] Models can query the database
- [ ] No MongoDB references remain

## Troubleshooting

### Connection Issues

If you get connection errors:
1. Check MySQL server is running
2. Verify credentials in `.env`
3. Ensure database exists: `CREATE DATABASE institute_exams;`

### Missing Tables

If tables are missing:
1. Run `database_schema.sql` to create them
2. Or use `npm run sync-db` (creates missing tables only)

### Schema Mismatches

If models don't match database:
1. Check `database_schema.sql` for latest schema
2. Run migration scripts if needed
3. Use `ALTER TABLE` statements to add missing columns

## Migration from MongoDB

If you're migrating from MongoDB:

1. ✅ All MongoDB models have been removed
2. ✅ All code uses MySQL/Sequelize models
3. ✅ Database schema is defined in `database_schema.sql`
4. ✅ Models are in `backend/models/mysql/`

## Next Steps

1. Run `npm run verify-db` to verify setup
2. Test the application
3. Check logs for any database errors
4. Verify all CRUD operations work

---

For more information, see `MONGODB_REMOVAL_SUMMARY.md`

