
import { 
  StudentExamReport, 
  Batch, 
  Exam, 
  CivilQuestion, 
  GKQuestion,
  AnswerDetail,
  Student,
  ExamRequest,
  StudentBatchAccess
} from '../../models/mysql/index.js';
import { Op } from 'sequelize';
import NotificationService from '../../services/NotificationService.js';



export const submittedStudentExam = async (req, res) => {
  try {
    const { examId, studentId, answers, reviewFlags, startTime, endTime } = req.body;

    const examIdInt = parseInt(examId);
    const studentIdInt = parseInt(studentId);

    // Fetch exam and all related questions
    const exam = await Exam.findOne({
      where: { id: examIdInt },
      include: [
        {
          model: CivilQuestion,
          as: 'civilQuestions',
          required: false
        },
        {
          model: GKQuestion,
          as: 'generalKnowledgeQuestions',
          required: false
        }
      ]
    });
    
    if (!exam) return res.status(404).json({ message: 'Exam not found' });

    const allQuestions = [
      ...(exam.civilQuestions || []),
      ...(exam.generalKnowledgeQuestions || [])
    ];

    const answerDetails = [];
    let correct = 0, wrong = 0, reviewCount = 0;

    for (const question of allQuestions) {
      const qid = String(question.id);
      const selectedOption = answers[qid];
      const markedForReview = reviewFlags?.[qid] || false;

      const isCorrect = selectedOption === question.correctOption;
      if (selectedOption) isCorrect ? correct++ : wrong++;
      if (markedForReview) reviewCount++;

      answerDetails.push({
        questionId: qid,
        selectedOption: selectedOption || '',
        isCorrect,
        markedForReview,
      });
    }

    const attempted = answerDetails.filter(a => a.selectedOption).length;
    const unanswered = allQuestions.length - attempted;

    const newReport = await StudentExamReport.create({
      examId: examIdInt,
      examCode: exam.examCode,
      studentId: studentIdInt,
      totalQuestions: allQuestions.length,
      attemptedQuestions: attempted,
      unansweredQuestions: unanswered,
      correctAnswers: correct,
      wrongAnswers: wrong,
      reviewedQuestionsCount: reviewCount,
      result: Math.round((correct / allQuestions.length) * 100),
      status: 'completed',
      startTime,
      endTime,
      durationInMinutes: (new Date(endTime) - new Date(startTime)) / 60000,
    });

    // Create answer details
    if (answerDetails.length > 0) {
      const answerDetailRecords = answerDetails.map(ad => ({
        reportId: newReport.id,
        questionId: ad.questionId,
        questionNumber: allQuestions.find(q => String(q.id) === ad.questionId)?.questionNumber || 0,
        selectedOption: ad.selectedOption,
        isCorrect: ad.isCorrect,
        markedForReview: ad.markedForReview
      }));
      
      await AnswerDetail.bulkCreate(answerDetailRecords);
    }

    res.status(201).json({ message: 'Exam submitted', report: newReport });
  } catch (error) {
    console.error('Submit Exam Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const ExamReport = async (req, res) => {
  try {
    const {
      examCode,
      studentId,
      totalQuestions,
      answers = {},
      attemptedQuestions,
      unansweredQuestions,
      reviewedQuestionsCount,
      status,
      endTime
    } = req.body;

    if (!examCode || !studentId) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const studentIdInt = parseInt(studentId);

    const existingReport = await StudentExamReport.findOne({
      where: {
        examCode,
        studentId: studentIdInt
      }
    });

    if (!existingReport) {
      return res.status(404).json({ message: 'Exam not started or not found' });
    }

    // Optional: Fetch questions to compute result
    const exam = await Exam.findOne({
      where: { examCode },
      include: [
        {
          model: CivilQuestion,
          as: 'civilQuestions',
          required: false
        },
        {
          model: GKQuestion,
          as: 'generalKnowledgeQuestions',
          required: false
        }
      ]
    });
    
    const questionMap = {};
    if (exam) {
      const allQuestions = [
        ...(exam.civilQuestions || []),
        ...(exam.generalKnowledgeQuestions || [])
      ];
      for (const q of allQuestions) {
        questionMap[q.questionNumber] = q.correctOption;
      }
    }

    let correctAnswers = 0;
    let wrongAnswers = 0;

    for (const [qNo, selected] of Object.entries(answers)) {
      const correct = questionMap[qNo];
      if (selected === correct) correctAnswers++;
      else wrongAnswers++;
    }

    const result = Math.round((correctAnswers / totalQuestions) * 100);

    // Update fields
    await existingReport.update({
      totalQuestions,
      attemptedQuestions,
      unansweredQuestions,
      reviewedQuestionsCount,
      status: status || 'completed',
      endTime: endTime ? new Date(endTime) : new Date(),
      autoSubmitted: false,
      correctAnswers,
      wrongAnswers,
      result
    });

    // Update answer details if provided
    if (Object.keys(answers).length > 0) {
      // Delete old answer details
      await AnswerDetail.destroy({ where: { reportId: existingReport.id } });
      
      // Create new answer details
      const answerDetailRecords = Object.entries(answers).map(([qNo, selected]) => ({
        reportId: existingReport.id,
        questionId: String(qNo),
        questionNumber: parseInt(qNo),
        selectedOption: selected,
        correctOption: questionMap[qNo] || '',
        isCorrect: selected === questionMap[qNo],
        markedForReview: false
      }));
      
      if (answerDetailRecords.length > 0) {
        await AnswerDetail.bulkCreate(answerDetailRecords);
      }
    }

    return res.status(200).json({ message: '✅ Exam submitted successfully', result });
  } catch (error) {
    console.error('❌ Submit Error:', error);
    return res.status(500).json({ message: 'Server error while submitting exam' });
  }
};


export  const ExamsList = async (req, res) => {
  try {
    const { studentId, showAll } = req.query; // ✅ Added showAll for admin view

    // ✅ For admin view (no studentId and showAll=true), show all exams including drafts
    // ✅ For student view, only show active exams
    const whereClause = studentId || showAll !== 'true' 
      ? { status: 'active' } 
      : {}; // Admin view: show all statuses

    // Get all exams
    const allExams = await Exam.findAll({
      attributes: ['id', 'examCode', 'examName', 'examDescription', 'batchId', 'createdAt', 'status', 'category', 'duration', 'year', 'month'],
      include: [{
        model: Batch,
        as: 'batch',
        attributes: ['id', 'batchName']
      }],
      where: whereClause,
      order: [['createdAt', 'DESC']]
    });

    // If studentId provided, filter by approval status
    if (studentId) {
      const studentIdInt = parseInt(studentId);
      
      // Get all exam requests for this student
      const examRequests = await ExamRequest.findAll({
        where: { studentId: studentIdInt }
      });

      const requestMap = {};
      examRequests.forEach(req => {
        requestMap[req.examCode] = req.status;
      });

      // Filter exams: show approved exams OR exams not yet requested
      const filteredExams = allExams.filter(exam => {
        const requestStatus = requestMap[exam.examCode];
        // Show if: approved OR not requested yet (null/undefined)
        // Don't show if: denied
        return requestStatus === 'approved' || requestStatus === undefined || requestStatus === null;
      });

      // Add request status to each exam
      const examsWithStatus = filteredExams.map(exam => ({
        ...exam.toJSON(),
        requestStatus: requestMap[exam.examCode] || null
      }));

      return res.status(200).json(examsWithStatus);
    }

    // If no studentId, return all exams (for admin view)
    res.status(200).json(allExams);
  } catch (error) {
    console.error('Error fetching exams:', error);
    res.status(500).json({ message: 'Failed to fetch exams.' });
  }
}


// 1. Controller: Get Exam Questions by examCode
// /api/exams/questions/${examCode}
export const getExamQuestionsByCodeAndBatch = async (req, res) => {
  const { examCode, batchName } = req.params;

  try {
    const decodedBatchName = decodeURIComponent(batchName).trim();

    // Find batch
    const batch = await Batch.findOne({
      where: {
        batchName: {
          [Op.like]: decodedBatchName
        }
      }
    });

    if (!batch) {
      console.log(`Batch "${decodedBatchName}" not found.`);
      return res.status(404).json({ message: 'Batch not found' });
    }

    // Find exam with questions
    const exam = await Exam.findOne({
      where: {
        batchId: batch.id,
        examCode: {
          [Op.like]: examCode.trim()
        }
      },
      include: [
        {
          model: CivilQuestion,
          as: 'civilQuestions',
          required: false
        },
        {
          model: GKQuestion,
          as: 'generalKnowledgeQuestions',
          required: false
        }
      ]
    });

    if (!exam) {
      console.log(`Exam with code "${examCode}" not found in batch "${batchName}".`);
      return res.status(404).json({ message: 'Exam not found in this batch' });
    }

    // Check exam scheduling
    const now = new Date();
    if (exam.isScheduled) {
      if (exam.scheduledStartDate && now < exam.scheduledStartDate) {
        return res.status(403).json({ 
          message: 'Exam has not started yet',
          scheduledStartDate: exam.scheduledStartDate
        });
      }
      if (exam.scheduledEndDate && now > exam.scheduledEndDate) {
        if (!exam.allowLateSubmission || 
            (exam.lateSubmissionMinutes && 
             now > new Date(exam.scheduledEndDate.getTime() + exam.lateSubmissionMinutes * 60000))) {
          return res.status(403).json({ 
            message: 'Exam time has expired',
            scheduledEndDate: exam.scheduledEndDate
          });
        }
      }
    }

    // Check exam status
    if (exam.status === 'draft' || exam.status === 'cancelled') {
      return res.status(403).json({ message: 'Exam is not available' });
    }

    // ✅ SECURITY: Check if student has approved batch access
    const studentId = req.query?.studentId || req.body?.studentId;
    if (studentId) {
      const studentIdInt = parseInt(studentId);
      if (isNaN(studentIdInt)) {
        return res.status(400).json({ 
          message: 'Invalid student ID',
        });
      }

      // Check if student has approved access to this batch
      // Note: batchName matching should be exact (MySQL string comparison is case-insensitive by default)
      const batchAccess = await StudentBatchAccess.findOne({
        where: {
          studentId: studentIdInt,
          batchName: decodedBatchName.trim()
        }
      });

      if (!batchAccess) {
        return res.status(403).json({ 
          message: 'Access denied. Please request access to this batch first.',
          requiresApproval: true
        });
      }

      if (batchAccess.status === 'pending') {
        return res.status(403).json({ 
          message: 'Your request is pending approval. Please wait for admin approval.',
          status: 'pending'
        });
      }

      if (batchAccess.status === 'declined') {
        return res.status(403).json({ 
          message: 'Your request has been declined. Please contact admin for access.',
          status: 'declined'
        });
      }

      // Only allow if status is 'approved'
      if (batchAccess.status !== 'approved') {
        return res.status(403).json({ 
          message: 'Access denied. Your request has not been approved.',
          status: batchAccess.status
        });
      }
    }

    // ✅ Combine both civil and GK questions
    const civilQuestions = exam.civilQuestions || [];
    const gkQuestions = exam.generalKnowledgeQuestions || [];
    
    // Convert to array format with question type
    let allQuestions = [
      ...civilQuestions.map(q => ({ ...q.toJSON(), questionSource: 'civil' })),
      ...gkQuestions.map(q => ({ ...q.toJSON(), questionSource: 'gk' }))
    ];

    // Randomize questions if enabled
    if (exam.randomizeQuestions) {
      allQuestions = allQuestions.sort(() => Math.random() - 0.5);
    }

    // Format questions with optional randomization
    const formattedQuestions = allQuestions.map((q, index) => {
      // Build options object from separate fields
      let options = {
        A: q.optionA || '',
        B: q.optionB || '',
        C: q.optionC || '',
        D: q.optionD || ''
      };
      
      let subOptions = {};
      if (q.questionSource === 'gk') {
        subOptions = {
          i: q.subOptionI || '',
          ii: q.subOptionIi || '',
          iii: q.subOptionIii || '',
          iv: q.subOptionIv || ''
        };
      }
      
      let optionMap = { A: 'A', B: 'B', C: 'C', D: 'D' };

      // Randomize options if enabled
      if (exam.randomizeOptions) {
        const optionKeys = Object.keys(options).sort(() => Math.random() - 0.5);
        const newOptions = {};
        const newMap = {};
        optionKeys.forEach((key, idx) => {
          const newKey = ['A', 'B', 'C', 'D'][idx];
          newOptions[newKey] = options[key];
          newMap[newKey] = key;
        });
        options = newOptions;
        optionMap = newMap;
      }

      return {
        _id: q.id,
        questionNumber: q.questionNumber || index + 1,
        questionTextEnglish: q.questionTextEnglish,
        questionTextTamil: q.questionTextTamil || '',
        ocrTamilRawText: '',
        passage: q.passage || '',
        passageTamil: q.passageTamil || '',
        options: options,
        subOptions: subOptions,
        questionType: q.questionType || 'mcq',
        explanation: q.explanation || '',
        difficulty: q.difficulty || 'medium',
        imageUrl: q.imageUrl || '',
        optionMap: exam.randomizeOptions ? optionMap : null,
        correctOption: exam.randomizeOptions ? optionMap[q.correctOption] : q.correctOption
      };
    });

    // Set UTF-8 charset header for proper Tamil text encoding
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    
    return res.status(200).json({
      examId: exam.id,
      examName: exam.examName,
      examDescription: exam.examDescription || '',
      questions: formattedQuestions,
      examDuration: exam.duration || null,
      batchDuration: exam.duration || null,
    });
  } catch (error) {
    console.error('Error fetching exam questions:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};





export const submitStudentExams = async (req, res) => {
  try {
    const {
      examId,
      examCode,
      batchName,
      studentId,
      answers,
      reviewedQuestions = [],
      startTime,
      endTime,
      autoSubmitted = false,
      tabSwitchCount = 0,
      suspiciousActivity = false,
      activityLog = [],
      ipAddress,
      userAgent
    } = req.body;

    if (!examId || !examCode || !studentId || !answers) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Ensure examId and studentId are integers (not strings or ObjectIds)
    const examIdInt = parseInt(String(examId));
    const studentIdInt = parseInt(String(studentId));

    if (isNaN(examIdInt) || isNaN(studentIdInt)) {
      return res.status(400).json({ 
        message: 'Invalid examId or studentId. Must be valid integers.',
        received: { examId, studentId }
      });
    }

    // 🔍 Find the batch and exam
    const batch = await Batch.findOne({ 
      where: { batchName } 
    });
    if (!batch) return res.status(404).json({ message: 'Batch not found' });

    const exam = await Exam.findOne({
      where: {
        id: examIdInt,
        batchId: batch.id,
        examCode
      },
      include: [
        {
          model: CivilQuestion,
          as: 'civilQuestions',
          required: false
        },
        {
          model: GKQuestion,
          as: 'generalKnowledgeQuestions',
          required: false
        }
      ]
    });
    
    if (!exam) return res.status(404).json({ message: 'Exam not found in batch' });

    // Check if multiple attempts are allowed
    const existingAttempts = await StudentExamReport.findAll({
      where: {
        examId: examIdInt,
        studentId: studentIdInt
      },
      order: [['attemptNumber', 'DESC']]
    });

    const attemptNumber = existingAttempts.length > 0 
      ? existingAttempts[0].attemptNumber + 1 
      : 1;

    if (!exam.allowMultipleAttempts && attemptNumber > 1) {
      return res.status(403).json({ message: 'Multiple attempts not allowed for this exam' });
    }

    if (exam.maxAttempts && attemptNumber > exam.maxAttempts) {
      return res.status(403).json({ 
        message: `Maximum attempts (${exam.maxAttempts}) reached for this exam` 
      });
    }

    // ✅ Combine questions
    const civilQuestions = exam.civilQuestions || [];
    const gkQuestions = exam.generalKnowledgeQuestions || [];
    const allQuestions = [
      ...civilQuestions.map(q => ({ ...q.toJSON(), questionSource: 'civil' })),
      ...gkQuestions.map(q => ({ ...q.toJSON(), questionSource: 'gk' }))
    ];

    if (allQuestions.length === 0) {
      return res.status(400).json({ message: 'No questions found in the exam' });
    }

    let correctAnswersCount = 0;
    let attemptedQuestionsCount = 0;
    let unansweredQuestionsCount = 0;
    let wrongAnswersCount = 0;

    const answerDetails = [];

    for (const question of allQuestions) {
      const qNoStr = String(question.questionNumber);
      const studentAnswer = answers[qNoStr];
      const isReviewed = reviewedQuestions.includes(qNoStr);

      const correctOption = question.correctOption?.trim?.().toUpperCase();
      const selectedOption = studentAnswer?.trim?.().toUpperCase();

      const isCorrect = selectedOption && selectedOption === correctOption;

      if (selectedOption) {
        attemptedQuestionsCount++;
        if (isCorrect) correctAnswersCount++;
        else wrongAnswersCount++;
      } else {
        unansweredQuestionsCount++;
      }

      answerDetails.push({
        questionId: question.id,
        questionNumber: question.questionNumber,
        selectedOption: selectedOption || '',
        correctOption: correctOption || '',
        isCorrect,
        markedForReview: isReviewed
      });
    }

    const reviewedQuestionsCount = reviewedQuestions.length;
    const result = Math.round((correctAnswersCount / allQuestions.length) * 100);
    const durationInMinutes = Math.floor(
      (new Date(endTime || Date.now()) - new Date(startTime || Date.now())) / 60000
    );

    // Determine if this is the best attempt
    let isBestAttempt = false;
    if (existingAttempts.length > 0) {
      const bestScore = Math.max(...existingAttempts.map(a => a.result || 0));
      isBestAttempt = result > bestScore;
      
      // Update previous best attempt flag
      if (isBestAttempt) {
        await StudentExamReport.update(
          { isBestAttempt: false },
          {
            where: {
              examId: examIdInt,
              studentId: studentIdInt,
              isBestAttempt: true
            }
          }
        );
      }
    } else {
      isBestAttempt = true; // First attempt is always best
    }

    // 🔁 Create new report for this attempt
    // Ensure we're using integers, not strings or ObjectIds
    const studentReport = await StudentExamReport.create({
      examId: examIdInt, // Must be INTEGER for MySQL
      examCode: String(examCode),
      studentId: studentIdInt, // Must be INTEGER for MySQL
      totalQuestions: allQuestions.length,
      attemptedQuestions: attemptedQuestionsCount,
      unansweredQuestions: unansweredQuestionsCount,
      correctAnswers: correctAnswersCount,
      wrongAnswers: wrongAnswersCount,
      reviewedQuestionsCount,
      result,
      status: 'completed',
      startTime: startTime || new Date(),
      endTime: endTime || new Date(),
      durationInMinutes,
      autoSubmitted,
      attemptNumber,
      isBestAttempt,
      tabSwitchCount,
      suspiciousActivity: suspiciousActivity || tabSwitchCount > 10,
      activityLog: activityLog.length > 0 ? activityLog : null,
      ipAddress,
      userAgent
    });

    // Create answer details records
    if (answerDetails.length > 0) {
      const answerDetailRecords = answerDetails.map(ad => ({
        reportId: studentReport.id,
        questionId: String(ad.questionId),
        questionNumber: ad.questionNumber,
        selectedOption: ad.selectedOption,
        correctOption: ad.correctOption,
        isCorrect: ad.isCorrect,
        markedForReview: ad.markedForReview
      }));
      
      await AnswerDetail.bulkCreate(answerDetailRecords);
    }

    // Send result notification
    try {
      await NotificationService.notifyResultAvailable(
        examCode,
        exam.examName,
        studentIdInt,
        result
      );
    } catch (notifError) {
      console.error('Error sending notification:', notifError);
    }

    return res.status(200).json({
      message: '✅ Exam submitted successfully',
      result,
      correctAnswers: correctAnswersCount,
      wrongAnswers: wrongAnswersCount,
      attemptedQuestions: attemptedQuestionsCount,
      unansweredQuestions: unansweredQuestionsCount,
      durationInMinutes,
      answerDetails
    });
  } catch (error) {
    console.error('❌ Exam submission error:', error);
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack,
      examId: req.body?.examId,
      examIdType: typeof req.body?.examId
    });
    
    // Check if it's a MongoDB ObjectId error
    if (error.message && error.message.includes('ObjectId')) {
      return res.status(500).json({ 
        message: 'Server error: Database model mismatch. Please contact support.',
        error: 'Invalid data type for examId. Expected integer, received: ' + typeof req.body?.examId
      });
    }
    
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};



export const getStudentExamReport = async (req, res) => {
  const { studentId, examId } = req.params;

  try {
    const studentIdInt = parseInt(studentId);
    const examIdInt = parseInt(examId);

    const report = await StudentExamReport.findOne({
      where: {
        studentId: studentIdInt,
        examId: examIdInt,
        status: 'completed',
      },
      include: [{
        model: AnswerDetail,
        as: 'answerDetails'
      }]
    });

    if (!report) {
      return res.status(404).json({ message: 'Exam report not found' });
    }

    const exam = await Exam.findOne({
      where: { id: examIdInt },
      include: [
        {
          model: CivilQuestion,
          as: 'civilQuestions',
          required: false
        },
        {
          model: GKQuestion,
          as: 'generalKnowledgeQuestions',
          required: false
        }
      ]
    });

    if (!exam) {
      return res.status(404).json({ message: 'Exam data not found' });
    }

    const civilQuestions = exam.civilQuestions || [];
    const gkQuestions = exam.generalKnowledgeQuestions || [];
    const allQuestions = [
      ...civilQuestions.map(q => ({ ...q.toJSON(), questionSource: 'civil' })),
      ...gkQuestions.map(q => ({ ...q.toJSON(), questionSource: 'gk' }))
    ];

    const enrichedAnswers = (report.answerDetails || []).map((answer) => {
      const q = allQuestions.find(q => q.id === parseInt(answer.questionId));

      // Build options object
      const options = q ? {
        A: q.optionA || '',
        B: q.optionB || '',
        C: q.optionC || '',
        D: q.optionD || ''
      } : {};

      const subOptions = (q && q.questionSource === 'gk') ? {
        i: q.subOptionI || '',
        ii: q.subOptionIi || '',
        iii: q.subOptionIii || '',
        iv: q.subOptionIv || ''
      } : {};

      return {
        ...answer.toJSON(),
        questionData: q
          ? {
              id: q.id,
              questionNumber: q.questionNumber,
              questionTextEnglish: q.questionTextEnglish,
              questionTextTamil: q.questionTextTamil || '',
              options: options,
              subOptions: subOptions,
              correctOption: q.correctOption,
              explanation: q.explanation || '',
              imageUrl: q.imageUrl || q.image_url || '',
              hasImage: q.hasImage || (q.imageUrl || q.image_url ? true : false),
            }
          : null,
      };
    });

    return res.status(200).json({
      ...report.toJSON(),
      answerDetails: enrichedAnswers,
      examInfo: {
        examCode: exam.examCode,
        examName: exam.examName,
        category: exam.category,
        duration: exam.duration,
        examDescription: exam.examDescription,
        year: exam.year,
        month: exam.month,
        civilQuestionsCount: civilQuestions.length,
        generalKnowledgeQuestionsCount: gkQuestions.length,
        totalQuestions: allQuestions.length,
      },
    });
  } catch (error) {
    console.error('❌ Error fetching student exam report:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};





// 3. Controller: Get Student Exam Submission Status and Score

export const getStudentExamStatus = async (req, res) => {
  const { studentId, examCode } = req.params;

  try {
    const examReport = await StudentExamReport.findOne({ 
      where: { 
        studentId: parseInt(studentId), 
        examCode 
      } 
    });

    if (!examReport) {
      return res.status(404).json({ message: 'Exam submission not found' });
    }

    return res.status(200).json({
      isSubmitted: examReport.status === 'completed',
      score: examReport.result,
    });
  } catch (error) {
    console.error('Error fetching exam status:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};


// 3. Admin API: List All Submissions (with filters)
// GET /api/student-exams?examId=xyz
export const getAllExamReports = async (req, res) => {
  try {
    const { examId } = req.query;

    const where = examId ? { examId: parseInt(examId) } : {};
    
    const reports = await StudentExamReport.findAll({
      where,
      include: [
        {
          model: Student,
          as: 'student',
          attributes: ['id', 'name', 'email']
        },
        {
          model: Exam,
          as: 'exam',
          attributes: ['id', 'examName', 'examCode']
        }
      ]
    });

    res.status(200).json(reports);
  } catch (error) {
    console.error('Get Reports Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const getAllStudentReports = async (req, res) => {
  const { studentId } = req.params;

  try {
    const reports = await StudentExamReport.findAll({
      where: { studentId: parseInt(studentId) },
      include: [{
        model: Exam,
        as: 'exam',
        attributes: ['id', 'examName', 'examCode', 'category']
      }],
      order: [['createdAt', 'DESC']]
    });

    res.status(200).json(reports);
  } catch (error) {
    console.error('Error fetching all reports:', error);
    res.status(500).json({ message: 'Failed to fetch reports', error: error.message });
  }
};



export const Questions =  async (req, res) => {
  try {
    const { examCode } = req.params; 
    const exam = await Exam.findOne({
      where: { examCode },
      include: [
        {
          model: CivilQuestion,
          as: 'civilQuestions',
          required: false
        },
        {
          model: GKQuestion,
          as: 'generalKnowledgeQuestions',
          required: false
        }
      ]
    });

    if (!exam) return res.status(404).json({ message: "Exam not found" });

    // Combine questions
    const allQuestions = [
      ...(exam.civilQuestions || []),
      ...(exam.generalKnowledgeQuestions || [])
    ];

    // remove correct options before sending to students
    const questionsForStudent = allQuestions.map(q => ({
      questionNumber: q.questionNumber,
      questionText: q.questionTextEnglish,
      options: {
        A: q.optionA,
        B: q.optionB,
        C: q.optionC,
        D: q.optionD
      }, 
    }));

    res.status(200).json({ examCode, Batch: questionsForStudent });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
}

export const deleteExam = async (req, res) => {
  const { examCode } = req.params;

  try {
    const exam = await Exam.findOne({ where: { examCode } });

    if (!exam) {
      return res.status(404).json({ message: "Exam not found" });
    }

    // Delete related questions first
    await CivilQuestion.destroy({ where: { examId: exam.id } });
    await GKQuestion.destroy({ where: { examId: exam.id } });
    
    // Delete exam
    await exam.destroy();

    res.status(200).json({ message: "Exam deleted successfully" });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ error: "Server error" });
  }
};
