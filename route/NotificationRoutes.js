import express from 'express';
import NotificationService from '../services/NotificationService.js';
import { authenticate } from '../middleware/RBAC.js';

const router = express.Router();

// Get user notifications (both admin and student can access their own)
router.get('/user/:userId', authenticate, async (req, res) => {
  try {
    const { userId } = req.params;
    const { userType } = req.query;
    const { limit = 50, unreadOnly = false } = req.query;

    let query = { recipientId: userId, recipientType: userType };
    if (unreadOnly) query.read = false;

    const notifications = await NotificationService.getUserNotifications(userId, userType, limit);
    const unreadCount = await NotificationService.getUnreadCount(userId, userType);

    res.status(200).json({ notifications, unreadCount });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch notifications', error: error.message });
  }
});

// Mark notification as read
router.put('/:notificationId/read', authenticate, async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user.id;

    const notification = await NotificationService.markAsRead(notificationId, userId);
    res.status(200).json(notification);
  } catch (error) {
    res.status(500).json({ message: 'Failed to mark notification as read', error: error.message });
  }
});

// Mark all as read
router.put('/read-all', authenticate, async (req, res) => {
  try {
    const { userType } = req.body;
    const userId = req.user.id;

    await NotificationService.markAllAsRead(userId, userType);
    res.status(200).json({ message: 'All notifications marked as read' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to mark all as read', error: error.message });
  }
});

// Get unread count
router.get('/unread-count/:userId', authenticate, async (req, res) => {
  try {
    const { userId } = req.params;
    const { userType } = req.query;

    const count = await NotificationService.getUnreadCount(userId, userType);
    res.status(200).json({ unreadCount: count });
  } catch (error) {
    res.status(500).json({ message: 'Failed to get unread count', error: error.message });
  }
});

export default router;

