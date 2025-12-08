// services/ocr-providers/ocrSpaceService.js
/**
 * OCR.space API Integration
 * Free tier: 25,000 requests per day
 * Supports Tamil language
 */

import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';

const OCR_SPACE_API_URL = 'https://api.ocr.space/parse/image';
const OCR_SPACE_API_KEY = process.env.OCR_SPACE_API_KEY || 'helloworld'; // Free tier key

/**
 * Extract text from image using OCR.space API
 * @param {string} imagePath - Path to image file
 * @param {Object} options - Additional options
 * @returns {Promise<{success: boolean, text: string, confidence?: number, error?: string}>}
 */
export async function extractTextWithOCRSpace(imagePath, options = {}) {
  try {
    // Check if API key is configured
    if (!OCR_SPACE_API_KEY || OCR_SPACE_API_KEY === 'helloworld') {
      console.warn('⚠️  OCR.space API key not configured. Using free tier key.');
    }

    // Read image file
    const imageBuffer = fs.readFileSync(imagePath);
    
    // Create form data
    const formData = new FormData();
    formData.append('file', imageBuffer, {
      filename: 'image.png',
      contentType: 'image/png'
    });
    formData.append('language', 'tam'); // Tamil language code
    formData.append('isOverlayRequired', 'false');
    formData.append('detectOrientation', 'true');
    formData.append('scale', 'true');
    formData.append('OCREngine', '2'); // Engine 2 is better for Tamil

    // Make API request
    const response = await axios.post(OCR_SPACE_API_URL, formData, {
      headers: {
        ...formData.getHeaders(),
        'apikey': OCR_SPACE_API_KEY
      },
      timeout: 30000 // 30 second timeout
    });

    if (response.data && response.data.ParsedResults && response.data.ParsedResults.length > 0) {
      const parsedText = response.data.ParsedResults[0].ParsedText || '';
      const confidence = response.data.ParsedResults[0].TextOverlay?.HasOverlay 
        ? 0.9 
        : 0.7; // Estimate confidence

      return {
        success: true,
        text: parsedText.trim(),
        confidence: confidence,
        method: 'ocrspace'
      };
    } else {
      return {
        success: false,
        text: '',
        error: 'No text found in OCR.space response',
        method: 'ocrspace'
      };
    }
  } catch (error) {
    console.error('OCR.space API error:', error.message);
    return {
      success: false,
      text: '',
      error: error.message || 'OCR.space API error',
      method: 'ocrspace'
    };
  }
}

/**
 * Check if OCR.space is available and configured
 */
export async function isOCRSpaceAvailable() {
  return !!OCR_SPACE_API_KEY;
}

