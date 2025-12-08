import express from 'express';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import Tesseract from 'tesseract.js';
import { fromBuffer } from 'pdf2pic';
import tmp from 'tmp';
import fs from 'fs/promises';
import { Configuration, OpenAIApi } from 'openai';
import { preprocessImage } from '../utils/imagePreprocessor.js';
import { extractTextWithFallback } from '../services/easyocr-wrapper.js';
import { extractTextWithSmartFallback } from '../services/ocr-providers/index.js';
import { cleanTamilText } from '../utils/cleanTamilText.js';

import { Batch, Exam, CivilQuestion, GKQuestion } from '../models/mysql/index.js';
import { sequelize } from '../config/MySQLConfig.js';
import { getAllExamReports } from '../Controller/Exam/ExamControl.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Progress tracking store (in-memory)
const progressStore = new Map();

// Setup OpenAI client with your API key (use env var in real apps)
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY || 'YOUR_API_KEY_HERE',
});
const openai = new OpenAIApi(configuration);

// AI Tamil text fixer
async function aiFixTamilText(rawTamil) {
  if (!rawTamil || rawTamil.trim() === '') return rawTamil;

  try {
    const prompt = `
You are an expert Tamil language text corrector. 
Fix any spelling, grammar, or formatting issues in the following Tamil text. 
Return only the corrected Tamil text without extra explanation.

Text to fix:
"""${rawTamil}"""
`;

    const completion = await openai.createChatCompletion({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      max_tokens: 100,
    });

    const fixedText = completion.data.choices[0].message.content.trim();
    return fixedText || rawTamil;
  } catch (error) {
    console.error('OpenAI Tamil text fix error:', error);
    return rawTamil; // fallback to raw text on error
  }
}

// Extract answers (A-D) from answer PDF text
async function extractAnswersFromAnswerPDF(buffer) {
  const data = await pdfParse(buffer);
  const text = data.text;

  const answerLines = text.split(/\r?\n/).filter(Boolean);
  const answers = [];
  const answerMap = {}; // Also return as map for compatibility

  for (const line of answerLines) {
    // Enhanced patterns to match various answer formats
    const patterns = [
      /^(\d+)\.\s*([A-D])/i,  // 1. A
      /^(\d+)\s*[\.\)]\s*\(?([A-D])\)?/i,  // 1. (A) or 1) A
      /^(\d+)\.\s*[^\(]*\(([A-D])\)/i,  // 1. Question text... (A)
      /\(([A-D])\)\s*$/,  // (A) at end
    ];
    
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        const qNo = parseInt(match[1] || '0', 10);
        const option = (match[2] || match[1]).toUpperCase();
        if (qNo > 0 && ['A', 'B', 'C', 'D'].includes(option)) {
          answers.push(option);
          answerMap[qNo] = option;
          break;
        }
      }
    }
  }

  // Return both array and map for compatibility
  return answers.length > 0 ? answers : Object.values(answerMap);
}

