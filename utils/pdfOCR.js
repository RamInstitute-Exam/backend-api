import pdfParse from "pdf-parse";
import pdfjsLib from "pdfjs-dist/legacy/build/pdf.js";
import Tesseract from "tesseract.js";
import { extractTextWithSmartFallback } from '../services/ocr-providers/index.js';
import { fromBuffer } from 'pdf2pic';
import tmp from 'tmp';
import fs from 'fs/promises';
import { preprocessImage } from './imagePreprocessor.js';

const OCR_LANGUAGES = "tam+eng"; // Tamil + English
// Note: Tesseract OCR is configured for Tamil + English recognition
const MAX_PAGES = 40;

function ensureUint8Array(data) {
  if (data instanceof Uint8Array) return data;
  if (Buffer.isBuffer(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  throw new Error("Unsupported data type for PDF input: " + typeof data);
}

/**
 * OCR fallback: extract only text layer (no image rendering).
 * This avoids `Image or Canvas expected` errors in Render.
 */
async function extractTextWithOcr(pdfBuffer) {
  const uint8Array = ensureUint8Array(pdfBuffer);

  const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
  const pdf = await loadingTask.promise;

  const pagePromises = [];

  for (let i = 0; i < Math.min(pdf.numPages, MAX_PAGES); i++) {
    pagePromises.push(
      (async (pageIndex) => {
        try {
          const page = await pdf.getPage(pageIndex + 1);
          const textContent = await page.getTextContent();

          // If text layer exists, no OCR needed
          if (textContent.items.length > 0) {
            return textContent.items.map((i) => i.str).join(" ");
          }

          // Otherwise, do OCR only if needed (but skip images!)
          console.log(`⚠️ Page ${pageIndex + 1} has no text → Skipping image OCR on Render.`);
          return "";
        } catch (err) {
          console.error(`❌ Failed text extraction on page ${pageIndex + 1}:`, err.message);
          return "";
        }
      })(i)
    );
  }

  const results = await Promise.all(pagePromises);
  return results.filter(Boolean).join("\n\n").trim();
}

export async function extractFullText(pdfBuffer) {
  const uint8Array = ensureUint8Array(pdfBuffer);

  let rawText = "";
  try {
    const parsed = await pdfParse(Buffer.from(uint8Array));
    rawText = (parsed.text || "").trim();
    console.log(`✅ Digital text extracted, length: ${rawText.length}`);
  } catch (err) {
    console.warn("⚠️ pdf-parse failed, trying pdf.js text extraction:", err.message);
  }

  let fallbackText = "";
  if (!rawText || rawText.length < 50) {
    console.log("🔎 Running pdf.js text extraction (Render-safe)...");
    fallbackText = await extractTextWithOcr(uint8Array);
  }

  const combinedText = (rawText + "\n" + fallbackText).trim();
  
  // Check if text contains Tamil or is poor quality - use OCR with Google Vision fallback
  const tamilRegex = /[\u0B80-\u0BFF]/;
  const hasTamil = tamilRegex.test(combinedText);
  const isPoorQuality = combinedText.length < 100 || !hasTamil;
  
  // If text is poor quality or missing Tamil, use OCR with Google Vision
  if (isPoorQuality || (hasTamil && combinedText.length < 200)) {
    console.log("🔄 Text quality is poor or Tamil text missing, running OCR with Google Vision fallback...");
    try {
      const tmpDir = tmp.dirSync({ unsafeCleanup: true });
      const tempPath = tmpDir.name;
      
      const storeAsImage = fromBuffer(Buffer.from(uint8Array), {
        density: 400,
        saveFilename: 'page',
        savePath: tempPath,
        format: 'png',
        width: 1600,
        height: 2200,
      });
      
      const pdfData = await pdfParse(Buffer.from(uint8Array));
      const numPages = pdfData.numpages || 1;
      let ocrText = '';
      
      for (let pageNum = 1; pageNum <= Math.min(numPages, 10); pageNum++) {
        try {
          const imageResponse = await storeAsImage(pageNum);
          const imagePath = imageResponse.path;
          
          // Preprocess image
          const processedImagePath = await preprocessImage(imagePath);
          
          // Try Tesseract first
          let pageText = '';
          try {
            const { data: { text } } = await Tesseract.recognize(
              processedImagePath,
              'tam+eng',
              {
                logger: () => {} // Silent
              }
            );
            pageText = text || '';
          } catch (tesseractError) {
            console.warn(`⚠️  Tesseract OCR failed for page ${pageNum}`);
          }
          
          // Use smart fallback (includes Google Vision)
          const result = await extractTextWithSmartFallback(processedImagePath, pageText);
          if (result.text) {
            ocrText += result.text + '\n';
            console.log(`✅ Page ${pageNum} extracted using ${result.provider || result.method}`);
          }
          
          // Cleanup
          await fs.unlink(imagePath).catch(() => {});
          if (processedImagePath !== imagePath) {
            await fs.unlink(processedImagePath).catch(() => {});
          }
        } catch (pageError) {
          console.error(`❌ Error processing page ${pageNum} for OCR:`, pageError.message);
        }
      }
      
      tmpDir.removeCallback();
      
      if (ocrText.trim().length > combinedText.length) {
        console.log(`✅ OCR with Google Vision extracted better text (${ocrText.length} vs ${combinedText.length} chars)`);
        return ocrText.trim();
      }
    } catch (ocrError) {
      console.warn("⚠️  OCR fallback failed, using extracted text:", ocrError.message);
    }
  }

  return combinedText;
}
