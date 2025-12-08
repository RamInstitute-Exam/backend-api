// utils/cleanTamilText.js

import { cleanAndSegmentTamil } from './tamilWordSegmenter.js';

/**
 * Clean and normalize Tamil text
 * Uses intelligent word segmentation for ALL Tamil words
 * Handles OCR errors like spaces in the middle of words
 * Adds proper spacing between Tamil words using linguistic rules
 */
export function cleanTamilText(text) {
  if (!text) return '';
  
  // Use the intelligent word segmenter for general Tamil text
  // This uses linguistic rules to segment ANY Tamil text, not just hardcoded words
  return cleanAndSegmentTamil(text);
}
