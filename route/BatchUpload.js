import express from 'express';
import multer from 'multer';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { Batch, Exam, CivilQuestion, GKQuestion } from '../models/mysql/index.js';
import { sequelize } from '../config/MySQLConfig.js';
import cloudinary from "../config/Cloudinary.js";
import { extractHighlightedAnswers } from '../utils/answerget.js';
import { extractTextFromPDF } from '../utils/pdfExtractorPython.js';
import { correctTamilOCR } from '../utils/tamilOCRCorrection.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

/**
 * Safely truncate UTF-8 string to fit MySQL TEXT field (65535 bytes)
 * Ensures we don't cut in the middle of a multi-byte character
 */
function truncateToByteLength(str, maxBytes = 65535) {
  if (!str) return '';
  if (typeof str !== 'string') {
    try {
      str = String(str);
    } catch (e) {
      console.warn('⚠️ Failed to convert value to string:', e);
      return '';
    }
  }
  
  try {
    // Convert to Buffer to get actual byte length
    const buffer = Buffer.from(str, 'utf8');
    
    if (buffer.length <= maxBytes) {
      return str;
    }
    
    // Truncate buffer and convert back, handling incomplete multi-byte characters
    let truncatedBuffer = buffer.slice(0, maxBytes);
    
    // Remove incomplete multi-byte characters at the end
    // UTF-8 continuation bytes start with 10xxxxxx (0x80-0xBF)
    while (truncatedBuffer.length > 0) {
      const lastByte = truncatedBuffer[truncatedBuffer.length - 1];
      // If last byte is a continuation byte, remove it and try again
      if ((lastByte & 0xC0) === 0x80) {
        truncatedBuffer = truncatedBuffer.slice(0, -1);
      } else {
        break;
      }
    }
    
    const result = truncatedBuffer.toString('utf8');
    
    // Validate the result can be encoded back to UTF-8
    Buffer.from(result, 'utf8');
    
    return result;
  } catch (encodingError) {
    console.error('⚠️ Encoding error in truncateToByteLength:', encodingError);
    console.error('Problematic string (first 100 chars):', str.substring(0, 100));
    // Return empty string on encoding error to prevent database errors
    return '';
  }
}


// Progress tracking store (in-memory)
const progressStore = new Map();
function extractAnswers(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const answerMap = {};
  
  console.log('🔍 Extracting answers from text (first 2000 chars):', text.substring(0, 2000));
  console.log(`📄 Total lines in answer text: ${lines.length}`);
  
  let lastQuestionNumber = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Enhanced patterns to match various answer formats:
    // Priority order matters - more specific patterns first
    const patterns = [
      // Pattern 1: "1. (A)" - explicit parentheses (most common in answer PDFs)
      {
        regex: /^(\d+)\.\s*\(([A-D])\)/i,
        extract: (m) => ({ qNo: parseInt(m[1], 10), option: m[2].toUpperCase() })
      },
      // Pattern 2: "1. A" or "1) A" - number followed by option
      {
        regex: /^(\d+)\s*[\.\)]\s*([A-D])\s*$/i,
        extract: (m) => ({ qNo: parseInt(m[1], 10), option: m[2].toUpperCase() })
      },
      // Pattern 3: "1. A" with text after - extract just the answer
      {
        regex: /^(\d+)\s*[\.\)]\s*\(?([A-D])\)?\s*[^A-D]/i,
        extract: (m) => ({ qNo: parseInt(m[1], 10), option: m[2].toUpperCase() })
      },
      // Pattern 4: "1 - A" or "1 : A"
      {
        regex: /^(\d+)\s*[\-:]\s*([A-D])/i,
        extract: (m) => ({ qNo: parseInt(m[1], 10), option: m[2].toUpperCase() })
      },
      // Pattern 5: "1 Ans: A" or "1 Ans - A" or "1 Answer: A"
      {
        regex: /^(\d+)\s*(?:Ans|Answer)[:\-]?\s*([A-D])/i,
        extract: (m) => ({ qNo: parseInt(m[1], 10), option: m[2].toUpperCase() })
      },
      // Pattern 6: Question text with answer at end "1. text... (A)"
      {
        regex: /^(\d+)\.\s*[^\(]*\(([A-D])\)/i,
        extract: (m) => ({ qNo: parseInt(m[1], 10), option: m[2].toUpperCase() })
      },
      // Pattern 7: Just "(A)" on a line - use context from previous question number
      {
        regex: /^\(([A-D])\)\s*$/i,
        extract: (m) => lastQuestionNumber ? { qNo: lastQuestionNumber, option: m[1].toUpperCase() } : null
      },
      // Pattern 8: Just "A" on a line after a question number
      {
        regex: /^([A-D])\s*$/i,
        extract: (m) => lastQuestionNumber ? { qNo: lastQuestionNumber, option: m[1].toUpperCase() } : null
      },
      // Pattern 9: Standalone question number, answer might be on next line
      {
        regex: /^(\d+)[\.\)]?\s*$/,
        extract: (m) => {
          const qNo = parseInt(m[1], 10);
          lastQuestionNumber = qNo;
          // Check next line for answer
          if (i + 1 < lines.length) {
            const nextLine = lines[i + 1].trim();
            // Try multiple patterns for next line
            const answerMatch = nextLine.match(/^\(?([A-D])\)?\s*$/i) || 
                               nextLine.match(/^([A-D])\./i) ||
                               nextLine.match(/^Answer[:\-]?\s*([A-D])/i);
            if (answerMatch) {
              return { qNo, option: answerMatch[1].toUpperCase() };
            }
          }
          return null;
        }
      },
      // Pattern 10: "Q1: A" or "Question 1: A"
      {
        regex: /^(?:Q|Question)\s*(\d+)[:\-]?\s*([A-D])/i,
        extract: (m) => ({ qNo: parseInt(m[1], 10), option: m[2].toUpperCase() })
      }
    ];
    
    for (const pattern of patterns) {
      const match = line.match(pattern.regex);
      if (match) {
        try {
          const result = pattern.extract(match);
          if (result && result.qNo && result.option && ['A', 'B', 'C', 'D'].includes(result.option)) {
            // Validate question number is reasonable (1-200)
            if (result.qNo > 0 && result.qNo <= 200) {
              if (!answerMap[result.qNo]) {
                answerMap[result.qNo] = result.option;
                console.log(`✅ Found answer for Q${result.qNo}: ${result.option} (from line ${i + 1}: "${line.substring(0, 50)}...")`);
              } else if (answerMap[result.qNo] !== result.option) {
                // Conflicting answer - log warning but keep first one
                console.warn(`⚠️  Q${result.qNo} has conflicting answers: existing=${answerMap[result.qNo]}, new=${result.option}, keeping existing`);
              }
              lastQuestionNumber = result.qNo;
              break; // Found match, move to next line
            } else {
              console.warn(`⚠️  Invalid question number ${result.qNo} from line "${line.substring(0, 50)}"`);
            }
          }
        } catch (err) {
          console.warn(`⚠️  Error extracting from pattern for line "${line}":`, err.message);
        }
      }
    }
  }
  
  console.log(`📋 Total answers extracted from text: ${Object.keys(answerMap).length}`);
  if (Object.keys(answerMap).length > 0) {
    const sortedKeys = Object.keys(answerMap).sort((a, b) => parseInt(a) - parseInt(b));
    console.log(`📋 Answer keys found:`, sortedKeys.join(', '));
    console.log(`📋 Answer range: Q${sortedKeys[0]} to Q${sortedKeys[sortedKeys.length - 1]}`);
  } else {
    console.warn('⚠️  No answers extracted from answer PDF!');
  }
  return answerMap;
}



function detectQuestionType(text) {
  const lower = text.toLowerCase();
  if (lower.includes('match the following')) return 'match';
  if (lower.includes('assertion') && lower.includes('reason')) return 'assertion';
  if (/true\s*or\s*false/.test(lower)) return 'truefalse';
  if (lower.includes('passage')) return 'passage';
  if (/[√σγτεμ]/.test(text) || /\d\^?\d/.test(text)) return 'formula'; // math style
  if (lower.includes('figure') || lower.includes('diagram')) return 'image';
  return 'mcq';
}

// Normalize superscripts
// utils/questionParser.js

function normalizeSuperscripts(str) {
  return str
    .replace(/(\w)\^2/g, '$1²')
    .replace(/(\w)\^3/g, '$1³')
    .replace(/(\w)\^4/g, '$1⁴')
    .replace(/(\w)\^5/g, '$1⁵')
    .replace(/(\w)\^6/g, '$1⁶')
    .replace(/10\^6/g, '10⁶')
    .replace(/10\^3/g, '10³');
}

function normalizeMathSymbols(str) {
  if (!str) return str;
  return str
    // Replace Greek OCR mistakes
    .replace(/휀/g, 'ε')
    .replace(/훾/g, 'γ')
    .replace(/𝜎/g, 'σ')
    .replace(/𝜏/g, 'τ')
    .replace(/𝜀/g, 'ε')
    .replace(/𝛾/g, 'γ')
    // Fix common PDF extraction errors: μ (mu) incorrectly extracted as 'u'
    // Only replace μ with u if it's clearly a mistake (not in actual Greek text)
    .replace(/μnder/g, 'under') // "under" misread as "μnder"
    .replace(/μ/g, 'u') // Replace μ with u (common PDF extraction error)
    // Common OCR mistakes for Greek letters (be more careful)
    // Don't replace 'y' with 'γ' as it's too aggressive - only in math contexts
    // .replace(/y/g, 'γ') // OCR misreads gamma - REMOVED: too aggressive
}

// Tamil Unicode range: \u0B80-\u0BFF
const TAMIL_REGEX = /[\u0B80-\u0BFF]/;
const TAMIL_AND_PUNCTUATION_REGEX = /[\u0B80-\u0BFF\s.,;:"'?!()\-–—]/;

/**
 * Extract Tamil text from a line that may contain both English and Tamil
 * Returns { english: string, tamil: string }
 * Improved to handle patterns like "English Tamil", "Tamil English", and mixed content
 * Enhanced for better separation of English and Tamil text
 */
function extractEnglishAndTamil(line) {
  if (!line || !line.trim()) return { english: '', tamil: '' };
  
  // Check if line contains Tamil
  if (!TAMIL_REGEX.test(line)) {
    return { english: line.trim(), tamil: '' };
  }
  
  // Strategy: Use character-by-character analysis for better accuracy
  // Split the line into segments of consecutive same-type characters
  
  let englishParts = [];
  let tamilParts = [];
  let currentEnglish = '';
  let currentTamil = '';
  
  // Process character by character
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const charCode = char.charCodeAt(0);
    
    // Check if character is Tamil (Unicode range 0B80-0BFF)
    const isTamil = (charCode >= 0x0B80 && charCode <= 0x0BFF);
    
    // Check if character is English (Latin letters, numbers, common punctuation)
    const isEnglish = /[A-Za-z0-9\s(),.\-:;!?'"\[\]{}]/.test(char);
    
    if (isTamil) {
      // If we were building English, save it
      if (currentEnglish.trim()) {
        englishParts.push(currentEnglish.trim());
        currentEnglish = '';
      }
      // Add to Tamil
      currentTamil += char;
    } else if (isEnglish && !isTamil) {
      // If we were building Tamil, save it
      if (currentTamil.trim()) {
        tamilParts.push(currentTamil.trim());
        currentTamil = '';
      }
      // Add to English (but skip if it's just punctuation after Tamil)
      if (currentTamil.length === 0 || !/[.,;:!?)]/.test(char)) {
        currentEnglish += char;
      }
    } else {
      // Special character or space - decide based on context
      if (currentTamil.trim()) {
        // If we're in Tamil context, add space to Tamil
        if (char === ' ' && currentTamil.length > 0) {
          currentTamil += char;
        } else if (currentTamil.length > 0) {
          tamilParts.push(currentTamil.trim());
          currentTamil = '';
        }
      } else if (currentEnglish.trim()) {
        // If we're in English context, add to English
        currentEnglish += char;
      }
    }
  }
  
  // Add any remaining parts
  if (currentEnglish.trim()) {
    englishParts.push(currentEnglish.trim());
  }
  if (currentTamil.trim()) {
    tamilParts.push(currentTamil.trim());
  }
  
  // Clean and join Tamil parts - remove extra spaces but preserve word boundaries
  let combinedTamil = tamilParts.join(' ').trim();
  // Remove multiple spaces but keep single spaces
  combinedTamil = combinedTamil.replace(/\s+/g, ' ');
  let cleanedTamil = normalizeTamilText(combinedTamil);
  // Apply OCR error correction
  cleanedTamil = correctTamilOCR(cleanedTamil);
  
  // Clean English parts - preserve structure
  let cleanedEnglish = englishParts.join(' ').trim();
  // Remove multiple spaces
  cleanedEnglish = cleanedEnglish.replace(/\s+/g, ' ');
  
  // If English is empty but line had content, check if it was all Tamil
  if (!cleanedEnglish && line.trim().length > 0) {
    // Might be Tamil-only line
    cleanedTamil = normalizeTamilText(line.trim());
    // Apply OCR error correction
    cleanedTamil = correctTamilOCR(cleanedTamil);
  }
  
  return {
    english: cleanedEnglish,
    tamil: cleanedTamil
  };
}

