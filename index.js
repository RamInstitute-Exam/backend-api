
import express from "express";
import DBConnect from "./config/MySQLConfig.js";
import Student from "./route/StudentRoute.js";
import Admin from "./route/AdminRoutes.js";
import Question from "./route/ExamsRoute.js";
import Batch from "./route/BatchRoute.js";
import BatchUpload from "./route/BatchUpload.js"
import cors from "cors";
import cookieParser from "cookie-parser";
import UploadRoute from "./route/upload.js"
import examUploadRoutes from './route/BatchQuestionUpload.js';
import NotificationRoutes from './route/NotificationRoutes.js';
import AnalyticsRoutes from './route/AnalyticsRoutes.js';
import QuestionBankRoutes from './route/QuestionBankRoutes.js';
import AuthRoutes from './route/AuthRoutes.js';
import RoleRoutes from './route/RoleRoutes.js';
import StudentDashboardRoutes from './route/StudentDashboardRoutes.js';
import TestSeriesRoutes from './route/TestSeriesRoutes.js';
import PracticeRoutes from './route/PracticeRoutes.js';
import EnhancedAnalyticsRoutes from './route/AnalyticsRoutes.js';
import GamificationRoutes from './route/GamificationRoutes.js';
import StudentProfileRoutes from './route/StudentProfileRoutes.js';
import dotenv from "dotenv";
dotenv.config();

const app = express();

// Request timeout middleware (5 minutes for large PDF uploads)
app.use((req, res, next) => {
  req.setTimeout(300000); // 5 minutes
  res.setTimeout(300000);
  next();
});

app.use(express.json({ limit: '100mb' })); // Increase limit for large PDFs
app.use(cookieParser());
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      'https://institute-exam.vercel.app',
      'https://institute-exam-d4kz-beta.vercel.app',
      'https://ram-institute-frontend.vercel.app',
      'http://institute-frontend.s3-website.ap-south-1.amazonaws.com'
    ],  
    credentials: true 
  })
);

// Routes

app.use("/Admin", Admin);
app.use("/Question", Question);
app.use("/api", UploadRoute);
app.use("/batch", Batch);
app.use("/Student", Student);

app.use('/Batch',BatchUpload)
app.use('/exam', examUploadRoutes);

// Unified Authentication & RBAC Routes
app.use('/api/auth', AuthRoutes);
app.use('/api/roles', RoleRoutes);

app.use('/notifications', NotificationRoutes);
app.use('/analytics', AnalyticsRoutes);
app.use('/api/analytics', EnhancedAnalyticsRoutes);
app.use('/api/gamification', GamificationRoutes);
app.use('/api/student-profile', StudentProfileRoutes);
app.use('/question-bank', QuestionBankRoutes);
app.use('/api/student-dashboard', StudentDashboardRoutes);
app.use('/api/test-series', TestSeriesRoutes);
app.use('/api/practice', PracticeRoutes);
app.get("/", (req, res) => {
  res.send("Running backend");
});

// Global error handler to prevent server crashes
app.use((err, req, res, next) => {
  console.error('❌ Global error handler:', err);
  console.error('Error stack:', err.stack);
  
  if (!res.headersSent) {
    res.status(500).json({ 
      error: 'Internal server error', 
      message: err.message || 'An unexpected error occurred' 
    });
  }
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  // Don't exit immediately, let the server try to recover
});

// Start Server
// Use Render's provided PORT in production; fall back to 5001 for local dev
const PORT = process.env.PORT || 5001;
app.listen(PORT, async () => {
  console.log(`Server running on PORT ${PORT}`);
  await DBConnect();
});
