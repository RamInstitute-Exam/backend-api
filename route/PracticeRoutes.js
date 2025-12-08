import express from 'express';
import { sequelize } from '../config/MySQLConfig.js';
import { Op } from 'sequelize';
import { Student, CivilQuestion, GKQuestion } from '../models/mysql/index.js';

const router = express.Router();

// =====================================================
// GET DAILY PRACTICE QUESTIONS
// =====================================================
router.get('/daily/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    const { date, category } = req.query;
    
    const practiceDate = date || new Date().toISOString().split('T')[0];
    
    // Get daily practice questions from database
    // This would query the daily_practice_questions table
    const [results] = await sequelize.query(`
      SELECT 
        dpq.id,
        dpq.question_id,
        dpq.question_type,
        dpq.practice_date,
        dpq.difficulty,
        dpq.category_id,
        ec.name as category_name
      FROM daily_practice_questions dpq
      LEFT JOIN exam_categories ec ON dpq.category_id = ec.id
      WHERE dpq.practice_date = :practiceDate
        AND dpq.is_active = 1
        ${category ? 'AND dpq.category_id = :category' : ''}
      ORDER BY dpq.id ASC
      LIMIT 10
    `, {
      replacements: { practiceDate, category: category || null }
    });

    // Fetch actual question data
    const questions = await Promise.all(
      results.map(async (dpq) => {
        if (dpq.question_type === 'civil') {
          const question = await CivilQuestion.findByPk(dpq.question_id);
          return question ? {
            ...dpq,
            questionData: question.toJSON()
          } : null;
        } else {
          const question = await GKQuestion.findByPk(dpq.question_id);
          return question ? {
            ...dpq,
            questionData: question.toJSON()
          } : null;
        }
      })
    );

    const validQuestions = questions.filter(q => q !== null);

    res.json({
      date: practiceDate,
      totalQuestions: validQuestions.length,
      questions: validQuestions
    });
  } catch (error) {
    console.error('Daily practice error:', error);
    res.status(500).json({ error: 'Failed to fetch daily practice questions' });
  }
});

// =====================================================
// GET TOPIC-WISE PRACTICE QUESTIONS
// =====================================================
router.get('/topic/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    const { topic, category, difficulty, limit = 20 } = req.query;

    // This would query questions by topic
    // For now, using a simplified approach
    let whereClause = { isActive: true };
    
    if (difficulty) {
      whereClause.difficulty = difficulty;
    }

    // Get GK questions as example
    const gkQuestions = await GKQuestion.findAll({
      where: whereClause,
      limit: parseInt(limit),
      order: [sequelize.literal('RAND()')]
    });

    res.json({
      topic: topic || 'all',
      totalQuestions: gkQuestions.length,
      questions: gkQuestions.map(q => q.toJSON())
    });
  } catch (error) {
    console.error('Topic practice error:', error);
    res.status(500).json({ error: 'Failed to fetch topic practice questions' });
  }
});

// =====================================================
// SUBMIT PRACTICE ANSWER
// =====================================================
router.post('/submit', async (req, res) => {
  try {
    const { studentId, questionId, questionType, selectedOption, timeTaken } = req.body;

    // Get the question to check answer
    let question;
    if (questionType === 'civil') {
      question = await CivilQuestion.findByPk(questionId);
    } else {
      question = await GKQuestion.findByPk(questionId);
    }

    if (!question) {
      return res.status(404).json({ error: 'Question not found' });
    }

    const isCorrect = selectedOption === question.correctOption;

    // Save practice attempt
    const practiceDate = new Date().toISOString().split('T')[0];
    await sequelize.query(`
      INSERT INTO practice_attempts 
      (student_id, question_id, question_type, selected_option, is_correct, time_taken_seconds, practice_date)
      VALUES (:studentId, :questionId, :questionType, :selectedOption, :isCorrect, :timeTaken, :practiceDate)
      ON DUPLICATE KEY UPDATE
        selected_option = VALUES(selected_option),
        is_correct = VALUES(is_correct),
        time_taken_seconds = VALUES(time_taken_seconds)
    `, {
      replacements: {
        studentId,
        questionId,
        questionType,
        selectedOption,
        isCorrect: isCorrect ? 1 : 0,
        timeTaken: timeTaken || 0,
        practiceDate
      }
    });

    // Update topic mastery
    const topicName = question.category || 'General';
    await sequelize.query(`
      INSERT INTO topic_mastery 
      (student_id, topic_name, category_id, total_questions, correct_answers, wrong_answers, mastery_percentage, last_practiced_at)
      VALUES (
        :studentId, 
        :topicName, 
        NULL,
        1,
        :correctCount,
        :wrongCount,
        :mastery,
        NOW()
      )
      ON DUPLICATE KEY UPDATE
        total_questions = total_questions + 1,
        correct_answers = correct_answers + :correctCount,
        wrong_answers = wrong_answers + :wrongCount,
        mastery_percentage = (correct_answers / total_questions) * 100,
        last_practiced_at = NOW()
    `, {
      replacements: {
        studentId,
        topicName,
        correctCount: isCorrect ? 1 : 0,
        wrongCount: isCorrect ? 0 : 1,
        mastery: isCorrect ? 100 : 0
      }
    });

    res.json({
      isCorrect,
      correctOption: question.correctOption,
      explanation: question.explanation || '',
      message: isCorrect ? 'Correct answer!' : 'Incorrect answer'
    });
  } catch (error) {
    console.error('Practice submit error:', error);
    res.status(500).json({ error: 'Failed to submit practice answer' });
  }
});

// =====================================================
// GET PRACTICE STATISTICS
// =====================================================
router.get('/stats/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    const { period = '30' } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period));

    const [stats] = await sequelize.query(`
      SELECT 
        COUNT(*) as total_attempts,
        SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) as correct_answers,
        SUM(CASE WHEN is_correct = 0 THEN 1 ELSE 0 END) as wrong_answers,
        AVG(time_taken_seconds) as avg_time_per_question,
        COUNT(DISTINCT DATE(practice_date)) as days_practiced
      FROM practice_attempts
      WHERE student_id = :studentId
        AND practice_date >= :startDate
    `, {
      replacements: { studentId, startDate: startDate.toISOString().split('T')[0] }
    });

    const total = stats[0]?.total_attempts || 0;
    const correct = stats[0]?.correct_answers || 0;
    const accuracy = total > 0 ? ((correct / total) * 100).toFixed(2) : 0;

    res.json({
      totalAttempts: total,
      correctAnswers: correct,
      wrongAnswers: stats[0]?.wrong_answers || 0,
      accuracy: parseFloat(accuracy),
      avgTimePerQuestion: parseFloat(stats[0]?.avg_time_per_question || 0),
      daysPracticed: stats[0]?.days_practiced || 0
    });
  } catch (error) {
    console.error('Practice stats error:', error);
    res.status(500).json({ error: 'Failed to fetch practice statistics' });
  }
});

// =====================================================
// GET TOPIC MASTERY
// =====================================================
router.get('/mastery/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;

    const [mastery] = await sequelize.query(`
      SELECT 
        topic_name,
        total_questions,
        correct_answers,
        wrong_answers,
        mastery_percentage,
        last_practiced_at
      FROM topic_mastery
      WHERE student_id = :studentId
      ORDER BY mastery_percentage DESC, total_questions DESC
      LIMIT 20
    `, {
      replacements: { studentId }
    });

    res.json(mastery);
  } catch (error) {
    console.error('Mastery error:', error);
    res.status(500).json({ error: 'Failed to fetch topic mastery' });
  }
});

export default router;

