import bcryptjs from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Admin, Student, Role } from '../../models/mysql/index.js';
import { Op } from 'sequelize';

/**
 * Unified Login Controller
 * Handles both Admin and Student login with role-based authentication
 */
export const unifiedLogin = async (req, res) => {
  try {
    const { email, password, userType } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ 
        success: false,
        message: 'Email and password are required' 
      });
    }

    if (!userType || !['admin', 'student'].includes(userType.toLowerCase())) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid user type. Must be "admin" or "student"' 
      });
    }

    const type = userType.toLowerCase();

    // Find user based on type
    let user;
    let roles = [];
    
    if (type === 'admin') {
      user = await Admin.findOne({ 
        where: { email },
        include: [{
          model: Role,
          as: 'roles',
          where: { isActive: true },
          required: false,
          attributes: ['id', 'name', 'slug', 'permissions']
        }]
      });

      if (!user) {
        return res.status(404).json({ 
          success: false,
          message: 'Admin not found' 
        });
      }

      if (!user.isActive) {
        return res.status(403).json({ 
          success: false,
          message: 'Account is deactivated. Please contact administrator.' 
        });
      }

      // Extract roles and permissions
      roles = user.roles?.map(role => ({
        id: role.id,
        name: role.name,
        slug: role.slug,
        permissions: role.permissions || []
      })) || [];

      // Update last login
      await user.update({ lastLogin: new Date() });

    } else {
      user = await Student.findOne({ where: { email } });

      if (!user) {
        return res.status(404).json({ 
          success: false,
          message: 'Student not found' 
        });
      }

      // Students have default role
      roles = [{ 
        id: 0, 
        name: 'Student', 
        slug: 'student', 
        permissions: ['view_exams', 'take_exams', 'view_results'] 
      }];
    }

    // Verify password
    const isPasswordValid = await bcryptjs.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid email or password' 
      });
    }

    // Generate JWT token
    const tokenPayload = {
      id: user.id,
      email: user.email,
      userType: type,
      roles: roles.map(r => r.slug),
      permissions: roles.flatMap(r => r.permissions || [])
    };

    const token = jwt.sign(
      tokenPayload,
      process.env.Secret_key,
      { expiresIn: '7d' }
    );

    // Set HTTP-only cookie
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('token', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'None' : 'Lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    // Prepare user data (exclude password)
    const userData = {
      id: user.id,
      email: user.email,
      userType: type,
      roles: roles,
      ...(type === 'admin' ? {
        username: user.username,
        mobileNumber: user.mobileNumber
      } : {
        name: user.name,
        batch: user.batch
      })
    };

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      user: userData,
      token: token // Also send in response for frontend storage if needed
    });

  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ 
      success: false,
      message: 'Internal server error',
      error: error.message 
    });
  }
};

/**
 * Get Current User Info
 */
export const getCurrentUser = async (req, res) => {
  try {
    const { id, userType } = req.user;

    if (userType === 'admin') {
      const admin = await Admin.findByPk(id, {
        include: [{
          model: Role,
          as: 'roles',
          where: { isActive: true },
          required: false,
          attributes: ['id', 'name', 'slug', 'permissions']
        }],
        attributes: { exclude: ['password'] }
      });

      if (!admin) {
        return res.status(404).json({ 
          success: false,
          message: 'Admin not found' 
        });
      }

      return res.status(200).json({
        success: true,
        user: {
          ...admin.toJSON(),
          roles: admin.roles || []
        }
      });
    } else {
      const student = await Student.findByPk(id, {
        attributes: { exclude: ['password'] }
      });

      if (!student) {
        return res.status(404).json({ 
          success: false,
          message: 'Student not found' 
        });
      }

      return res.status(200).json({
        success: true,
        user: {
          ...student.toJSON(),
          roles: [{ name: 'Student', slug: 'student' }]
        }
      });
    }
  } catch (error) {
    console.error('Get current user error:', error);
    return res.status(500).json({ 
      success: false,
      message: 'Internal server error' 
    });
  }
};

/**
 * Logout
 */
export const logout = async (req, res) => {
  try {
    const isProduction = process.env.NODE_ENV === 'production';

    res.clearCookie('token', {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'None' : 'Lax'
    });

    return res.status(200).json({ 
      success: true,
      message: 'Logout successful' 
    });
  } catch (error) {
    console.error('Logout error:', error);
    return res.status(500).json({ 
      success: false,
      message: 'Internal server error' 
    });
  }
};

/**
 * Verify Token
 */
export const verifyToken = async (req, res) => {
  try {
    const user = req.user;
    return res.status(200).json({
      success: true,
      valid: true,
      user: {
        id: user.id,
        email: user.email,
        userType: user.userType,
        roles: user.roles || []
      }
    });
  } catch (error) {
    return res.status(401).json({
      success: false,
      valid: false,
      message: 'Invalid token'
    });
  }
};

