import { DataTypes } from 'sequelize';
import { sequelize } from '../../config/MySQLConfig.js';
import Student from './Student.js';

const StudentBatchAccess = sequelize.define('StudentBatchAccess', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
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
  batchName: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'batch_name'
  },
  examCode: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'exam_code'
  },
  status: {
    type: DataTypes.ENUM('pending', 'approved', 'declined'),
    defaultValue: 'pending'
  },
  requestedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'requested_at'
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'updated_at'
  }
}, {
  tableName: 'student_batch_access',
  timestamps: false // Disable auto timestamps since we use requested_at instead of created_at
});

// Relationship
StudentBatchAccess.belongsTo(Student, { foreignKey: 'studentId', as: 'student' });
Student.hasMany(StudentBatchAccess, { foreignKey: 'studentId', as: 'batchAccess' });

export default StudentBatchAccess;

