import express from "express"
import { Student, Batch, Exam, StudentExamReport } from "../models/mysql/index.js";
import { sequelize } from "../config/MySQLConfig.js";
import {
  RegisterAdmin, 
  AdminReports, 
  ExamDelete, 
  ExamUpdate, 
  GetAllRequests, 
  getStudentExamStatusById,
  GetAllExamRequests,
  ApproveExamRequest,
  RejectExamRequest,
  PublishExam,
  UnpublishExam
} from "../Controller/Admin/AdminControl.js";
import { getStudentAccessList } from "../Controller/Batch/BatchControl.js";
import { authenticate, adminOnly, requirePermission } from "../middleware/RBAC.js";
import { Op } from "sequelize";


const router = express.Router();

// Public routes (no auth required)
router.post("/Register", RegisterAdmin);

// All other routes require admin authentication
router.use(authenticate);
router.use(adminOnly);

// Protected admin routes with permission checks
router.delete('/exam/delete', requirePermission('manage_exams'), ExamDelete);
router.put("/exams/update/:examCode", requirePermission('manage_exams'), ExamUpdate);
router.get("/GetALLRequests", requirePermission('manage_students'), GetAllRequests);
router.get("/exam-requests", requirePermission('manage_students'), GetAllExamRequests);
router.get("/admin/reports", requirePermission('view_reports'), AdminReports);
router.get('/student/:studentId/exam/status', requirePermission('view_reports'), getStudentExamStatusById);
router.get("/request-list", requirePermission('manage_students'), getStudentAccessList);
router.put("/exam-requests/:requestId/approve", requirePermission('manage_students'), ApproveExamRequest);
router.put("/exam-requests/:requestId/reject", requirePermission('manage_students'), RejectExamRequest);
router.put("/exams/publish", requirePermission('manage_exams'), PublishExam);
router.put("/exams/unpublish", requirePermission('manage_exams'), UnpublishExam);



// Dashboard endpoint
router.get('/dashboard', requirePermission('view_analytics'), async (req, res) => {
  try {
    const admin = req.user;
    res.json({
      message: 'Welcome to Admin Dashboard',
      user: {
        id: admin.id,
        email: admin.email,
        username: admin.username
      }
    });
  } catch (err) {
    console.error("Error fetching dashboard:", err);
    res.status(500).json({ message: 'Failed to fetch dashboard data' });
  }
});

router.get('/admin/statistics', requirePermission('view_analytics'), async (req, res) => {
  try {
    // Fetch total students
    const totalStudents = await Student.count();

    // Fetch total exams
    const totalExams = await Exam.count();

    // Fetch total completed and pending exams
    const totalCompletedExams = await StudentExamReport.count({ where: { status: 'completed' } });
    const totalPendingExams = await StudentExamReport.count({ where: { status: 'pending' } });

    // Fetch pass/fail data for exams using Sequelize
    const passFailData = await sequelize.query(`
      SELECT 
        SUM(CASE WHEN result >= 50 THEN 1 ELSE 0 END) as pass,
        SUM(CASE WHEN result < 50 THEN 1 ELSE 0 END) as fail
      FROM student_exam_reports
      WHERE status = 'completed'
    `, { type: sequelize.QueryTypes.SELECT });

    const passCount = passFailData[0]?.pass || 0;
    const failCount = passFailData[0]?.fail || 0;

    // Fetch student attendance using raw query (last 30 days)
    const studentAttendance = await sequelize.query(`
      SELECT 
        DATE(start_time) as date,
        COUNT(*) as attended
      FROM student_exam_reports
      WHERE start_time >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY DATE(start_time)
      ORDER BY date ASC
      LIMIT 30
    `, { type: sequelize.QueryTypes.SELECT });

    // Send response with all aggregated data
    res.json({
      totalStudents,
      totalExams,
      totalCompletedExams,
      totalPendingExams,
      passFailData: {
        pass: parseInt(passCount),
        fail: parseInt(failCount)
      },
      studentAttendance: studentAttendance.map(item => ({
        date: item.date,
        attended: parseInt(item.attended)
      }))
    });
  } catch (err) {
    console.error("Error fetching statistics:", err);
    res.status(500).json({ message: 'Failed to fetch statistics' });
  }
});

export default router;