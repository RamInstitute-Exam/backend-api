import { DataTypes } from 'sequelize';
import { sequelize } from '../../config/MySQLConfig.js';
import Exam from './Exam.js';

const CivilQuestion = sequelize.define('CivilQuestion', {
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
  tableName: 'civil_questions',
  timestamps: true
});

// Relationship
CivilQuestion.belongsTo(Exam, { foreignKey: 'examId', as: 'exam' });
Exam.hasMany(CivilQuestion, { foreignKey: 'examId', as: 'civilQuestions' });

export default CivilQuestion;

