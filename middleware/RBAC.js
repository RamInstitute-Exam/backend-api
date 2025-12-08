import jwt from 'jsonwebtoken';
import { Admin, Role } from '../models/mysql/index.js';

/**
 * Enhanced Authentication Middleware
 * Verifies JWT token and attaches user info to request
 */
export const authenticate = async (req, res, next) => {
  try {
    const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ 
        success: false,
        message: 'No token provided. Authorization denied.' 
      });
    }

    const decoded = jwt.verify(token, process.env.Secret_key);
    
    // Attach user info to request
    req.user = {
      id: decoded.id,
      email: decoded.email,
      userType: decoded.userType,
      roles: decoded.roles || [],
      permissions: decoded.permissions || []
    };

    next();
  } catch (error) {
    console.error('Token verification failed:', error.message);
    return res.status(401).json({ 
      success: false,
      message: 'Invalid or expired token. Authorization denied.' 
    });
  }
};

/**
 * Role-Based Access Control Middleware
 * Checks if user has required role(s)
 * 
 * Usage: requireRole('super_admin', 'admin')
 */
export const requireRole = (...allowedRoles) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ 
          success: false,
          message: 'Authentication required' 
        });
      }

      const userRoles = req.user.roles || [];
      const hasRole = allowedRoles.some(role => userRoles.includes(role));

      if (!hasRole) {
        return res.status(403).json({ 
          success: false,
          message: `Access denied. Required role: ${allowedRoles.join(' or ')}` 
        });
      }

      next();
    } catch (error) {
      console.error('Role check error:', error);
      return res.status(500).json({ 
        success: false,
        message: 'Internal server error' 
      });
    }
  };
};

/**
 * Permission-Based Access Control Middleware
 * Checks if user has required permission(s)
 * 
 * Usage: requirePermission('manage_exams', 'view_reports')
 */
export const requirePermission = (...requiredPermissions) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ 
          success: false,
          message: 'Authentication required' 
        });
      }

      const userPermissions = req.user.permissions || [];
      const hasPermission = requiredPermissions.some(permission => 
        userPermissions.includes(permission)
      );

      if (!hasPermission) {
        return res.status(403).json({ 
          success: false,
          message: `Access denied. Required permission: ${requiredPermissions.join(' or ')}` 
        });
      }

      next();
    } catch (error) {
      console.error('Permission check error:', error);
      return res.status(500).json({ 
        success: false,
        message: 'Internal server error' 
      });
    }
  };
};

/**
 * Admin Only Middleware
 * Ensures only admin users can access
 */
export const adminOnly = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ 
        success: false,
        message: 'Authentication required' 
      });
    }

    if (req.user.userType !== 'admin') {
      return res.status(403).json({ 
        success: false,
        message: 'Access denied. Admin access required.' 
      });
    }

    next();
  } catch (error) {
    console.error('Admin check error:', error);
    return res.status(500).json({ 
      success: false,
      message: 'Internal server error' 
    });
  }
};

/**
 * Student Only Middleware
 * Ensures only student users can access
 */
export const studentOnly = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ 
        success: false,
        message: 'Authentication required' 
      });
    }

    if (req.user.userType !== 'student') {
      return res.status(403).json({ 
        success: false,
        message: 'Access denied. Student access required.' 
      });
    }

    next();
  } catch (error) {
    console.error('Student check error:', error);
    return res.status(500).json({ 
      success: false,
      message: 'Internal server error' 
    });
  }
};

/**
 * Combined Middleware Helper
 * Combines authentication with role/permission checks
 */
export const requireAuthAndRole = (...roles) => {
  return [authenticate, requireRole(...roles)];
};

export const requireAuthAndPermission = (...permissions) => {
  return [authenticate, requirePermission(...permissions)];
};

