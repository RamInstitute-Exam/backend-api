import express from 'express';
import { sequelize } from '../config/MySQLConfig.js';
import { Op } from 'sequelize';

const router = express.Router();

// XP Calculation Constants
const XP_VALUES = {
  TEST_COMPLETED: 100,
  TEST_PASSED: 50,
  PRACTICE_QUESTION: 10,
  CORRECT_ANSWER: 5,
  DAILY_STREAK: 20,
  PERFECT_SCORE: 200,
  ACHIEVEMENT_UNLOCKED: 150
};

const LEVEL_XP_REQUIREMENTS = [
  0, 100, 250, 500, 1000, 2000, 3500, 5500, 8000, 11000, 15000, 20000, 26000, 33000, 41000, 50000
];

// =====================================================
// GET STUDENT XP & LEVEL
// =====================================================
router.get('/xp/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;

    const [results] = await sequelize.query(`
      SELECT 
        total_xp,
        current_level,
        xp_for_next_level,
        streak_days,
        longest_streak,
        last_activity_date
      FROM student_xp
      WHERE student_id = :studentId
    `, {
      replacements: { studentId }
    });

    if (results.length === 0) {
      // Initialize XP for new student
      await sequelize.query(`
        INSERT INTO student_xp 
        (student_id, total_xp, current_level, xp_for_next_level, streak_days, longest_streak)
        VALUES (:studentId, 0, 1, 100, 0, 0)
      `, {
        replacements: { studentId }
      });

      return res.json({
        totalXP: 0,
        currentLevel: 1,
        xpForNextLevel: 100,
        xpProgress: 0,
        streakDays: 0,
        longestStreak: 0
      });
    }

    const xp = results[0];
    const xpProgress = xp.xp_for_next_level > 0 
      ? ((xp.total_xp % LEVEL_XP_REQUIREMENTS[xp.current_level]) / xp.xp_for_next_level) * 100
      : 0;

    res.json({
      totalXP: xp.total_xp || 0,
      currentLevel: xp.current_level || 1,
      xpForNextLevel: xp.xp_for_next_level || 100,
      xpProgress: Math.min(xpProgress, 100),
      streakDays: xp.streak_days || 0,
      longestStreak: xp.longest_streak || 0,
      lastActivityDate: xp.last_activity_date
    });
  } catch (error) {
    console.error('XP fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch XP data' });
  }
});

// =====================================================
// ADD XP (Called after test/practice completion)
// =====================================================
router.post('/xp/add', async (req, res) => {
  try {
    const { studentId, xpAmount, transactionType, description, referenceId, referenceType } = req.body;

    // Add XP transaction
    await sequelize.query(`
      INSERT INTO xp_transactions 
      (student_id, xp_amount, transaction_type, description, reference_id, reference_type)
      VALUES (:studentId, :xpAmount, :transactionType, :description, :referenceId, :referenceType)
    `, {
      replacements: {
        studentId,
        xpAmount,
        transactionType,
        description: description || '',
        referenceId: referenceId || null,
        referenceType: referenceType || null
      }
    });

    // Update student XP
    const [currentXP] = await sequelize.query(`
      SELECT total_xp, current_level
      FROM student_xp
      WHERE student_id = :studentId
    `, {
      replacements: { studentId }
    });

    if (currentXP.length === 0) {
      await sequelize.query(`
        INSERT INTO student_xp 
        (student_id, total_xp, current_level, xp_for_next_level)
        VALUES (:studentId, :xpAmount, 1, 100)
      `, {
        replacements: { studentId, xpAmount }
      });
    } else {
      const newTotalXP = (currentXP[0].total_xp || 0) + xpAmount;
      const currentLevel = currentXP[0].current_level || 1;
      
      // Calculate new level
      let newLevel = currentLevel;
      let xpForNextLevel = LEVEL_XP_REQUIREMENTS[newLevel + 1] - newTotalXP;
      
      for (let i = currentLevel; i < LEVEL_XP_REQUIREMENTS.length - 1; i++) {
        if (newTotalXP >= LEVEL_XP_REQUIREMENTS[i + 1]) {
          newLevel = i + 1;
          xpForNextLevel = LEVEL_XP_REQUIREMENTS[i + 2] - newTotalXP;
        } else {
          break;
        }
      }

      await sequelize.query(`
        UPDATE student_xp
        SET total_xp = :newTotalXP,
            current_level = :newLevel,
            xp_for_next_level = :xpForNextLevel
        WHERE student_id = :studentId
      `, {
        replacements: {
          studentId,
          newTotalXP,
          newLevel,
          xpForNextLevel: Math.max(xpForNextLevel, 0)
        }
      });
    }

    res.json({ 
      success: true, 
      xpAdded: xpAmount,
      message: `+${xpAmount} XP earned!`
    });
  } catch (error) {
    console.error('Add XP error:', error);
    res.status(500).json({ error: 'Failed to add XP' });
  }
});