/**
 * Improved Tamil text normalization with better cleaning
 * Handles PDF extraction artifacts and encoding issues
 */
function normalizeTamilText(text) {
  if (!text) return '';
  
  // Convert to string if not already
  if (typeof text !== 'string') {
    try {
      text = String(text);
    } catch (e) {
      console.warn('⚠️ Failed to convert text to string:', e);
      return '';
    }
  }
  
  // Remove leading/trailing whitespace
  let cleaned = text.trim();
  
  // Remove zero-width and invisible characters that break Tamil text
  cleaned = cleaned
    .replace(/\u200B/g, '') // Zero-width space
    .replace(/\u200C/g, '') // Zero-width non-joiner
    .replace(/\u200D/g, '') // Zero-width joiner
    .replace(/\uFEFF/g, '') // Zero-width no-break space (BOM)
    .replace(/[\u2000-\u200F]/g, ' ') // Various space characters to regular space
    .replace(/[\u2028-\u202F]/g, ' ') // Line/paragraph separators
    .replace(/[\u2060-\u206F]/g, '') // Word joiners and invisible characters
    .replace(/\u00A0/g, ' '); // Non-breaking space to regular space
  
  // Remove extra spaces (multiple spaces to single space)
  cleaned = cleaned.replace(/\s+/g, ' ');
  
  // Fix common OCR errors in Tamil text - GENERAL patterns only, NO static word replacements
  // Only fix structural/encoding issues, not specific words
  cleaned = cleaned
    .replace(/[\u0B82-\u0B83]/g, match => match) // Preserve anusvara and visarga
    .replace(/\u0BCD\u0BBE/g, '\u0BBE\u0BCD') // Fix vowel sign order (structural fix)
    .replace(/\u0BCD\u0BBF/g, '\u0BBF\u0BCD') // Fix vowel sign order (structural fix)
    .replace(/\u0BCD\u0BC0/g, '\u0BC0\u0BCD') // Fix vowel sign order (structural fix)
    .replace(/\u0BCD\u0BC1/g, '\u0BC1\u0BCD') // Fix vowel sign order (structural fix)
    .replace(/\u0BCD\u0BC2/g, '\u0BC2\u0BCD'); // Fix vowel sign order (structural fix)
  
  // Remove parsing artifacts ONLY (not word corrections)
  cleaned = cleaned
    .replace(/விலட[^.]*/g, '') // Remove garbled "விலட" (artifact from "Answer not known")
    .replace(/ததரினவில்ல/g, '') // Remove garbled text artifacts
    .replace(/ததரிநிலவ/g, '') // Remove garbled text artifacts
    .replace(/தெரியவில்லை/g, '') // Remove "தெரியவில்லை" (not known) - artifact removal
    .replace(/\(E\)[^.]*/g, ''); // Remove "(E)" and anything after - artifact removal
  
  // Remove spaces between Tamil characters that are likely OCR errors
  // But preserve spaces that are likely word boundaries
  // Pattern: Tamil char + space + Tamil char (only if both are consonants/vowels that can combine)
  cleaned = cleaned.replace(/([\u0B80-\u0BFF])\s+([\u0B80-\u0BFF])/g, (match, p1, p2) => {
    // Check if p1 is a consonant and p2 is a vowel sign - they should combine
    const p1IsConsonant = /[\u0B95-\u0BB9]/.test(p1);
    const p2IsVowelSign = /[\u0BBE-\u0BCD]/.test(p2);
    
    if (p1IsConsonant && p2IsVowelSign) {
      // These should combine, remove space
      return p1 + p2;
    }
    
    // Otherwise, keep the space (likely a word boundary)
    return match;
  });
  
  // Final cleanup
  cleaned = cleaned
    .replace(/\s+/g, ' ') // Final space cleanup
    .trim();
  
  // Apply OCR error correction
  cleaned = correctTamilOCR(cleaned);
  
  // Validate UTF-8 encoding
  try {
    Buffer.from(cleaned, 'utf8');
  } catch (encodingError) {
    console.warn('⚠️ Tamil text encoding error, attempting to fix:', encodingError);
    // Try to fix by removing invalid characters
    cleaned = cleaned.split('').filter(char => {
      try {
        Buffer.from(char, 'utf8');
        return true;
      } catch {
        return false;
      }
    }).join('');
  }
  
  return cleaned;
}

/**
 * Check if a line is primarily Tamil text
 * Improved detection to better identify Tamil-only or Tamil-dominant lines
 */
function isTamilLine(line) {
  if (!line || !TAMIL_REGEX.test(line)) return false;
  
  const tamilChars = (line.match(/[\u0B80-\u0BFF]/g) || []).length;
  const englishChars = (line.match(/[A-Za-z]/g) || []).length;
  const totalChars = line.replace(/\s/g, '').length;
  
  // If line has Tamil characters
  if (tamilChars === 0) return false;
  
  // If Tamil chars significantly outnumber English chars (more than 2:1 ratio)
  if (englishChars > 0 && tamilChars / englishChars < 2) {
    return false; // Mixed content, not primarily Tamil
  }
  
  // If more than 40% of non-space characters are Tamil, consider it a Tamil line
  // Or if Tamil chars are more than 5 and English chars are less than 3
  return totalChars > 0 && (
    (tamilChars / totalChars) > 0.4 || 
    (tamilChars > 5 && englishChars < 3)
  );
}

/**
 * Parse questions from OCR text + highlighted answers
 * Handles all government coaching center question types:
 * - Standard MCQ with (A), (B), (C), (D)
 * - Questions with formulas (LaTeX notation)
 * - Questions with sub-options (i, ii, iii, iv)
 * - Matching questions (List I with List II)
 * - Questions with diagrams/figures
 * - Nested options (a, b, c, d then A, B, C, D)
 * - Multi-line questions and options
 */
