// services/ocr-providers/googleVisionService.js
/**
 * Google Cloud Vision API Integration
 * Requires: Google Cloud account and API key
 * Free tier: 1,000 requests/month
 * Excellent accuracy for Tamil text
 */

import axios from 'axios';
import fs from 'fs';
import { promisify } from 'util';

const readFile = promisify(fs.readFile);

const GOOGLE_VISION_API_URL = 'https://vision.googleapis.com/v1/images:annotate';

/**
 * Get Google Vision API key from environment
 */
function getGoogleApiKey() {
  return process.env.GOOGLE_VISION_API_KEY;
}

/**
 * Extract text from image using Google Cloud Vision API
 * @param {string} imagePath - Path to image file
 * @returns {Promise<{success: boolean, text: string, confidence?: number, error?: string}>}
 */
export async function extractTextWithGoogleVision(imagePath) {
  try {
    const GOOGLE_API_KEY = getGoogleApiKey();
    if (!GOOGLE_API_KEY) {
      return {
        success: false,
        text: '',
        error: 'Google Vision API key not configured. Set GOOGLE_VISION_API_KEY environment variable.',
        method: 'googlevision'
      };
    }

    // Read and encode image as base64
    const imageBuffer = await readFile(imagePath);
    const base64Image = imageBuffer.toString('base64');

    // Prepare API request
    const requestBody = {
      requests: [
        {
          image: {
            content: base64Image
          },
          features: [
            {
              type: 'TEXT_DETECTION',
              maxResults: 1
            }
          ],
          imageContext: {
            languageHints: ['ta', 'en'] // Tamil and English
          }
        }
      ]
    };

    // Make API request
    const response = await axios.post(
      `${GOOGLE_VISION_API_URL}?key=${GOOGLE_API_KEY}`,
      requestBody,
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    if (response.data && response.data.responses && response.data.responses.length > 0) {
      const textAnnotations = response.data.responses[0].textAnnotations;
      
      if (textAnnotations && textAnnotations.length > 0) {
        // First annotation contains full text
        const fullText = textAnnotations[0].description || '';
        const confidence = response.data.responses[0].textAnnotations?.[0]?.confidence || 0.9;

        return {
          success: true,
          text: fullText.trim(),
          confidence: confidence,
          method: 'googlevision'
        };
      }
    }

    return {
      success: false,
      text: '',
      error: 'No text detected by Google Vision API',
      method: 'googlevision'
    };
  } catch (error) {
    console.error('Google Vision API error:', error.response?.data || error.message);
    
    // Check for billing-related errors
    const errorMessage = error.response?.data?.error?.message || error.message || 'Google Vision API error';
    const errorCode = error.response?.data?.error?.code;
    
    let userFriendlyError = errorMessage;
    
    if (errorCode === 403 && errorMessage.includes('billing')) {
      userFriendlyError = `Google Vision API requires billing to be enabled. Even though there's a free tier (1,000 requests/month), Google requires a billing account to be set up. Please enable billing at: https://console.cloud.google.com/billing/enable`;
    }
    
    return {
      success: false,
      text: '',
      error: userFriendlyError,
      method: 'googlevision'
    };
  }
}

/**
 * Check if Google Vision API is available and configured
 */
export async function isGoogleVisionAvailable() {
  return !!getGoogleApiKey();
}

