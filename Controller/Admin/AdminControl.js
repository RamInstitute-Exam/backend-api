import { Admin, Batch, Exam, StudentBatchAccess, StudentExamReport, Student, ExamRequest } from "../../models/mysql/index.js";
import bcryptjs from "bcryptjs"
import jwt from "jsonwebtoken"
import { Op } from "sequelize";


//Register Admin
export const RegisterAdmin = async(req,res)=>{
try{
    const {username,email,password,mobileNumber} = req.body;
const user = await Admin.findOne({ where: { email } })
if(user){
    return res.status(400).json({message:"User Already Exist"})
}
const hashpassword = await bcryptjs.hash(password,10)

const newUser = await Admin.create({
    username,email,password:hashpassword,mobileNumber
}) 

return res.status(200).json({message:"Admin Register Successfully",newUser})


}
catch(error){
    console.error(error);
return res.status(500).json({message:"Internal Server Error",error})
}
}

//Login Admin
export const LoginAdmin = async(req,res)=>{
try{
const {email,password} = req.body;
const user = await Admin.findOne({ where: { email } })
if(!user){
    return res.status(404).json({message:"User Not Exist"})
}
const IsPassword = await bcryptjs.compare(password,user.password)
if(!IsPassword){
    return res.status(400).json({message:"Invalid password"})
}
const token = jwt.sign({id:user.id,email:user.email},process.env.Secret_key,{expiresIn:'1d'})
      res.cookie("token", token, {
      httpOnly: true,
      secure: true,       
      sameSite:  "None",  
      maxAge: 24 * 60 * 60 * 1000,
    });

return res.status(200).json({message:"Login Successfully",user:{id: user.id,email:user.email}})

}
catch(error){
    console.error(error);
    
}
}


export const Logout = async (req,res)=>{
    try{
const isProduction  = process.env.NODE_ENV  === 'production';

    res.clearCookie('token',{
    httpOnly:true,
    secure:isProduction,
    sameSite:isProduction ? "None": "Lax"
})

return res.status(200).json({message:"Logout Successfully"})
    }
    catch(error){
        console.error(error);
        return res.status(500).json({ error: "Internal server error" });    
    }
}

export const ExamDelete = async (req, res) => {
  const { examCode } = req.params;

  try {
    const exam = await Exam.findOne({ where: { examCode } });
    if (!exam) {
      return res.status(404).json({ message: "Exam not found" });
    }

    await exam.destroy();
    res.status(200).json({ message: "Exam deleted successfully" });
  } catch (error) {
    console.error("Error deleting exam", error);
    res.status(500).json({ message: "Failed to delete exam" });
  }
}


export const UnApprovedStudents = async (req, res) => {
  const { studentId } = req.params;

  try {
    // Find all exam requests for this student
    const requestedExamCodes = await ExamRequest.find({ studentId }).distinct('examCode');

    // Find all exams that are not in the requested list
    const unapprovedExams = await Exam.find({
      examCode: { $nin: requestedExamCodes }
    });

    res.status(200).json(unapprovedExams);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching unapproved exams', error });
  }
}


export const ExamUpdate = async (req, res) => {
  const { examCode } = req.params;
  const { examName, examDescription } = req.body;

  try {
    const exam = await Exam.findOne({ where: { examCode } });
    if (!exam) {
      return res.status(404).json({ message: "Exam not found" });
    }

    await exam.update({ examName, examDescription });

    res.status(200).json(exam);
  } catch (error) {
    console.error("Error updating exam", error);
    res.status(500).json({ message: "Failed to update exam" });
  }
}

export const GetAllRequests = async (req, res) => {
  try {
    const requests = await StudentBatchAccess.findAll({
      include: [{
        model: Student,
        as: 'student',
        attributes: ['id', 'name', 'email']
      }],
      order: [['createdAt', 'DESC']]
    });

    res.status(200).json({ message: 'Requesters', requests });
  } catch (error) {
    console.error("Error fetching requests:", error);
    res.status(500).json({ message: "Failed to fetch requests" });
  }
};

export const AdminReports = async (req, res) => {
  try {
    const { status } = req.query;

    const where = status ? { status } : {};
    
    const reports = await StudentExamReport.findAll({
      where,
      include: [{
        model: Student,
        as: 'student',
        attributes: ['id', 'name', 'email']
      }],
      order: [['startTime', 'DESC']]
    });

    res.json(reports);
  } catch (err) {
    console.error("Error fetching reports:", err);
    res.status(500).json({ message: "Failed to fetch reports" });
  }
}

export const getStudentExamStatusById = async (req, res) => {
  const { studentId } = req.params

  try {
    // Step 1: Count total active exams
    const totalExams = await Exam.count({ 
      where: { status: 'active' } 
    })

    // Step 2: Count how many of those this student has completed
    const completedExams = await StudentExamReport.count({
      where: {
        studentId: parseInt(studentId),
        status: 'completed',
      }
    })

    return res.status(200).json({
      completed: completedExams,
      total: totalExams,
    })
  } catch (err) {
    console.error('Error fetching exam status:', err)
    res.status(500).json({ error: 'Failed to fetch exam status' })
  }
}