// OCR Tamil text from all pages of a PDF buffer
async function extractTamilTextFromPDF(buffer, progressCallback = null) {
  const tmpDir = tmp.dirSync({ unsafeCleanup: true });
  const tempPath = tmpDir.name;

  const storeAsImage = fromBuffer(buffer, {
    density: 400, // Increased from 300 for better OCR accuracy
    saveFilename: 'page',
    savePath: tempPath,
    format: 'png',
    width: 1600, // Increased for better text recognition
    height: 2200,
  });

  const pdfData = await pdfParse(buffer);
  const numPages = pdfData.numpages || 1;

  let fullText = '';

  try {
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      // Emit progress: Converting page to image
      if (progressCallback) {
        progressCallback({
          stage: 'ocr',
          message: `Converting page ${pageNum}/${numPages} to image...`,
          progress: Math.round((pageNum - 1) / numPages * 100),
          currentPage: pageNum,
          totalPages: numPages
        });
      }

      const imageResponse = await storeAsImage(pageNum);
      const imagePath = imageResponse.path;

      // Preprocess image for better OCR accuracy
      if (progressCallback) {
        progressCallback({
          stage: 'ocr',
          message: `Preprocessing page ${pageNum}/${numPages}...`,
          progress: Math.round((pageNum - 0.8) / numPages * 100),
          currentPage: pageNum,
          totalPages: numPages
        });
      }
      console.log(`🖼️  Preprocessing image for page ${pageNum}...`);
      const processedImagePath = await preprocessImage(imagePath);

      // Try Tesseract OCR first
      let pageText = '';
      try {
        if (progressCallback) {
          progressCallback({
            stage: 'ocr',
            message: `Running OCR on page ${pageNum}/${numPages}...`,
            progress: Math.round((pageNum - 0.5) / numPages * 100),
            currentPage: pageNum,
            totalPages: numPages
          });
        }
        const { data: { text } } = await Tesseract.recognize(
          processedImagePath,
          'tam+eng', // Use Tamil + English for better recognition
          {
            logger: (m) => {
              console.log(`OCR page ${pageNum}:`, m.status, m.progress);
              if (progressCallback && m.status === 'recognizing text') {
                progressCallback({
                  stage: 'ocr',
                  message: `OCR progress: ${Math.round(m.progress * 100)}% (page ${pageNum}/${numPages})`,
                  progress: Math.round(((pageNum - 1) + m.progress) / numPages * 100),
                  currentPage: pageNum,
                  totalPages: numPages
                });
              }
            },
          }
        );
        pageText = text || '';
      } catch (tesseractError) {
        console.warn(`⚠️  Tesseract OCR failed for page ${pageNum}:`, tesseractError.message);
      }

      // Use smart fallback: Try third-party services, then EasyOCR, then Tesseract
      if (progressCallback) {
        progressCallback({
          stage: 'ocr',
          message: `Extracting text from page ${pageNum}/${numPages}...`,
          progress: Math.round((pageNum - 0.3) / numPages * 100),
          currentPage: pageNum,
          totalPages: numPages
        });
      }
      const result = await extractTextWithSmartFallback(processedImagePath, pageText);
      if (result.text) {
        fullText += result.text + '\n';
        console.log(`✅ Page ${pageNum} extracted using ${result.provider || result.method}`);
      } else {
        console.warn(`⚠️  No text extracted from page ${pageNum}`);
      }
      
      // Clean up processed images
      try {
        await fs.unlink(imagePath);
        if (processedImagePath !== imagePath) {
          await fs.unlink(processedImagePath).catch(() => {}); // Ignore errors
        }
      } catch (cleanupErr) {
        console.warn('Cleanup warning:', cleanupErr.message);
      }

      // Emit progress: Page completed
      if (progressCallback) {
        progressCallback({
          stage: 'ocr',
          message: `Completed page ${pageNum}/${numPages}`,
          progress: Math.round(pageNum / numPages * 100),
          currentPage: pageNum,
          totalPages: numPages
        });
      }
    }
  } catch (err) {
    console.error('OCR extraction error:', err);
    if (progressCallback) {
      progressCallback({
        stage: 'ocr',
        message: `Error processing PDF: ${err.message}`,
        progress: 0,
        error: true
      });
    }
  } finally {
    tmpDir.removeCallback();
  }

  return fullText;
}

// Tamil text regex helper
const tamilRegex = /[\u0B80-\u0BFF]/;

// Extract questions from text with Tamil and options, with AI fixing and validations
async function extractQuestionsFromText(text, answers = []) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const questions = [];
  let currentQuestion = null;
  let answerIndex = 0;

  const issues = {
    missingTamilQuestions: [],
    missingOptions: [],
    invalidCorrectOptions: [],
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const qMatch = line.match(/^(\d+)\.\s+(.+)/);
    if (qMatch) {
      if (currentQuestion) questions.push(currentQuestion);

      currentQuestion = {
        questionNumber: parseInt(qMatch[1]),
        questionTextEnglish: qMatch[2].trim(),
        questionTextTamil: '',
        ocrTamilRawText: '',
        options: { A: '', B: '', C: '', D: '' },
        correctOption:
          answers[answerIndex] && ['A', 'B', 'C', 'D'].includes(answers[answerIndex])
            ? answers[answerIndex]
            : 'A',
      };
      answerIndex++;

      const nextLine = lines[i + 1]?.trim() || '';
      if (tamilRegex.test(nextLine)) {
        const rawTamil = nextLine;
        // Use advanced Tamil text cleaning with word segmentation
        let normalized = cleanTamilText(rawTamil);
        if (!normalized && rawTamil) {
          normalized = await aiFixTamilText(rawTamil);
          console.warn(`AI fixed Tamil text in question ${currentQuestion.questionNumber}`);
        }
        currentQuestion.questionTextTamil = normalized;
        currentQuestion.ocrTamilRawText = rawTamil;
        i++; // skip tamil line
      }
      continue;
    }

    const optMatch = line.match(/^\(?([A-D])\)?\.?\s+(.*)/);
    if (currentQuestion && optMatch) {
      const optionLetter = optMatch[1];
      const englishText = optMatch[2].trim();
      const nextLine = lines[i + 1]?.trim() || '';
      let tamilPart = '';
      let rawTamil = '';

      if (tamilRegex.test(nextLine)) {
        rawTamil = nextLine;
        // Use advanced Tamil text cleaning with word segmentation
        let normalized = cleanTamilText(rawTamil);
        if (!normalized && rawTamil) {
          normalized = await aiFixTamilText(rawTamil);
          console.warn(`AI fixed Tamil text in option ${optionLetter} of question ${currentQuestion.questionNumber}`);
        }
        tamilPart = normalized;
        i++;
      }

      currentQuestion.options[optionLetter] = tamilPart
        ? `${englishText} ${tamilPart}`.trim()
        : englishText;
    }
  }

  if (currentQuestion) questions.push(currentQuestion);

  for (const q of questions) {
    if (!q.questionTextTamil || q.questionTextTamil.length === 0) {
      issues.missingTamilQuestions.push(q.questionNumber);
      console.warn(`Tamil question missing for question number ${q.questionNumber}`);
    }
    ['A', 'B', 'C', 'D'].forEach((opt) => {
      if (!q.options[opt] || q.options[opt] === '') {
        issues.missingOptions.push({ questionNumber: q.questionNumber, option: opt });
        q.options[opt] = 'N/A';
        console.warn(`Missing option ${opt} for question number ${q.questionNumber}`);
      }
    });
    if (!['A', 'B', 'C', 'D'].includes(q.correctOption)) {
      issues.invalidCorrectOptions.push(q.questionNumber);
      console.warn(`Invalid correct option for question number ${q.questionNumber}, defaulting to 'A'`);
      q.correctOption = 'A';
    }
  }

  return { questions, issues };
}

