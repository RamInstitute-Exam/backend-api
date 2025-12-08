// Central export for all MySQL models
// Import in order to establish relationships
import Admin from './Admin.js';
import Student from './Student.js';
import Batch from './Batch.js';
import Exam from './Exam.js';
import CivilQuestion from './CivilQuestion.js';
import GKQuestion from './GKQuestion.js';
import StudentExamReport from './StudentExamReport.js';
import AnswerDetail from './AnswerDetail.js';
import Notification from './Notification.js';
import QuestionBank from './QuestionBank.js';
import StudentBatchAccess from './StudentBatchAccess.js';
import ExamRequest from './ExamRequest.js';
import Role from './Role.js';
import AdminRole from './AdminRole.js';

// Define relationships
Admin.belongsToMany(Role, { 
  through: AdminRole, 
  foreignKey: 'adminId', 
  otherKey: 'roleId',
  as: 'roles'
});
Role.belongsToMany(Admin, { 
  through: AdminRole, 
  foreignKey: 'roleId', 
  otherKey: 'adminId',
  as: 'admins'
});

// Export all models
export {
  Admin,
  Student,
  Batch,
  Exam,
  CivilQuestion,
  GKQuestion,
  StudentExamReport,
  AnswerDetail,
  Notification,
  QuestionBank,
  StudentBatchAccess,
  ExamRequest,
  Role,
  AdminRole
};

// Export sequelize instance for migrations
export { sequelize } from '../../config/MySQLConfig.js';

