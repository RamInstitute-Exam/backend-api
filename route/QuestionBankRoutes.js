import express from 'express';
import { authenticate, adminOnly, requirePermission } from '../middleware/RBAC.js';
import { QuestionBank, Admin } from '../models/mysql/index.js';
import multer from 'multer';
import { Op } from 'sequelize';

const router = express.Router();

// All routes require admin authentication and manage_questions permission
router.use(authenticate);
router.use(adminOnly);
router.use(requirePermission('manage_questions'));

// Get all questions with filters
router.get('/', async (req, res) => {
  try {
    const {
      category,
      subject,
      difficulty,
      tags,
      status = 'active',
      page = 1,
      limit = 20,
      search
    } = req.query;

    const where = { status };
    
    if (category) where.category = category;
    if (subject) where.subject = subject;
    if (difficulty) where.difficulty = difficulty;
    if (tags) {
      const tagArray = Array.isArray(tags) ? tags : [tags];
      where.tags = { [Op.contains]: tagArray };
    }
    if (search) {
      where[Op.or] = [
        { questionTextEnglish: { [Op.like]: `%${search}%` } },
        { questionTextTamil: { [Op.like]: `%${search}%` } }
      ];
    }

    const offset = (page - 1) * limit;

    const questions = await QuestionBank.findAll({
      where,
      include: [{
        model: Admin,
        as: 'creator',
        attributes: ['id', 'username', 'email']
      }],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    const total = await QuestionBank.count({ where });

    res.status(200).json({
      questions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch questions', error: error.message });
  }
});

// Get single question
router.get('/:id', async (req, res) => {
  try {
    const question = await QuestionBank.findByPk(req.params.id, {
      include: [{
        model: Admin,
        as: 'creator',
        attributes: ['id', 'username', 'email']
      }]
    });

    if (!question) {
      return res.status(404).json({ message: 'Question not found' });
    }

    res.status(200).json(question);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch question', error: error.message });
  }
});

// Create question
router.post('/', async (req, res) => {
  try {
    // Convert options object to separate fields if needed
    const questionData = {
      ...req.body,
      createdBy: req.user.id
    };

    // Handle options object conversion
    if (questionData.options && typeof questionData.options === 'object') {
      questionData.optionA = questionData.options.A || '';
      questionData.optionB = questionData.options.B || '';
      questionData.optionC = questionData.options.C || '';
      questionData.optionD = questionData.options.D || '';
      delete questionData.options;
    }

    // Handle subOptions
    if (questionData.subOptions && typeof questionData.subOptions === 'object') {
      questionData.subOptionI = questionData.subOptions.i || '';
      questionData.subOptionIi = questionData.subOptions.ii || '';
      questionData.subOptionIii = questionData.subOptions.iii || '';
      questionData.subOptionIv = questionData.subOptions.iv || '';
      delete questionData.subOptions;
    }

    const question = await QuestionBank.create(questionData);

    res.status(201).json(question);
  } catch (error) {
    res.status(500).json({ message: 'Failed to create question', error: error.message });
  }
});

// Update question
router.put('/:id', async (req, res) => {
  try {
    const question = await QuestionBank.findByPk(req.params.id);

    if (!question) {
      return res.status(404).json({ message: 'Question not found' });
    }

    // Handle options conversion
    const updateData = { ...req.body };
    if (updateData.options && typeof updateData.options === 'object') {
      updateData.optionA = updateData.options.A || '';
      updateData.optionB = updateData.options.B || '';
      updateData.optionC = updateData.options.C || '';
      updateData.optionD = updateData.options.D || '';
      delete updateData.options;
    }

    // Create new version
    const newVersion = await QuestionBank.create({
      ...updateData,
      version: question.version + 1,
      previousVersionId: question.id,
      createdBy: req.user.id
    });

    // Archive old version
    await question.update({ status: 'archived' });

    res.status(200).json(newVersion);
  } catch (error) {
    res.status(500).json({ message: 'Failed to update question', error: error.message });
  }
});

// Delete question (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const question = await QuestionBank.findByPk(req.params.id);

    if (!question) {
      return res.status(404).json({ message: 'Question not found' });
    }

    await question.update({ status: 'archived' });

    res.status(200).json({ message: 'Question archived successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete question', error: error.message });
  }
});

// Get categories
router.get('/meta/categories', async (req, res) => {
  try {
    const categories = await QuestionBank.findAll({
      attributes: [[fn('DISTINCT', col('category')), 'category']],
      raw: true
    });
    res.status(200).json(categories.map(c => c.category).filter(Boolean));
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch categories', error: error.message });
  }
});

// Get subjects
router.get('/meta/subjects', async (req, res) => {
  try {
    const subjects = await QuestionBank.findAll({
      attributes: [[fn('DISTINCT', col('subject')), 'subject']],
      raw: true
    });
    res.status(200).json(subjects.map(s => s.subject).filter(Boolean));
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch subjects', error: error.message });
  }
});

// Get tags
router.get('/meta/tags', async (req, res) => {
  try {
    const { sequelize } = await import('../config/MySQLConfig.js');
    const tagsQuery = `
      SELECT DISTINCT JSON_EXTRACT(tags, '$[*]') as tag
      FROM question_banks
      WHERE tags IS NOT NULL AND tags != '[]'
    `;
    const tags = await sequelize.query(tagsQuery, {
      type: sequelize.QueryTypes.SELECT
    });
    const uniqueTags = [...new Set(tags.flatMap(t => JSON.parse(t.tag || '[]')))];
    res.status(200).json(uniqueTags);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch tags', error: error.message });
  }
});

// Bulk import questions
router.post('/bulk-import', async (req, res) => {
  try {
    const { questions } = req.body;

    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ message: 'Invalid questions array' });
    }

    const questionsToInsert = questions.map(q => {
      const questionData = {
        ...q,
        createdBy: req.user.id
      };

      // Convert options
      if (questionData.options && typeof questionData.options === 'object') {
        questionData.optionA = questionData.options.A || '';
        questionData.optionB = questionData.options.B || '';
        questionData.optionC = questionData.options.C || '';
        questionData.optionD = questionData.options.D || '';
        delete questionData.options;
      }

      // Convert subOptions
      if (questionData.subOptions && typeof questionData.subOptions === 'object') {
        questionData.subOptionI = questionData.subOptions.i || '';
        questionData.subOptionIi = questionData.subOptions.ii || '';
        questionData.subOptionIii = questionData.subOptions.iii || '';
        questionData.subOptionIv = questionData.subOptions.iv || '';
        delete questionData.subOptions;
      }

      return questionData;
    });

    const result = await QuestionBank.bulkCreate(questionsToInsert);

    res.status(201).json({
      message: `${result.length} questions imported successfully`,
      count: result.length
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to import questions', error: error.message });
  }
});

export default router;

