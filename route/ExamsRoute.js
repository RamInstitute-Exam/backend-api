import express from 'express';
import { deleteExam, ExamReport, ExamsList, getAllExamReports, getAllStudentReports, getExamQuestionsByCodeAndBatch, getStudentExamReport, getStudentExamStatus, submitStudentExams, submittedStudentExam } from '../Controller/Exam/ExamControl.js';
import { scheduleExam, updateExamSchedule, activateExam, getExamSchedule } from '../Controller/Exam/ExamSchedulingControl.js';
import { authenticate, adminOnly, studentOnly, requirePermission } from '../middleware/RBAC.js';

const router = express.Router();



// router.post('/api/student-exams/submit', submittedStudentExam);    
router.get('/api/exam-report', ExamReport);        
router.get('/student/exam/:examCode/:batchName', getExamQuestionsByCodeAndBatch);         // 1. Controller: Get Exam Questions by examCode
// router.post('/studsubmit', submitedStudentExam);        
router.get('/student/exam-report/:examId/:studentId', getStudentExamReport);   
router.get('/student-exam-status/:studentId/:examCode', getStudentExamStatus);        
router.post('/exam-reports', getAllExamReports);        
router.post('/student/submit', submitStudentExams);    
router.get('/exams/list', ExamsList);    
router.get('/student/all-reports/:studentId', getAllStudentReports);    

router.delete('/exams/delete/:examCode', deleteExam);

// Public routes (no auth required)
router.get('/student/exam/:examCode/:batchName', getExamQuestionsByCodeAndBatch);
router.get('/exams/list', ExamsList);
router.get('/schedule/:batchName/:examCode', getExamSchedule);

// Student routes (require student authentication)
router.post('/student/submit', authenticate, studentOnly, submitStudentExams);
router.get('/student/exam-report/:examId/:studentId', authenticate, studentOnly, getStudentExamReport);
router.get('/student-exam-status/:studentId/:examCode', authenticate, studentOnly, getStudentExamStatus);
router.get('/student/all-reports/:studentId', authenticate, studentOnly, getAllStudentReports);
router.get('/api/exam-report', authenticate, studentOnly, ExamReport);

// Admin routes (require admin authentication and permissions)
router.delete('/exams/delete/:examCode', authenticate, adminOnly, requirePermission('manage_exams'), deleteExam);
router.post('/exam-reports', authenticate, adminOnly, requirePermission('view_reports'), getAllExamReports);

// Exam Scheduling Routes (Admin only)
router.post('/schedule/:batchName/:examCode', authenticate, adminOnly, requirePermission('manage_exams'), scheduleExam);
router.put('/schedule/:batchName/:examCode', authenticate, adminOnly, requirePermission('manage_exams'), updateExamSchedule);
router.put('/activate/:batchName/:examCode', authenticate, adminOnly, requirePermission('manage_exams'), activateExam);









export default router;
