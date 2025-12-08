-- URGENT: Run this SQL migration to add option_e support
-- Copy and paste this entire file into your MySQL client (phpMyAdmin, MySQL Workbench, or command line)

-- Step 1: Add option_e column to civil_questions table
ALTER TABLE civil_questions 
ADD COLUMN option_e TEXT DEFAULT '' AFTER option_d;

-- Step 2: Add option_e column to gk_questions table  
ALTER TABLE gk_questions 
ADD COLUMN option_e TEXT DEFAULT '' AFTER option_d;

-- Step 3: Update correct_option ENUM to include 'E' for civil_questions
ALTER TABLE civil_questions 
MODIFY COLUMN correct_option ENUM('A', 'B', 'C', 'D', 'E', 'NA') NOT NULL;

-- Step 4: Update correct_option ENUM to include 'E' for gk_questions
ALTER TABLE gk_questions 
MODIFY COLUMN correct_option ENUM('A', 'B', 'C', 'D', 'E', 'NA') NOT NULL;

-- Verification queries (run these to confirm):
-- DESCRIBE civil_questions;
-- DESCRIBE gk_questions;
-- SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'civil_questions' AND COLUMN_NAME = 'option_e';
-- SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'gk_questions' AND COLUMN_NAME = 'option_e';

