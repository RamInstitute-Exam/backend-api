-- Simple Migration: Add image_url column to gk_questions table
-- Run this SQL command in your MySQL database

ALTER TABLE gk_questions 
ADD COLUMN image_url VARCHAR(500) AFTER has_image;

