-- Migration: Add image_url column to gk_questions table
-- Date: 2024
-- Description: Adds image_url column to match civil_questions table structure

-- Check if column exists before adding (safe migration)
SET @dbname = DATABASE();
SET @tablename = "gk_questions";
SET @columnname = "image_url";
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (table_name = @tablename)
      AND (table_schema = @dbname)
      AND (column_name = @columnname)
  ) > 0,
  "SELECT 'Column already exists.' AS result;",
  CONCAT("ALTER TABLE ", @tablename, " ADD COLUMN ", @columnname, " VARCHAR(500) AFTER has_image;")
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

