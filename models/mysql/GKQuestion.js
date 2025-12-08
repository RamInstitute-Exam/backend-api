import { DataTypes } from 'sequelize';
import { sequelize } from '../../config/MySQLConfig.js';
import Exam from './Exam.js';

const GKQuestion = sequelize.define('GKQuestion', {
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
  questionNumber: {
    type: DataTypes.INTEGER,
    allowNull: false,
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
  hasImage: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'has_image'
  },
  imageUrl: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'image_url'
  }
}, {
  tableName: 'gk_questions',
  timestamps: true
});

// Relationship
GKQuestion.belongsTo(Exam, { foreignKey: 'examId', as: 'exam' });
Exam.hasMany(GKQuestion, { foreignKey: 'examId', as: 'generalKnowledgeQuestions' });

export default GKQuestion;

