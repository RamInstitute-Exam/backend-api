#!/usr/bin/env node
/**
 * Test script for Google Cloud Vision API
 * Usage: node services/test-google-vision.js [image_path]
 */

// Load environment variables
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env file from backend directory
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import { extractTextWithGoogleVision, isGoogleVisionAvailable } from './ocr-providers/googleVisionService.js';
import fs from 'fs';

async function testGoogleVision() {
  console.log('🔍 Testing Google Cloud Vision API Setup...\n');

  // Check if API key is configured
  const isAvailable = await isGoogleVisionAvailable();
  
  if (!isAvailable) {
    console.error('❌ Google Vision API key not configured!');
    console.log('\n📝 Setup Instructions:');
    console.log('1. Get API key from: https://console.cloud.google.com/apis/credentials');
    console.log('2. Enable Vision API: https://console.cloud.google.com/apis/library');
    console.log('3. Set environment variable: GOOGLE_VISION_API_KEY=your_key_here');
    console.log('4. Or add to .env file in backend folder\n');
    process.exit(1);
  }

  console.log('✅ Google Vision API key found!\n');

  // Get test image path
  const imagePath = process.argv[2];
  
  if (!imagePath) {
    console.log('⚠️  No image path provided.');
    console.log('Usage: node services/test-google-vision.js <image_path>');
    console.log('\nExample:');
    console.log('  node services/test-google-vision.js ../doc/test-image.png');
    process.exit(1);
  }

  // Check if image exists
  const fullPath = path.resolve(imagePath);
  if (!fs.existsSync(fullPath)) {
    console.error(`❌ Image not found: ${fullPath}`);
    process.exit(1);
  }

  console.log(`📸 Testing with image: ${fullPath}\n`);
  console.log('🔄 Calling Google Vision API...\n');

  try {
    const result = await extractTextWithGoogleVision(fullPath);

    if (result.success) {
      console.log('✅ Success!\n');
      console.log('📄 Extracted Text:');
      console.log('─'.repeat(50));
      console.log(result.text);
      console.log('─'.repeat(50));
      console.log(`\n📊 Confidence: ${(result.confidence * 100).toFixed(1)}%`);
      console.log(`🔧 Method: ${result.method}`);
    } else {
      console.error('❌ Failed to extract text');
      console.error(`Error: ${result.error}`);
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Run test
testGoogleVision().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});