export function parseQuestions(qText, answers) {
  // Normalize line breaks and clean text
  const lines = qText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  
  let questions = [];
  let currentQ = null;
  let currentOption = null; // Track which option we're currently building
  let inSubOptions = false; // Track if we're in sub-options section (i, ii, iii, iv)
  let inListI = false; // Track if we're in List I section (for matching questions)
  let inListII = false; // Track if we're in List II section (for matching questions)
  let expectedQ = 1;
  let questionTextBuffer = []; // Buffer for multi-line question text

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const nextLine = i + 1 < lines.length ? lines[i + 1] : "";
    
    // ✅ Pattern 1: Question number detection - handles "1.", "1)", "1.The", "1. The"
    // More strict: question number must be at start of line, followed by space/punctuation and text
    const qMatch = line.match(/^(\d+)[\.\)]\s+([A-Z].*)$/) || // "17. For" or "17) For" - must have text after
                   line.match(/^(\d+)\.([A-Z][a-z].*)$/) || // "17.For" format - no space
                   line.match(/^(\d+)\s+([A-Z][a-z].*)$/); // "17 For" format - space and capital letter

    if (qMatch) {
      // Save previous question
      if (currentQ) {
        // Finalize question text from buffer
        if (questionTextBuffer.length > 0) {
          currentQ.questionTextEnglish += " " + questionTextBuffer.join(" ");
          questionTextBuffer = [];
        }
        questions.push(currentQ);
      }

      let qNo = parseInt(qMatch[1], 10);
      
      // ✅ Prevent duplicate question numbers - if we already have this number, 
      // check if current question has content, if not, replace it
      const existingQ = questions.find(q => q.questionNumber === qNo);
      if (existingQ) {
        // Check if existing question has meaningful content
        const existingHasContent = existingQ.questionTextEnglish && 
                                   existingQ.questionTextEnglish.trim().length > 10 &&
                                   Object.values(existingQ.options).some(v => v && v.trim().length > 0);
        
        if (!existingHasContent) {
          // Existing question is empty/incomplete, remove it and create new one
          console.warn(`⚠️  Duplicate question number ${qNo} detected, but existing is empty - replacing`);
          const index = questions.findIndex(q => q.questionNumber === qNo);
          if (index !== -1) {
            questions.splice(index, 1);
          }
        } else {
          console.warn(`⚠️  Duplicate question number ${qNo} detected, skipping duplicate`);
          // Don't create duplicate, but continue processing current question
          continue;
        }
      }
      
      // Auto-correct question number if sequence is off
      if (qNo !== expectedQ && qNo > expectedQ + 2) {
        console.warn(`⚠️  Question number jump: expected ${expectedQ}, got ${qNo}, using ${expectedQ}`);
        qNo = expectedQ;
      }
      expectedQ = qNo + 1;

      // Extract question text (may contain both English and Tamil)
      let questionText = qMatch[2] || "";
      if (!questionText && qMatch[0]) {
        questionText = line.substring(qMatch[0].length).trim();
      }

      // Extract English and Tamil from question line
      let { english: questionEnglish, tamil: questionTamil } = extractEnglishAndTamil(questionText);
      
      // Fix character encoding issues in English text (μ → u)
      questionEnglish = normalizeMathSymbols(questionEnglish);
      
      // Remove "(E) Answer not known" artifacts from question text
      questionEnglish = questionEnglish
        .replace(/\s*\(E\)\s*Answer\s+not\s+known[^.]*/gi, '')
        .replace(/\s*Answer\s+not\s+known[^.]*/gi, '')
        .trim();
      
      // Check next line for Tamil text (common pattern: English on one line, Tamil on next)
      let tamilFromNextLine = '';
      if (i + 1 < lines.length) {
        const nextLineText = lines[i + 1].trim();
        // Check if it's a Tamil-only line or Tamil-dominant line
        if (isTamilLine(nextLineText)) {
          // It's primarily Tamil, extract all of it
          const { tamil: fullTamil } = extractEnglishAndTamil(nextLineText);
          tamilFromNextLine = fullTamil || normalizeTamilText(nextLineText);
          // Remove "(E) Answer not known" artifacts from Tamil text
          tamilFromNextLine = tamilFromNextLine
            .replace(/\s*விலட[^.]*/g, '') // Remove garbled "விலட" and anything after
            .replace(/\s*விடை\s*தெரியவில்லை[^.]*/g, '') // Remove correct Tamil "Answer not known"
            .replace(/\s*\(E\)[^.]*/g, '') // Remove "(E)" and anything after
            .trim();
          i++; // Skip the Tamil line
        } else {
          // Check if next line has Tamil mixed with English
          const { tamil: mixedTamil } = extractEnglishAndTamil(nextLineText);
          if (mixedTamil) {
            tamilFromNextLine = mixedTamil;
            // Remove artifacts from Tamil text
            tamilFromNextLine = tamilFromNextLine
              .replace(/\s*விலட[^.]*/g, '')
              .replace(/\s*விடை\s*தெரியவில்லை[^.]*/g, '')
              .replace(/\s*\(E\)[^.]*/g, '')
              .trim();
            // If the line is mostly Tamil, we might want to skip it
            // But be conservative - only skip if it's clearly Tamil-dominant
            if (isTamilLine(nextLineText)) {
              i++; // Skip if it's Tamil-dominant
            }
          }
        }
      }
      
      // Clean Tamil text from question line
      questionTamil = normalizeTamilText(questionTamil);
      questionTamil = questionTamil
        .replace(/\s*விலட[^.]*/g, '')
        .replace(/\s*விடை\s*தெரியவில்லை[^.]*/g, '')
        .replace(/\s*\(E\)[^.]*/g, '')
        .trim();

      // Combine Tamil from same line and next line
      // Remove duplicates and clean up
      const combinedTamil = [questionTamil, tamilFromNextLine]
        .filter(Boolean)
        .map(t => t.trim())
        .filter(t => t.length > 0)
        .join(' ')
        .trim();

      // Reset state for new question
      currentQ = {
        questionNumber: qNo,
        questionTextEnglish: normalizeMathSymbols(normalizeSuperscripts(questionEnglish || questionText)),
        questionTextTamil: combinedTamil,
        options: { A: "", B: "", C: "", D: "" },
        subOptions: { i: "", ii: "", iii: "", iv: "" }, // For sub-options (i, ii, iii, iv)
        listI: { a: "", b: "", c: "", d: "" }, // For matching questions - List I
        listII: { "1": "", "2": "", "3": "", "4": "" }, // For matching questions - List II
        correctOption: "",
        questionType: "mcq",
        explanation: "",
        difficulty: "medium",
        hasImage: false,
      };
      currentOption = null;
      inSubOptions = false;
      inListI = false; // Track if we're in List I section
      inListII = false; // Track if we're in List II section
      questionTextBuffer = [];
      continue;
    }

    // ✅ Pattern 2a: List I detection (a, b, c, d) - for matching questions like Q10
    const listIMatch = line.match(/^list\s+i[:\s]*$/i);
    if (listIMatch && currentQ) {
      inListI = true;
      inListII = false;
      inSubOptions = false;
      continue;
    }

    // ✅ Pattern 2b: List II detection (1, 2, 3, 4) - for matching questions
    const listIIMatch = line.match(/^list\s+ii[:\s]*$/i);
    if (listIIMatch && currentQ) {
      inListI = false;
      inListII = true;
      inSubOptions = false;
      continue;
    }

    // ✅ Pattern 2c: List I items (a, b, c, d) - for matching questions
    const listIItemMatch = line.match(/^([a-d])\.\s*(.*)$/i);
    if (listIItemMatch && currentQ && inListI) {
      const itemKey = listIItemMatch[1].toLowerCase();
      const itemText = normalizeMathSymbols(normalizeSuperscripts(listIItemMatch[2] || ""));
      if (['a', 'b', 'c', 'd'].includes(itemKey)) {
        currentQ.listI[itemKey] = itemText;
        continue;
      }
    }

    // ✅ Pattern 2d: List II items (1, 2, 3, 4) - for matching questions
    const listIIItemMatch = line.match(/^(\d+)\.\s*(.*)$/);
    if (listIIItemMatch && currentQ && inListII) {
      const itemKey = listIIItemMatch[1];
      const itemText = normalizeMathSymbols(normalizeSuperscripts(listIIItemMatch[2] || ""));
      if (['1', '2', '3', '4'].includes(itemKey)) {
        currentQ.listII[itemKey] = itemText;
        continue;
      }
    }

    // ✅ Pattern 2e: Codes section detection - for matching questions
    const codesMatch = line.match(/^codes?:?\s*$/i);
    if (codesMatch && currentQ) {
      inListI = false;
      inListII = false;
      inSubOptions = false;
      continue;
    }

    // ✅ Pattern 2f: Sub-options detection (i, ii, iii, iv) - for questions like Q2, Q5
    // Match patterns: "(i)", "(ii)", "(iii)", "(iv)" or "i)", "ii)", etc.
    // More specific: only match 'i' characters, 1-4 times
    const subOptMatch = line.match(/^\(?([i]{1,4})\)?\s*[\.\)]?\s*(.*)$/i) || 
                       line.match(/^([i]{1,4})[\.\)]\s*(.*)$/i);
    if (subOptMatch && currentQ && !inListI && !inListII) {
      let subOptKey = subOptMatch[1].toLowerCase();
      const subOptTextRaw = subOptMatch[2] || "";
      
      // Normalize sub-option key (handle "iv" vs "iiii")
      if (subOptKey === 'iiii') subOptKey = 'iv';
      if (subOptKey === 'iii') subOptKey = 'iii';
      if (subOptKey === 'ii') subOptKey = 'ii';
      if (subOptKey === 'i') subOptKey = 'i';
      
      // Only process valid sub-option keys
      if (!['i', 'ii', 'iii', 'iv'].includes(subOptKey)) {
        // Not a sub-option, continue processing
      } else {
        // Extract English and Tamil from sub-option
        const { english: subOptEnglish, tamil: subOptTamil } = extractEnglishAndTamil(subOptTextRaw);
        
        // Check next line for Tamil (common pattern: English on one line, Tamil on next)
        let tamilFromNextLine = '';
        if (i + 1 < lines.length) {
          const nextLineText = lines[i + 1].trim();
          // Skip if next line is a main option (A, B, C, D)
          const isNextLineOption = /^\(?([A-D])\)?[\.\)]/.test(nextLineText);
          if (!isNextLineOption) {
            if (isTamilLine(nextLineText)) {
              tamilFromNextLine = normalizeTamilText(nextLineText);
              i++; // Skip the Tamil line
            } else {
              const { tamil: mixedTamil } = extractEnglishAndTamil(nextLineText);
              if (mixedTamil) {
                tamilFromNextLine = mixedTamil;
              }
            }
          }
        }
        
        const combinedTamil = [subOptTamil, tamilFromNextLine].filter(Boolean).join(' ').trim();
        let subOptText = normalizeMathSymbols(normalizeSuperscripts(subOptEnglish || subOptTextRaw));
        
        // Apply Tamil normalization and truncation
        if (combinedTamil) {
          let normalizedTamil = normalizeTamilText(combinedTamil);
          normalizedTamil = truncateToByteLength(normalizedTamil);
          subOptText = `${subOptText} ${normalizedTamil}`.trim();
        }
        
        // Truncate to byte length for database
        subOptText = truncateToByteLength(subOptText);
        
        inSubOptions = true;
        currentQ.subOptions[subOptKey] = subOptText;
        currentOption = null; // Reset main option tracking
        continue;
      }
    }

    // ✅ Pattern 3: Main options detection - handles "(A)", "A)", "A.", "A " formats
    // More strict: must be at start of line, not part of question text
    const optMatch = line.match(/^\(?([A-D])\)?[\.\)]\s*(.*)$/i) || 
                     line.match(/^\(([A-D])\)\s+(.*)$/i); // Strict "(A) text" format
    if (optMatch && currentQ) {
      // Reset all section flags when we hit main options
      inSubOptions = false;
      inListI = false;
      inListII = false;
      
      const optKey = optMatch[1].toUpperCase();
      let optTextRaw = optMatch[2] || "";
      
      // Validate option key (A-D only)
      if (!['A', 'B', 'C', 'D'].includes(optKey)) {
        continue; // Skip invalid options
      }
      
      // Extract English and Tamil from option text
      const { english: optEnglish, tamil: optTamil } = extractEnglishAndTamil(optTextRaw);
      
      // Check next line for Tamil text (common pattern: English option on one line, Tamil on next)
      let tamilFromNextLine = '';
      if (i + 1 < lines.length) {
        const nextLineText = lines[i + 1].trim();
        if (isTamilLine(nextLineText)) {
          tamilFromNextLine = normalizeTamilText(nextLineText);
          i++; // Skip the Tamil line
        } else {
          // Check if next line has Tamil mixed with English
          const { tamil: mixedTamil } = extractEnglishAndTamil(nextLineText);
          if (mixedTamil) {
            tamilFromNextLine = mixedTamil;
          }
        }
      }
      
      // Combine English and Tamil for option
      // Store separately for better database storage
      let optText = normalizeMathSymbols(normalizeSuperscripts(optEnglish || optTextRaw));
      
      // Remove parsing artifacts early: "(E) Answer not known" patterns
      optText = optText
        .replace(/\s*\(E\)\s*Answer\s+not\s+known[^.]*/gi, '')
        .replace(/\s*Answer\s+not\s+known[^.]*/gi, '')
        .trim();
      
      const combinedTamil = [optTamil, tamilFromNextLine].filter(Boolean).join(' ').trim();
      
      // For options, we'll store English and Tamil together in the option field
      // This is because the database schema stores options as single TEXT fields
      // If Tamil exists, append it to option text with proper spacing
      if (combinedTamil) {
        // Normalize Tamil before appending and remove artifacts
        let normalizedTamil = normalizeTamilText(combinedTamil);
        // Remove garbled Tamil "Answer not known" variants - more aggressive
        normalizedTamil = normalizedTamil
          .replace(/\s*விலட[^.]*/g, '') // Remove "விலட" and anything after (garbled Tamil)
          .replace(/\s*விடை\s*தெரியவில்லை[^.]*/g, '') // Remove correct Tamil "Answer not known"
          .replace(/\s*\(E\)[^.]*/g, '') // Remove "(E)" and anything after
          .trim();
        
        // If English text ends with punctuation or is empty, just add Tamil
        // Otherwise, add a space before Tamil
        if (normalizedTamil) {
          if (optText && !optText.match(/[.,;:!?)\]]\s*$/)) {
            optText = `${optText} ${normalizedTamil}`.trim();
          } else {
            optText = `${optText}${normalizedTamil}`.trim();
          }
        }
      }
      
      // Skip if option text is just "N/A" or empty after cleanup
      if (optText.trim() === "N/A" || optText.trim() === "NA" || optText.trim() === "") {
        // Don't set empty options, but continue to next line
        continue;
      }
      
      // If we have buffered question text, add it now
      if (questionTextBuffer.length > 0) {
        let bufferedText = questionTextBuffer.join(" ");
        // Fix character encoding in buffered text
        bufferedText = normalizeMathSymbols(bufferedText);
        // Remove artifacts from buffered text
        bufferedText = bufferedText
          .replace(/\s*\(E\)\s*Answer\s+not\s+known[^.]*/gi, '')
          .replace(/\s*Answer\s+not\s+known[^.]*/gi, '')
          .trim();
        currentQ.questionTextEnglish += " " + bufferedText;
        questionTextBuffer = [];
      }
      
      // Fix character encoding in option text
      optText = normalizeMathSymbols(optText);
      
      currentQ.options[optKey] = optText;
      currentOption = optKey; // Track which option we're building
      continue;
    }

    // ✅ Pattern 4: Nested options (a, b, c, d) - for questions like Q17
    const nestedOptMatch = line.match(/^([a-d])\)\s*(.*)$/i);
    if (nestedOptMatch && currentQ && !currentOption) {
      // This is a nested option (a, b, c, d) - append to question text or handle specially
      let nestedText = normalizeMathSymbols(normalizeSuperscripts(nestedOptMatch[2] || ""));
      // Clean artifacts from nested text
      nestedText = nestedText
        .replace(/\s*\(E\)\s*Answer\s+not\s+known[^.]*/gi, '')
        .replace(/\s*Answer\s+not\s+known[^.]*/gi, '')
        .trim();
      questionTextBuffer.push(`${nestedOptMatch[1]}) ${nestedText}`);
      continue;
    }

    // ✅ Pattern 5: Continuation lines - append to current question or option
    if (currentQ && line.length > 0) {
      const normalizedLine = normalizeMathSymbols(normalizeSuperscripts(line));
      
      // STRICT: Check if this line starts a new question - be more aggressive
      // Look for question patterns that might have been missed
      const potentialNewQuestion = /^(\d+)[\.\)]\s+[A-Z]/.test(line) || // "17. For" or "17) For"
                                  /^(\d+)\s+[A-Z][a-z]/.test(line) || // "17 For" (with capital letter)
                                  (line.match(/^(\d+)[\.\)]?\s*$/) && i + 1 < lines.length && /^[A-Z]/.test(lines[i + 1])); // "17." on one line, question on next
      
      if (potentialNewQuestion) {
        // This is actually a new question, process it in next iteration
        console.warn(`⚠️  Potential new question detected on line ${i + 1}, but continuing current question: "${line.substring(0, 50)}"`);
        continue;
      }
      
      // Check if this line starts a new question or option
      if (/^\d+[\.\)]/.test(line)) {
        // This is actually a new question, process it in next iteration
        continue;
      }
      
      if (/^\(?([A-D])\)?[\.\)]/.test(line)) {
        // This is actually an option, process it in next iteration
        continue;
      }
      
      // STRICT: If we already have all 4 options filled, don't append more text
      // This prevents merging multiple questions
      const allOptionsFilled = currentQ.options.A && currentQ.options.A.trim() &&
                               currentQ.options.B && currentQ.options.B.trim() &&
                               currentQ.options.C && currentQ.options.C.trim() &&
                               currentQ.options.D && currentQ.options.D.trim();
      
      if (allOptionsFilled) {
        // All options are filled, any new text is likely a new question
        // Check if this line looks like a question start
        const looksLikeQuestionStart = /^[A-Z][a-z]/.test(line) && 
                                       (line.length > 20 || // Long line likely a question
                                        line.includes('?') || 
                                        line.toLowerCase().startsWith('for') || 
                                        line.toLowerCase().startsWith('what') ||
                                        line.toLowerCase().startsWith('which') ||
                                        line.toLowerCase().startsWith('maximum') ||
                                        line.toLowerCase().startsWith('minimum'));
        
        if (looksLikeQuestionStart) {
          console.warn(`⚠️  All options filled for Q${currentQ.questionNumber}, line ${i + 1} looks like new question: "${line.substring(0, 50)}"`);
          // Don't append - this is likely a new question that wasn't detected
          continue;
        }
      }
      
      // Check if line looks like it could be the start of a new question (has question-like patterns)
      // If we have options already and this line looks like a new question, stop appending
      const hasOptions = Object.values(currentQ.options).some(v => v && v.trim());
      const looksLikeNewQuestion = /^[A-Z][a-z]+/.test(line) && 
                                   (line.includes('?') || 
                                    line.toLowerCase().includes('for') || 
                                    line.toLowerCase().includes('the') ||
                                    line.toLowerCase().includes('what') ||
                                    line.toLowerCase().includes('which'));
      
      if (hasOptions && looksLikeNewQuestion && questionTextBuffer.length === 0) {
        // We already have options, and this looks like a new question
        // Don't append to current question - let it be detected as new question
        console.warn(`⚠️  Line ${i + 1} looks like new question but has options already: "${line.substring(0, 50)}"`);
        continue;
      }
      
      // Determine where to append: question text, current option, or buffer
      if (currentOption && currentQ.options[currentOption]) {
        // Append to current option (multi-line option)
        // Clean artifacts from option text
        let cleanedOptionLine = normalizedLine
          .replace(/\s*\(E\)\s*Answer\s+not\s+known[^.]*/gi, '')
          .replace(/\s*Answer\s+not\s+known[^.]*/gi, '')
          .trim();
        if (cleanedOptionLine) {
          currentQ.options[currentOption] += " " + cleanedOptionLine;
        }
      } else if (inListI) {
        // Append to last List I item
        const lastListItem = Object.keys(currentQ.listI).reverse().find(k => currentQ.listI[k]);
        if (lastListItem) {
          currentQ.listI[lastListItem] += " " + normalizedLine;
        } else {
          // Clean line before adding to buffer
          let cleanedLine = normalizedLine
            .replace(/\s*\(E\)\s*Answer\s+not\s+known[^.]*/gi, '')
            .replace(/\s*Answer\s+not\s+known[^.]*/gi, '')
            .trim();
          if (cleanedLine) {
            questionTextBuffer.push(cleanedLine);
          }
        }
      } else if (inListII) {
        // Append to last List II item
        const lastListIIItem = Object.keys(currentQ.listII).reverse().find(k => currentQ.listII[k]);
        if (lastListIIItem) {
          currentQ.listII[lastListIIItem] += " " + normalizedLine;
        } else {
          // Clean line before adding to buffer
          let cleanedLine = normalizedLine
            .replace(/\s*\(E\)\s*Answer\s+not\s+known[^.]*/gi, '')
            .replace(/\s*Answer\s+not\s+known[^.]*/gi, '')
            .trim();
          if (cleanedLine) {
            questionTextBuffer.push(cleanedLine);
          }
        }
      } else if (inSubOptions) {
        // Append to last sub-option if we're in sub-options section
        const lastSubOpt = Object.keys(currentQ.subOptions).reverse().find(k => currentQ.subOptions[k]);
        if (lastSubOpt) {
          currentQ.subOptions[lastSubOpt] += " " + normalizedLine;
        } else {
          // Clean line before adding to buffer
          let cleanedLine = normalizedLine
            .replace(/\s*\(E\)\s*Answer\s+not\s+known[^.]*/gi, '')
            .replace(/\s*Answer\s+not\s+known[^.]*/gi, '')
            .trim();
          if (cleanedLine) {
            questionTextBuffer.push(cleanedLine);
          }
        }
      } else {
        // Append to question text buffer (will be added when we hit an option)
        // Clean line before adding to buffer
        let cleanedLine = normalizedLine
          .replace(/\s*\(E\)\s*Answer\s+not\s+known[^.]*/gi, '')
          .replace(/\s*Answer\s+not\s+known[^.]*/gi, '')
          .trim();
        if (cleanedLine) {
          questionTextBuffer.push(cleanedLine);
        }
      }
    }
  }

  // Save last question
  if (currentQ) {
    if (questionTextBuffer.length > 0) {
      currentQ.questionTextEnglish += " " + questionTextBuffer.join(" ");
    }
    
    // ✅ Validate question before adding (must have at least question text or one option)
    const hasQuestionText = currentQ.questionTextEnglish.trim().length > 0;
    const hasAtLeastOneOption = Object.values(currentQ.options).some(v => v && v.trim() && v.trim() !== "N/A" && v.trim() !== "NA");
    
    if (hasQuestionText || hasAtLeastOneOption) {
      questions.push(currentQ);
    } else {
      console.warn(`⚠️  Skipping invalid question ${currentQ.questionNumber}: no text and no valid options`);
    }
  }

  // ✅ Remove duplicate questions (same question number)
  const questionMap = new Map();
  questions.forEach(q => {
    const existing = questionMap.get(q.questionNumber);
    if (!existing) {
      questionMap.set(q.questionNumber, q);
    } else {
      // Merge if current has more complete data
      const currentHasOptions = Object.values(q.options).some(v => v && v.trim());
      const existingHasOptions = Object.values(existing.options).some(v => v && v.trim());
      
      if (currentHasOptions && !existingHasOptions) {
        questionMap.set(q.questionNumber, q);
      } else if (existingHasOptions && !currentHasOptions) {
        // Keep existing
      } else {
        // Both have options, keep the one with longer question text
        if (q.questionTextEnglish.length > existing.questionTextEnglish.length) {
          questionMap.set(q.questionNumber, q);
        }
      }
    }
  });
  questions = Array.from(questionMap.values());

  // ✅ Re-number questions sequentially to fix any gaps
  // BUT FIRST: Map answers to original question numbers before renumbering
  const originalAnswerMap = { ...answers };
  const questionNumberMapping = {}; // old -> new mapping
  
  questions.sort((a, b) => a.questionNumber - b.questionNumber);
  questions = questions.map((q, index) => {
    const oldQNum = q.questionNumber;
    const newQNum = index + 1;
    questionNumberMapping[oldQNum] = newQNum;
    return {
      ...q,
      questionNumber: newQNum
    };
  });
  
  // ✅ Remap answers to new question numbers
  const remappedAnswers = {};
  Object.keys(originalAnswerMap).forEach(oldQNum => {
    const newQNum = questionNumberMapping[parseInt(oldQNum)];
    if (newQNum) {
      remappedAnswers[newQNum] = originalAnswerMap[oldQNum];
    } else {
      // Try to find closest match
      const oldNum = parseInt(oldQNum);
      const closestNewNum = questions.find(q => Math.abs(q.questionNumber - oldNum) <= 2)?.questionNumber;
      if (closestNewNum) {
        remappedAnswers[closestNewNum] = originalAnswerMap[oldQNum];
        console.log(`🔄 Remapped answer from Q${oldQNum} to Q${closestNewNum}`);
      }
    }
  });
  
  // Update answers to use remapped version
  Object.keys(remappedAnswers).forEach(qNum => {
    if (!answers[qNum]) {
      answers[qNum] = remappedAnswers[qNum];
    }
  });

  // Post-process questions
  questions = questions.map(q => {
    // ✅ For matching questions, append List I and List II to question text
    const hasListIItems = Object.values(q.listI || {}).some(v => v && v.trim());
    const hasListIIItems = Object.values(q.listII || {}).some(v => v && v.trim());
    if (hasListIItems || hasListIIItems) {
      let listText = "\n\nList I:\n";
      Object.keys(q.listI || {}).forEach(key => {
        if (q.listI[key] && q.listI[key].trim()) {
          listText += `${key}. ${q.listI[key]}\n`;
        }
      });
      listText += "\nList II:\n";
      Object.keys(q.listII || {}).forEach(key => {
        if (q.listII[key] && q.listII[key].trim()) {
          listText += `${key}. ${q.listII[key]}\n`;
        }
      });
      q.questionTextEnglish += listText;
    }

    // Clean up question text
    q.questionTextEnglish = q.questionTextEnglish.trim().replace(/\s+/g, " ");
    
    // Missing text → try to extract from options or sub-options
    if (!q.questionTextEnglish || q.questionTextEnglish.length < 10) {
      // Try to find question text in sub-options or options
      const subOptText = Object.values(q.subOptions || {}).filter(v => v && v.trim()).join(' ');
      const optionText = Object.values(q.options || {}).filter(v => v && v.trim()).join(' ');
      
      // If we have sub-options with text, use that as question text
      if (subOptText && subOptText.length > q.questionTextEnglish.length) {
        q.questionTextEnglish = subOptText;
        console.warn(`⚠️  Q${q.questionNumber}: Using sub-options text as question text`);
      }
      
      // If still missing and we have options, check if first option might be question text
      if ((!q.questionTextEnglish || q.questionTextEnglish.length < 10) && optionText) {
        // Check if options look like they contain question text (long text, question marks)
        const firstOption = Object.values(q.options || {}).find(v => v && v.trim() && v.trim().length > 50);
        if (firstOption && (firstOption.includes('?') || firstOption.toLowerCase().includes('for ') || firstOption.toLowerCase().includes('the '))) {
          // This might be question text misidentified as an option
          q.questionTextEnglish = firstOption;
          console.warn(`⚠️  Q${q.questionNumber}: Using first option as question text (may be misparsed)`);
        }
      }
    }
    
    // Missing text → fallback (only if still empty after above attempts)
    if (!q.questionTextEnglish || q.questionTextEnglish.length < 5) {
      if (Object.values(q.options).some(v => v && v.trim())) {
        q.questionType = "image";
        q.questionTextEnglish = "Question text missing (check diagram)";
        q.hasImage = true;
        console.warn(`⚠️  Q${q.questionNumber}: Question text missing, marked as image type`);
      } else {
        q.questionTextEnglish = `Question ${q.questionNumber} text missing (PDF parsing failed)`;
        q.questionType = "image";
        q.hasImage = true;
        console.warn(`⚠️  Q${q.questionNumber}: Question text and options missing`);
      }
    }

    // Clean up options - remove empty or "N/A" options and parsing artifacts
    Object.keys(q.options).forEach(key => {
      let optText = q.options[key].trim().replace(/\s+/g, " ");
      
      // Remove parsing artifacts: "(E) Answer not known" and garbled Tamil variants
      // More aggressive pattern matching to catch all variations
      optText = optText
        .replace(/\s*\(E\)\s*Answer\s+not\s+known[^.]*/gi, '') // Remove "(E) Answer not known" and anything after
        .replace(/\s*\(E\)\s*விலட[^.]*/gi, '') // Remove "(E) விலட" and anything after (garbled Tamil)
        .replace(/\s*\(E\)\s*விடை[^.]*/gi, '') // Remove "(E) விடை" and anything after (correct Tamil)
        .replace(/\s*Answer\s+not\s+known[^.]*/gi, '') // Remove standalone "Answer not known"
        .replace(/\s*விலட[^.]*/gi, '') // Remove standalone "விலட" and anything after (garbled Tamil)
        .replace(/\s*விடை\s*தெரியவில்லை[^.]*/gi, '') // Remove correct Tamil "Answer not known"
        .replace(/\s*\(E\)[^.]*/gi, '') // Remove standalone "(E)" and anything after
        .trim();
      
      // Remove "N/A" if it's the only content
      if (optText === "N/A" || optText === "NA" || optText === "") {
        optText = "";
      }
      
      q.options[key] = optText;
    });

    // ✅ Validate question has at least one valid option
    const validOptions = Object.values(q.options).filter(v => v && v.trim() && v.trim() !== "N/A" && v.trim() !== "NA");
    if (validOptions.length === 0) {
      console.warn(`⚠️  Question ${q.questionNumber} has no valid options, marking as image type`);
      q.questionType = "image";
      q.hasImage = true;
    }

    // ✅ Enhanced question type detection
    const qTextLower = q.questionTextEnglish.toLowerCase();
    
    // Matching question - check if it has List I and List II items
    const hasListI = Object.values(q.listI || {}).some(v => v && v.trim());
    const hasListII = Object.values(q.listII || {}).some(v => v && v.trim());
    if ((qTextLower.includes('match') && (qTextLower.includes('list') || qTextLower.includes('column'))) || 
        (hasListI && hasListII)) {
      q.questionType = "match";
    }
    // Assertion-Reason
    else if (qTextLower.includes('assertion') && qTextLower.includes('reason')) {
      q.questionType = "assertion";
    }
    // True/False
    else if (/true\s*or\s*false|false\s*or\s*true/.test(qTextLower)) {
      q.questionType = "truefalse";
    }
    // Passage-based
    else if (qTextLower.includes('passage') || qTextLower.includes('paragraph')) {
      q.questionType = "passage";
    }
    // Formula-based (check for math symbols, LaTeX notation, or formulas)
    else if (/[μ√±=≠≤≥∞∑πθ²³⁴⁵⁶]/.test(q.questionTextEnglish) || 
             /\$\$?[^$]+\$\$?/.test(q.questionTextEnglish) || // LaTeX notation
             /\\mathrm\{[^}]+\}/.test(q.questionTextEnglish) || // LaTeX \mathrm{}
             /[fσγτεμ]=\s*[^A-Za-z]/.test(q.questionTextEnglish)) { // Formula patterns like "f=P/A"
      q.questionType = "formula";
    }
    // Image/Diagram question
    else if (qTextLower.includes('figure') || 
             qTextLower.includes('diagram') || 
             qTextLower.includes('shown in the') ||
             qTextLower.includes('refer to the') ||
             q.hasImage) {
      q.questionType = "image";
      q.hasImage = true;
    }
    // Sub-options question (has i, ii, iii, iv)
    else if (Object.values(q.subOptions || {}).some(v => v.trim())) {
      q.questionType = "suboptions";
    }
    // Default MCQ
    else {
      q.questionType = "mcq";
    }

    // Attach answer - try multiple matching strategies
    let foundAnswer = null;
    
    if (answers && answers[q.questionNumber]) {
      // Direct match by question number
      const opts = answers[q.questionNumber];
      foundAnswer = Array.isArray(opts) ? opts[0] : opts;
    } else {
      // ✅ Improved: Only use nearby answers if they're within 1 question number (more conservative)
      // This prevents wrong answers from propagating (e.g., Q20 using Q19's wrong answer)
      const nearbyNumbers = [q.questionNumber - 1, q.questionNumber + 1];
      let foundNearby = false;
      for (const num of nearbyNumbers) {
        if (answers && answers[num] && num > 0) {
          // Only use if the nearby question's answer seems valid
          const nearbyAnswer = Array.isArray(answers[num]) ? answers[num][0] : answers[num];
          if (['A', 'B', 'C', 'D'].includes(nearbyAnswer)) {
            // Check if this nearby answer is already used by another question
            // If it is, it might be wrong, so be more cautious
            const answerUsedBy = Object.keys(answers).filter(k => {
              const ans = Array.isArray(answers[k]) ? answers[k][0] : answers[k];
              return ans === nearbyAnswer && parseInt(k) !== num;
            });
            
            if (answerUsedBy.length === 0) {
              // Answer is unique, safe to use
              console.warn(`⚠️  Q${q.questionNumber} answer found at Q${num} (${nearbyAnswer}), using it`);
              foundAnswer = nearbyAnswer;
              foundNearby = true;
              break;
            } else {
              console.warn(`⚠️  Q${q.questionNumber} nearby answer at Q${num} (${nearbyAnswer}) is already used by Q${answerUsedBy.join(', Q')}, skipping`);
            }
          }
        }
      }
      
      // ✅ Last resort: Only check ±2 if ±1 didn't work, and log it as less reliable
      if (!foundNearby) {
        const farNumbers = [q.questionNumber - 2, q.questionNumber + 2];
        for (const num of farNumbers) {
          if (answers && answers[num] && num > 0) {
            const farAnswer = Array.isArray(answers[num]) ? answers[num][0] : answers[num];
            if (['A', 'B', 'C', 'D'].includes(farAnswer)) {
              console.warn(`⚠️  Q${q.questionNumber} answer found at distant Q${num} (${farAnswer}), using as last resort`);
              foundAnswer = farAnswer;
              break;
            }
          }
        }
      }
    }
    
    if (foundAnswer && ['A', 'B', 'C', 'D'].includes(foundAnswer)) {
      q.correctOption = foundAnswer;
      if (q.questionNumber <= 5) {
        console.log(`✅ Assigned answer for Q${q.questionNumber}: ${q.correctOption}`);
      }
    } else {
      // Don't set to "NA", leave empty and let database default handle it
      q.correctOption = "";
      if (q.questionNumber <= 5) {
        console.warn(`⚠️  No valid answer found for Q${q.questionNumber}. Available answer keys:`, Object.keys(answers || {}).join(', '));
      }
    }

    return q;
  });

  return questions;
}




