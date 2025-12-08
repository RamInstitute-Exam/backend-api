import express from 'express';
import { sequelize } from '../config/MySQLConfig.js';
import { Student, Exam, StudentExamReport, StudentBatchAccess, Batch } from '../models/mysql/index.js';
import { Op } from 'sequelize';

const router = express.Router();

// =====================================================
// GET DASHBOARD SUMMARY
// =====================================================
router.get('/summary/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    const student = await Student.findByPk(studentId);
    
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Get upcoming exams
    const upcomingExams = await Exam.findAll({
      where: {
        status: 'scheduled',
        scheduledStartDate: {
          [Op.gte]: new Date()
        }
      },
      order: [['scheduledStartDate', 'ASC']],
      limit: 5,
      include: [{
        model: Batch,
        as: 'batch',
        attributes: ['batchName']
      }]
    });

    // Get recent exam reports
    const recentReports = await StudentExamReport.findAll({
      where: { studentId },
      order: [['endTime', 'DESC']],
      limit: 5,
      include: [{
        model: Exam,
        as: 'exam',
        attributes: ['examName', 'examCode', 'category']
      }]
    });

    // Get exam statistics
    const totalExams = await StudentExamReport.count({
      where: { studentId, status: 'completed' }
    });

    const completedExams = await StudentExamReport.count({
      where: { 
        studentId, 
        status: 'completed',
        endTime: {
          [Op.gte]: new Date(new Date().setDate(new Date().getDate() - 30))
        }
      }
    });

    // Calculate average score
    const avgScoreResult = await StudentExamReport.findOne({
      where: { studentId, status: 'completed' },
      attributes: [
        [sequelize.fn('AVG', sequelize.col('result')), 'avgPercentage']
      ],
      raw: true
    });

    const avgScore = avgScoreResult?.avgPercentage || 0;

    // Get pending exam requests
    const pendingRequests = await StudentBatchAccess.count({
      where: {
        studentId,
        status: 'pending'
      }
    });

    res.json({
      student: {
        id: student.id,
        name: student.name,
        email: student.email,
        profilePhoto: student.profilePhoto
      },
      stats: {
        totalExams,
        completedExams,
        avgScore: parseFloat(avgScore).toFixed(2),
        pendingRequests
      },
      upcomingExams: upcomingExams.map(exam => ({
        id: exam.id,
        examCode: exam.examCode,
        examName: exam.examName,
        category: exam.category,
        scheduledStartDate: exam.scheduledStartDate,
        batchName: exam.batch?.batchName
      })),
      recentReports: recentReports.map(report => ({
        id: report.id,
        examName: report.exam?.examName,
        examCode: report.exam?.examCode,
        category: report.exam?.category,
        percentage: report.result,
        submittedAt: report.endTime
      }))
    });
  } catch (error) {
    console.error('Dashboard summary error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard summary' });
  }
});

// =====================================================
// GET ANALYTICS DATA
// =====================================================
router.get('/analytics/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    const { period = '30' } = req.query; // days
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period));

    // Get attempt history
    const attempts = await StudentExamReport.findAll({
      where: {
        studentId,
        status: 'completed',
        endTime: {
          [Op.gte]: startDate
        }
      },
      attributes: [
        'endTime',
        'result',
        'totalQuestions',
        'correctAnswers',
        'wrongAnswers'
      ],
      order: [['endTime', 'ASC']]
    });

    // Calculate accuracy
    const totalCorrect = attempts.reduce((sum, a) => sum + (a.correctAnswers || 0), 0);
    const totalAnswered = attempts.reduce((sum, a) => sum + ((a.correctAnswers || 0) + (a.wrongAnswers || 0)), 0);
    const accuracy = totalAnswered > 0 ? (totalCorrect / totalAnswered) * 100 : 0;

    // Calculate average time per question (mock data for now)
    const avgTimePerQuestion = 2.5; // minutes

    // Get topic-wise performance (mock for now, would need topic tracking)
    const topicPerformance = [
      { topic: 'Mathematics', correct: 45, wrong: 15, mastery: 75 },
      { topic: 'General Knowledge', correct: 60, wrong: 20, mastery: 75 },
      { topic: 'Reasoning', correct: 30, wrong: 10, mastery: 75 },
      { topic: 'English', correct: 25, wrong: 5, mastery: 83 }
    ];

    res.json({
      accuracy: parseFloat(accuracy.toFixed(2)),
      avgTimePerQuestion: avgTimePerQuestion,
      attemptHistory: attempts.map(a => ({
        date: a.endTime,
        score: a.result,
        marks: a.correctAnswers || 0,
        totalMarks: a.totalQuestions || 0
      })),
      topicPerformance,
      totalAttempts: attempts.length
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// =====================================================
// GET UPCOMING TESTS
// =====================================================
router.get('/upcoming-tests/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    
    // Get student's batch access (contains batch_name, not batch_id)
    const batchAccess = await StudentBatchAccess.findAll({
      where: {
        studentId,
        status: 'approved'
      },
      attributes: ['batchName']
    });

    // Get batch names from access records
    const batchNames = batchAccess.map(ba => ba.batchName);
    
    // Find batches by name to get their IDs
    const batches = await Batch.findAll({
      where: {
        batchName: {
          [Op.in]: batchNames
        }
      },
      attributes: ['id']
    });

    const batchIds = batches.map(b => b.id);

    const upcomingTests = await Exam.findAll({
      where: {
        status: {
          [Op.in]: ['scheduled', 'active']
        },
        scheduledStartDate: {
          [Op.gte]: new Date()
        },
        batchId: {
          [Op.in]: batchIds
        }
      },
      order: [['scheduledStartDate', 'ASC']],
      limit: 10,
      include: [{
        model: Batch,
        as: 'batch',
        attributes: ['batchName']
      }]
    });

    res.json(upcomingTests.map(test => ({
      id: test.id,
      examCode: test.examCode,
      examName: test.examName,
      category: test.category,
      duration: test.duration,
      scheduledStartDate: test.scheduledStartDate,
      batchName: test.batch?.batchName
    })));
  } catch (error) {
    console.error('Upcoming tests error:', error);
    res.status(500).json({ error: 'Failed to fetch upcoming tests' });
  }
});

export default router;