// =====================================================
// UPDATE STREAK
// =====================================================
router.post('/streak/update', async (req, res) => {
  try {
    const { studentId } = req.body;
    const today = new Date().toISOString().split('T')[0];

    const [currentXP] = await sequelize.query(`
      SELECT streak_days, longest_streak, last_activity_date
      FROM student_xp
      WHERE student_id = :studentId
    `, {
      replacements: { studentId }
    });

    if (currentXP.length === 0) {
      await sequelize.query(`
        INSERT INTO student_xp 
        (student_id, streak_days, longest_streak, last_activity_date)
        VALUES (:studentId, 1, 1, :today)
      `, {
        replacements: { studentId, today }
      });
      return res.json({ streakDays: 1, isNewStreak: true });
    }

    const xp = currentXP[0];
    const lastActivity = xp.last_activity_date ? new Date(xp.last_activity_date).toISOString().split('T')[0] : null;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    let newStreakDays = xp.streak_days || 0;
    let isNewStreak = false;

    if (lastActivity === today) {
      // Already active today
      newStreakDays = xp.streak_days;
    } else if (lastActivity === yesterdayStr) {
      // Continuing streak
      newStreakDays = (xp.streak_days || 0) + 1;
      isNewStreak = true;
    } else {
      // Streak broken, start new
      newStreakDays = 1;
      isNewStreak = true;
    }

    const newLongestStreak = Math.max(newStreakDays, xp.longest_streak || 0);

    await sequelize.query(`
      UPDATE student_xp
      SET streak_days = :newStreakDays,
          longest_streak = :newLongestStreak,
          last_activity_date = :today
      WHERE student_id = :studentId
    `, {
      replacements: {
        studentId,
        newStreakDays,
        newLongestStreak,
        today
      }
    });

    // Award streak bonus XP
    if (isNewStreak && newStreakDays > 0) {
      const streakXP = newStreakDays * XP_VALUES.DAILY_STREAK;
      await sequelize.query(`
        INSERT INTO xp_transactions 
        (student_id, xp_amount, transaction_type, description)
        VALUES (:studentId, :streakXP, 'daily_streak', :description)
      `, {
        replacements: {
          studentId,
          streakXP,
          description: `${newStreakDays} day streak bonus!`
        }
      });
    }

    res.json({ 
      streakDays: newStreakDays, 
      longestStreak: newLongestStreak,
      isNewStreak,
      streakXP: isNewStreak ? newStreakDays * XP_VALUES.DAILY_STREAK : 0
    });
  } catch (error) {
    console.error('Streak update error:', error);
    res.status(500).json({ error: 'Failed to update streak' });
  }
});

