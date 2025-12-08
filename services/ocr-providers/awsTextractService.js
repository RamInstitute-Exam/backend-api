// services/ocr-providers/awsTextractService.js
/**
 * AWS Textract Integration
 * Requires: AWS account and credentials
 * Free tier: 1,000 pages/month (first 3 months)
 * Good accuracy for Tamil text
 */

import { TextractClient, DetectDocumentTextCommand } from '@aws-sdk/client-textract';
import fs from 'fs';
import { promisify } from 'util';

const readFile = promisify(fs.readFile);

// AWS credentials from environment variables
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;

let textractClient = null;

/**
 * Initialize AWS Textract client
 */
function getTextractClient() {
  if (!textractClient) {
    if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
      throw new Error('AWS credentials not configured');
    }
    textractClient = new TextractClient({
      region: AWS_REGION,
      credentials: {
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY
      }
    });
  }
  return textractClient;
}

/**
 * Extract text from image using AWS Textract
 * @param {string} imagePath - Path to image file
 * @returns {Promise<{success: boolean, text: string, confidence?: number, error?: string}>}
 */
export async function extractTextWithAWSTextract(imagePath) {
  try {
    if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
      return {
        success: false,
        text: '',
        error: 'AWS credentials not configured. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables.',
        method: 'awstextract'
      };
    }

    // Read image file
    const imageBuffer = await readFile(imagePath);

    // Initialize client
    const client = getTextractClient();

    // Create command
    const command = new DetectDocumentTextCommand({
      Document: {
        Bytes: imageBuffer
      }
    });

    // Execute command
    const response = await client.send(command);

    // Extract text from blocks
    if (response.Blocks) {
      const textBlocks = response.Blocks
        .filter(block => block.BlockType === 'LINE')
        .map(block => block.Text)
        .filter(text => text);

      const fullText = textBlocks.join('\n');
      const confidence = response.Blocks
        .filter(block => block.BlockType === 'LINE')
        .reduce((sum, block) => sum + (block.Confidence || 0), 0) / textBlocks.length || 0.8;

      return {
        success: true,
        text: fullText.trim(),
        confidence: confidence / 100, // Convert to 0-1 scale
        method: 'awstextract'
      };
    }

    return {
      success: false,
      text: '',
      error: 'No text detected by AWS Textract',
      method: 'awstextract'
    };
  } catch (error) {
    console.error('AWS Textract error:', error.message);
    return {
      success: false,
      text: '',
      error: error.message || 'AWS Textract error',
      method: 'awstextract'
    };
  }
}

/**
 * Check if AWS Textract is available and configured
 */
export async function isAWSTextractAvailable() {
  return !!(AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY);
}

