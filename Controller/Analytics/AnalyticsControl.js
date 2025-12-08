import { StudentExamReport, Student, Exam, AnswerDetail, QuestionBank } from '../../models/mysql/index.js';
import { sequelize } from '../../config/MySQLConfig.js';
import { Op, fn, col, literal } from 'sequelize';

// Get comprehensive analytics dashboard data
export const getDashboardAnalytics = async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      examCode,
      batchName,
      studentId
    } = req.query;

    const whereClause = {};
    if (startDate || endDate) {
      whereClause.startTime = {};
      if (startDate) whereClause.startTime[Op.gte] = new Date(startDate);
      if (endDate) whereClause.startTime[Op.lte] = new Date(endDate);
    }

    if (examCode) whereClause.examCode = examCode;
    if (studentId) whereClause.studentId = parseInt(studentId);

    // Overall Statistics
    const totalStudents = await Student.count();
    const totalExams = await Exam.count();

    const totalAttempts = await StudentExamReport.count({
      where: whereClause
    });

    const completedExams = await StudentExamReport.count({
      where: {
        ...whereClause,
        status: 'completed'
      }
    });

    // Performance Metrics using raw query
    const performanceStatsQuery = `
      SELECT 
        AVG(result) as avgScore,
        MAX(result) as maxScore,
        MIN(result) as minScore,
        COUNT(*) as totalAttempts,
        AVG(duration_in_minutes) as avgTime
      FROM student_exam_reports
      WHERE status = 'completed'
      ${startDate ? `AND start_time >= '${startDate}'` : ''}
      ${endDate ? `AND start_time <= '${endDate}'` : ''}
      ${examCode ? `AND exam_code = '${examCode}'` : ''}
      ${studentId ? `AND student_id = ${parseInt(studentId)}` : ''}
    `;
    
    const performanceStats = await sequelize.query(performanceStatsQuery, {
      type: sequelize.QueryTypes.SELECT
    });

    // Pass/Fail Analysis
    const passFailQuery = `
      SELECT 
        SUM(CASE WHEN result >= 50 THEN 1 ELSE 0 END) as pass,
        SUM(CASE WHEN result < 50 THEN 1 ELSE 0 END) as fail
      FROM student_exam_reports
      WHERE status = 'completed'
      ${startDate ? `AND start_time >= '${startDate}'` : ''}
      ${endDate ? `AND start_time <= '${endDate}'` : ''}
      ${examCode ? `AND exam_code = '${examCode}'` : ''}
      ${studentId ? `AND student_id = ${parseInt(studentId)}` : ''}
    `;
    
    const passFailStats = await sequelize.query(passFailQuery, {
      type: sequelize.QueryTypes.SELECT
    });

    // Exam-wise Performance
    const examPerformanceQuery = `
      SELECT 
        exam_code as examCode,
        AVG(result) as avgScore,
        COUNT(*) as totalAttempts,
        SUM(CASE WHEN result >= 50 THEN 1 ELSE 0 END) as passCount,
        SUM(CASE WHEN result < 50 THEN 1 ELSE 0 END) as failCount
      FROM student_exam_reports
      WHERE status = 'completed'
      ${startDate ? `AND start_time >= '${startDate}'` : ''}
      ${endDate ? `AND start_time <= '${endDate}'` : ''}
      ${examCode ? `AND exam_code = '${examCode}'` : ''}
      ${studentId ? `AND student_id = ${parseInt(studentId)}` : ''}
      GROUP BY exam_code
      ORDER BY avgScore DESC
      LIMIT 10
    `;
    
    const examPerformance = await sequelize.query(examPerformanceQuery, {
      type: sequelize.QueryTypes.SELECT
    });

    // Student Performance Ranking
    const studentRanking = await StudentExamReport.findAll({
      where: {
        ...whereClause,
        status: 'completed'
      },
      attributes: [
        'studentId',
        [fn('AVG', col('result')), 'avgScore'],
        [fn('COUNT', col('StudentExamReport.id')), 'totalExams'],
        [fn('MAX', col('result')), 'bestScore'],
        [fn('SUM', col('correct_answers')), 'totalCorrect'],
        [fn('SUM', col('wrong_answers')), 'totalWrong']
      ],
      include: [{
        model: Student,
        as: 'student',
        attributes: ['id', 'name', 'email']
      }],
      group: ['studentId', 'student.id'],
      order: [[fn('AVG', col('result')), 'DESC']],
      limit: 20,
      raw: false
    });

    // Format the results
    const formattedRanking = studentRanking.map(item => ({
      studentName: item.student?.name || 'N/A',
      studentEmail: item.student?.email || 'N/A',
      avgScore: parseFloat(item.dataValues?.avgScore || 0).toFixed(2),
      totalExams: parseInt(item.dataValues?.totalExams || 0),
      bestScore: parseFloat(item.dataValues?.bestScore || 0),
      totalCorrect: parseInt(item.dataValues?.totalCorrect || 0),
      totalWrong: parseInt(item.dataValues?.totalWrong || 0)
    }));

    // Daily Activity
    const dailyActivityQuery = `
      SELECT 
        DATE(start_time) as date,
        COUNT(*) as attempts,
        AVG(result) as avgScore
      FROM student_exam_reports
      WHERE status = 'completed'
      ${startDate ? `AND start_time >= '${startDate}'` : ''}
      ${endDate ? `AND start_time <= '${endDate}'` : ''}
      ${examCode ? `AND exam_code = '${examCode}'` : ''}
      ${studentId ? `AND student_id = ${parseInt(studentId)}` : ''}
      GROUP BY DATE(start_time)
      ORDER BY date ASC
    `;
    
    const dailyActivity = await sequelize.query(dailyActivityQuery, {
      type: sequelize.QueryTypes.SELECT
    });

    // Question Difficulty Analysis
    const questionDifficultyQuery = `
      SELECT 
        is_correct as isCorrect,
        COUNT(*) as count
      FROM answer_details
      INNER JOIN student_exam_reports ON answer_details.report_id = student_exam_reports.id
      WHERE student_exam_reports.status = 'completed'
      ${startDate ? `AND student_exam_reports.start_time >= '${startDate}'` : ''}
      ${endDate ? `AND student_exam_reports.start_time <= '${endDate}'` : ''}
      ${examCode ? `AND student_exam_reports.exam_code = '${examCode}'` : ''}
      ${studentId ? `AND student_exam_reports.student_id = ${parseInt(studentId)}` : ''}
      GROUP BY is_correct
    `;
    
    const questionDifficulty = await sequelize.query(questionDifficultyQuery, {
      type: sequelize.QueryTypes.SELECT
    });

    res.status(200).json({
      overall: {
        totalStudents,
        totalExams,
        totalAttempts,
        completedExams
      },
      performance: performanceStats[0] || {
        avgScore: 0,
        maxScore: 0,
        minScore: 0,
        totalAttempts: 0,
        avgTime: 0
      },
      passFail: {
        pass: parseInt(passFailStats[0]?.pass || 0),
        fail: parseInt(passFailStats[0]?.fail || 0)
      },
      examPerformance,
      studentRanking: formattedRanking,
      dailyActivity,
      questionDifficulty
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ message: 'Failed to fetch analytics', error: error.message });
  }
};

