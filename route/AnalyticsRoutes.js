import express from 'express';
import { sequelize } from '../config/MySQLConfig.js';
import { Op } from 'sequelize';
import { getDashboardAnalytics } from '../Controller/Analytics/AnalyticsControl.js';
import { authenticate, adminOnly, requirePermission } from '../middleware/RBAC.js';

const router = express.Router();

// =====================================================
// GET COMPREHENSIVE ANALYTICS
// =====================================================
router.get('/comprehensive/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    const { period = '30' } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period));

    // Get test attempts
    const [testAttempts] = await sequelize.query(`
      SELECT 
        DATE(ta.submitted_at) as date,
        COUNT(*) as tests_taken,
        AVG(ta.percentage) as avg_score,
        AVG(ta.time_taken_minutes) as avg_time,
        SUM(ta.correct_count) as total_correct,
        SUM(ta.wrong_count) as total_wrong,
        SUM(ta.skipped_count) as total_skipped
      FROM test_attempts ta
      WHERE ta.student_id = :studentId
        AND ta.status = 'completed'
        AND ta.submitted_at >= :startDate
      GROUP BY DATE(ta.submitted_at)
      ORDER BY date ASC
    `, {
      replacements: {
        studentId,
        startDate: startDate.toISOString().split('T')[0]
      }
    });

    // Get practice attempts
    const [practiceAttempts] = await sequelize.query(`
      SELECT 
        DATE(pa.practice_date) as date,
        COUNT(*) as questions_answered,
        SUM(CASE WHEN pa.is_correct = 1 THEN 1 ELSE 0 END) as correct,
        SUM(CASE WHEN pa.is_correct = 0 THEN 1 ELSE 0 END) as wrong,
        AVG(pa.time_taken_seconds) as avg_time
      FROM practice_attempts pa
      WHERE pa.student_id = :studentId
        AND pa.practice_date >= :startDate
      GROUP BY DATE(pa.practice_date)
      ORDER BY date ASC
    `, {
      replacements: {
        studentId,
        startDate: startDate.toISOString().split('T')[0]
      }
    });

    // Get topic-wise performance
    const [topicPerformance] = await sequelize.query(`
      SELECT 
        topic_name,
        total_questions,
        correct_answers,
        wrong_answers,
        mastery_percentage,
        last_practiced_at
      FROM topic_mastery
      WHERE student_id = :studentId
      ORDER BY mastery_percentage ASC, total_questions DESC
      LIMIT 20
    `, {
      replacements: { studentId }
    });

    // Get overall statistics
    const [overallStats] = await sequelize.query(`
      SELECT 
        (SELECT COUNT(*) FROM test_attempts WHERE student_id = :studentId AND status = 'completed') as total_tests,
        (SELECT AVG(percentage) FROM test_attempts WHERE student_id = :studentId AND status = 'completed') as avg_test_score,
        (SELECT COUNT(*) FROM practice_attempts WHERE student_id = :studentId) as total_practice_questions,
        (SELECT AVG(CASE WHEN is_correct = 1 THEN 100 ELSE 0 END) FROM practice_attempts WHERE student_id = :studentId) as practice_accuracy,
        (SELECT COUNT(DISTINCT DATE(practice_date)) FROM practice_attempts WHERE student_id = :studentId) as days_practiced
    `, {
      replacements: { studentId }
    });

    // Get improvement trend
    const [improvementTrend] = await sequelize.query(`
      SELECT 
        DATE(ta.submitted_at) as date,
        ta.percentage as score,
        ta.obtained_marks,
        ta.total_marks
      FROM test_attempts ta
      WHERE ta.student_id = :studentId
        AND ta.status = 'completed'
        AND ta.submitted_at >= :startDate
      ORDER BY ta.submitted_at ASC
    `, {
      replacements: {
        studentId,
        startDate: startDate.toISOString().split('T')[0]
      }
    });

    res.json({
      period: parseInt(period),
      overallStats: overallStats[0] || {},
      testAttempts,
      practiceAttempts,
      topicPerformance,
      improvementTrend,
      summary: {
        totalTests: overallStats[0]?.total_tests || 0,
        avgTestScore: parseFloat(overallStats[0]?.avg_test_score || 0).toFixed(2),
        totalPracticeQuestions: overallStats[0]?.total_practice_questions || 0,
        practiceAccuracy: parseFloat(overallStats[0]?.practice_accuracy || 0).toFixed(2),
        daysPracticed: overallStats[0]?.days_practiced || 0
      }
    });
  } catch (error) {
    console.error('Comprehensive analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch comprehensive analytics' });
  }
});

