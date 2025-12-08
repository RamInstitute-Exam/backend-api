import express from 'express';
import { sequelize } from '../config/MySQLConfig.js';
import { Op } from 'sequelize';
import { Student } from '../models/mysql/index.js';

const router = express.Router();

// =====================================================
// GET STUDENT PROFILE
// =====================================================
router.get('/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;

    const student = await Student.findByPk(studentId, {
      attributes: { exclude: ['password'] }
    });

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Get preferences
    const [preferences] = await sequelize.query(`
      SELECT * FROM student_preferences
      WHERE student_id = :studentId
    `, {
      replacements: { studentId }
    });

    // Get test history
    const [testHistory] = await sequelize.query(`
      SELECT 
        ta.id,
        ta.submitted_at,
        ta.percentage,
        ta.obtained_marks,
        ta.total_marks,
        ta.correct_count,
        ta.wrong_count,
        mt.title as test_title,
        mt.exam_code,
        ec.name as category_name
      FROM test_attempts ta
      LEFT JOIN mock_tests mt ON ta.mock_test_id = mt.id
      LEFT JOIN test_series ts ON mt.test_series_id = ts.id
      LEFT JOIN exam_categories ec ON ts.category_id = ec.id
      WHERE ta.student_id = :studentId
        AND ta.status = 'completed'
      ORDER BY ta.submitted_at DESC
      LIMIT 50
    `, {
      replacements: { studentId }
    });

    // Get saved materials
    const [savedMaterials] = await sequelize.query(`
      SELECT 
        b.id,
        b.created_at as saved_at,
        sm.title,
        sm.description,
        sm.material_type,
        sm.file_url,
        ec.name as category_name
      FROM bookmarks b
      JOIN study_materials sm ON b.item_id = sm.id
      LEFT JOIN exam_categories ec ON sm.category_id = ec.id
      WHERE b.student_id = :studentId
        AND b.item_type = 'material'
      ORDER BY b.created_at DESC
    `, {
      replacements: { studentId }
    });

    // Get XP and badges
    const [xpData] = await sequelize.query(`
      SELECT 
        total_xp,
        current_level,
        streak_days,
        longest_streak
      FROM student_xp
      WHERE student_id = :studentId
    `, {
      replacements: { studentId }
    });

    const [badgeCount] = await sequelize.query(`
      SELECT COUNT(*) as count
      FROM student_badges
      WHERE student_id = :studentId
    `, {
      replacements: { studentId }
    });

    res.json({
      student: student.toJSON(),
      preferences: preferences[0] || null,
      testHistory: testHistory,
      savedMaterials: savedMaterials,
      gamification: {
        xp: xpData[0]?.total_xp || 0,
        level: xpData[0]?.current_level || 1,
        streak: xpData[0]?.streak_days || 0,
        badges: badgeCount[0]?.count || 0
      }
    });
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// =====================================================
// UPDATE STUDENT PROFILE
// =====================================================
router.put('/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    const updateData = req.body;

    // Remove password from update if present
    delete updateData.password;

    await Student.update(updateData, {
      where: { id: studentId }
    });

    const updatedStudent = await Student.findByPk(studentId, {
      attributes: { exclude: ['password'] }
    });

    res.json({
      message: 'Profile updated successfully',
      student: updatedStudent.toJSON()
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// =====================================================
// UPDATE PREFERENCES
// =====================================================
router.put('/preferences/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    const preferences = req.body;

    const [existing] = await sequelize.query(`
      SELECT id FROM student_preferences
      WHERE student_id = :studentId
    `, {
      replacements: { studentId }
    });

    if (existing.length > 0) {
      await sequelize.query(`
        UPDATE student_preferences
        SET 
          language_preference = :language,
          preferred_categories = :categories,
          notification_enabled = :notifications,
          email_notifications = :email,
          sms_notifications = :sms,
          daily_reminder_time = :reminderTime,
          study_goal_hours_per_day = :studyGoal
        WHERE student_id = :studentId
      `, {
        replacements: {
          studentId,
          language: preferences.language_preference || 'both',
          categories: preferences.preferred_categories || null,
          notifications: preferences.notification_enabled !== undefined ? preferences.notification_enabled : true,
          email: preferences.email_notifications !== undefined ? preferences.email_notifications : true,
          sms: preferences.sms_notifications !== undefined ? preferences.sms_notifications : false,
          reminderTime: preferences.daily_reminder_time || null,
          studyGoal: preferences.study_goal_hours_per_day || 2
        }
      });
    } else {
      await sequelize.query(`
        INSERT INTO student_preferences
        (student_id, language_preference, preferred_categories, notification_enabled, 
         email_notifications, sms_notifications, daily_reminder_time, study_goal_hours_per_day)
        VALUES (:studentId, :language, :categories, :notifications, :email, :sms, :reminderTime, :studyGoal)
      `, {
        replacements: {
          studentId,
          language: preferences.language_preference || 'both',
          categories: preferences.preferred_categories || null,
          notifications: preferences.notification_enabled !== undefined ? preferences.notification_enabled : true,
          email: preferences.email_notifications !== undefined ? preferences.email_notifications : true,
          sms: preferences.sms_notifications !== undefined ? preferences.sms_notifications : false,
          reminderTime: preferences.daily_reminder_time || null,
          studyGoal: preferences.study_goal_hours_per_day || 2
        }
      });
    }

    res.json({ message: 'Preferences updated successfully' });
  } catch (error) {
    console.error('Preferences update error:', error);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

// =====================================================
// GET LEARNING GOALS
// =====================================================
router.get('/goals/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;

    // Get student's learning path progress
    const [learningProgress] = await sequelize.query(`
      SELECT 
        lp.id,
        lp.title,
        lp.description,
        lp.difficulty_level,
        slp.progress_percentage,
        slp.is_completed,
        slp.started_at,
        slp.completed_at
      FROM learning_paths lp
      LEFT JOIN student_learning_progress slp ON lp.id = slp.learning_path_id AND slp.student_id = :studentId
      WHERE lp.is_active = 1
      ORDER BY lp.display_order ASC
    `, {
      replacements: { studentId }
    });

    res.json(learningProgress);
  } catch (error) {
    console.error('Learning goals error:', error);
    res.status(500).json({ error: 'Failed to fetch learning goals' });
  }
});

export default router;