// Get exam-specific analytics
export const getExamAnalytics = async (req, res) => {
  try {
    const { examCode } = req.params;

    const examStatsQuery = `
      SELECT 
        COUNT(*) as totalAttempts,
        AVG(result) as avgScore,
        MAX(result) as maxScore,
        MIN(result) as minScore,
        AVG(duration_in_minutes) as avgTime,
        SUM(correct_answers) as totalCorrect,
        SUM(wrong_answers) as totalWrong,
        SUM(unanswered_questions) as totalUnanswered
      FROM student_exam_reports
      WHERE exam_code = '${examCode}' AND status = 'completed'
    `;
    
    const examStats = await sequelize.query(examStatsQuery, {
      type: sequelize.QueryTypes.SELECT
    });

    // Score Distribution
    const scoreDistributionQuery = `
      SELECT 
        CASE 
          WHEN result >= 0 AND result < 25 THEN '0-25'
          WHEN result >= 25 AND result < 50 THEN '25-50'
          WHEN result >= 50 AND result < 75 THEN '50-75'
          WHEN result >= 75 AND result <= 100 THEN '75-100'
          ELSE 'Other'
        END as range,
        COUNT(*) as count
      FROM student_exam_reports
      WHERE exam_code = '${examCode}' AND status = 'completed'
      GROUP BY range
      ORDER BY range
    `;
    
    const scoreDistribution = await sequelize.query(scoreDistributionQuery, {
      type: sequelize.QueryTypes.SELECT
    });

    // Question-wise Performance
    const questionPerformanceQuery = `
      SELECT 
        answer_details.question_id as questionId,
        COUNT(*) as totalAttempts,
        SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) as correctAttempts,
        SUM(CASE WHEN is_correct = 0 THEN 1 ELSE 0 END) as wrongAttempts,
        ROUND((SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) / COUNT(*)) * 100, 2) as successRate
      FROM answer_details
      INNER JOIN student_exam_reports ON answer_details.report_id = student_exam_reports.id
      WHERE student_exam_reports.exam_code = '${examCode}' 
        AND student_exam_reports.status = 'completed'
      GROUP BY answer_details.question_id
      ORDER BY successRate ASC
    `;
    
    const questionPerformance = await sequelize.query(questionPerformanceQuery, {
      type: sequelize.QueryTypes.SELECT
    });

    res.status(200).json({
      examStats: examStats[0] || {},
      scoreDistribution,
      questionPerformance: questionPerformance.map(qp => ({
        questionId: qp.questionId,
        totalAttempts: parseInt(qp.totalAttempts),
        correctAttempts: parseInt(qp.correctAttempts),
        wrongAttempts: parseInt(qp.wrongAttempts),
        successRate: parseFloat(qp.successRate)
      }))
    });
  } catch (error) {
    console.error('Error fetching exam analytics:', error);
    res.status(500).json({ message: 'Failed to fetch exam analytics', error: error.message });
  }
};

