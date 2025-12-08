// POST /api/batch-access/request
import express from 'express';
import { StudentBatchAccess, Batch, Exam, Student } from '../../models/mysql/index.js';
import { Op } from 'sequelize';

const router = express.Router();


//API – Student Request Access to a Batch
// router.post('/api/batch-access/request', async (req, res) => {
export const BatchRequest= async (req, res) => {

  try {
    const { studentId, examCode, batchName } = req.body;

    const existingRequest = await StudentBatchAccess.findOne({ 
      where: { 
        studentId: parseInt(studentId), 
        examCode, 
        batchName 
      } 
    });
    if (existingRequest) {
      return res.status(400).json({ message: 'Already requested for this batch' });
    }

    const newRequest = await StudentBatchAccess.create({ 
      studentId: parseInt(studentId), 
      examCode, 
      batchName 
    });

    res.json({ message: 'Access request submitted successfully' });
  } catch (err) {
    console.error('Request error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

//API – Admin Approves or Declines
// router.put('/api/batch-access/update', async (req, res) => {
export const BatchAccessUpdate = async (req, res) => {

  try {
    const { studentId, examCode, batchName, status } = req.body;

    const request = await StudentBatchAccess.findOne({
      where: { 
        studentId: parseInt(studentId), 
        examCode, 
        batchName 
      }
    });

    if (!request) {
      return res.status(404).json({ message: 'Request not found' });
    }

    await request.update({ 
      status, 
      updatedAt: new Date() 
    });

    res.json({ message: `Batch access ${status}` });
  } catch (err) {
    console.error('Admin update error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};


// Before Showing Questions to Student — Validate Access
// router.get('/api/student/exam/:examCode/batch/:batchName', async (req, res) => {
export const ShowQuestion = async (req, res) => {
  const { examCode, batchName } = req.params;
  const { studentId } = req.query; // or req.user from auth middleware

  try {
    const studentIdInt = parseInt(studentId);

    // Check if student has approved access
    const access = await StudentBatchAccess.findOne({ 
      where: { 
        studentId: studentIdInt, 
        examCode, 
        batchName 
      } 
    });

    if (!access || access.status !== 'approved') {
      return res.status(403).json({ message: 'Access to batch not approved' });
    }

    // Find batch
    const batch = await Batch.findOne({
      where: { batchName }
    });

    if (!batch) {
      return res.status(404).json({ message: 'Batch not found' });
    }

    // Find exam in this batch
    const exam = await Exam.findOne({
      where: {
        batchId: batch.id,
        examCode
      }
    });

    if (!exam) {
      return res.status(404).json({ message: 'Exam not found in batch' });
    }

    res.json({ batch: { ...batch.toJSON(), exam } });
  } catch (error) {
    console.error('Error showing questions:', error);
    res.status(500).json({ message: 'Server error' });
  }
};



// Create a request
export const requestBatchAccess = async (req, res) => {
  try {
    const { studentId, batchName } = req.body;

    console.log('📥 Batch access request received:', { studentId, batchName });

    // Validate input
    if (!studentId || !batchName) {
      return res.status(400).json({ 
        message: 'Student ID and batch name are required',
        error: 'Missing required fields'
      });
    }

    // Check if a request already exists for student + batch
    const existing = await StudentBatchAccess.findOne({ 
      where: { 
        studentId: parseInt(studentId), 
        batchName 
      } 
    });
    
    if (existing) {
      console.log('⚠️ Request already exists:', existing.status);
      return res.status(400).json({ 
        message: 'Request already exists for this batch',
        status: existing.status
      });
    }

    const request = await StudentBatchAccess.create({ 
      studentId: parseInt(studentId), 
      batchName,
      status: 'pending',
      requestedAt: new Date(),
      updatedAt: new Date()
    });
    
    console.log('✅ Batch access request created:', request.id);
    res.status(201).json({
      message: 'Access request submitted successfully',
      request: request
    });
  } catch (err) {
    console.error('❌ Error creating batch access request:', err);
    res.status(500).json({ 
      message: 'Server Error', 
      error: err.message,
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
};

export const approveBatchAccess = async (req, res) => {
  try {
    const { studentId, batchName } = req.body;

    const access = await StudentBatchAccess.findOne({
      where: { 
        studentId: parseInt(studentId), 
        batchName 
      }
    });

    if (!access) return res.status(404).json({ message: 'Access request not found' });

    await access.update({ 
      status: 'approved', 
      updatedAt: new Date() 
    });

    res.status(200).json(access);
  } catch (err) {
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

export const getStudentAccessList = async (req, res) => {
  try {
    const { studentId } = req.query;
    const accessList = await StudentBatchAccess.findAll({ 
      where: { studentId: parseInt(studentId) } 
    });
    res.status(200).json(accessList);
  } catch (err) {
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

// Get all requests (admin)
export const getAllRequests = async (req, res) => {
  try {
    const requests = await StudentBatchAccess.findAll({
      include: [{
        model: Student,
        as: 'student',
        attributes: ['id', 'name', 'email', 'mobileNumber'],
        required: false // Left join - include even if student not found
      }],
      order: [['requestedAt', 'DESC']]
    });

    // Format response to ensure student data is accessible
    const formattedRequests = requests.map(request => {
      const requestData = request.toJSON();
      return {
        ...requestData,
        student: requestData.student || null,
        studentId: requestData.studentId || requestData.student?.id || null,
        requestedAt: requestData.requestedAt || requestData.requested_at,
        requested_at: requestData.requestedAt || requestData.requested_at // Support both formats
      };
    });

    res.status(200).json(formattedRequests);
  } catch (err) {
    console.error('Error fetching batch access requests:', err);
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

// Update request status
export const updateRequestStatus = async (req, res) => {
  try {
    const { studentId, batchName, status } = req.body;
    const request = await StudentBatchAccess.findOne({
      where: { 
        studentId: parseInt(studentId), 
        batchName 
      }
    });
    if (!request) return res.status(404).json({ message: 'Request not found' });
    
    await request.update({ status });
    res.status(200).json(request);
  } catch (err) {
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};


// PUT /api/batch-access/update
// router.put('/api/batch-access/update', async (req, res) => {
export const BatchUpdate = async (req, res) => {
  try {
    const { studentId, examCode, batchName, status } = req.body;

    const request = await StudentBatchAccess.findOne({
      where: { 
        studentId: parseInt(studentId), 
        examCode, 
        batchName 
      }
    });

    if (!request) {
      return res.status(404).json({ message: 'Request not found' });
    }

    await request.update({ 
      status, 
      updatedAt: new Date() 
    });

    res.json({ message: `Batch access ${status}` });
  } catch (err) {
    console.error('Admin update error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

export default router;
