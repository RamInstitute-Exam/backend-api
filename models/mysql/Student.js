import { DataTypes } from 'sequelize';
import { sequelize } from '../../config/MySQLConfig.js';

const Student = sequelize.define('Student', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  batch: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'batch'
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  mobileNumber: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  whatsappNumber: {
    type: DataTypes.STRING,
    allowNull: false
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true
    }
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false
  },
  gender: {
    type: DataTypes.STRING,
    allowNull: false
  },
  fathername: {
    type: DataTypes.STRING,
    allowNull: false
  },
  fatherOccupation: {
    type: DataTypes.STRING,
    allowNull: false
  },
  mothername: {
    type: DataTypes.STRING,
    allowNull: false
  },
  motherOccupation: {
    type: DataTypes.STRING,
    allowNull: false
  },
  profilePhoto: {
    type: DataTypes.STRING,
    defaultValue: ''
  },
  degree: {
    type: DataTypes.STRING,
    allowNull: false
  },
  yearOfPassing: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'year_of_passing'
  },
  working: {
    type: DataTypes.STRING,
    allowNull: false
  },
  workdesc: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  permanentAddress: {
    type: DataTypes.TEXT,
    allowNull: false,
    field: 'permanent_address'
  },
  residentialAddress: {
    type: DataTypes.TEXT,
    allowNull: false,
    field: 'residential_address'
  }
}, {
  tableName: 'students',
  timestamps: true
});

export default Student;