// =====================================================
// GET ALL BADGES (Admin)
// =====================================================
router.get('/badges', async (req, res) => {
  try {
    const [allBadges] = await sequelize.query(`
      SELECT * FROM badges
      ORDER BY created_at DESC
    `);

    res.json({
      data: allBadges,
      total: allBadges.length
    });
  } catch (error) {
    console.error('Get all badges error:', error);
    res.status(500).json({ error: 'Failed to fetch badges' });
  }
});

// =====================================================
// CREATE BADGE (Admin)
// =====================================================
router.post('/badges', async (req, res) => {
  try {
    const { name, description, badge_type, icon_url, criteria_xp, criteria_tests, criteria_streak } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Badge name is required' });
    }

    const [result] = await sequelize.query(`
      INSERT INTO badges 
      (name, description, badge_type, icon_url, criteria_xp, criteria_tests, criteria_streak, is_active, created_at)
      VALUES (:name, :description, :badge_type, :icon_url, :criteria_xp, :criteria_tests, :criteria_streak, 1, NOW())
    `, {
      replacements: {
        name: name.trim(),
        description: description?.trim() || null,
        badge_type: badge_type || 'achievement',
        icon_url: icon_url || null,
        criteria_xp: criteria_xp || null,
        criteria_tests: criteria_tests || null,
        criteria_streak: criteria_streak || null
      }
    });

    const insertId = result?.insertId || (Array.isArray(result) && result[0]?.insertId);
    let badgeId = insertId;

    if (!badgeId) {
      const [lastIdResult] = await sequelize.query('SELECT LAST_INSERT_ID() as id');
      badgeId = lastIdResult?.[0]?.id || lastIdResult?.id;
    }

    // Fetch the created badge
    const [badges] = await sequelize.query(`
      SELECT * FROM badges WHERE id = :id
    `, {
      replacements: { id: badgeId }
    });

    res.status(201).json({
      message: 'Badge created successfully',
      data: badges[0]
    });
  } catch (error) {
    console.error('Create badge error:', error);
    res.status(500).json({ error: 'Failed to create badge', details: error.message });
  }
});

// =====================================================
// UPDATE BADGE (Admin)
// =====================================================
router.put('/badges/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, badge_type, icon_url, criteria_xp, criteria_tests, criteria_streak, is_active } = req.body;

    // Check if badge exists
    const [existing] = await sequelize.query(`
      SELECT * FROM badges WHERE id = :id
    `, {
      replacements: { id }
    });

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Badge not found' });
    }

    await sequelize.query(`
      UPDATE badges 
      SET 
        name = :name,
        description = :description,
        badge_type = :badge_type,
        icon_url = :icon_url,
        criteria_xp = :criteria_xp,
        criteria_tests = :criteria_tests,
        criteria_streak = :criteria_streak,
        is_active = :is_active
      WHERE id = :id
    `, {
      replacements: {
        id,
        name: name?.trim() || existing[0].name,
        description: description?.trim() || existing[0].description || null,
        badge_type: badge_type || existing[0].badge_type || 'achievement',
        icon_url: icon_url || existing[0].icon_url || null,
        criteria_xp: criteria_xp !== undefined ? criteria_xp : existing[0].criteria_xp || null,
        criteria_tests: criteria_tests !== undefined ? criteria_tests : existing[0].criteria_tests || null,
        criteria_streak: criteria_streak !== undefined ? criteria_streak : existing[0].criteria_streak || null,
        is_active: is_active !== undefined ? is_active : existing[0].is_active
      }
    });

    // Fetch the updated badge
    const [badges] = await sequelize.query(`
      SELECT * FROM badges WHERE id = :id
    `, {
      replacements: { id }
    });

    res.json({
      message: 'Badge updated successfully',
      data: badges[0]
    });
  } catch (error) {
    console.error('Update badge error:', error);
    res.status(500).json({ error: 'Failed to update badge', details: error.message });
  }
});

