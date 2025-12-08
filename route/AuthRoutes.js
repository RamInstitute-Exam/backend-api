import express from 'express';
import { unifiedLogin, getCurrentUser, logout, verifyToken } from '../Controller/Auth/AuthController.js';
import { authenticate } from '../middleware/RBAC.js';

const router = express.Router();

/**
 * @route   POST /api/auth/login
 * @desc    Unified login endpoint for both Admin and Student
 * @access  Public
 * @body    { email, password, userType: 'admin' | 'student' }
 */
router.post('/login', unifiedLogin);

/**
 * @route   GET /api/auth/me
 * @desc    Get current authenticated user info
 * @access  Private
 */
router.get('/me', authenticate, getCurrentUser);

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user
 * @access  Private
 */
router.post('/logout', authenticate, logout);

/**
 * @route   GET /api/auth/verify
 * @desc    Verify token validity
 * @access  Private
 */
router.get('/verify', authenticate, verifyToken);

export default router;