export function normalizeCategory(category) { if (!category) return ''; const map = { 'Civil Engineering': 'Civil', 'General Knowledge': 'GK', }; return map[category] || category; }


router.post(
  "/upload-exam",
  upload.fields([
    { name: "questionPDF", maxCount: 1 },
    { name: "answerPDF", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const { batchName, examCode, examName, examDescription, category, year, month, duration } = req.body;
      
      // ✅ Validate required fields early
      if (!examCode || !examCode.trim()) {
        return res.status(400).json({ error: "❌ Exam code is required." });
      }
      if (!examName || !examName.trim()) {
        return res.status(400).json({ error: "❌ Exam name is required." });
      }
      if (!batchName || !batchName.trim()) {
        return res.status(400).json({ error: "❌ Batch name is required." });
      }
      
      console.log('📋 Received exam data:', {
        examCode: examCode?.substring(0, 50),
        examName: examName?.substring(0, 50),
        category,
        batchName: batchName?.substring(0, 50)
      });

      // ✅ Validate files exist
      if (!req.files || !req.files["questionPDF"] || !req.files["answerPDF"]) {
        return res.status(400).json({ error: "❌ Both question and answer PDF files are required." });
      }

      // ✅ Validate file types
      const qFile = req.files["questionPDF"][0];
      const aFile = req.files["answerPDF"][0];
      
      if (qFile.mimetype !== 'application/pdf' || aFile.mimetype !== 'application/pdf') {
        return res.status(400).json({ error: "❌ Only PDF files are allowed." });
      }

      // ✅ Validate file sizes (max 50MB)
      const maxSize = 50 * 1024 * 1024; // 50MB
      if (qFile.size > maxSize || aFile.size > maxSize) {
        return res.status(400).json({ error: "❌ PDF file size must be less than 50MB." });
      }

      const qBuffer = qFile.buffer;
      const aBuffer = aFile.buffer;

      console.log("📄 Question PDF size:", qBuffer?.length || 0);
      console.log("📄 Answer PDF size:", aBuffer?.length || 0);

      if (!qBuffer?.length || !aBuffer?.length) {
        return res.status(400).json({ error: "❌ Uploaded PDFs are empty or invalid." });
      }

      // Create progress ID for this upload IMMEDIATELY
      const progressId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      console.log('🆔 Created progressId:', progressId);
      
      const progressCallback = (progress) => {
        const progressData = { ...progress, timestamp: Date.now() };
        progressStore.set(progressId, progressData);
        console.log('📊 Progress updated:', progressData);
      };

      // Initialize progress - set immediately so frontend can poll
      progressCallback({
        stage: 'upload',
        message: 'Files uploaded successfully. Starting processing...',
        progress: 100,
        uploadComplete: true
      });
      
      // Set initial parsing progress immediately
      progressCallback({
        stage: 'parsing',
        message: 'Starting PDF processing...',
        progress: 5
      });
      
      // IMPORTANT: Send response IMMEDIATELY with progressId so frontend can start polling
      // Processing will continue in the background
      if (!res.headersSent) {
        res.status(202).json({ // 202 Accepted - processing in background
          message: "✅ Files uploaded. Processing started...",
          progressId,
          status: 'processing'
        });
        console.log('📤 Sent immediate response with progressId:', progressId);
      }

      // Wrap all background processing in try-catch to prevent server crashes
      // This runs after the response is sent, so we can't send another response
      (async () => {
        try {
          // Extract text safely
          progressCallback({
            stage: 'parsing',
            message: 'Extracting text from question PDF...',
            progress: 10
          });
          let qText = "";
          let aText = "";
          try {
            // Use Python PDF extractor (better for Tamil/Unicode), fallback to Node.js
            progressCallback({
              stage: 'parsing',
              message: 'Extracting text from question PDF (using Python if available)...',
              progress: 15
            });
            const qResult = await extractTextFromPDF(qBuffer, {
              preferPython: true,
              fallbackToNodeJS: true
            });
            qText = qResult.text || '';
            
            if (qResult.success) {
              console.log(`✅ Question PDF extracted using: ${qResult.method}`);
              progressCallback({
                stage: 'parsing',
                message: `Question PDF text extracted successfully (${qResult.method})`,
                progress: 30
              });
            } else {
              throw new Error(qResult.error || 'PDF extraction failed');
            }
          } catch (err) {
            console.warn("⚠️ Question PDF parsing failed:", err.message);
            qText = '';
            progressCallback({
              stage: 'parsing',
              message: `Warning: Question PDF parsing had issues: ${err.message}`,
              progress: 30
            });
          }
          try {
            progressCallback({
              stage: 'parsing',
              message: 'Extracting text from answer PDF (using Python if available)...',
              progress: 40
            });
            // Use Python PDF extractor (better for Tamil/Unicode), fallback to Node.js
            const aResult = await extractTextFromPDF(aBuffer, {
              preferPython: true,
              fallbackToNodeJS: true
            });
            aText = aResult.text || '';
            
            if (aResult.success) {
              console.log(`✅ Answer PDF extracted using: ${aResult.method}`);
              // Ensure UTF-8 encoding is correct
              try {
                const utf8Buffer = Buffer.from(aText, 'utf8');
                aText = utf8Buffer.toString('utf8');
              } catch (encodingErr) {
                console.warn("⚠️ UTF-8 encoding check failed, using original text:", encodingErr.message);
              }
              
              progressCallback({
                stage: 'parsing',
                message: `Answer PDF text extracted successfully (${aResult.method})`,
                progress: 50
              });
            } else {
              throw new Error(aResult.error || 'PDF extraction failed');
            }
          } catch (err) {
            console.warn("⚠️ Answer PDF parsing failed:", err.message);
            aText = '';
            progressCallback({
              stage: 'parsing',
              message: `Warning: Answer PDF parsing had issues: ${err.message}`,
              progress: 50
            });
          }

          // Extract answers
          progressCallback({
            stage: 'parsing',
            message: 'Extracting answers from answer PDF (text)...',
            progress: 60
          });
          const answersFromText = extractAnswers(aText);
          
          progressCallback({
            stage: 'parsing',
            message: 'Detecting highlighted answers in PDF...',
            progress: 65
          });
          const answersFromHighlight = await extractHighlightedAnswers(aBuffer);
          
          progressCallback({
            stage: 'parsing',
            message: `Found ${Object.keys(answersFromText).length} text answers, ${Object.keys(answersFromHighlight).length} highlighted answers`,
            progress: 68
          });
          
          // ✅ Merge: Highlighted answers take priority (more reliable)
          // Start with text answers, then override with highlighted answers
          const answers = { ...answersFromText, ...answersFromHighlight };
          
          // ✅ Validate answer assignments - log conflicts
          const conflicts = [];
          Object.keys(answersFromHighlight).forEach(qNum => {
            if (answersFromText[qNum] && answersFromText[qNum] !== answersFromHighlight[qNum]) {
              conflicts.push({
                question: qNum,
                textAnswer: answersFromText[qNum],
                highlightAnswer: answersFromHighlight[qNum],
                finalAnswer: answers[qNum]
              });
            }
          });
          
          if (conflicts.length > 0) {
            console.warn(`⚠️  Found ${conflicts.length} answer conflicts (highlighted answers override text answers):`);
            conflicts.forEach(c => {
              console.warn(`   Q${c.question}: Text says ${c.textAnswer}, Highlight says ${c.highlightAnswer}, Using: ${c.finalAnswer}`);
            });
          }
          
          // Log merge results
          const textOnly = Object.keys(answersFromText).filter(q => !answersFromHighlight[q]);
          const highlightOnly = Object.keys(answersFromHighlight).filter(q => !answersFromText[q]);
          const both = Object.keys(answers).filter(q => answersFromText[q] && answersFromHighlight[q]);
          
          if (textOnly.length > 0) console.log(`📝 Answers from text only: Q${textOnly.join(', Q')}`);
          if (highlightOnly.length > 0) console.log(`🎨 Answers from highlights only: Q${highlightOnly.join(', Q')}`);
          if (both.length > 0) console.log(`✅ Answers found in both: Q${both.join(', Q')}`);

          // ✅ Debug: Log extracted answers
          console.log('📋 Extracted Answers from Text:', answersFromText);
          console.log('📋 Extracted Answers from Highlight:', answersFromHighlight);
          console.log('📋 Final Answers Map:', answers);
          console.log(`📊 Total answers extracted: ${Object.keys(answers).length}`);

          // Parse questions
          progressCallback({
            stage: 'parsing',
            message: 'Parsing questions and options...',
            progress: 70
          });
          const parsedQuestions = parseQuestions(qText, answers);
          console.log(`✅ Parsed ${parsedQuestions.length} questions from the PDF.`);
          
          // ✅ Enhanced logging for Tamil text verification
          const questionsWithTamil = parsedQuestions.filter(q => {
            const hasTamil = TAMIL_REGEX.test(
              (q.questionTextTamil || '') + 
              (q.options?.A || '') + 
              (q.options?.B || '') + 
              (q.options?.C || '') + 
              (q.options?.D || '')
            );
            return hasTamil;
          });
          
          console.log(`📝 Questions with Tamil text: ${questionsWithTamil.length}/${parsedQuestions.length}`);
          
          // Log sample of first question with Tamil
          if (questionsWithTamil.length > 0) {
            const sampleQ = questionsWithTamil[0];
            console.log(`📋 Sample Question ${sampleQ.questionNumber}:`);
            console.log(`   English: ${(sampleQ.questionTextEnglish || '').substring(0, 100)}...`);
            console.log(`   Tamil: ${(sampleQ.questionTextTamil || '').substring(0, 100)}...`);
            console.log(`   Option A: ${(sampleQ.options?.A || '').substring(0, 80)}...`);
            if (sampleQ.subOptions && Object.values(sampleQ.subOptions).some(v => v)) {
              console.log(`   Sub-options found:`, Object.keys(sampleQ.subOptions).filter(k => sampleQ.subOptions[k]));
            }
          }
          
          // Check for sub-options
          const questionsWithSubOptions = parsedQuestions.filter(q => 
            q.subOptions && Object.values(q.subOptions).some(v => v && v.trim())
          );
          console.log(`📝 Questions with sub-options: ${questionsWithSubOptions.length}/${parsedQuestions.length}`);
          
          // Check for parsing artifacts
          const questionsWithArtifacts = parsedQuestions.filter(q => {
            const allText = [
              q.questionTextEnglish || '',
              q.questionTextTamil || '',
              ...Object.values(q.options || {}),
              ...Object.values(q.subOptions || {})
            ].join(' ');
            return /\(E\)\s*Answer\s+not\s+known|விலட|விடை\s*தெரியவில்லை/i.test(allText);
          });
          if (questionsWithArtifacts.length > 0) {
            console.warn(`⚠️  Found ${questionsWithArtifacts.length} questions with potential parsing artifacts`);
          }
          
          // Update progress with Tamil text statistics
          progressCallback({
            stage: 'parsing',
            message: `Parsed ${parsedQuestions.length} questions. ${questionsWithTamil.length} with Tamil text, ${questionsWithSubOptions.length} with sub-options.`,
            progress: 75,
            tamilQuestionsCount: questionsWithTamil.length,
            subOptionsCount: questionsWithSubOptions.length
          });
          
          // Use parsed questions directly (no image extraction)
          const questionsWithImages = parsedQuestions;
          
          // ✅ Debug: Check answer assignment
          const questionsWithAnswers = questionsWithImages.filter(q => q.correctOption && q.correctOption !== 'NA' && q.correctOption !== '');
          const questionsWithoutAnswers = questionsWithImages.filter(q => !q.correctOption || q.correctOption === 'NA' || q.correctOption === '');
          console.log(`📊 Questions with answers: ${questionsWithAnswers.length}`);
          console.log(`⚠️  Questions without answers: ${questionsWithoutAnswers.length}`);
          if (questionsWithoutAnswers.length > 0) {
            const missingQNumbers = questionsWithoutAnswers.map(q => q.questionNumber);
            console.log(`⚠️  Missing answers for questions: ${missingQNumbers.join(', ')}`);
            console.log(`⚠️  Available answer keys in map:`, Object.keys(answers).sort((a, b) => parseInt(a) - parseInt(b)).join(', '));
            
            // Try to find potential matches (off-by-one errors)
            missingQNumbers.forEach(qNum => {
              const nearby = [qNum - 1, qNum + 1, qNum - 2, qNum + 2].filter(n => n > 0 && answers[n]);
              if (nearby.length > 0) {
                console.log(`💡 Q${qNum} might match answers at:`, nearby.map(n => `Q${n}(${answers[n]})`).join(', '));
              }
            });
          }

          const finalCategory = normalizeCategory(category);
          let civilQuestions = [];
          let generalKnowledgeQuestions = [];

          if (finalCategory === "GK") {
            generalKnowledgeQuestions = questionsWithImages;
          } else if (finalCategory === "Civil") {
            civilQuestions = questionsWithImages;
          }

          // Use transaction for data integrity
          progressCallback({
            stage: 'saving',
            message: 'Saving to database...',
            progress: 80
          });
          const transaction = await sequelize.transaction();

          try {
            // Find or create batch
            let batch = await Batch.findOne({ 
              where: { batchName },
              transaction 
            });

            if (!batch) {
              batch = await Batch.create({ batchName }, { transaction });
            }

            // ✅ Validate examCode is not empty
            if (!examCode || !examCode.trim()) {
              await transaction.rollback();
              progressCallback({
                stage: 'error',
                message: 'Exam code is required and cannot be empty',
                progress: 0,
                error: true
              });
              return;
            }

            // ✅ Check duplicate exam code (globally unique, not just within batch)
            const existingExam = await Exam.findOne({
              where: { 
                examCode: examCode.trim()
              },
              transaction
            });

            if (existingExam) {
              await transaction.rollback();
              progressCallback({
                stage: 'error',
                message: `Exam code "${examCode}" already exists. Please use a different exam code.`,
                progress: 0,
                error: true
              });
              return; // Don't try to send response, already sent
            }

            // ✅ Validate exam type matches question type
            if (finalCategory === "GK" && civilQuestions.length > 0) {
              await transaction.rollback();
              progressCallback({
                stage: 'error',
                message: 'Category mismatch: GK exam cannot contain Civil questions',
                progress: 0,
                error: true
              });
              return; // Don't try to send response, already sent
            }
            if (finalCategory === "Civil" && generalKnowledgeQuestions.length > 0) {
              await transaction.rollback();
              progressCallback({
                stage: 'error',
                message: 'Category mismatch: Civil exam cannot contain GK questions',
                progress: 0,
                error: true
              });
              return; // Don't try to send response, already sent
            }

            // ✅ Validate at least one question exists
            if (civilQuestions.length === 0 && generalKnowledgeQuestions.length === 0) {
              await transaction.rollback();
              progressCallback({
                stage: 'error',
                message: 'No questions found in PDF. Please check the PDF format.',
                progress: 0,
                error: true
              });
              return; // Don't try to send response, already sent
            }

            // ✅ Get publish status from request (default to 'draft' for safety)
            const publishImmediately = req.body.publishImmediately === 'true' || req.body.publishImmediately === true;
            const examStatus = publishImmediately ? 'active' : 'draft';

            // Get maxAttempts and allowMultipleAttempts from request
            const maxAttempts = req.body.maxAttempts ? parseInt(req.body.maxAttempts) : 0;
            const allowMultipleAttempts = req.body.allowMultipleAttempts === 'true' || req.body.allowMultipleAttempts === true;

            // ✅ Validate required fields before creating exam
            if (!examCode || !examCode.trim()) {
              await transaction.rollback();
              progressCallback({
                stage: 'error',
                message: 'Exam code is required',
                progress: 0,
                error: true
              });
              return;
            }

            if (!examName || !examName.trim()) {
              await transaction.rollback();
              progressCallback({
                stage: 'error',
                message: 'Exam name is required',
                progress: 0,
                error: true
              });
              return;
            }

            // Create exam with proper error handling
            let exam;
            try {
              exam = await Exam.create({
                batchId: batch.id,
                examCode: examCode.trim(),
                examName: examName.trim(),
                examDescription: (examDescription || "").trim(),
                category: (finalCategory || "").trim(),
                year: year ? Number(year) : null,
                month: month ? Number(month) : null,
                duration: [0, 30, 60].includes(Number(duration)) ? Number(duration) : 0,
                maxAttempts: maxAttempts > 0 ? maxAttempts : 0, // 0 means unlimited when allowMultipleAttempts is true
                allowMultipleAttempts: allowMultipleAttempts,
                status: examStatus
              }, { transaction });
            } catch (createError) {
              await transaction.rollback();
              console.error('❌ Error creating exam:', createError);
              console.error('❌ Exam data:', {
                batchId: batch.id,
                examCode: examCode?.trim(),
                examName: examName?.trim(),
                category: finalCategory,
                year, month, duration
              });
              
              // Provide more specific error message
              let errorMessage = 'Failed to create exam';
              if (createError.name === 'SequelizeUniqueConstraintError') {
                errorMessage = `Exam code "${examCode}" already exists. Please use a unique exam code.`;
              } else if (createError.name === 'SequelizeValidationError') {
                errorMessage = `Validation error: ${createError.errors?.map(e => e.message).join(', ') || createError.message}`;
              } else {
                errorMessage = createError.message || 'Unknown error creating exam';
              }
              
              progressCallback({
                stage: 'error',
                message: errorMessage,
                progress: 0,
                error: true
              });
              return;
            }

            // Create civil questions
            if (civilQuestions.length > 0) {
              progressCallback({
                stage: 'saving',
                message: `Creating ${civilQuestions.length} Civil questions...`,
                progress: 85
              });
              
              try {
                console.log(`📝 Preparing ${civilQuestions.length} Civil questions for bulk insert...`);
                
                // Validate Tamil text presence
                const questionsWithTamil = civilQuestions.filter(q => {
                  const hasTamil = TAMIL_REGEX.test(
                    (q.questionTextTamil || '') + 
                    (q.options?.A || '') + 
                    (q.options?.B || '') + 
                    (q.options?.C || '') + 
                    (q.options?.D || '')
                  );
                  return hasTamil;
                });
                
                if (questionsWithTamil.length > 0) {
                  console.log(`📝 Found ${questionsWithTamil.length} Civil questions with Tamil text`);
                }
                
                const civilQuestionRecords = civilQuestions.map((q, index) => {
                  // Validate required fields
                  if (!q.questionNumber) {
                    console.warn(`⚠️ Civil question at index ${index} missing questionNumber, using ${index + 1}`);
                  }
                  
                  // Safely truncate all text fields to fit MySQL TEXT field (65535 bytes)
                  // This is especially important for Tamil text which uses multi-byte UTF-8 encoding
                  try {
                    return {
                      examId: exam.id,
                      questionNumber: q.questionNumber || index + 1,
                      questionTextEnglish: truncateToByteLength(q.questionTextEnglish || ''),
                      questionTextTamil: truncateToByteLength(q.questionTextTamil || ''),
                      optionA: truncateToByteLength(q.options?.A || ''),
                      optionB: truncateToByteLength(q.options?.B || ''),
                      optionC: truncateToByteLength(q.options?.C || ''),
                      optionD: truncateToByteLength(q.options?.D || ''),
                      correctOption: (q.correctOption && q.correctOption !== 'NA' && ['A', 'B', 'C', 'D'].includes(q.correctOption)) ? q.correctOption : 'A',
                      questionType: (q.questionType && ['mcq', 'assertion-reason', 'assertion', 'match', 'formula', 'passage', 'statement', 'image'].includes(q.questionType)) ? q.questionType : 'mcq',
                      explanation: truncateToByteLength(q.explanation || ''),
                      difficulty: (q.difficulty && ['easy', 'medium', 'hard'].includes(q.difficulty)) ? q.difficulty : 'medium',
                      imageUrl: q.imageUrl || null,
                      hasImage: q.hasImage || false
                    };
                  } catch (encodingError) {
                    console.error(`❌ Encoding error processing Civil question ${index + 1}:`, encodingError);
                    // Fallback: use empty string for problematic fields
                    return {
                      examId: exam.id,
                      questionNumber: q.questionNumber || index + 1,
                      questionTextEnglish: truncateToByteLength(String(q.questionTextEnglish || '')),
                      questionTextTamil: '', // Set to empty on encoding error
                      optionA: truncateToByteLength(String(q.options?.A || '')),
                      optionB: truncateToByteLength(String(q.options?.B || '')),
                      optionC: truncateToByteLength(String(q.options?.C || '')),
                      optionD: truncateToByteLength(String(q.options?.D || '')),
                      correctOption: (q.correctOption && q.correctOption !== 'NA' && ['A', 'B', 'C', 'D'].includes(q.correctOption)) ? q.correctOption : 'A',
                      questionType: (q.questionType && ['mcq', 'assertion-reason', 'assertion', 'match', 'formula', 'passage', 'statement', 'image'].includes(q.questionType)) ? q.questionType : 'mcq',
                      explanation: truncateToByteLength(String(q.explanation || '')),
                      difficulty: (q.difficulty && ['easy', 'medium', 'hard'].includes(q.difficulty)) ? q.difficulty : 'medium',
                      imageUrl: q.imageUrl || null,
                      hasImage: q.hasImage || false
                    };
                  }
                });

                // Validate all records before inserting
                const invalidRecords = civilQuestionRecords.filter((q, idx) => {
                  if (!q.examId || !q.questionNumber) {
                    console.error(`❌ Invalid Civil record at index ${idx}: missing examId or questionNumber`);
                    return true;
                  }
                  return false;
                });
                
                if (invalidRecords.length > 0) {
                  throw new Error(`${invalidRecords.length} invalid Civil question records found. All questions must have examId and questionNumber.`);
                }

                console.log(`💾 Bulk creating ${civilQuestionRecords.length} Civil questions...`);
                
                // Create in batches to avoid memory issues
                const BATCH_SIZE = 50;
                for (let i = 0; i < civilQuestionRecords.length; i += BATCH_SIZE) {
                  const batch = civilQuestionRecords.slice(i, i + BATCH_SIZE);
                  
                  try {
                    await CivilQuestion.bulkCreate(batch, { 
                      transaction,
                      validate: true, // Enable validation
                      individualHooks: false // Disable hooks for performance
                    });
                    console.log(`✅ Created Civil batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(civilQuestionRecords.length / BATCH_SIZE)} (${batch.length} questions)`);
                  } catch (batchError) {
                    console.error(`❌ Error creating Civil batch ${Math.floor(i / BATCH_SIZE) + 1}:`, batchError);
                    console.error('Batch data sample:', batch[0]);
                    throw new Error(`Failed to create Civil questions batch: ${batchError.message}`);
                  }
                  
                  progressCallback({
                    stage: 'saving',
                    message: `Saving Civil questions... ${Math.min(i + BATCH_SIZE, civilQuestionRecords.length)}/${civilQuestionRecords.length}`,
                    progress: 85 + Math.floor((i / civilQuestionRecords.length) * 10)
                  });
                }
                
                console.log(`✅ Successfully created ${civilQuestionRecords.length} Civil questions`);
              } catch (civilError) {
                console.error('❌ Error creating Civil questions:', civilError);
                console.error('Error details:', civilError.message, civilError.stack);
                throw new Error(`Failed to create Civil questions: ${civilError.message}`);
              }
            }

            // Create GK questions
            if (generalKnowledgeQuestions.length > 0) {
              progressCallback({
                stage: 'saving',
                message: `Creating ${generalKnowledgeQuestions.length} GK questions...`,
                progress: 85
              });
              
              try {
                console.log(`📝 Preparing ${generalKnowledgeQuestions.length} GK questions for bulk insert...`);
                
                // Simple validation - just log if Tamil text is present
                const questionsWithTamil = generalKnowledgeQuestions.filter(q => {
                  const hasTamil = TAMIL_REGEX.test(
                    (q.questionTextTamil || '') + 
                    (q.options?.A || '') + 
                    (q.options?.B || '') + 
                    (q.options?.C || '') + 
                    (q.options?.D || '')
                  );
                  return hasTamil;
                });
                
                if (questionsWithTamil.length > 0) {
                  console.log(`📝 Found ${questionsWithTamil.length} questions with Tamil text`);
                }
                
                const gkQuestionRecords = generalKnowledgeQuestions.map((q, index) => {
                  // Validate required fields
                  if (!q.questionNumber) {
                    console.warn(`⚠️ Question at index ${index} missing questionNumber, using ${index + 1}`);
                  }
                  
                  // Safely truncate all text fields to fit MySQL TEXT field (65535 bytes)
                  // This is especially important for Tamil text which uses multi-byte UTF-8 encoding
                  try {
                    return {
                      examId: exam.id,
                      questionNumber: q.questionNumber || index + 1,
                      questionTextEnglish: truncateToByteLength(q.questionTextEnglish || ''),
                      questionTextTamil: truncateToByteLength(q.questionTextTamil || ''),
                      optionA: truncateToByteLength(q.options?.A || ''),
                      optionB: truncateToByteLength(q.options?.B || ''),
                      optionC: truncateToByteLength(q.options?.C || ''),
                      optionD: truncateToByteLength(q.options?.D || ''),
                      subOptionI: truncateToByteLength(q.subOptions?.i || ''),
                      subOptionIi: truncateToByteLength(q.subOptions?.ii || ''),
                      subOptionIii: truncateToByteLength(q.subOptions?.iii || ''),
                      subOptionIv: truncateToByteLength(q.subOptions?.iv || ''),
                      correctOption: (q.correctOption && q.correctOption !== 'NA' && ['A', 'B', 'C', 'D'].includes(q.correctOption)) ? q.correctOption : 'A',
                      questionType: (q.questionType && ['mcq', 'assertion-reason', 'assertion', 'match', 'formula', 'passage', 'statement', 'image'].includes(q.questionType)) ? q.questionType : 'mcq',
                      explanation: truncateToByteLength(q.explanation || ''),
                      difficulty: (q.difficulty && ['easy', 'medium', 'hard'].includes(q.difficulty)) ? q.difficulty : 'medium',
                      imageUrl: q.imageUrl || null,
                      hasImage: q.hasImage || false
                    };
                  } catch (encodingError) {
                    console.error(`❌ Encoding error processing question ${index + 1}:`, encodingError);
                    // Fallback: use empty string for problematic fields
                    return {
                      examId: exam.id,
                      questionNumber: q.questionNumber || index + 1,
                      questionTextEnglish: truncateToByteLength(String(q.questionTextEnglish || '')),
                      questionTextTamil: '', // Set to empty on encoding error
                      optionA: truncateToByteLength(String(q.options?.A || '')),
                      optionB: truncateToByteLength(String(q.options?.B || '')),
                      optionC: truncateToByteLength(String(q.options?.C || '')),
                      optionD: truncateToByteLength(String(q.options?.D || '')),
                      subOptionI: truncateToByteLength(String(q.subOptions?.i || '')),
                      subOptionIi: truncateToByteLength(String(q.subOptions?.ii || '')),
                      subOptionIii: truncateToByteLength(String(q.subOptions?.iii || '')),
                      subOptionIv: truncateToByteLength(String(q.subOptions?.iv || '')),
                      correctOption: (q.correctOption && q.correctOption !== 'NA' && ['A', 'B', 'C', 'D'].includes(q.correctOption)) ? q.correctOption : 'A',
                      questionType: (q.questionType && ['mcq', 'assertion-reason', 'assertion', 'match', 'formula', 'passage', 'statement', 'image'].includes(q.questionType)) ? q.questionType : 'mcq',
                      explanation: truncateToByteLength(String(q.explanation || '')),
                      difficulty: (q.difficulty && ['easy', 'medium', 'hard'].includes(q.difficulty)) ? q.difficulty : 'medium',
                      imageUrl: q.imageUrl || null,
                      hasImage: q.hasImage || false
                    };
                  }
                });

                console.log(`💾 Bulk creating ${gkQuestionRecords.length} GK questions...`);
                
                // Validate all records before inserting
                const invalidRecords = gkQuestionRecords.filter((q, idx) => {
                  if (!q.examId || !q.questionNumber) {
                    console.error(`❌ Invalid record at index ${idx}: missing examId or questionNumber`);
                    return true;
                  }
                  return false;
                });
                
                if (invalidRecords.length > 0) {
                  throw new Error(`${invalidRecords.length} invalid GK question records found. All questions must have examId and questionNumber.`);
                }
                
                // Create in batches to avoid memory issues
                const BATCH_SIZE = 50;
                for (let i = 0; i < gkQuestionRecords.length; i += BATCH_SIZE) {
                  const batch = gkQuestionRecords.slice(i, i + BATCH_SIZE);
                  
                  try {
                    await GKQuestion.bulkCreate(batch, { 
                      transaction,
                      validate: true, // Enable validation
                      individualHooks: false // Disable hooks for performance
                    });
                    console.log(`✅ Created batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(gkQuestionRecords.length / BATCH_SIZE)} (${batch.length} questions)`);
                  } catch (batchError) {
                    console.error(`❌ Error creating batch ${Math.floor(i / BATCH_SIZE) + 1}:`, batchError);
                    console.error('Batch data sample:', batch[0]);
                    throw new Error(`Failed to create GK questions batch: ${batchError.message}`);
                  }
                  
                  progressCallback({
                    stage: 'saving',
                    message: `Saving questions... ${Math.min(i + BATCH_SIZE, gkQuestionRecords.length)}/${gkQuestionRecords.length}`,
                    progress: 85 + Math.floor((i / gkQuestionRecords.length) * 10)
                  });
                }
                
                console.log(`✅ Successfully created ${gkQuestionRecords.length} GK questions`);
              } catch (gkError) {
                console.error('❌ Error creating GK questions:', gkError);
                console.error('Error details:', gkError.message, gkError.stack);
                throw new Error(`Failed to create GK questions: ${gkError.message}`);
              }
            }

            await transaction.commit();
            console.log('✅ Transaction committed successfully');

            progressCallback({
              stage: 'complete',
              message: 'Upload completed successfully!',
              progress: 100,
              questionCount: parsedQuestions.length
            });

            // Clean up progress after 30 seconds (give more time for polling)
            setTimeout(() => progressStore.delete(progressId), 30000);

            console.log('✅ Upload complete! ProgressId:', progressId);
            console.log('📊 Final progress in store:', progressStore.get(progressId));
            
            // Response was already sent at the start (202 Accepted)
            // Frontend should be polling for updates
            console.log('✅ Processing complete. Frontend should have received progress via polling.');
          } catch (err) {
            console.error("❌ Transaction error:", err);
            console.error("Error stack:", err.stack);
            
            try {
              await transaction.rollback();
            } catch (rollbackErr) {
              console.error("❌ Rollback error:", rollbackErr);
            }
            
            // Update progress with error (don't try to send response, already sent)
            progressCallback({
              stage: 'error',
              message: `Error: ${err.message || 'Failed to save to database'}`,
              progress: 0,
              error: true
            });
          }
        } catch (outerErr) {
          // Catch any errors in the outer try block (outside transaction)
          console.error("❌ Outer processing error:", outerErr);
          console.error("Error stack:", outerErr.stack);
          
          progressCallback({
            stage: 'error',
            message: `Error: ${outerErr.message || 'Failed to process upload'}`,
            progress: 0,
            error: true
          });
        }
      })().catch((backgroundError) => {
        // Catch any unhandled errors in background processing
        console.error("❌ Background processing error (unhandled):", backgroundError);
        console.error("Error stack:", backgroundError.stack);
        
        // Update progress with error
        progressCallback({
          stage: 'error',
          message: `Error: ${backgroundError.message || 'Failed to process upload'}`,
          progress: 0,
          error: true
        });
        
        // Don't crash the server - just log the error
        // The frontend will see the error via progress polling
      });
    } catch (err) {
      console.error("❌ Upload failed (before background processing):", err);
      console.error("Error stack:", err.stack);
      
      // Try to get progressId from request or create new one
      let errorProgressId = req.body?.progressId;
      if (!errorProgressId) {
        // Try to find it in progressStore (if it was created)
        const existingIds = Array.from(progressStore.keys());
        if (existingIds.length > 0) {
          errorProgressId = existingIds[existingIds.length - 1]; // Use most recent
        } else {
          errorProgressId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        }
      }
      
      progressStore.set(errorProgressId, {
        stage: 'error',
        message: `Error: ${err.message || 'Failed to process and upload exam'}`,
        progress: 0,
        error: true,
        timestamp: Date.now()
      });
      setTimeout(() => progressStore.delete(errorProgressId), 5000);
      
      // Always send response, even on error
      if (!res.headersSent) {
        res.status(500).json({ 
          error: "Failed to process and upload exam", 
          details: err.message || 'Unknown error',
          progressId: errorProgressId 
        });
      } else {
        console.error("⚠️ Response already sent, cannot send error response");
      }
    }
  }
);

// Get upload progress endpoint
router.get('/upload-progress/:progressId', (req, res) => {
  const { progressId } = req.params;
  console.log('📊 Progress request for ID:', progressId);
  console.log('📊 Available progress IDs:', Array.from(progressStore.keys()));
  
  const progress = progressStore.get(progressId);
  
  if (!progress) {
    console.warn('⚠️ Progress not found for ID:', progressId);
    return res.status(404).json({ error: 'Progress not found', progressId });
  }
  
  console.log('✅ Returning progress:', progress);
  res.json(progress);
});

router.post('/manual-upload', async (req, res) => {
    try {
      const {
        batchName = '',
        examCode = '',
        examName = '',
        examDescription = '',
        category = '',
        year = null,
        month = null,
        duration = 0,
        maxAttempts = 1,
        allowMultipleAttempts = false,
        civilQuestions = [],
        generalKnowledgeQuestions = []
      } = req.body;

      // ✅ Validate required fields
      if (
        !batchName.trim() ||
        !examCode.trim() ||
        !examName.trim()
      ) {
        return res.status(400).json({ error: 'Required fields missing or invalid format' });
      }

      console.log(`Civil Questions: ${civilQuestions.length}`);
      console.log(`GK Questions: ${generalKnowledgeQuestions.length}`);

      const newExam = {
        examCode: examCode.trim(),
        examName: examName.trim(),
        examDescription: examDescription.trim(),
        category: category.trim(),
        year: typeof year === 'number' ? year : null,
        month: typeof month === 'number' ? month : null,
        duration: typeof duration === 'number' ? duration : 0,
        civilQuestions: Array.isArray(civilQuestions) ? civilQuestions : [],
        generalKnowledgeQuestions: Array.isArray(generalKnowledgeQuestions) ? generalKnowledgeQuestions : []
      };

      // Use transaction
      const transaction = await sequelize.transaction();

      try {
        // Find or create the batch
        let batch = await Batch.findOne({ 
          where: { batchName: batchName.trim() },
          transaction 
        });

        if (!batch) {
          batch = await Batch.create({ 
            batchName: batchName.trim()
          }, { transaction });
        }

        // ✅ Check for duplicate exam code (within batch)
        const existingExam = await Exam.findOne({
          where: {
            batchId: batch.id,
            examCode: examCode.trim()
          },
          transaction
        });

        if (existingExam) {
          await transaction.rollback();
          return res.status(400).json({ error: 'Exam code already exists in this batch. Please use a different exam code.' });
        }

        // ✅ Validate exam type matches question type
        const isGK = category && category.toLowerCase().includes('gk');
        const isCivil = category && (category.toLowerCase().includes('civil') || category.toLowerCase() === 'civil');
        
        if (isGK && civilQuestions.length > 0) {
          await transaction.rollback();
          return res.status(400).json({ error: "Category mismatch: GK exam cannot contain Civil questions" });
        }
        if (isCivil && generalKnowledgeQuestions.length > 0) {
          await transaction.rollback();
          return res.status(400).json({ error: "Category mismatch: Civil exam cannot contain GK questions" });
        }

        // ✅ Validate at least one question exists
        if (civilQuestions.length === 0 && generalKnowledgeQuestions.length === 0) {
          await transaction.rollback();
          return res.status(400).json({ error: "No questions provided. Please add at least one question." });
        }

        // ✅ Get publish status from request
        const publishImmediately = req.body.publishImmediately === 'true' || req.body.publishImmediately === true;
        const examStatus = publishImmediately ? 'active' : 'draft';

        // Create exam
        const exam = await Exam.create({
          batchId: batch.id,
          examCode: examCode.trim(),
          examName: examName.trim(),
          examDescription: examDescription.trim(),
          category: category.trim(),
          year: typeof year === 'number' ? year : null,
          month: typeof month === 'number' ? month : null,
          duration: typeof duration === 'number' ? duration : 0,
          maxAttempts: typeof maxAttempts === 'number' ? maxAttempts : 1,
          allowMultipleAttempts: allowMultipleAttempts === true || allowMultipleAttempts === 'true',
          status: examStatus
        }, { transaction });

        // Create civil questions
        if (civilQuestions.length > 0) {
          const civilQuestionRecords = civilQuestions.map(q => {
            // ✅ Apply Tamil text normalization and UTF-8 safety for manual upload
            let tamilText = q.questionTextTamil || '';
            if (tamilText) {
              tamilText = normalizeTamilText(tamilText);
              tamilText = truncateToByteLength(tamilText);
            }
            
            // ✅ Apply UTF-8 safety to all text fields
            return {
              examId: exam.id,
              questionNumber: q.questionNumber || 0,
              questionTextEnglish: truncateToByteLength(String(q.questionTextEnglish || '')),
              questionTextTamil: tamilText,
              optionA: truncateToByteLength(String(q.options?.A || '')),
              optionB: truncateToByteLength(String(q.options?.B || '')),
              optionC: truncateToByteLength(String(q.options?.C || '')),
              optionD: truncateToByteLength(String(q.options?.D || '')),
              // Note: Civil questions don't have subOptions in the database schema
              // Sub-options are only for GK questions
              correctOption: (q.correctOption && q.correctOption !== 'NA' && q.correctOption !== '') ? q.correctOption : 'A',
              questionType: q.questionType || 'mcq',
              explanation: truncateToByteLength(String(q.explanation || '')),
              difficulty: q.difficulty || 'medium',
              imageUrl: q.imageUrl || null,
              hasImage: q.hasImage || false
            };
          });

          await CivilQuestion.bulkCreate(civilQuestionRecords, { transaction });
        }

        // Create GK questions
        if (generalKnowledgeQuestions.length > 0) {
          const gkQuestionRecords = generalKnowledgeQuestions.map(q => {
            // ✅ Apply Tamil text normalization and UTF-8 safety for manual upload
            let tamilText = q.questionTextTamil || '';
            if (tamilText) {
              tamilText = normalizeTamilText(tamilText);
              tamilText = truncateToByteLength(tamilText);
            }
            
            // ✅ Apply UTF-8 safety to all text fields including sub-options
            return {
              examId: exam.id,
              questionNumber: q.questionNumber || 0,
              questionTextEnglish: truncateToByteLength(String(q.questionTextEnglish || '')),
              questionTextTamil: tamilText,
              optionA: truncateToByteLength(String(q.options?.A || '')),
              optionB: truncateToByteLength(String(q.options?.B || '')),
              optionC: truncateToByteLength(String(q.options?.C || '')),
              optionD: truncateToByteLength(String(q.options?.D || '')),
              subOptionI: truncateToByteLength(String(q.subOptions?.i || '')),
              subOptionIi: truncateToByteLength(String(q.subOptions?.ii || '')),
              subOptionIii: truncateToByteLength(String(q.subOptions?.iii || '')),
              subOptionIv: truncateToByteLength(String(q.subOptions?.iv || '')),
              correctOption: (q.correctOption && q.correctOption !== 'NA' && q.correctOption !== '') ? q.correctOption : 'A',
              questionType: q.questionType || 'mcq',
              explanation: truncateToByteLength(String(q.explanation || '')),
              difficulty: q.difficulty || 'medium',
              imageUrl: q.imageUrl || null,
              hasImage: q.hasImage || false
            };
          });

          await GKQuestion.bulkCreate(gkQuestionRecords, { transaction });
        }

        await transaction.commit();

        res.status(200).json({
          message: 'Exam saved successfully',
          batchId: batch.id,
          examId: exam.id
        });
      } catch (err) {
        await transaction.rollback();
        throw err;
      }
    } catch (err) {
      console.error('❌ Error saving exam:', err);
      res.status(500).json({ error: 'Server error' });
    }
  });





// Unified route handler for both :batchId and :batchName patterns
router.get(["/:batchId/exams/:examCode", "/:batchName/exams/:examCode"], async (req, res) => {
  try {
    const { batchId, batchName, examCode } = req.params;
    const decodedBatchName = batchId ? decodeURIComponent(batchId) : decodeURIComponent(batchName);
    
    console.log("👉 Params received:", req.params);
    console.log("👉 Decoded batchName:", decodedBatchName);

    const batch = await Batch.findOne({ where: { batchName: decodedBatchName } });
    console.log("👉 Batch found:", batch ? "YES" : "NO");

    if (!batch) {
      return res.status(404).json({ message: `Batch not found: ${decodedBatchName}` });
    }

    const exam = await Exam.findOne({
      where: {
        batchId: batch.id,
        examCode
      },
      include: [
        {
          model: CivilQuestion,
          as: 'civilQuestions',
          required: false
        },
        {
          model: GKQuestion,
          as: 'generalKnowledgeQuestions',
          required: false
        }
      ]
    });

    console.log("👉 Exam found:", exam ? "YES" : "NO");

    if (!exam) {
      return res.status(404).json({ message: `Exam not found in ${decodedBatchName}: ${examCode}` });
    }

    // Format response
    const formattedExam = {
      ...exam.toJSON(),
      civilQuestions: exam.civilQuestions || [],
      generalKnowledgeQuestions: exam.generalKnowledgeQuestions || []
    };

    res.json(formattedExam);
  } catch (error) {
    console.error("🔥 Error fetching exam:", error);
    res.status(500).json({
      message: "Server error",
      error: error?.message || error.toString(),
    });
  }
});





// ✅ Get all batches
router.get("/get-batches", async (req, res) => {
  try {
    const batches = await Batch.findAll({
      include: [{
        model: Exam,
        as: 'exams',
        include: [
          {
            model: CivilQuestion,
            as: 'civilQuestions',
            required: false
          },
          {
            model: GKQuestion,
            as: 'generalKnowledgeQuestions',
            required: false
          }
        ]
      }]
    });

    const response = batches.map(batch => ({
      id: batch.id,
      batchName: batch.batchName,
      exams: (batch.exams || [])
        .filter(exam => exam && exam.examCode)
        .map(exam => ({
          id: exam.id,
          examCode: exam.examCode,
          examName: exam.examName,
          examDescription: exam.examDescription,
          category: exam.category,
          duration: exam.duration,
          year: exam.year,
          month: exam.month,
          createdAt: exam.createdAt,
          civilQuestions: exam.civilQuestions || [],
          generalKnowledgeQuestions: exam.generalKnowledgeQuestions || [],
        }))
    }));

    res.status(200).json(response);
  } catch (error) {
    console.error("Error fetching batches:", error);
    res.status(500).json({ error: 'Failed to fetch batches' });
  }
});


router.get("/exams/:batchName", async (req, res) => {
  try {
    const { batchName } = req.params;
    const decodedBatchName = decodeURIComponent(batchName);

    const batch = await Batch.findOne({
      where: { batchName: decodedBatchName },
      include: [{
        model: Exam,
        as: 'exams',
        attributes: [
          'id', 
          'examCode', 
          'examName', 
          'examDescription',
          'duration', 
          'category',
          'year',
          'month',
          'status',
          'scheduledStartDate',
          'scheduledEndDate'
        ],
        order: [['createdAt', 'DESC']]
      }]
    });

    if (!batch) {
      return res.status(404).json({ message: `Batch "${decodedBatchName}" not found` });
    }

    // Format exams with additional details
    const formattedExams = (batch.exams || []).map(exam => ({
      id: exam.id,
      examCode: exam.examCode,
      exam_code: exam.examCode, // Support both formats
      examName: exam.examName,
      examDescription: exam.examDescription,
      category: exam.category,
      duration: exam.duration,
      year: exam.year,
      month: exam.month,
      status: exam.status,
      scheduledStartDate: exam.scheduledStartDate,
      scheduledEndDate: exam.scheduledEndDate,
      createdAt: exam.createdAt
    }));

    res.status(200).json(formattedExams);
  } catch (error) {
    console.error("Error fetching exams:", error);
    res.status(500).json({ error: "Failed to fetch exams for batch", message: error.message });
  }
});


// router.put("/manual-upload/:batchId/:examCode", async (req, res) => {
//   try {
//     const { batchId, examCode } = req.params;
//     const batchName = decodeURIComponent(batchId); // "Batch A"
//     const payload = req.body;

//     // Find batch by batchName (not _id)
//     const batch = await Batch.findOne({ batchName });
//     if (!batch) return res.status(404).json({ message: "Batch not found" });

//     // Find exam index
//     const examIndex = batch.exams.findIndex((e) => e.examCode === examCode);
//     if (examIndex === -1) return res.status(404).json({ message: "Exam not found" });

//     // Replace the exam data
//     batch.exams[examIndex] = payload;

//     await batch.save();

//     res.json({ message: "Exam updated successfully", exam: batch.exams[examIndex] });
//   } catch (error) {
//     console.error("Error updating exam:", error);
//     res.status(500).json({ message: "Server error", error: error.message });
//   }
// });

const uploadToCloudinary = (fileBuffer) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: "exam-questions" },
      (err, result) => {
        if (err) reject(err);
        else resolve(result);
      }
    );
    stream.end(fileBuffer);
  });
};