// =====================================================
// GET WEAK VS STRONG TOPICS
// =====================================================
router.get('/topics/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;

    const [topics] = await sequelize.query(`
      SELECT 
        topic_name,
        total_questions,
        correct_answers,
        wrong_answers,
        mastery_percentage,
        last_practiced_at
      FROM topic_mastery
      WHERE student_id = :studentId
      ORDER BY mastery_percentage ASC
    `, {
      replacements: { studentId }
    });

    const weakTopics = topics.filter(t => t.mastery_percentage < 50);
    const strongTopics = topics.filter(t => t.mastery_percentage >= 70);
    const averageTopics = topics.filter(t => t.mastery_percentage >= 50 && t.mastery_percentage < 70);

    res.json({
      weak: weakTopics,
      average: averageTopics,
      strong: strongTopics,
      all: topics
    });
  } catch (error) {
    console.error('Topics analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch topic analytics' });
  }
});

// =====================================================
// GET COMPARATIVE ANALYTICS
// =====================================================
router.get('/comparative/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;

    // Get student's average
    const [studentStats] = await sequelize.query(`
      SELECT 
        AVG(percentage) as avg_score,
        AVG(time_taken_minutes) as avg_time,
        COUNT(*) as total_tests
      FROM test_attempts
      WHERE student_id = :studentId
        AND status = 'completed'
    `, {
      replacements: { studentId }
    });

    // Get overall average (all students)
    const [overallStats] = await sequelize.query(`
      SELECT 
        AVG(percentage) as avg_score,
        AVG(time_taken_minutes) as avg_time,
        COUNT(*) as total_tests
      FROM test_attempts
      WHERE status = 'completed'
    `);

    // Get rank (mock calculation - would need proper ranking logic)
    const [rankData] = await sequelize.query(`
      SELECT 
        COUNT(DISTINCT student_id) + 1 as \`rank\`,
        COUNT(*) as total_students
      FROM test_attempts
      WHERE status = 'completed'
        AND student_id != :studentId
        AND (
          SELECT AVG(percentage) 
          FROM test_attempts 
          WHERE student_id = test_attempts.student_id 
          AND status = 'completed'
        ) > (
          SELECT AVG(percentage) 
          FROM test_attempts 
          WHERE student_id = :studentId 
          AND status = 'completed'
        )
    `, {
      replacements: { studentId }
    });

    res.json({
      student: {
        avgScore: parseFloat(studentStats[0]?.avg_score || 0).toFixed(2),
        avgTime: parseFloat(studentStats[0]?.avg_time || 0).toFixed(2),
        totalTests: studentStats[0]?.total_tests || 0
      },
      overall: {
        avgScore: parseFloat(overallStats[0]?.avg_score || 0).toFixed(2),
        avgTime: parseFloat(overallStats[0]?.avg_time || 0).toFixed(2),
        totalTests: overallStats[0]?.total_tests || 0
      },
      rank: {
        position: rankData[0]?.rank || 0,
        totalStudents: rankData[0]?.total_students || 0
      }
    });
  } catch (error) {
    console.error('Comparative analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch comparative analytics' });
  }
});

// =====================================================
// GET TIME-BASED ANALYTICS
// =====================================================
router.get('/time-based/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    const { period = '30' } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period));

    // Daily activity
    const [dailyActivity] = await sequelize.query(`
      SELECT 
        DATE(combined.date) as date,
        COUNT(DISTINCT ta.id) as tests_taken,
        COUNT(DISTINCT pa.id) as practice_questions,
        SUM(COALESCE(ta.time_taken_minutes, 0) + COALESCE(pa.time_taken_seconds / 60, 0)) as total_study_time
      FROM (
        SELECT submitted_at as date, id, time_taken_minutes, 0 as practice_time
        FROM test_attempts
        WHERE student_id = :studentId AND submitted_at >= :startDate
        UNION ALL
        SELECT practice_date as date, NULL as id, 0 as time_taken_minutes, time_taken_seconds / 60 as practice_time
        FROM practice_attempts
        WHERE student_id = :studentId AND practice_date >= :startDate
      ) combined
      LEFT JOIN test_attempts ta ON DATE(ta.submitted_at) = DATE(combined.date) AND ta.student_id = :studentId
      LEFT JOIN practice_attempts pa ON DATE(pa.practice_date) = DATE(combined.date) AND pa.student_id = :studentId
      GROUP BY DATE(combined.date)
      ORDER BY date ASC
    `, {
      replacements: {
        studentId,
        startDate: startDate.toISOString().split('T')[0]
      }
    });

    res.json({
      period: parseInt(period),
      dailyActivity
    });
  } catch (error) {
    console.error('Time-based analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch time-based analytics' });
  }
});

// =====================================================
// GET DASHBOARD ANALYTICS (Admin)
// =====================================================
router.get('/dashboard', authenticate, adminOnly, requirePermission('view_analytics'), getDashboardAnalytics);

export default router;
