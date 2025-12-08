/**
 * Test script to verify PDF parsing for Civil Model 4.7.25
 * This helps identify parsing issues with the provided PDFs
 */

import pdfParse from 'pdf-parse';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import parsing functions
function extractAnswers(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const answerMap = {};
  
  for (const line of lines) {
    // Enhanced regex to match various formats:
    // 1. A | 1) A | 1 - A | 1 : A | 1 Ans: A | (A) | 1. (A)
    const patterns = [
      /^(\d+)\s*[\.\)\-:]?\s*(?:Ans[:\-]?\s*)?\(?([A-D])\)?/i,  // 1. A or 1. (A)
      /^(\d+)\s*[\.\)]\s*\(([A-D])\)/i,  // 1. (A)
      /^(\d+)\s*[\.\)]\s*([A-D])[\.\)]/i,  // 1. A.
      /\(([A-D])\)\s*$/,  // (A) at end of line
    ];
    
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        const qNo = parseInt(match[1] || match[0], 10);
        const option = (match[2] || match[1]).toUpperCase();
        if (qNo && option) {
          answerMap[qNo] = option;
          break;
        }
      }
    }
  }
  
  return answerMap;
}

async function testPDFParsing() {
  try {
    console.log('📄 Testing PDF Parsing for Civil Model 4.7.25\n');
    
    // Read answer PDF
    const answerPdfPath = path.join(__dirname, '../doc/Civil answer model 4.7.25.pdf');
    const answerBuffer = fs.readFileSync(answerPdfPath);
    const answerData = await pdfParse(answerBuffer);
    const answerText = answerData.text;
    
    console.log('✅ Answer PDF loaded');
    console.log(`📊 Answer PDF text length: ${answerText.length} characters\n`);
    
    // Extract answers
    const answers = extractAnswers(answerText);
    console.log('📋 Extracted Answers:');
    console.log(answers);
    console.log(`\n✅ Found ${Object.keys(answers).length} answers\n`);
    
    // Read question PDF
    const questionPdfPath = path.join(__dirname, '../doc/CIVIL MODEL 4.7.25.pdf');
    const questionBuffer = fs.readFileSync(questionPdfPath);
    const questionData = await pdfParse(questionBuffer);
    const questionText = questionData.text;
    
    console.log('✅ Question PDF loaded');
    console.log(`📊 Question PDF text length: ${questionText.length} characters\n`);
    
    // Show first 2000 characters of question text
    console.log('📝 First 2000 characters of question text:');
    console.log('─'.repeat(80));
    console.log(questionText.substring(0, 2000));
    console.log('─'.repeat(80));
    console.log('\n');
    
    // Show first 1000 characters of answer text
    console.log('📝 First 1000 characters of answer text:');
    console.log('─'.repeat(80));
    console.log(answerText.substring(0, 1000));
    console.log('─'.repeat(80));
    console.log('\n');
    
    // Test question parsing
    const lines = questionText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    console.log(`📊 Total lines in question PDF: ${lines.length}\n`);
    
    // Find question patterns
    let questionCount = 0;
    let optionCount = 0;
    
    lines.forEach((line, idx) => {
      // Match question numbers
      if (/^\d+[\.\)]\s*/.test(line)) {
        questionCount++;
        if (questionCount <= 3) {
          console.log(`Question ${questionCount} (line ${idx + 1}): ${line.substring(0, 100)}...`);
        }
      }
      // Match options
      if (/^[A-D][\.\)]\s*/.test(line) || /^\([A-D]\)\s*/.test(line)) {
        optionCount++;
        if (optionCount <= 5) {
          console.log(`  Option (line ${idx + 1}): ${line.substring(0, 80)}...`);
        }
      }
    });
    
    console.log(`\n✅ Found ${questionCount} question numbers`);
    console.log(`✅ Found ${optionCount} option lines\n`);
    
    // Summary
    console.log('📊 PARSING SUMMARY:');
    console.log('─'.repeat(80));
    console.log(`Questions detected: ${questionCount}`);
    console.log(`Options detected: ${optionCount}`);
    console.log(`Answers extracted: ${Object.keys(answers).length}`);
    console.log('─'.repeat(80));
    
    if (questionCount === 0) {
      console.log('\n⚠️  WARNING: No questions detected. PDF format may not match expected pattern.');
      console.log('💡 Suggestion: Check if questions use different numbering format.');
    }
    
    if (Object.keys(answers).length === 0) {
      console.log('\n⚠️  WARNING: No answers extracted. Answer format may not match expected pattern.');
      console.log('💡 Suggestion: Check answer PDF format.');
    }
    
    if (questionCount > 0 && Object.keys(answers).length > 0) {
      console.log('\n✅ PDFs appear to be parseable!');
    }
    
  } catch (error) {
    console.error('❌ Error testing PDF parsing:', error);
    console.error(error.stack);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testPDFParsing();
}

export { testPDFParsing, extractAnswers };