router.put("/manual-upload/:batchId/:examCode", upload.array("questionImages", 50), async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { batchId, examCode } = req.params;
    const batchName = decodeURIComponent(batchId);
    const batch = await Batch.findOne({ 
      where: { batchName },
      transaction 
    });
    
    if (!batch) {
      await transaction.rollback();
      return res.status(404).json({ message: "Batch not found" });
    }

    const exam = await Exam.findOne({
      where: {
        batchId: batch.id,
        examCode
      },
      transaction
    });

    if (!exam) {
      await transaction.rollback();
      return res.status(404).json({ message: "Exam not found" });
    }

    const examData = JSON.parse(req.body.examData);

    // Upload each image and attach url
    for (const file of req.files) {
      const match = file.originalname.match(/q(\d+)/i);
      if (!match) continue;
      const qNum = parseInt(match[1], 10);

      const result = await uploadToCloudinary(file.buffer);

      // Update civil questions
      if (examData.civilQuestions) {
        const civilQ = examData.civilQuestions.find((q) => q.questionNumber === qNum);
        if (civilQ) {
          await CivilQuestion.update(
            { imageUrl: result.secure_url, hasImage: true },
            {
              where: {
                examId: exam.id,
                questionNumber: qNum
              },
              transaction
            }
          );
        }
      }

      // Update GK questions
      if (examData.generalKnowledgeQuestions) {
        const gkQ = examData.generalKnowledgeQuestions.find((q) => q.questionNumber === qNum);
        if (gkQ) {
          await GKQuestion.update(
            { imageUrl: result.secure_url, hasImage: true },
            {
              where: {
                examId: exam.id,
                questionNumber: qNum
              },
              transaction
            }
          );
        }
      }
    }

    // Update exam data if provided
    const updateData = {};
    if (examData.examName) updateData.examName = examData.examName;
    if (examData.examDescription !== undefined) updateData.examDescription = examData.examDescription;
    if (examData.category !== undefined) updateData.category = examData.category;
    if (examData.year !== undefined) updateData.year = examData.year;
    if (examData.month !== undefined) updateData.month = examData.month;
    if (examData.duration !== undefined) updateData.duration = examData.duration;
    if (examData.maxAttempts !== undefined) updateData.maxAttempts = examData.maxAttempts;
    if (examData.allowMultipleAttempts !== undefined) updateData.allowMultipleAttempts = examData.allowMultipleAttempts;
    if (examData.status !== undefined) updateData.status = examData.status;

    if (Object.keys(updateData).length > 0) {
      await exam.update(updateData, { transaction });
    }

    await transaction.commit();

    // Fetch updated exam with questions
    const updatedExam = await Exam.findOne({
      where: { id: exam.id },
      include: [
        { model: CivilQuestion, as: 'civilQuestions', required: false },
        { model: GKQuestion, as: 'generalKnowledgeQuestions', required: false }
      ]
    });

    res.json({ message: "✅ Exam updated with images", exam: updatedExam });
  } catch (err) {
    await transaction.rollback();
    res.status(500).json({ message: "❌ Server error", error: err.message });
  }
});
export default router;