// Get student performance analytics
export const getStudentAnalytics = async (req, res) => {
  try {
    const { studentId } = req.params;
    const studentIdInt = parseInt(studentId);

    const studentStatsQuery = `
      SELECT 
        COUNT(*) as totalExams,
        AVG(result) as avgScore,
        MAX(result) as bestScore,
        MIN(result) as worstScore,
        SUM(correct_answers) as totalCorrect,
        SUM(wrong_answers) as totalWrong,
        SUM(unanswered_questions) as totalUnanswered,
        AVG(duration_in_minutes) as avgTime
      FROM student_exam_reports
      WHERE student_id = ${studentIdInt} AND status = 'completed'
    `;
    
    const studentStats = await sequelize.query(studentStatsQuery, {
      type: sequelize.QueryTypes.SELECT
    });

    // Performance Over Time
    const performanceOverTimeQuery = `
      SELECT 
        DATE(start_time) as date,
        AVG(result) as avgScore,
        COUNT(*) as examCount
      FROM student_exam_reports
      WHERE student_id = ${studentIdInt} AND status = 'completed'
      GROUP BY DATE(start_time)
      ORDER BY date ASC
    `;
    
    const performanceOverTime = await sequelize.query(performanceOverTimeQuery, {
      type: sequelize.QueryTypes.SELECT
    });

    // Exam-wise Performance
    const examPerformanceQuery = `
      SELECT 
        exam_code as examCode,
        COUNT(*) as attempts,
        MAX(result) as bestScore,
        AVG(result) as avgScore
      FROM student_exam_reports
      WHERE student_id = ${studentIdInt} AND status = 'completed'
      GROUP BY exam_code
      ORDER BY bestScore DESC
    `;
    
    const examPerformanceRaw = await sequelize.query(examPerformanceQuery, {
      type: sequelize.QueryTypes.SELECT
    });

    // Get latest score for each exam
    const examPerformance = await Promise.all(
      examPerformanceRaw.map(async (exam) => {
        const latestReport = await StudentExamReport.findOne({
          where: {
            studentId: studentIdInt,
            examCode: exam.examCode,
            status: 'completed'
          },
          order: [['createdAt', 'DESC']],
          attributes: ['result']
        });

        return {
          examCode: exam.examCode,
          attempts: parseInt(exam.attempts),
          bestScore: parseFloat(exam.bestScore),
          latestScore: latestReport ? parseFloat(latestReport.result) : 0,
          avgScore: parseFloat(exam.avgScore)
        };
      })
    );

    res.status(200).json({
      studentStats: studentStats[0] ? {
        totalExams: parseInt(studentStats[0].totalExams),
        avgScore: parseFloat(studentStats[0].avgScore),
        bestScore: parseFloat(studentStats[0].bestScore),
        worstScore: parseFloat(studentStats[0].worstScore),
        totalCorrect: parseInt(studentStats[0].totalCorrect),
        totalWrong: parseInt(studentStats[0].totalWrong),
        totalUnanswered: parseInt(studentStats[0].totalUnanswered),
        avgTime: parseFloat(studentStats[0].avgTime)
      } : {},
      performanceOverTime: performanceOverTime.map(pot => ({
        date: pot.date,
        avgScore: parseFloat(pot.avgScore),
        examCount: parseInt(pot.examCount)
      })),
      examPerformance
    });
  } catch (error) {
    console.error('Error fetching student analytics:', error);
    res.status(500).json({ message: 'Failed to fetch student analytics', error: error.message });
  }
};

// Export analytics data
export const exportAnalytics = async (req, res) => {
  try {
    const { format = 'json', type = 'dashboard' } = req.query;

    let data;
    if (type === 'dashboard') {
      const result = await getDashboardAnalytics(req, res);
      data = result;
    } else if (type === 'exam') {
      const result = await getExamAnalytics(req, res);
      data = result;
    }

    if (format === 'csv') {
      // TODO: Convert to CSV format
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=analytics.csv');
      // Return CSV data
    } else {
      res.status(200).json(data);
    }
  } catch (error) {
    console.error('Error exporting analytics:', error);
    res.status(500).json({ message: 'Failed to export analytics', error: error.message });
  }
};

