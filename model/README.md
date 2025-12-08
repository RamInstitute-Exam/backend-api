# MongoDB Models - REMOVED

⚠️ **All MongoDB models have been completely removed from the codebase.**

This directory previously contained old MongoDB/Mongoose model files, but they have been deleted as part of the migration to MySQL.

## Current Database

The system now uses **MySQL with Sequelize ORM** exclusively.

All models are located in:
- `backend/models/mysql/` - Sequelize models for MySQL

## Migration Complete

✅ All MongoDB dependencies removed
✅ All MongoDB model files deleted
✅ All code updated to use MySQL/Sequelize models
✅ MongoDB connection config removed

## Models Available

- `Admin.js` - Admin user model
- `Batch.js` - Batch model
- `CivilQuestion.js` - Civil engineering questions
- `GKQuestion.js` - General knowledge questions
- `Exam.js` - Exam model
- `Student.js` - Student model
- `StudentExamReport.js` - Exam submission reports
- `StudentBatchAccess.js` - Batch access requests
- `QuestionBank.js` - Question bank
- `Notification.js` - Notifications
- `ExamRequest.js` - Exam access requests
- `AnswerDetail.js` - Answer details for reports

All models use Sequelize with MySQL.
