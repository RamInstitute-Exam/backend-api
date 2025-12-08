// services/easyocr-wrapper.js

/**
 * EasyOCR Wrapper for Node.js
 * Calls Python EasyOCR service as fallback when Tesseract fails
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

/**
 * Check if EasyOCR service is available
 */
export async function isEasyOCRAvailable() {
  try {
    const pythonScript = path.join(process.cwd(), 'backend', 'services', 'easyocr-service.py');
    const { stdout } = await execAsync(`python3 --version`);
    const scriptExists = await fs.access(pythonScript).then(() => true).catch(() => false);
    return scriptExists && stdout.includes('Python');
  } catch (error) {
    return false;
  }
}

/**
 * Extract text from image using EasyOCR (Python service)
 * @param {string} imagePath - Path to image file
 * @returns {Promise<{success: boolean, text: string, error?: string}>}
 */
export async function extractTextWithEasyOCR(imagePath) {
  try {
    const pythonScript = path.join(process.cwd(), 'backend', 'services', 'easyocr-service.py');
    
    // Check if script exists
    try {
      await fs.access(pythonScript);
    } catch {
      return {
        success: false,
        text: '',
        error: 'EasyOCR service not found. Install EasyOCR: pip install easyocr'
      };
    }
    
    // Call Python script
    const { stdout, stderr } = await execAsync(`python3 "${pythonScript}" "${imagePath}"`);
    
    if (stderr) {
      console.warn('EasyOCR stderr:', stderr);
    }
    
    const result = JSON.parse(stdout);
    
    if (result.success) {
      return {
        success: true,
        text: result.text || '',
        confidence: result.confidence || 0
      };
    } else {
      return {
        success: false,
        text: '',
        error: result.error || 'EasyOCR extraction failed'
      };
    }
  } catch (error) {
    console.error('EasyOCR wrapper error:', error);
    return {
      success: false,
      text: '',
      error: error.message || 'EasyOCR service error'
    };
  }
}

/**
 * Extract text with fallback: Tesseract first, then EasyOCR if needed
 */
export async function extractTextWithFallback(imagePath, tesseractResult) {
  // If Tesseract result is good (has reasonable amount of text), use it
  if (tesseractResult && tesseractResult.length > 50) {
    return {
      success: true,
      text: tesseractResult,
      method: 'tesseract'
    };
  }
  
  // Try EasyOCR as fallback
  console.log('⚠️  Tesseract result seems poor, trying EasyOCR fallback...');
  const easyOCRResult = await extractTextWithEasyOCR(imagePath);
  
  if (easyOCRResult.success) {
    return {
      success: true,
      text: easyOCRResult.text,
      method: 'easyocr',
      confidence: easyOCRResult.confidence
    };
  }
  
  // Return Tesseract result even if poor (better than nothing)
  return {
    success: true,
    text: tesseractResult || '',
    method: 'tesseract',
    fallbackFailed: true
  };
}

