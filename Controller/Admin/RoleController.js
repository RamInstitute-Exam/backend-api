import { Role, Admin, AdminRole } from '../../models/mysql/index.js';
import { Op } from 'sequelize';

/**
 * Get All Roles
 */
export const getAllRoles = async (req, res) => {
  try {
    const roles = await Role.findAll({
      where: { isActive: true },
      order: [['name', 'ASC']]
    });

    return res.status(200).json({
      success: true,
      roles
    });
  } catch (error) {
    console.error('Error fetching roles:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch roles'
    });
  }
};

/**
 * Create Role
 */
export const createRole = async (req, res) => {
  try {
    const { name, slug, description, permissions } = req.body;

    if (!name || !slug) {
      return res.status(400).json({
        success: false,
        message: 'Name and slug are required'
      });
    }

    // Check if role already exists
    const existingRole = await Role.findOne({
      where: {
        [Op.or]: [{ name }, { slug }]
      }
    });

    if (existingRole) {
      return res.status(400).json({
        success: false,
        message: 'Role with this name or slug already exists'
      });
    }

    const role = await Role.create({
      name,
      slug: slug.toLowerCase(),
      description: description || '',
      permissions: permissions || [],
      isActive: true
    });

    return res.status(201).json({
      success: true,
      message: 'Role created successfully',
      role
    });
  } catch (error) {
    console.error('Error creating role:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create role'
    });
  }
};

/**
 * Update Role
 */
export const updateRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, permissions, isActive } = req.body;

    const role = await Role.findByPk(id);

    if (!role) {
      return res.status(404).json({
        success: false,
        message: 'Role not found'
      });
    }

    await role.update({
      name: name || role.name,
      description: description !== undefined ? description : role.description,
      permissions: permissions !== undefined ? permissions : role.permissions,
      isActive: isActive !== undefined ? isActive : role.isActive
    });

    return res.status(200).json({
      success: true,
      message: 'Role updated successfully',
      role
    });
  } catch (error) {
    console.error('Error updating role:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update role'
    });
  }
};

/**
 * Delete Role (Soft delete)
 */
export const deleteRole = async (req, res) => {
  try {
    const { id } = req.params;

    const role = await Role.findByPk(id);

    if (!role) {
      return res.status(404).json({
        success: false,
        message: 'Role not found'
      });
    }

    // Check if role is assigned to any admin
    const assignedAdmins = await AdminRole.count({
      where: { roleId: id }
    });

    if (assignedAdmins > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete role. It is assigned to ${assignedAdmins} admin(s).`
      });
    }

    await role.update({ isActive: false });

    return res.status(200).json({
      success: true,
      message: 'Role deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting role:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete role'
    });
  }
};

/**
 * Assign Role to Admin
 */
export const assignRoleToAdmin = async (req, res) => {
  try {
    const { adminId, roleId } = req.body;

    if (!adminId || !roleId) {
      return res.status(400).json({
        success: false,
        message: 'Admin ID and Role ID are required'
      });
    }

    // Check if admin exists
    const admin = await Admin.findByPk(adminId);
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }

    // Check if role exists
    const role = await Role.findByPk(roleId);
    if (!role || !role.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Role not found or inactive'
      });
    }

    // Check if already assigned
    const existing = await AdminRole.findOne({
      where: { adminId, roleId }
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Role already assigned to this admin'
      });
    }

    await AdminRole.create({ adminId, roleId });

    return res.status(200).json({
      success: true,
      message: 'Role assigned successfully'
    });
  } catch (error) {
    console.error('Error assigning role:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to assign role'
    });
  }
};

/**
 * Remove Role from Admin
 */
export const removeRoleFromAdmin = async (req, res) => {
  try {
    const { adminId, roleId } = req.params;

    const adminRole = await AdminRole.findOne({
      where: { adminId: parseInt(adminId), roleId: parseInt(roleId) }
    });

    if (!adminRole) {
      return res.status(404).json({
        success: false,
        message: 'Role assignment not found'
      });
    }

    await adminRole.destroy();

    return res.status(200).json({
      success: true,
      message: 'Role removed successfully'
    });
  } catch (error) {
    console.error('Error removing role:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to remove role'
    });
  }
};

/**
 * Get Admin Roles
 */
export const getAdminRoles = async (req, res) => {
  try {
    const { adminId } = req.params;

    const admin = await Admin.findByPk(adminId, {
      include: [{
        model: Role,
        as: 'roles',
        where: { isActive: true },
        required: false
      }]
    });

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }

    return res.status(200).json({
      success: true,
      roles: admin.roles || []
    });
  } catch (error) {
    console.error('Error fetching admin roles:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch admin roles'
    });
  }
};

