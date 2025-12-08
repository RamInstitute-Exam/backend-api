/**
 * Python PDF Extractor Wrapper for Node.js
 * Calls Python service for better Tamil/Unicode text extraction
 * Falls back to Node.js pdf-parse if Python is unavailable
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import tmp from 'tmp';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Check if Python PDF extractor is available
 * Tries both 'python3' and 'python' commands (Windows compatibility)
 */
export async function isPythonExtractorAvailable() {
  try {
    const pythonScript = path.join(__dirname, '..', 'services', 'pdf-extractor.py');
    const scriptExists = await fs.access(pythonScript).then(() => true).catch(() => false);
    if (!scriptExists) return false;
    
    // Try python3 first, then python (Windows compatibility)
    try {
      const { stdout } = await execAsync(`python3 --version`);
      return stdout.includes('Python');
    } catch {
      try {
        const { stdout } = await execAsync(`python --version`);
        return stdout.includes('Python');
      } catch {
        return false;
      }
    }
  } catch (error) {
    return false;
  }
}

/**
 * Get the Python command to use (python3 or python)
 */
async function getPythonCommand() {
  try {
    await execAsync(`python3 --version`);
    return 'python3';
  } catch {
    try {
      await execAsync(`python --version`);
      return 'python';
    } catch {
      return null;
    }
  }
}

/**
 * Extract text from PDF using Python service
 * @param {Buffer} pdfBuffer - PDF file buffer
 * @param {Object} options - Extraction options
 * @returns {Promise<{success: boolean, text: string, method: string, error?: string}>}
 */
export async function extractTextWithPython(pdfBuffer, options = {}) {
  try {
    const pythonScript = path.join(__dirname, '..', 'services', 'pdf-extractor.py');
    
    // Check if script exists
    try {
      await fs.access(pythonScript);
    } catch {
      return {
        success: false,
        text: '',
        method: 'none',
        error: 'Python PDF extractor service not found'
      };
    }
    
    // Save buffer to temporary file
    const tmpFile = await new Promise((resolve, reject) => {
      tmp.file({ prefix: 'pdf-extract-', postfix: '.pdf', keep: false }, (err, filePath, fd, cleanupCallback) => {
        if (err) reject(err);
        else resolve({ path: filePath, cleanup: cleanupCallback });
      });
    });
    
    try {
      // Write PDF buffer to temp file
      await fs.writeFile(tmpFile.path, pdfBuffer);
      
      // Get Python command (python3 or python for Windows)
      const pythonCmd = await getPythonCommand();
      if (!pythonCmd) {
        return {
          success: false,
          text: '',
          method: 'none',
          error: 'Python not found. Install Python 3.8+ and ensure it\'s in PATH'
        };
      }
      
      // Call Python script
      const { stdout, stderr } = await execAsync(`"${pythonCmd}" "${pythonScript}" "${tmpFile.path}"`);
      
      if (stderr && !stderr.includes('Warning')) {
        console.warn('Python PDF extractor stderr:', stderr);
      }
      
      const result = JSON.parse(stdout);
      
      if (result.success) {
        return {
          success: true,
          text: result.text || '',
          method: result.method || 'python',
          pages: result.pages || 0
        };
      } else {
        return {
          success: false,
          text: '',
          method: 'python',
          error: result.error || 'Python extraction failed'
        };
      }
    } finally {
      // Clean up temp file
      try {
        tmpFile.cleanup();
      } catch (cleanupError) {
        console.warn('Failed to cleanup temp file:', cleanupError);
        // Try to delete manually if cleanup callback fails
        try {
          await fs.unlink(tmpFile.path);
        } catch (unlinkError) {
          // Ignore unlink errors
        }
      }
    }
  } catch (error) {
    console.error('Python PDF extractor wrapper error:', error);
    return {
      success: false,
      text: '',
      method: 'python',
      error: error.message || 'Python PDF extractor service error'
    };
  }
}

/**
 * Extract text from PDF using Node.js pdf-parse (fallback)
 * @param {Buffer} pdfBuffer - PDF file buffer
 * @returns {Promise<{success: boolean, text: string, method: string}>}
 */
export async function extractTextWithNodeJS(pdfBuffer) {
  try {
    const parsed = await pdfParse(pdfBuffer, {
      max: 0, // No page limit
    });
    
    return {
      success: true,
      text: parsed.text || '',
      method: 'nodejs-pdf-parse',
      pages: parsed.numpages || 0
    };
  } catch (error) {
    console.error('Node.js PDF parse error:', error);
    return {
      success: false,
      text: '',
      method: 'nodejs-pdf-parse',
      error: error.message || 'PDF parsing failed'
    };
  }
}

/**
 * Extract text from PDF with automatic fallback
 * Tries Python first (better for Tamil/Unicode), falls back to Node.js
 * @param {Buffer} pdfBuffer - PDF file buffer
 * @param {Object} options - Options
 * @param {boolean} options.preferPython - Prefer Python over Node.js (default: true)
 * @param {boolean} options.fallbackToNodeJS - Fallback to Node.js if Python fails (default: true)
 * @returns {Promise<{success: boolean, text: string, method: string, error?: string}>}
 */
export async function extractTextFromPDF(pdfBuffer, options = {}) {
  const {
    preferPython = true,
    fallbackToNodeJS = true
  } = options;
  
  // Try Python first if preferred and available
  if (preferPython) {
    const pythonAvailable = await isPythonExtractorAvailable();
    if (pythonAvailable) {
      const pythonResult = await extractTextWithPython(pdfBuffer, options);
      if (pythonResult.success && pythonResult.text.trim().length > 0) {
        console.log(`✅ PDF text extracted using Python (${pythonResult.method})`);
        return pythonResult;
      }
      
      // Python failed, try Node.js fallback if enabled
      if (fallbackToNodeJS) {
        console.warn('⚠️  Python extraction failed or returned empty text, trying Node.js fallback...');
        const nodeResult = await extractTextWithNodeJS(pdfBuffer);
        if (nodeResult.success) {
          console.log(`✅ PDF text extracted using Node.js fallback`);
          return nodeResult;
        }
        // Both failed, return Python error
        return pythonResult;
      }
      
      return pythonResult;
    } else {
      console.warn('⚠️  Python PDF extractor not available, using Node.js');
    }
  }
  
  // Use Node.js directly
  const nodeResult = await extractTextWithNodeJS(pdfBuffer);
  if (nodeResult.success) {
    console.log(`✅ PDF text extracted using Node.js`);
    return nodeResult;
  }
  
  return nodeResult;
}

