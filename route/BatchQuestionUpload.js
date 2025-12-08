import express from 'express';
import { Batch, Exam, CivilQuestion, GKQuestion } from '../models/mysql/index.js';
import { sequelize } from '../config/MySQLConfig.js';
import { Op } from 'sequelize';

const router = express.Router();





router.post('/create',async (req, res) => {
  try {
    const {
      studentId,
      batchName,
      exams
    } = req.body;

    if (!batchName || !Array.isArray(exams)) {
      return res.status(400).json({ message: 'batchName and exams are required' });
    }

    const transaction = await sequelize.transaction();

    try {
      // Create batch
      const newBatch = await Batch.create({ batchName }, { transaction });

      // Create exams and questions
      for (const examData of exams) {
        const exam = await Exam.create({
          batchId: newBatch.id,
          examCode: examData.examCode,
          examName: examData.examName,
          examDescription: examData.examDescription || '',
          category: examData.category || '',
          year: examData.year || null,
          month: examData.month || null,
          duration: examData.duration || 0,
          status: 'draft'
        }, { transaction });

        // Create questions if provided
        if (examData.civilQuestions && examData.civilQuestions.length > 0) {
          const civilQRecords = examData.civilQuestions.map(q => ({
            examId: exam.id,
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
          await CivilQuestion.bulkCreate(civilQRecords, { transaction });
        }

        if (examData.generalKnowledgeQuestions && examData.generalKnowledgeQuestions.length > 0) {
          const gkQRecords = examData.generalKnowledgeQuestions.map(q => ({
            examId: exam.id,
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
          await GKQuestion.bulkCreate(gkQRecords, { transaction });
        }
      }

      await transaction.commit();

      res.status(201).json({
        message: 'Batch created successfully with exams',
        batch: newBatch
      });
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (error) {
    console.error('Error creating batch:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
})


// POST /exam/:examId/upload-civil-questions

router.post('/:examId/upload-civil-questions', async (req, res) => {
  const { examId } = req.params;
  const { questions } = req.body;

  try {
    const examIdInt = parseInt(examId);
    const exam = await Exam.findByPk(examIdInt);
    
    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }

    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ message: 'Questions array is required' });
    }

    const questionRecords = questions.map(q => ({
      examId: exam.id,
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
      difficulty: q.difficulty || 'medium',
      imageUrl: q.imageUrl || null,
      hasImage: q.hasImage || false
    }));

    await CivilQuestion.bulkCreate(questionRecords);

    return res.status(200).json({ message: 'Civil questions uploaded successfully' });
  } catch (error) {
    console.error('Error uploading civil questions:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * POST /exam/:examId/upload-gk-questions
 */
// router.post('/:examId/upload-gk-questions', async (req, res) => {
router.post('/upload-gk-questions', async (req, res) => {
  try {
    const {
      batchName,
      examCode,
      examName,
      examDescription,
      category,
      year,
      month,
      duration,
      questions
    } = req.body;

    if (!batchName || !examCode || !examName || !questions || questions.length === 0) {
      return res.status(400).json({ error: 'Required fields missing' });
    }

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

      // ✅ Validate exam type matches question type
      const isGK = category && category.toLowerCase().includes('gk');
      if (isGK && (!questions || questions.length === 0 || !questions.some(q => q.subOptions))) {
        await transaction.rollback();
        return res.status(400).json({ error: 'GK exams require questions with sub-options (i, ii, iii, iv)' });
      }

      // ✅ Validate at least one question exists
      if (!questions || questions.length === 0) {
        await transaction.rollback();
        return res.status(400).json({ error: 'No questions provided. Please add at least one question.' });
      }

      // ✅ Get publish status from request
      const publishImmediately = req.body.publishImmediately === 'true' || req.body.publishImmediately === true;
      const examStatus = publishImmediately ? 'active' : 'draft';

      // Create exam
      const exam = await Exam.create({
        batchId: batch.id,
        examCode,
        examName,
        examDescription: examDescription || '',
        category: category || '',
        year: year || null,
        month: month || null,
        duration: duration || 0,
        status: examStatus
      }, { transaction });

      // Create GK questions
      const gkQuestionRecords = questions.map(q => ({
        examId: exam.id,
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
        difficulty: q.difficulty || 'medium',
        imageUrl: q.imageUrl || null,
        hasImage: q.hasImage || false
      }));

      await GKQuestion.bulkCreate(gkQuestionRecords, { transaction });

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
    console.error('Error saving exam:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

export default router;