// =====================================================
// DELETE BADGE (Admin)
// =====================================================
router.delete('/badges/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Check if badge exists
    const [existing] = await sequelize.query(`
      SELECT * FROM badges WHERE id = :id
    `, {
      replacements: { id }
    });

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Badge not found' });
    }

    // Soft delete by setting is_active to 0
    await sequelize.query(`
      UPDATE badges 
      SET is_active = 0, updated_at = NOW()
      WHERE id = :id
    `, {
      replacements: { id }
    });

    res.json({ message: 'Badge deleted successfully' });
  } catch (error) {
    console.error('Delete badge error:', error);
    res.status(500).json({ error: 'Failed to delete badge', details: error.message });
  }
});

// =====================================================
// GET BADGES FOR STUDENT
// =====================================================
router.get('/badges/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;

    // Get all badges
    const [allBadges] = await sequelize.query(`
      SELECT * FROM badges
      WHERE is_active = 1
      ORDER BY badge_type, criteria_xp ASC
    `);

    // Get student's earned badges
    const [earnedBadges] = await sequelize.query(`
      SELECT b.*, sb.earned_at
      FROM student_badges sb
      JOIN badges b ON sb.badge_id = b.id
      WHERE sb.student_id = :studentId
      ORDER BY sb.earned_at DESC
    `, {
      replacements: { studentId }
    });

    const earnedBadgeIds = earnedBadges.map(b => b.id);

    // Check which badges can be earned
    const [studentXP] = await sequelize.query(`
      SELECT total_xp, current_level, streak_days
      FROM student_xp
      WHERE student_id = :studentId
    `, {
      replacements: { studentId }
    });

    const [testStats] = await sequelize.query(`
      SELECT COUNT(*) as total_tests
      FROM test_attempts
      WHERE student_id = :studentId AND status = 'completed'
    `, {
      replacements: { studentId }
    });

    const xp = studentXP[0] || { total_xp: 0, current_level: 1, streak_days: 0 };
    const totalTests = testStats[0]?.total_tests || 0;

    const availableBadges = allBadges.map(badge => {
      const isEarned = earnedBadgeIds.includes(badge.id);
      let canEarn = false;

      if (!isEarned) {
        if (badge.criteria_xp && xp.total_xp >= badge.criteria_xp) canEarn = true;
        if (badge.criteria_tests && totalTests >= badge.criteria_tests) canEarn = true;
        if (badge.criteria_streak && xp.streak_days >= badge.criteria_streak) canEarn = true;
      }

      return {
        ...badge,
        isEarned,
        canEarn,
        earnedAt: earnedBadges.find(eb => eb.id === badge.id)?.earned_at
      };
    });

    res.json({
      earned: earnedBadges,
      available: availableBadges,
      totalEarned: earnedBadges.length,
      totalAvailable: allBadges.length
    });
  } catch (error) {
    console.error('Badges fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch badges' });
  }
});

