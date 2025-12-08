import { DataTypes } from 'sequelize';
import { sequelize } from '../../config/MySQLConfig.js';
import Student from './Student.js';

const ExamRequest = sequelize.define('ExamRequest', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  examCode: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'exam_code'
  },
  studentId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'students',
      key: 'id'
    },
    field: 'student_id'
  },
  status: {
    type: DataTypes.ENUM('pending', 'approved', 'denied'),
    defaultValue: 'pending'
  }
}, {
  tableName: 'exam_requests',
  timestamps: true
});

// Relationship
ExamRequest.belongsTo(Student, { foreignKey: 'studentId', as: 'student' });
Student.hasMany(ExamRequest, { foreignKey: 'studentId', as: 'examRequests' });

export default ExamRequest;