// Upload route
router.post(
  '/upload-question-answer-pdf',
  upload.fields([
    { name: 'questionPDF', maxCount: 1 },
    { name: 'answerPDF', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      if (!req.files['questionPDF'] || !req.files['answerPDF']) {
        return res.status(400).json({ error: 'Missing PDF files' });
      }

      const {
        examCode,
        examName,
        examDescription,
        category,
        year,
        date,
        month,
        duration,
        batchName,
      } = req.body;

      const questionBuffer = req.files['questionPDF'][0].buffer;
      const answerBuffer = req.files['answerPDF'][0].buffer;

      // Create progress ID for this upload
      const progressId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const progressCallback = (progress) => {
        progressStore.set(progressId, { ...progress, timestamp: Date.now() });
      };

      // Initialize progress
      progressCallback({
        stage: 'upload',
        message: 'Files uploaded successfully. Starting processing...',
        progress: 100,
        uploadComplete: true
      });

      // Extract question text from PDF (normal text parse)
      progressCallback({
        stage: 'parsing',
        message: 'Parsing PDF text...',
        progress: 10
      });
      let questionText = (await pdfParse(questionBuffer)).text;

      // Fallback to OCR if Tamil text is missing or poor quality
      const tamilCheckText = 'இராஜாஜி'; // Example Tamil keyword you expect in PDF
      if (!questionText.includes(tamilCheckText) || questionText.length < 100) {
        console.log('⚠️ Tamil text missing or corrupted in PDF, running OCR fallback...');
        progressCallback({
          stage: 'ocr',
          message: 'Tamil text missing. Running OCR on all pages...',
          progress: 20
        });
        questionText = await extractTamilTextFromPDF(questionBuffer, progressCallback);
      } else {
        progressCallback({
          stage: 'parsing',
          message: 'PDF text extracted successfully',
          progress: 30
        });
      }

      // Extract answers from answer PDF
      progressCallback({
        stage: 'parsing',
        message: 'Extracting answers from answer PDF...',
        progress: 60
      });
      const correctAnswers = await extractAnswersFromAnswerPDF(answerBuffer);

      // Parse questions & options with AI fixing Tamil text if needed
      progressCallback({
        stage: 'parsing',
        message: 'Parsing questions and options...',
        progress: 70
      });
      const { questions, issues } = await extractQuestionsFromText(questionText, correctAnswers);

      // Save to DB using transaction
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

        // Check for duplicate exam code
        const existingExam = await Exam.findOne({
          where: {
            batchId: batch.id,
            examCode
          },
          transaction
        });

        if (existingExam) {
          await transaction.rollback();
          return res.status(400).json({ error: 'Exam code already exists in this batch' });
        }

        // Get publish status from request
        const publishImmediately = req.body.publishImmediately === 'true' || req.body.publishImmediately === true;
        const examStatus = publishImmediately ? 'active' : 'draft';
        
        // Create exam
        const maxAttempts = parseInt(req.body.maxAttempts) || 1;
        const allowMultipleAttempts = req.body.allowMultipleAttempts === 'true' || req.body.allowMultipleAttempts === true;
        
        const newExam = await Exam.create({
          batchId: batch.id,
          examCode,
          examName,
          examDescription: examDescription || '',
          category: category || '',
          year: year || null,
          month: month || null,
          duration: duration || 0,
          maxAttempts,
          allowMultipleAttempts,
          status: examStatus
        }, { transaction });

        // ✅ Validate exam type matches question type
        const isGK = category && category.toLowerCase().includes('gk');
        const isCivil = category && (category.toLowerCase().includes('civil') || category.toLowerCase() === 'civil');
        
        // Validate category and question type match
        if (isGK && questions.some(q => !q.subOptions || Object.keys(q.subOptions).length === 0)) {
          await transaction.rollback();
          return res.status(400).json({ error: 'GK exams require questions with sub-options (i, ii, iii, iv)' });
        }
        if (isCivil && questions.some(q => q.subOptions && Object.keys(q.subOptions).length > 0)) {
          await transaction.rollback();
          return res.status(400).json({ error: 'Civil exams should not have sub-options. Use GK category for sub-option questions.' });
        }
        
        if (isGK) {
          // Create GK questions
          const gkQuestionRecords = questions.map(q => ({
            examId: newExam.id,
            questionNumber: q.questionNumber || 0,
            questionTextEnglish: q.questionTextEnglish || '',
            questionTextTamil: q.questionTextTamil || '',
            optionA: q.options?.A || '',
            optionB: q.options?.B || '',
            optionC: q.options?.C || '',
            optionD: q.options?.D || '',
            subOptionI: q.subOptions?.i || '',
            subOptionIi: q.subOptions?.ii || '',
            subOptionIii: q.subOptions?.iii || '',
            subOptionIv: q.subOptions?.iv || '',
            correctOption: q.correctOption || 'A',
            questionType: q.questionType || 'mcq',
            explanation: q.explanation || '',
            difficulty: q.difficulty || 'medium'
          }));

          await GKQuestion.bulkCreate(gkQuestionRecords, { transaction });
        } else {
          // Create Civil questions
          const civilQuestionRecords = questions.map(q => ({
            examId: newExam.id,
            questionNumber: q.questionNumber || 0,
            questionTextEnglish: q.questionTextEnglish || '',
            questionTextTamil: q.questionTextTamil || '',
            optionA: q.options?.A || '',
            optionB: q.options?.B || '',
            optionC: q.options?.C || '',
            optionD: q.options?.D || '',
            correctOption: q.correctOption || 'A',
            questionType: q.questionType || 'mcq',
            explanation: q.explanation || '',
            difficulty: q.difficulty || 'medium'
          }));

          await CivilQuestion.bulkCreate(civilQuestionRecords, { transaction });
        }

        await transaction.commit();

        progressCallback({
          stage: 'complete',
          message: 'Upload completed successfully!',
          progress: 100,
          questionCount: questions.length
        });

        // Fetch created exam with questions
        const createdExam = await Exam.findOne({
          where: { id: newExam.id },
          include: [
            { model: CivilQuestion, as: 'civilQuestions', required: false },
            { model: GKQuestion, as: 'generalKnowledgeQuestions', required: false }
          ]
        });

        // Clean up progress after 5 seconds
        setTimeout(() => progressStore.delete(progressId), 5000);

        res.status(200).json({
          message: 'Questions and answers uploaded successfully.',
          questionCount: questions.length,
          issues,
          exam: createdExam,
          progressId, // Return progress ID for client reference
        });
    } catch (err) {
      await transaction.rollback();
      throw err;
      }
    } catch (err) {
      console.error('❌ Upload processing failed:', err);
      const progressId = req.body.progressId || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      progressStore.set(progressId, {
        stage: 'error',
        message: `Error: ${err.message || 'Failed to process PDFs'}`,
        progress: 0,
        error: true,
        timestamp: Date.now()
      });
      setTimeout(() => progressStore.delete(progressId), 5000);
      res.status(500).json({ error: 'Failed to process PDFs', details: err.message || err, progressId });
    }
  }
);

// Get upload progress endpoint
router.get('/upload-progress/:progressId', (req, res) => {
  const { progressId } = req.params;
  const progress = progressStore.get(progressId);
  
  if (!progress) {
    return res.status(404).json({ error: 'Progress not found' });
  }
  
  res.json(progress);
});

router.get('/get-all-exams', getAllExamReports);

export default router;




