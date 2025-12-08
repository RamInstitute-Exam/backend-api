import { DataTypes } from 'sequelize';
import { sequelize } from '../../config/MySQLConfig.js';
import Admin from './Admin.js';

const QuestionBank = sequelize.define('QuestionBank', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  questionNumber: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'question_number'
  },
  questionTextEnglish: {
    type: DataTypes.TEXT,
    allowNull: false,
    field: 'question_text_english'
  },
  questionTextTamil: {
    type: DataTypes.TEXT,
    defaultValue: '',
    field: 'question_text_tamil'
  },
  optionA: {
    type: DataTypes.TEXT,
    defaultValue: '',
    field: 'option_a'
  },
  optionB: {
    type: DataTypes.TEXT,
    defaultValue: '',
    field: 'option_b'
  },
  optionC: {
    type: DataTypes.TEXT,
    defaultValue: '',
    field: 'option_c'
  },
  optionD: {
    type: DataTypes.TEXT,
    defaultValue: '',
    field: 'option_d'
  },
  subOptionI: {
    type: DataTypes.TEXT,
    defaultValue: '',
    field: 'sub_option_i'
  },
  subOptionIi: {
    type: DataTypes.TEXT,
    defaultValue: '',
    field: 'sub_option_ii'
  },
  subOptionIii: {
    type: DataTypes.TEXT,
    defaultValue: '',
    field: 'sub_option_iii'
  },
  subOptionIv: {
    type: DataTypes.TEXT,
    defaultValue: '',
    field: 'sub_option_iv'
  },
  correctOption: {
    type: DataTypes.ENUM('A', 'B', 'C', 'D', 'NA'),
    allowNull: false,
    field: 'correct_option'
  },
  questionType: {
    type: DataTypes.ENUM('mcq', 'assertion-reason', 'assertion', 'match', 'formula', 'passage', 'statement', 'image'),
    defaultValue: 'mcq',
    field: 'question_type'
  },
  explanation: {
    type: DataTypes.TEXT,
    defaultValue: ''
  },
  difficulty: {
    type: DataTypes.ENUM('easy', 'medium', 'hard'),
    defaultValue: 'medium'
  },
  imageUrl: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'image_url'
  },
  passage: {
    type: DataTypes.TEXT,
    defaultValue: ''
  },
  passageTamil: {
    type: DataTypes.TEXT,
    defaultValue: '',
    field: 'passage_tamil'
  },
  category: {
    type: DataTypes.STRING,
    allowNull: false
  },
  subject: {
    type: DataTypes.STRING,
    defaultValue: ''
  },
  tags: {
    type: DataTypes.JSON,
    defaultValue: []
  },
  topic: {
    type: DataTypes.STRING,
    defaultValue: ''
  },
  usageCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'usage_count'
  },
  lastUsedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'last_used_at'
  },
  averageTimeSpent: {
    type: DataTypes.FLOAT,
    defaultValue: 0,
    field: 'average_time_spent'
  },
  correctAttempts: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'correct_attempts'
  },
  totalAttempts: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'total_attempts'
  },
  createdBy: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'admins',
      key: 'id'
    },
    field: 'created_by'
  },
  status: {
    type: DataTypes.ENUM('draft', 'active', 'archived'),
    defaultValue: 'active'
  },
  version: {
    type: DataTypes.INTEGER,
    defaultValue: 1
  },
  previousVersionId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'question_banks',
      key: 'id'
    },
    field: 'previous_version_id'
  },
  notes: {
    type: DataTypes.TEXT,
    defaultValue: ''
  }
}, {
  tableName: 'question_banks',
  timestamps: true,
  indexes: [
    { fields: ['category', 'subject', 'difficulty'] },
    { fields: ['status', 'created_at'] }
  ]
});

// Relationships
QuestionBank.belongsTo(Admin, { foreignKey: 'createdBy', as: 'creator' });
QuestionBank.belongsTo(QuestionBank, { foreignKey: 'previousVersionId', as: 'previousVersion' });

export default QuestionBank;

