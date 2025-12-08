import { DataTypes } from 'sequelize';
import { sequelize } from '../../config/MySQLConfig.js';
import Student from './Student.js';
import Exam from './Exam.js';

const StudentExamReport = sequelize.define('StudentExamReport', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  examId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'exams',
      key: 'id'
    },
    field: 'exam_id'
  },
  examCode: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'exam_code'
  },
  studentId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'students',
      key: 'id'
    },
    field: 'student_id'
  },
  totalQuestions: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'total_questions'
  },
  attemptedQuestions: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'attempted_questions'
  },
  unansweredQuestions: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'unanswered_questions'
  },
  correctAnswers: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'correct_answers'
  },
  wrongAnswers: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'wrong_answers'
  },
  reviewedQuestionsCount: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'reviewed_questions_count'
  },
  result: {
    type: DataTypes.FLOAT,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('pending', 'completed'),
    defaultValue: 'pending'
  },
  startTime: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'start_time'
  },
  endTime: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'end_time'
  },
  durationInMinutes: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'duration_in_minutes'
  },
  autoSubmitted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'auto_submitted'
  },
  attemptNumber: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    allowNull: false,
    field: 'attempt_number'
  },
  isBestAttempt: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_best_attempt'
  },
  tabSwitchCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'tab_switch_count'
  },
  suspiciousActivity: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'suspicious_activity'
  },
  activityLog: {
    type: DataTypes.JSON,
    allowNull: true,
    field: 'activity_log'
  },
  ipAddress: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'ip_address'
  },
  userAgent: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'user_agent'
  }
}, {
  tableName: 'student_exam_reports',
  timestamps: true
});

// Relationships
StudentExamReport.belongsTo(Student, { foreignKey: 'studentId', as: 'student' });
StudentExamReport.belongsTo(Exam, { foreignKey: 'examId', as: 'exam' });
Student.hasMany(StudentExamReport, { foreignKey: 'studentId', as: 'examReports' });
Exam.hasMany(StudentExamReport, { foreignKey: 'examId', as: 'reports' });

export default StudentExamReport;

