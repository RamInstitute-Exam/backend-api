# Database Migration: Add optionE Support for Assertion-Reason Questions

## Overview
This migration adds support for option E in assertion-reason questions (TNPSC format), which have 5 options (A through E) instead of the standard 4 options (A through D).

## Database Changes Required

### 1. Add `option_e` column to both question tables

#### For `gk_questions` table:
```sql
ALTER TABLE gk_questions 
ADD COLUMN option_e TEXT DEFAULT '' AFTER option_d;
```

#### For `civil_questions` table:
```sql
ALTER TABLE civil_questions 
ADD COLUMN option_e TEXT DEFAULT '' AFTER option_d;
```

### 2. Update `correct_option` ENUM to include 'E'

#### For `gk_questions` table:
```sql
ALTER TABLE gk_questions 
MODIFY COLUMN correct_option ENUM('A', 'B', 'C', 'D', 'E', 'NA') NOT NULL;
```

#### For `civil_questions` table:
```sql
ALTER TABLE civil_questions 
MODIFY COLUMN correct_option ENUM('A', 'B', 'C', 'D', 'E', 'NA') NOT NULL;
```

## Migration Script

Run these SQL commands in your MySQL database:

```sql
-- Add option_e to gk_questions
ALTER TABLE gk_questions 
ADD COLUMN option_e TEXT DEFAULT '' AFTER option_d;

-- Add option_e to civil_questions
ALTER TABLE civil_questions 
ADD COLUMN option_e TEXT DEFAULT '' AFTER option_d;

-- Update correct_option ENUM for gk_questions
ALTER TABLE gk_questions 
MODIFY COLUMN correct_option ENUM('A', 'B', 'C', 'D', 'E', 'NA') NOT NULL;

-- Update correct_option ENUM for civil_questions
ALTER TABLE civil_questions 
MODIFY COLUMN correct_option ENUM('A', 'B', 'C', 'D', 'E', 'NA') NOT NULL;
```

## Verification

After running the migration, verify the changes:

```sql
-- Check gk_questions structure
DESCRIBE gk_questions;

-- Check civil_questions structure
DESCRIBE civil_questions;

-- Verify option_e column exists
SELECT COLUMN_NAME, DATA_TYPE, COLUMN_DEFAULT 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME IN ('gk_questions', 'civil_questions') 
AND COLUMN_NAME = 'option_e';

-- Verify correct_option ENUM includes 'E'
SELECT COLUMN_TYPE 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME IN ('gk_questions', 'civil_questions') 
AND COLUMN_NAME = 'correct_option';
```

## Rollback (if needed)

If you need to rollback these changes:

```sql
-- Remove option_e column from gk_questions
ALTER TABLE gk_questions DROP COLUMN option_e;

-- Remove option_e column from civil_questions
ALTER TABLE civil_questions DROP COLUMN option_e;

-- Revert correct_option ENUM (remove 'E')
ALTER TABLE gk_questions 
MODIFY COLUMN correct_option ENUM('A', 'B', 'C', 'D', 'NA') NOT NULL;

ALTER TABLE civil_questions 
MODIFY COLUMN correct_option ENUM('A', 'B', 'C', 'D', 'NA') NOT NULL;
```

## Notes

- The `option_e` field will be empty for existing questions (defaults to empty string)
- Only assertion-reason type questions will use option E
- The models have been updated to support optionE
- The parsing logic automatically detects assertion-reason questions and adds option E

