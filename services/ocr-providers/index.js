// services/ocr-providers/index.js
/**
 * Unified OCR Provider Interface
 * Supports multiple third-party OCR services with fallback chain
 */

import { extractTextWithOCRSpace, isOCRSpaceAvailable } from './ocrSpaceService.js';
import { extractTextWithGoogleVision, isGoogleVisionAvailable } from './googleVisionService.js';
import { extractTextWithAWSTextract, isAWSTextractAvailable } from './awsTextractService.js';
import { extractTextWithEasyOCR, isEasyOCRAvailable } from '../easyocr-wrapper.js';

/**
 * OCR Provider Configuration
 * Order determines fallback priority
 */
const OCR_PROVIDERS = [
  {
    name: 'ocrspace',
    extract: extractTextWithOCRSpace,
    check: isOCRSpaceAvailable,
    priority: 1, // Free tier, good for Tamil
    cost: 'free'
  },
  {
    name: 'googlevision',
    extract: extractTextWithGoogleVision,
    check: isGoogleVisionAvailable,
    priority: 2, // Paid, excellent accuracy
    cost: 'paid'
  },
  {
    name: 'awstextract',
    extract: extractTextWithAWSTextract,
    check: isAWSTextractAvailable,
    priority: 3, // Paid, good accuracy
    cost: 'paid'
  },
  {
    name: 'easyocr',
    extract: async (imagePath) => {
      const result = await extractTextWithEasyOCR(imagePath);
      return {
        success: result.success,
        text: result.text || '',
        confidence: result.confidence || 0.7,
        method: 'easyocr',
        error: result.error
      };
    },
    check: isEasyOCRAvailable,
    priority: 4, // Free, local
    cost: 'free'
  }
];

/**
 * Extract text using multiple OCR providers with fallback
 * @param {string} imagePath - Path to image file
 * @param {Object} options - Options
 * @param {string[]} options.providers - List of provider names to try (default: all)
 * @param {boolean} options.useFreeOnly - Only use free providers (default: false)
 * @returns {Promise<{success: boolean, text: string, method: string, confidence?: number, error?: string}>}
 */
export async function extractTextWithThirdParty(imagePath, options = {}) {
  const {
    providers = null, // null = use all available
    useFreeOnly = false
  } = options;

  // Filter providers based on options
  let availableProviders = OCR_PROVIDERS.filter(provider => {
    // Check if provider is requested
    if (providers && !providers.includes(provider.name)) {
      return false;
    }
    // Check if free-only mode
    if (useFreeOnly && provider.cost !== 'free') {
      return false;
    }
    return true;
  });

  // Sort by priority
  availableProviders.sort((a, b) => a.priority - b.priority);

  // Try each provider in order
  for (const provider of availableProviders) {
    try {
      // Check if provider is available
      const isAvailable = await provider.check();
      if (!isAvailable) {
        console.log(`⏭️  Skipping ${provider.name} (not available)`);
        continue;
      }

      console.log(`🔄 Trying ${provider.name}...`);
      const result = await provider.extract(imagePath);

      if (result.success && result.text && result.text.length > 10) {
        console.log(`✅ Success with ${provider.name} (confidence: ${result.confidence || 'N/A'})`);
        return {
          ...result,
          provider: provider.name
        };
      } else {
        console.log(`⚠️  ${provider.name} returned poor result, trying next...`);
      }
    } catch (error) {
      console.error(`❌ Error with ${provider.name}:`, error.message);
      // Continue to next provider
    }
  }

  // All providers failed
  return {
    success: false,
    text: '',
    error: 'All OCR providers failed',
    method: 'none'
  };
}

/**
 * Get list of available OCR providers
 */
export async function getAvailableProviders() {
  const providers = [];
  
  for (const provider of OCR_PROVIDERS) {
    const isAvailable = await provider.check();
    providers.push({
      name: provider.name,
      available: isAvailable,
      cost: provider.cost,
      priority: provider.priority
    });
  }
  
  return providers;
}

/**
 * Extract text with smart fallback chain:
 * 1. Try free cloud services first (OCR.space)
 * 2. Try paid cloud services if configured (Google Vision, AWS) - Google Vision has free tier
 * 3. Fall back to local services (EasyOCR, Tesseract)
 */
export async function extractTextWithSmartFallback(imagePath, tesseractResult = '') {
  // If Tesseract result is good, use it
  if (tesseractResult && tesseractResult.length > 50) {
    return {
      success: true,
      text: tesseractResult,
      method: 'tesseract',
      provider: 'tesseract'
    };
  }

  // Step 1: Try free third-party services first
  console.log('🌐 Trying free third-party OCR services...');
  let thirdPartyResult = await extractTextWithThirdParty(imagePath, {
    useFreeOnly: true // Start with free services (OCR.space, EasyOCR)
  });

  if (thirdPartyResult.success) {
    return thirdPartyResult;
  }

  // Step 2: If free services failed, try all available services (including Google Vision, AWS)
  // Google Vision has a free tier (1,000 requests/month), so it's worth trying
  console.log('🌐 Free services failed, trying all available OCR services (including Google Vision)...');
  thirdPartyResult = await extractTextWithThirdParty(imagePath, {
    useFreeOnly: false // Try all services including paid ones with free tiers
  });

  if (thirdPartyResult.success) {
    return thirdPartyResult;
  }

  // Step 3: Fall back to Tesseract result (even if poor)
  return {
    success: true,
    text: tesseractResult || '',
    method: 'tesseract',
    provider: 'tesseract',
    fallback: true
  };
}

// Export individual providers for direct use
export { extractTextWithOCRSpace, isOCRSpaceAvailable } from './ocrSpaceService.js';
export { extractTextWithGoogleVision, isGoogleVisionAvailable } from './googleVisionService.js';
export { extractTextWithAWSTextract, isAWSTextractAvailable } from './awsTextractService.js';

