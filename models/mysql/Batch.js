import { DataTypes } from 'sequelize';
import { sequelize } from '../../config/MySQLConfig.js';
import Student from './Student.js';

const Batch = sequelize.define('Batch', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
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
  batchName: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'batch_name'
  }
}, {
  tableName: 'batches',
  timestamps: true
});

// Relationship
Batch.belongsTo(Student, { foreignKey: 'studentId', as: 'student' });
Student.hasMany(Batch, { foreignKey: 'studentId', as: 'batches' });

export default Batch;

