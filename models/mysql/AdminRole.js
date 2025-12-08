import { DataTypes } from 'sequelize';
import { sequelize } from '../../config/MySQLConfig.js';

const AdminRole = sequelize.define('AdminRole', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  adminId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'admins',
      key: 'id'
    },
    field: 'admin_id'
  },
  roleId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'roles',
      key: 'id'
    },
    field: 'role_id'
  }
}, {
  tableName: 'admin_roles',
  timestamps: true,
  indexes: [
    { unique: true, fields: ['admin_id', 'role_id'] }
  ]
});

export default AdminRole;

