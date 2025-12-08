import express from 'express';
import { 
  getAllRoles, 
  createRole, 
  updateRole, 
  deleteRole,
  assignRoleToAdmin,
  removeRoleFromAdmin,
  getAdminRoles
} from '../Controller/Admin/RoleController.js';
import { authenticate, adminOnly, requirePermission } from '../middleware/RBAC.js';

const router = express.Router();

// All routes require authentication and admin access
router.use(authenticate);
router.use(adminOnly);

/**
 * @route   GET /api/roles
 * @desc    Get all roles
 * @access  Private (Admin)
 */
router.get('/', getAllRoles);

/**
 * @route   POST /api/roles
 * @desc    Create new role
 * @access  Private (Admin with manage_roles permission)
 */
router.post('/', requirePermission('manage_roles'), createRole);

/**
 * @route   PUT /api/roles/:id
 * @desc    Update role
 * @access  Private (Admin with manage_roles permission)
 */
router.put('/:id', requirePermission('manage_roles'), updateRole);

/**
 * @route   DELETE /api/roles/:id
 * @desc    Delete role (soft delete)
 * @access  Private (Admin with manage_roles permission)
 */
router.delete('/:id', requirePermission('manage_roles'), deleteRole);

/**
 * @route   POST /api/roles/assign
 * @desc    Assign role to admin
 * @access  Private (Admin with manage_roles permission)
 */
router.post('/assign', requirePermission('manage_roles'), assignRoleToAdmin);

/**
 * @route   DELETE /api/roles/:adminId/:roleId
 * @desc    Remove role from admin
 * @access  Private (Admin with manage_roles permission)
 */
router.delete('/:adminId/:roleId', requirePermission('manage_roles'), removeRoleFromAdmin);

/**
 * @route   GET /api/roles/admin/:adminId
 * @desc    Get roles assigned to an admin
 * @access  Private (Admin)
 */
router.get('/admin/:adminId', getAdminRoles);

export default router;

