import { Batch, Exam, StudentBatchAccess } from '../../models/mysql/index.js';
import NotificationService from '../../services/NotificationService.js';
import { Op } from 'sequelize';

// Schedule an exam
export const scheduleExam = async (req, res) => {
  try {
    const { batchName, examCode } = req.params;
    const {
      scheduledStartDate,
      scheduledEndDate,
      timezone = 'Asia/Kolkata',
      allowLateSubmission = false,
      lateSubmissionMinutes = 0
    } = req.body;

    const batch = await Batch.findOne({ where: { batchName } });
    if (!batch) {
      return res.status(404).json({ message: 'Batch not found' });
    }

    const exam = await Exam.findOne({
      where: {
        batchId: batch.id,
        examCode
      }
    });
    
    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }

    // Update exam scheduling
    await exam.update({
      isScheduled: true,
      scheduledStartDate: new Date(scheduledStartDate),
      scheduledEndDate: new Date(scheduledEndDate),
      timezone,
      allowLateSubmission,
      lateSubmissionMinutes,
      status: 'scheduled'
    });

    // Notify students with batch access
    const approvedStudents = await StudentBatchAccess.findAll({
      where: {
        batchName,
        status: 'approved'
      },
      attributes: ['studentId']
    });

    if (approvedStudents.length > 0) {
      const studentIds = approvedStudents.map(s => s.studentId);
      await NotificationService.notifyExamScheduled(
        examCode,
        exam.examName,
        scheduledStartDate,
        studentIds
      );
    }

    res.status(200).json({
      message: 'Exam scheduled successfully',
      exam: {
        examCode: exam.examCode,
        examName: exam.examName,
        scheduledStartDate: exam.scheduledStartDate,
        scheduledEndDate: exam.scheduledEndDate
      }
    });
  } catch (error) {
    console.error('Error scheduling exam:', error);
    res.status(500).json({ message: 'Failed to schedule exam', error: error.message });
  }
};

// Update exam schedule
export const updateExamSchedule = async (req, res) => {
  try {
    const { batchName, examCode } = req.params;
    const updates = req.body;

    const batch = await Batch.findOne({ where: { batchName } });
    if (!batch) {
      return res.status(404).json({ message: 'Batch not found' });
    }

    const exam = await Exam.findOne({
      where: {
        batchId: batch.id,
        examCode
      }
    });
    
    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }

    const updateData = {};
    if (updates.scheduledStartDate) updateData.scheduledStartDate = new Date(updates.scheduledStartDate);
    if (updates.scheduledEndDate) updateData.scheduledEndDate = new Date(updates.scheduledEndDate);
    if (updates.timezone) updateData.timezone = updates.timezone;
    if (updates.allowLateSubmission !== undefined) updateData.allowLateSubmission = updates.allowLateSubmission;
    if (updates.lateSubmissionMinutes) updateData.lateSubmissionMinutes = updates.lateSubmissionMinutes;

    await exam.update(updateData);

    res.status(200).json({ message: 'Exam schedule updated successfully', exam });
  } catch (error) {
    console.error('Error updating exam schedule:', error);
    res.status(500).json({ message: 'Failed to update exam schedule', error: error.message });
  }
};

// Activate exam (make it available)
export const activateExam = async (req, res) => {
  try {
    const { batchName, examCode } = req.params;

    const batch = await Batch.findOne({ where: { batchName } });
    if (!batch) {
      return res.status(404).json({ message: 'Batch not found' });
    }

    const exam = await Exam.findOne({
      where: {
        batchId: batch.id,
        examCode
      }
    });
    
    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }

    await exam.update({ status: 'active' });

    res.status(200).json({ message: 'Exam activated successfully' });
  } catch (error) {
    console.error('Error activating exam:', error);
    res.status(500).json({ message: 'Failed to activate exam', error: error.message });
  }
};

// Get exam schedule status
export const getExamSchedule = async (req, res) => {
  try {
    const { batchName, examCode } = req.params;

    const batch = await Batch.findOne({ where: { batchName } });
    if (!batch) {
      return res.status(404).json({ message: 'Batch not found' });
    }

    const exam = await Exam.findOne({
      where: {
        batchId: batch.id,
        examCode
      }
    });
    
    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }

    const now = new Date();
    let availability = 'not_scheduled';

    if (exam.isScheduled) {
      if (now < exam.scheduledStartDate) {
        availability = 'upcoming';
      } else if (now >= exam.scheduledStartDate && now <= exam.scheduledEndDate) {
        availability = 'active';
      } else {
        availability = 'expired';
      }
    } else if (exam.status === 'active') {
      availability = 'active';
    }

    res.status(200).json({
      examCode: exam.examCode,
      examName: exam.examName,
      isScheduled: exam.isScheduled,
      scheduledStartDate: exam.scheduledStartDate,
      scheduledEndDate: exam.scheduledEndDate,
      timezone: exam.timezone,
      status: exam.status,
      availability,
      allowLateSubmission: exam.allowLateSubmission,
      lateSubmissionMinutes: exam.lateSubmissionMinutes
    });
  } catch (error) {
    console.error('Error fetching exam schedule:', error);
    res.status(500).json({ message: 'Failed to fetch exam schedule', error: error.message });
  }
};

