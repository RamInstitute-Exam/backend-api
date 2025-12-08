import express from 'express';
import {
  requestBatchAccess,
  getAllRequests,
  updateRequestStatus,
  BatchRequest,
  BatchAccessUpdate,
  ShowQuestion,
  getStudentAccessList
} from '../Controller/Batch/BatchControl.js';

const router = express.Router();

router.post('/request', requestBatchAccess);         
router.get('/access/requests/list', getAllRequests);            
router.put('/access/update', updateRequestStatus);
router.get('/access/list', getStudentAccessList);
// router.post('/api/batch-access/request', BatchRequest);
// router.put('/api/batch-access/update',BatchAccessUpdate)
router.get('/api/student/exam/:examCode/batch/:batchName',ShowQuestion)

export default router;
