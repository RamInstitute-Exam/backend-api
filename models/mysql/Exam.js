import { DataTypes } from 'sequelize';
import { sequelize } from '../../config/MySQLConfig.js';
import Batch from './Batch.js';

const Exam = sequelize.define('Exam', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  batchId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'batches',
      key: 'id'
    },
    field: 'batch_id'
  },
  examCode: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    field: 'exam_code'
  },
  examName: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'exam_name'
  },
  examDescription: {
    type: DataTypes.TEXT,
    defaultValue: '',
    field: 'exam_description'
  },
  category: {
    type: DataTypes.STRING,
    defaultValue: ''
  },
  year: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  month: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  duration: {
    type: DataTypes.INTEGER,
    allowNull: true
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
  // Exam Scheduling Fields
  scheduledStartDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'scheduled_start_date'
  },
  scheduledEndDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'scheduled_end_date'
  },
  isScheduled: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_scheduled'
  },
  timezone: {
    type: DataTypes.STRING,
    defaultValue: 'Asia/Kolkata'
  },
  allowLateSubmission: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'allow_late_submission'
  },
  lateSubmissionMinutes: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'late_submission_minutes'
  },
  // Exam Status
  status: {
    type: DataTypes.ENUM('draft', 'scheduled', 'active', 'completed', 'cancelled'),
    defaultValue: 'draft'
  },
  // Multiple Attempts
  maxAttempts: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    field: 'max_attempts'
  },
  allowMultipleAttempts: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'allow_multiple_attempts'
  },
  // Security Settings
  randomizeQuestions: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'randomize_questions'
  },
  randomizeOptions: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'randomize_options'
  },
  preventTabSwitch: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'prevent_tab_switch'
  },
  preventCopyPaste: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'prevent_copy_paste'
  },
  preventScreenshot: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'prevent_screenshot'
  }
}, {
  tableName: 'exams',
  timestamps: true
});

// Relationships
Exam.belongsTo(Batch, { foreignKey: 'batchId', as: 'batch' });
Batch.hasMany(Exam, { foreignKey: 'batchId', as: 'exams' });

export default Exam;

