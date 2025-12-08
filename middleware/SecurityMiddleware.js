// Security middleware for anti-cheating measures

export const trackActivity = (req, res, next) => {
  // Track IP and user agent
  req.clientInfo = {
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('user-agent')
  };
  next();
};

export const validateExamAccess = async (req, res, next) => {
  try {
    const { examCode, batchName } = req.params;
    const studentId = req.user?.id || req.query.studentId;

    if (!studentId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Import MySQL models to avoid circular dependency
    const { Batch, StudentBatchAccess, Exam } = await import('../models/mysql/index.js');

    // Check batch access
    const access = await StudentBatchAccess.findOne({
      where: {
        studentId: parseInt(studentId),
        batchName,
        status: 'approved'
      }
    });

    if (!access) {
      return res.status(403).json({ message: 'Access to this batch not approved' });
    }

    // Check exam scheduling - find batch and exam
    const batch = await Batch.findOne({ 
      where: { batchName },
      include: [{
        model: Exam,
        as: 'exams',
        where: { examCode },
        required: false
      }]
    });
    
    if (!batch) {
      return res.status(404).json({ message: 'Batch not found' });
    }

    const exam = batch.exams && batch.exams.length > 0 ? batch.exams[0] : null;
    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }

    const now = new Date();
    if (exam.isScheduled) {
      if (exam.scheduledStartDate && now < exam.scheduledStartDate) {
        return res.status(403).json({ 
          message: 'Exam has not started yet',
          scheduledStartDate: exam.scheduledStartDate
        });
      }
      if (exam.scheduledEndDate && now > exam.scheduledEndDate) {
        if (!exam.allowLateSubmission) {
          return res.status(403).json({ 
            message: 'Exam time has expired',
            scheduledEndDate: exam.scheduledEndDate
          });
        }
      }
    }

    req.exam = exam;
    next();
  } catch (error) {
    console.error('Error validating exam access:', error);
    res.status(500).json({ message: 'Error validating exam access', error: error.message });
  }
};

