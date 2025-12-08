// utils/imagePreprocessor.js

/**
 * Image preprocessing utilities for better OCR accuracy
 * Enhances images before OCR to improve Tamil text recognition
 */

import { createCanvas, loadImage } from 'canvas';
import fs from 'fs/promises';

/**
 * Enhance image for better OCR
 * - Increases contrast
 * - Reduces noise
 * - Sharpens text
 * - Converts to grayscale if needed
 */
export async function preprocessImageForOCR(imagePath) {
  try {
    const image = await loadImage(imagePath);
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d');
    
    // Draw original image
    ctx.drawImage(image, 0, 0);
    
    // Get image data
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    // Apply preprocessing
    for (let i = 0; i < data.length; i += 4) {
      // Convert to grayscale (weighted average)
      const gray = Math.round(
        0.299 * data[i] +      // Red
        0.587 * data[i + 1] +  // Green
        0.114 * data[i + 2]    // Blue
      );
      
      // Increase contrast (stretch histogram)
      const contrast = 1.5; // Adjust contrast level
      const enhanced = Math.min(255, Math.max(0, (gray - 128) * contrast + 128));
      
      // Apply to all channels (grayscale)
      data[i] = enhanced;     // Red
      data[i + 1] = enhanced; // Green
      data[i + 2] = enhanced; // Blue
      // Alpha channel (data[i + 3]) remains unchanged
    }
    
    // Put processed data back
    ctx.putImageData(imageData, 0, 0);
    
    // Save processed image
    const processedPath = imagePath.replace('.png', '_processed.png');
    const buffer = canvas.toBuffer('image/png');
    await fs.writeFile(processedPath, buffer);
    
    return processedPath;
  } catch (error) {
    console.error('Image preprocessing error:', error);
    // Return original path if preprocessing fails
    return imagePath;
  }
}

/**
 * Enhance contrast and brightness for better OCR
 */
export async function enhanceImageContrast(imagePath) {
  try {
    const image = await loadImage(imagePath);
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d');
    
    ctx.drawImage(image, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    // Calculate histogram for adaptive enhancement
    const histogram = new Array(256).fill(0);
    for (let i = 0; i < data.length; i += 4) {
      const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      histogram[gray]++;
    }
    
    // Find min and max values (excluding outliers)
    let min = 0, max = 255;
    let sum = 0;
    const total = data.length / 4;
    const threshold = total * 0.01; // 1% threshold
    
    for (let i = 0; i < 256; i++) {
      sum += histogram[i];
      if (sum > threshold && min === 0) min = i;
    }
    
    sum = 0;
    for (let i = 255; i >= 0; i--) {
      sum += histogram[i];
      if (sum > threshold && max === 255) max = i;
    }
    
    // Apply contrast stretching
    const range = max - min || 1;
    for (let i = 0; i < data.length; i += 4) {
      const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      const stretched = Math.min(255, Math.max(0, ((gray - min) / range) * 255));
      
      data[i] = stretched;
      data[i + 1] = stretched;
      data[i + 2] = stretched;
    }
    
    ctx.putImageData(imageData, 0, 0);
    const processedPath = imagePath.replace('.png', '_enhanced.png');
    const buffer = canvas.toBuffer('image/png');
    await fs.writeFile(processedPath, buffer);
    
    return processedPath;
  } catch (error) {
    console.error('Image contrast enhancement error:', error);
    return imagePath;
  }
}

/**
 * Denoise image (simple median filter)
 */
export async function denoiseImage(imagePath) {
  try {
    const image = await loadImage(imagePath);
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d');
    
    ctx.drawImage(image, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const width = canvas.width;
    const height = canvas.height;
    
    // Simple 3x3 median filter
    const newData = new Uint8ClampedArray(data.length);
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = (y * width + x) * 4;
        const neighbors = [];
        
        // Collect neighbors
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nIdx = ((y + dy) * width + (x + dx)) * 4;
            neighbors.push(
              Math.round(0.299 * data[nIdx] + 0.587 * data[nIdx + 1] + 0.114 * data[nIdx + 2])
            );
          }
        }
        
        // Get median
        neighbors.sort((a, b) => a - b);
        const median = neighbors[4]; // Middle value
        
        newData[idx] = median;
        newData[idx + 1] = median;
        newData[idx + 2] = median;
        newData[idx + 3] = data[idx + 3]; // Preserve alpha
      }
    }
    
    // Copy edges (no filtering)
    for (let i = 0; i < data.length; i += 4) {
      const y = Math.floor((i / 4) / width);
      const x = (i / 4) % width;
      if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
        newData[i] = data[i];
        newData[i + 1] = data[i + 1];
        newData[i + 2] = data[i + 2];
        newData[i + 3] = data[i + 3];
      }
    }
    
    const newImageData = new ImageData(newData, width, height);
    ctx.putImageData(newImageData, 0, 0);
    
    const processedPath = imagePath.replace('.png', '_denoised.png');
    const buffer = canvas.toBuffer('image/png');
    await fs.writeFile(processedPath, buffer);
    
    return processedPath;
  } catch (error) {
    console.error('Image denoising error:', error);
    return imagePath;
  }
}

/**
 * Main preprocessing function - applies all enhancements
 */
export async function preprocessImage(imagePath) {
  try {
    // Step 1: Enhance contrast
    const enhanced = await enhanceImageContrast(imagePath);
    
    // Step 2: Denoise (optional - can be slow)
    // const denoised = await denoiseImage(enhanced);
    
    // Step 3: Final preprocessing
    const processed = await preprocessImageForOCR(enhanced);
    
    return processed;
  } catch (error) {
    console.error('Full image preprocessing error:', error);
    return imagePath; // Return original if all fails
  }
}

