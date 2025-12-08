import { DataTypes } from 'sequelize';
import { sequelize } from '../../config/MySQLConfig.js';
import Student from './Student.js';
import Admin from './Admin.js';

const Notification = sequelize.define('Notification', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  recipientId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'recipient_id'
  },
  recipientType: {
    type: DataTypes.ENUM('Students', 'Admin'),
    allowNull: false,
    field: 'recipient_type'
  },
  type: {
    type: DataTypes.ENUM(
      'exam_scheduled',
      'exam_reminder',
      'exam_started',
      'exam_ending',
      'result_available',
      'batch_approved',
      'batch_declined',
      'exam_request',
      'system_announcement',
      'general'
    ),
    allowNull: false
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  examCode: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'exam_code'
  },
  batchName: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'batch_name'
  },
  read: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  readAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'read_at'
  },
  emailSent: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'email_sent'
  },
  smsSent: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'sms_sent'
  },
  emailSentAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'email_sent_at'
  },
  smsSentAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'sms_sent_at'
  },
  priority: {
    type: DataTypes.ENUM('low', 'medium', 'high', 'urgent'),
    defaultValue: 'medium'
  },
  actionUrl: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'action_url'
  }
}, {
  tableName: 'notifications',
  timestamps: true,
  indexes: [
    { fields: ['recipient_id', 'read', 'created_at'] },
    { fields: ['type', 'created_at'] }
  ]
});

export default Notification;