// =====================================================
// CHECK AND AWARD BADGES
// =====================================================
router.post('/badges/check', async (req, res) => {
  try {
    const { studentId } = req.params || req.body;

    const [studentXP] = await sequelize.query(`
      SELECT total_xp, current_level, streak_days
      FROM student_xp
      WHERE student_id = :studentId
    `, {
      replacements: { studentId }
    });

    const [testStats] = await sequelize.query(`
      SELECT COUNT(*) as total_tests
      FROM test_attempts
      WHERE student_id = :studentId AND status = 'completed'
    `, {
      replacements: { studentId }
    });

    const [earnedBadges] = await sequelize.query(`
      SELECT badge_id FROM student_badges
      WHERE student_id = :studentId
    `, {
      replacements: { studentId }
    });

    const earnedBadgeIds = earnedBadges.map(b => b.badge_id);
    const xp = studentXP[0] || { total_xp: 0, current_level: 1, streak_days: 0 };
    const totalTests = testStats[0]?.total_tests || 0;

    // Get all badges
    const [allBadges] = await sequelize.query(`
      SELECT * FROM badges WHERE is_active = 1
    `);

    const newlyEarned = [];

    for (const badge of allBadges) {
      if (earnedBadgeIds.includes(badge.id)) continue;

      let shouldAward = false;

      if (badge.criteria_xp && xp.total_xp >= badge.criteria_xp) shouldAward = true;
      if (badge.criteria_tests && totalTests >= badge.criteria_tests) shouldAward = true;
      if (badge.criteria_streak && xp.streak_days >= badge.criteria_streak) shouldAward = true;

      if (shouldAward) {
        await sequelize.query(`
          INSERT INTO student_badges (student_id, badge_id, earned_at)
          VALUES (:studentId, :badgeId, NOW())
        `, {
          replacements: { studentId, badgeId: badge.id }
        });

        // Award XP for badge
        await sequelize.query(`
          INSERT INTO xp_transactions 
          (student_id, xp_amount, transaction_type, description, reference_id, reference_type)
          VALUES (:studentId, :xpAmount, 'achievement', :description, :badgeId, 'badge')
        `, {
          replacements: {
            studentId,
            xpAmount: XP_VALUES.ACHIEVEMENT_UNLOCKED,
            description: `Badge unlocked: ${badge.name}`,
            badgeId: badge.id
          }
        });

        newlyEarned.push(badge);
      }
    }

    res.json({ newlyEarned, count: newlyEarned.length });
  } catch (error) {
    console.error('Badge check error:', error);
    res.status(500).json({ error: 'Failed to check badges' });
  }
});

// =====================================================
// GET LEADERBOARD
// =====================================================
router.get('/leaderboard', async (req, res) => {
  try {
    const { period = 'all_time', category, limit = 100 } = req.query;

    let dateFilter = '';
    if (period === 'daily') {
      const today = new Date().toISOString().split('T')[0];
      dateFilter = `AND DATE(xp.last_activity_date) = '${today}'`;
    } else if (period === 'weekly') {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      dateFilter = `AND xp.last_activity_date >= '${weekAgo.toISOString().split('T')[0]}'`;
    } else if (period === 'monthly') {
      const monthAgo = new Date();
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      dateFilter = `AND xp.last_activity_date >= '${monthAgo.toISOString().split('T')[0]}'`;
    }

    const [leaderboard] = await sequelize.query(`
      SELECT 
        s.id,
        s.name,
        s.email,
        s.profile_photo,
        xp.total_xp,
        xp.current_level,
        xp.streak_days,
        (SELECT COUNT(*) FROM test_attempts WHERE student_id = s.id AND status = 'completed') as total_tests,
        (SELECT AVG(percentage) FROM test_attempts WHERE student_id = s.id AND status = 'completed') as avg_score
      FROM students s
      JOIN student_xp xp ON s.id = xp.student_id
      WHERE 1=1 ${dateFilter}
      ORDER BY xp.total_xp DESC, xp.current_level DESC
      LIMIT :limit
    `, {
      replacements: { limit: parseInt(limit) }
    });

    // Add rank
    const leaderboardWithRank = leaderboard.map((entry, index) => ({
      ...entry,
      rank: index + 1
    }));

    res.json({
      period,
      leaderboard: leaderboardWithRank,
      total: leaderboardWithRank.length
    });
  } catch (error) {
    console.error('Leaderboard error:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// =====================================================
// GET XP TRANSACTIONS (History)
// =====================================================
router.get('/xp/transactions/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    const { limit = 50 } = req.query;

    const [transactions] = await sequelize.query(`
      SELECT 
        xp_amount,
        transaction_type,
        description,
        reference_id,
        reference_type,
        created_at
      FROM xp_transactions
      WHERE student_id = :studentId
      ORDER BY created_at DESC
      LIMIT :limit
    `, {
      replacements: { studentId, limit: parseInt(limit) }
    });

    res.json(transactions);
  } catch (error) {
    console.error('XP transactions error:', error);
    res.status(500).json({ error: 'Failed to fetch XP transactions' });
  }
});

export default router;

