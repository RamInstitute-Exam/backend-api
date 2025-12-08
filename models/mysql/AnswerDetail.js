import { DataTypes } from 'sequelize';
import { sequelize } from '../../config/MySQLConfig.js';
import StudentExamReport from './StudentExamReport.js';

const AnswerDetail = sequelize.define('AnswerDetail', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  reportId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'student_exam_reports',
      key: 'id'
    },
    field: 'report_id'
  },
  questionId: {
    type: DataTypes.STRING, // Can be string or integer depending on question ID format
    allowNull: true,
    field: 'question_id'
  },
  questionNumber: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'question_number'
  },
  selectedOption: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'selected_option'
  },
  correctOption: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'correct_option'
  },
  isCorrect: {
    type: DataTypes.BOOLEAN,
    allowNull: true,
    field: 'is_correct'
  },
  markedForReview: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'marked_for_review'
  }
}, {
  tableName: 'answer_details',
  timestamps: true
});

// Relationship
AnswerDetail.belongsTo(StudentExamReport, { foreignKey: 'reportId', as: 'report' });
StudentExamReport.hasMany(AnswerDetail, { foreignKey: 'reportId', as: 'answerDetails' });

export default AnswerDetail;

