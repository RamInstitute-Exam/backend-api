import express from 'express';
import { sequelize } from '../config/MySQLConfig.js';
import { Op } from 'sequelize';

const router = express.Router();

// Mock data structure - replace with actual models when created
// For now, using raw queries to work with the extended schema

// =====================================================
// GET ALL TEST SERIES
// =====================================================
router.get('/', async (req, res) => {
  try {
    const { category, search, page = 1, limit = 20, showAll } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    // For admin view, show all test series (active and inactive)
    // For student view, only show active ones
    const isActiveFilter = showAll === 'true' ? '' : 'ts.is_active = 1 AND';
    const whereClause = isActiveFilter ? `${isActiveFilter}` : '';
    const categoryFilter = category ? `AND ts.category_id = ${parseInt(category)}` : '';
    const searchFilter = search ? `AND (ts.title LIKE '%${search.replace(/'/g, "''")}%' OR ts.description LIKE '%${search.replace(/'/g, "''")}%')` : '';

    // Check if tables exist first
    try {
      await sequelize.query('SELECT 1 FROM test_series LIMIT 1');
    } catch (tableError) {
      // Table doesn't exist yet - return empty result
      return res.json({
        data: [],
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: 0,
          totalPages: 0
        }
      });
    }

    // This is a placeholder - implement with actual models
    const [results] = await sequelize.query(`
      SELECT 
        ts.*,
        ec.name as category_name,
        ec.slug as category_slug,
        COUNT(DISTINCT mt.id) as total_tests
      FROM test_series ts
      LEFT JOIN exam_categories ec ON ts.category_id = ec.id
      LEFT JOIN mock_tests mt ON mt.test_series_id = ts.id
      WHERE ${whereClause} 1=1
        ${categoryFilter}
        ${searchFilter}
      GROUP BY ts.id
      ORDER BY ts.display_order ASC, ts.created_at DESC
      LIMIT ${parseInt(limit)} OFFSET ${offset}
    `);

    const [countResult] = await sequelize.query(`
      SELECT COUNT(DISTINCT ts.id) as total
      FROM test_series ts
      WHERE ${whereClause} 1=1
        ${categoryFilter}
        ${searchFilter}
    `);

    res.json({
      data: results || [],
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: countResult[0]?.total || 0,
        totalPages: Math.ceil((countResult[0]?.total || 0) / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Test series error:', error);
    res.status(500).json({ error: 'Failed to fetch test series', details: error.message });
  }
});

// =====================================================
// GET TEST SERIES BY ID
// =====================================================
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [results] = await sequelize.query(`
      SELECT 
        ts.*,
        ec.name as category_name,
        ec.slug as category_slug
      FROM test_series ts
      LEFT JOIN exam_categories ec ON ts.category_id = ec.id
      WHERE ts.id = ${id} AND ts.is_active = 1
    `);

    if (results.length === 0) {
      return res.status(404).json({ error: 'Test series not found' });
    }

    // Get mock tests in this series
    const [mockTests] = await sequelize.query(`
      SELECT 
        id, exam_code, title, description, duration_minutes, 
        total_questions, is_active, scheduled_start_date
      FROM mock_tests
      WHERE test_series_id = ${id} AND is_active = 1
      ORDER BY created_at ASC
    `);

    res.json({
      ...results[0],
      mockTests
    });
  } catch (error) {
    console.error('Test series detail error:', error);
    res.status(500).json({ error: 'Failed to fetch test series' });
  }
});

// =====================================================
// GET MOCK TESTS
// =====================================================
router.get('/mock-tests/list', async (req, res) => {
  try {
    const { category, search, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const [results] = await sequelize.query(`
      SELECT 
        mt.*,
        ts.title as test_series_title,
        ec.name as category_name
      FROM mock_tests mt
      LEFT JOIN test_series ts ON mt.test_series_id = ts.id
      LEFT JOIN exam_categories ec ON ts.category_id = ec.id
      WHERE mt.is_active = 1
        ${category ? `AND ts.category_id = ${category}` : ''}
        ${search ? `AND (mt.title LIKE '%${search}%' OR mt.description LIKE '%${search}%')` : ''}
      ORDER BY mt.created_at DESC
      LIMIT ${parseInt(limit)} OFFSET ${offset}
    `);

    const [countResult] = await sequelize.query(`
      SELECT COUNT(*) as total
      FROM mock_tests mt
      LEFT JOIN test_series ts ON mt.test_series_id = ts.id
      WHERE mt.is_active = 1
        ${category ? `AND ts.category_id = ${category}` : ''}
        ${search ? `AND (mt.title LIKE '%${search}%' OR mt.description LIKE '%${search}%')` : ''}
    `);

    res.json({
      data: results,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: countResult[0]?.total || 0,
        totalPages: Math.ceil((countResult[0]?.total || 0) / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Mock tests error:', error);
    res.status(500).json({ error: 'Failed to fetch mock tests' });
  }
});

// =====================================================
// GET EXAM CATEGORIES
// =====================================================
router.get('/categories/list', async (req, res) => {
  try {
    const [results] = await sequelize.query(`
      SELECT * FROM exam_categories
      WHERE is_active = 1
      ORDER BY display_order ASC, name ASC
    `);

    res.json(results);
  } catch (error) {
    console.error('Categories error:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

export default router;

