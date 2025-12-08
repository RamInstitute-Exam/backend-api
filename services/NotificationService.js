import { Notification, Student, Admin } from '../models/mysql/index.js';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

// Email Configuration
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

class NotificationService {
  // Create and send notification
  static async createNotification(data) {
    try {
      const notification = await Notification.create(data);
      
      // Send email if recipient has email
      if (data.sendEmail) {
        await this.sendEmailNotification(notification);
      }
      
      // Send SMS if configured
      if (data.sendSMS) {
        await this.sendSMSNotification(notification);
      }
      
      return notification;
    } catch (error) {
      console.error('Error creating notification:', error);
      throw error;
    }
  }

  // Send email notification
  static async sendEmailNotification(notification) {
    try {
      let recipient;
      if (notification.recipientType === 'Students') {
        recipient = await Student.findByPk(notification.recipientId);
      } else {
        recipient = await Admin.findByPk(notification.recipientId);
      }

      if (!recipient || !recipient.email) {
        return;
      }

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: recipient.email,
        subject: notification.title,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">${notification.title}</h2>
            <p style="color: #666; line-height: 1.6;">${notification.message}</p>
            ${notification.actionUrl ? `<a href="${process.env.FRONTEND_URL}${notification.actionUrl}" style="display: inline-block; margin-top: 20px; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;">View Details</a>` : ''}
            <hr style="margin-top: 30px; border: none; border-top: 1px solid #eee;">
            <p style="color: #999; font-size: 12px;">This is an automated notification from Institute Examination System.</p>
          </div>
        `
      };

      await transporter.sendMail(mailOptions);
      
      await notification.update({
        emailSent: true,
        emailSentAt: new Date()
      });
    } catch (error) {
      console.error('Error sending email notification:', error);
    }
  }

  // Send SMS notification (placeholder - integrate with SMS service)
  static async sendSMSNotification(notification) {
    try {
      let recipient;
      if (notification.recipientType === 'Students') {
        recipient = await Student.findByPk(notification.recipientId);
      }

      if (!recipient || !recipient.mobileNumber) {
        return;
      }

      // TODO: Integrate with SMS service (Twilio, AWS SNS, etc.)
      // For now, just mark as sent
      await notification.update({
        smsSent: true,
        smsSentAt: new Date()
      });
    } catch (error) {
      console.error('Error sending SMS notification:', error);
    }
  }

  // Notify exam scheduled
  static async notifyExamScheduled(examCode, examName, scheduledDate, studentIds) {
    const notifications = studentIds.map(studentId => ({
      recipientId: studentId,
      recipientType: 'Students',
      type: 'exam_scheduled',
      title: `New Exam Scheduled: ${examName}`,
      message: `An exam "${examName}" (${examCode}) has been scheduled for ${new Date(scheduledDate).toLocaleString()}. Please prepare accordingly.`,
      examCode,
      priority: 'high',
      actionUrl: `/student/exams`,
      sendEmail: true
    }));

    return Promise.all(notifications.map(data => this.createNotification(data)));
  }

  // Notify exam reminder
  static async notifyExamReminder(examCode, examName, scheduledDate, studentIds, hoursBefore = 24) {
    const notifications = studentIds.map(studentId => ({
      recipientId: studentId,
      recipientType: 'Students',
      type: 'exam_reminder',
      title: `Exam Reminder: ${examName}`,
      message: `Reminder: Your exam "${examName}" (${examCode}) is scheduled in ${hoursBefore} hours.`,
      examCode,
      priority: 'high',
      actionUrl: `/student/exams`,
      sendEmail: true
    }));

    return Promise.all(notifications.map(data => this.createNotification(data)));
  }

  // Notify result available
  static async notifyResultAvailable(examCode, examName, studentId, score) {
    return this.createNotification({
      recipientId: studentId,
      recipientType: 'Students',
      type: 'result_available',
      title: `Result Available: ${examName}`,
      message: `Your result for exam "${examName}" (${examCode}) is now available. Your score: ${score}%`,
      examCode,
      priority: 'medium',
      actionUrl: `/student/reports/${studentId}`,
      sendEmail: true
    });
  }

  // Notify batch approval
  static async notifyBatchApproval(batchName, studentId) {
    return this.createNotification({
      recipientId: studentId,
      recipientType: 'Students',
      type: 'batch_approved',
      title: `Batch Access Approved`,
      message: `Your request for batch "${batchName}" has been approved. You can now access the exams in this batch.`,
      batchName,
      priority: 'medium',
      actionUrl: `/student/batchlist`,
      sendEmail: true
    });
  }

  // Get notifications for user
  static async getUserNotifications(userId, userType, limit = 50) {
    return Notification.findAll({
      where: {
        recipientId: parseInt(userId),
        recipientType: userType
      },
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit)
    });
  }

  // Mark notification as read
  static async markAsRead(notificationId, userId) {
    const notification = await Notification.findOne({
      where: {
        id: parseInt(notificationId),
        recipientId: parseInt(userId)
      }
    });
    
    if (notification) {
      await notification.update({
        read: true,
        readAt: new Date()
      });
    }
    
    return notification;
  }

  // Mark all as read
  static async markAllAsRead(userId, userType) {
    return Notification.update(
      { read: true, readAt: new Date() },
      {
        where: {
          recipientId: parseInt(userId),
          recipientType: userType,
          read: false
        }
      }
    );
  }

  // Get unread count
  static async getUnreadCount(userId, userType) {
    return Notification.count({
      where: {
        recipientId: parseInt(userId),
        recipientType: userType,
        read: false
      }
    });
  }
}

export default NotificationService;