// ✅ Get all exam requests (for admin approval UI)
export const GetAllExamRequests = async (req, res) => {
  try {
    const { status } = req.query; // Optional filter: 'pending', 'approved', 'denied'

    const where = status ? { status } : {};

    const requests = await ExamRequest.findAll({
      where,
      include: [{
        model: Student,
        as: 'student',
        attributes: ['id', 'name', 'email', 'mobileNumber']
      }],
      order: [['createdAt', 'DESC']]
    });

    res.status(200).json({ 
      message: 'Exam requests fetched successfully',
      requests 
    });
  } catch (error) {
    console.error("Error fetching exam requests:", error);
    res.status(500).json({ message: "Failed to fetch exam requests" });
  }
};

// ✅ Approve exam request
export const ApproveExamRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { examCode, studentId } = req.body;

    // Find request by ID or by examCode + studentId
    let request;
    if (requestId) {
      request = await ExamRequest.findByPk(requestId);
    } else if (examCode && studentId) {
      request = await ExamRequest.findOne({
        where: {
          examCode,
          studentId: parseInt(studentId)
        }
      });
    } else {
      return res.status(400).json({ message: 'requestId or (examCode + studentId) required' });
    }

    if (!request) {
      return res.status(404).json({ message: 'Exam request not found' });
    }

    if (request.status === 'approved') {
      return res.status(400).json({ message: 'Request is already approved' });
    }

    await request.update({ 
      status: 'approved',
      updatedAt: new Date()
    });

    res.status(200).json({ 
      message: 'Exam request approved successfully',
      request 
    });
  } catch (error) {
    console.error("Error approving exam request:", error);
    res.status(500).json({ message: "Failed to approve exam request" });
  }
};

// ✅ Reject/Deny exam request
export const RejectExamRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { examCode, studentId } = req.body;

    // Find request by ID or by examCode + studentId
    let request;
    if (requestId) {
      request = await ExamRequest.findByPk(requestId);
    } else if (examCode && studentId) {
      request = await ExamRequest.findOne({
        where: {
          examCode,
          studentId: parseInt(studentId)
        }
      });
    } else {
      return res.status(400).json({ message: 'requestId or (examCode + studentId) required' });
    }

    if (!request) {
      return res.status(404).json({ message: 'Exam request not found' });
    }

    if (request.status === 'denied') {
      return res.status(400).json({ message: 'Request is already denied' });
    }

    await request.update({ 
      status: 'denied',
      updatedAt: new Date()
    });

    res.status(200).json({ 
      message: 'Exam request denied successfully',
      request 
    });
  } catch (error) {
    console.error("Error rejecting exam request:", error);
    res.status(500).json({ message: "Failed to reject exam request" });
  }
};

// ✅ Publish/Activate Exam (Change status from draft to active)
export const PublishExam = async (req, res) => {
  try {
    const { examCode, batchName } = req.body;

    if (!examCode) {
      return res.status(400).json({ message: 'examCode is required' });
    }

    let exam;
    if (batchName) {
      // Find by batch and exam code
      const batch = await Batch.findOne({ where: { batchName } });
      if (!batch) {
        return res.status(404).json({ message: 'Batch not found' });
      }
      exam = await Exam.findOne({
        where: {
          batchId: batch.id,
          examCode
        }
      });
    } else {
      // Find by exam code only (first match)
      exam = await Exam.findOne({
        where: { examCode },
        include: [{ model: Batch, as: 'batch' }]
      });
    }

    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }

    if (exam.status === 'active') {
      return res.status(400).json({ message: 'Exam is already published' });
    }

    if (exam.status === 'cancelled') {
      return res.status(400).json({ message: 'Cannot publish a cancelled exam' });
    }

    await exam.update({ 
      status: 'active',
      updatedAt: new Date()
    });

    res.status(200).json({ 
      message: 'Exam published successfully',
      exam: {
        id: exam.id,
        examCode: exam.examCode,
        examName: exam.examName,
        status: exam.status
      }
    });
  } catch (error) {
    console.error("Error publishing exam:", error);
    res.status(500).json({ message: "Failed to publish exam" });
  }
};

// ✅ Unpublish Exam (Change status from active to draft)
export const UnpublishExam = async (req, res) => {
  try {
    const { examCode, batchName } = req.body;

    if (!examCode) {
      return res.status(400).json({ message: 'examCode is required' });
    }

    let exam;
    if (batchName) {
      const batch = await Batch.findOne({ where: { batchName } });
      if (!batch) {
        return res.status(404).json({ message: 'Batch not found' });
      }
      exam = await Exam.findOne({
        where: {
          batchId: batch.id,
          examCode
        }
      });
    } else {
      exam = await Exam.findOne({
        where: { examCode },
        include: [{ model: Batch, as: 'batch' }]
      });
    }

    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }

    if (exam.status !== 'active') {
      return res.status(400).json({ message: 'Only active exams can be unpublished' });
    }

    await exam.update({ 
      status: 'draft',
      updatedAt: new Date()
    });

    res.status(200).json({ 
      message: 'Exam unpublished successfully',
      exam: {
        id: exam.id,
        examCode: exam.examCode,
        examName: exam.examName,
        status: exam.status
      }
    });
  } catch (error) {
    console.error("Error unpublishing exam:", error);
    res.status(500).json({ message: "Failed to unpublish exam" });
  }
};