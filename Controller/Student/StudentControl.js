import { Student, ExamRequest, StudentExamReport, Exam } from "../../models/mysql/index.js"
import bcryptjs from "bcryptjs"
import jwt from "jsonwebtoken"
import { Op } from "sequelize";



export const RegisterStudent = async (req, res) => {
  try {
    const {
      Batch,
      name,
      mobileNumber,
      whatsappNumber,
      email,
      password,
      gender,
      fathername,
      fatherOccupation,
      mothername,
      motherOccupation,
      Degree,
      Year_of_passing,
      working,
      workdesc,
      profilePhoto,
      permanent_address,
      residential_address,
    } = req.body;

    // Basic validation example
    if (!email || !password || !name) {
      return res.status(400).json({ message: "Name, email and password are required." });
    }

    // Check if student already exists
    const existingStudent = await Student.findOne({ where: { email } });
    if (existingStudent) {
      return res.status(400).json({ message: "Student already registered with this email" });
    }

    // Hash password
    const hashpassword = await bcryptjs.hash(password, 10);

    // Create student object
    const student = await Student.create({
      batch: Batch,
      name,
      mobileNumber,
      whatsappNumber,
      email,
      password: hashpassword,
      gender,
      fathername,
      fatherOccupation,
      mothername,
      motherOccupation,
      degree: Degree,
      yearOfPassing: Year_of_passing,
      working,
      workdesc,
      profilePhoto,
      permanentAddress: permanent_address,
      residentialAddress: residential_address,
    });

    res.status(201).json({
      message: "Student registered successfully",
      studentId: student.id,
    });
  } catch (error) {
    console.error("Error registering student:", error);
    res.status(500).json({ message: "Server error while registering student" });
  }
};


export const GetStudent = async (req, res) => {
  try {
    const { User } = req.params;
    console.log("Requested student ID:", User);

    const studentdetails = await Student.findByPk(User);

    if (!studentdetails) {
      return res.status(404).json({ message: 'Student not found' });
    }

    return res.status(200).json({
      message: 'Student found',
      studentdetails,
    });
  } catch (error) {
    console.error("Error fetching student:", error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const StudentsList = async(req,res)=>{
  try{
const students = await Student.findAll();
if(!students || students.length === 0){
    return res.status(200).json({ message: 'No students found', students: [] });
}
    return res.status(200).json({ message: 'Students List',students });

  }
  catch(error){
    console.error(error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
}
//Login Student
export const StudentLogin = async (req,res)=>{
    try{
        const {mobileNumber,password} = req.body;
        const User = await Student.findOne({ where: { mobileNumber } });
        if(!User){
            return res.status(404).json({message:"Invalid Mobile Number"})
        }

    const Ispassword = await bcryptjs.compare(password,User.password)
    if(!Ispassword){
        return res.status(400).json({message:"Invalid Password"})
    }

    const token = jwt.sign({id:User.id,email:User.email,mobileNumber:User.mobileNumber},process.env.Secret_key,{expiresIn:'1d'})

// const isProduction = process.env.NODE_ENV === "production"

    res.cookie("token", token, {
      httpOnly: true,
      secure: true,       
      sameSite:  "None",  
      maxAge: 24 * 60 * 60 * 1000,
    });
    return res.status(200).json({message:"Login Successfully",User:User.id,Email:User.email
    })
    }
    catch(error){
        console.error(error);
    return res.status(500).json({message:"Internal server error",error})

    }
}


export const StudentLogout = async (req,res)=>{
  try{
const Isprotection = process.env.NODE_ENV === "production"
res.clearCookie('token',{
  httpOnly:true,
  sameSite:Isprotection,
  secure : Isprotection ? "None" : "Lax"
})

return res.status(200).json({message:"Logout Successfully"})

  }
  catch(error){
    console.error(error);
    
  }
}

export const ExamRequests = async (req, res) => {
  try {
    const { examCode, studentId } = req.body;

    if (!examCode || !studentId) {
      return res.status(400).json({ message: 'examCode and studentId are required' });
    }

    const studentIdInt = parseInt(studentId);

    // ✅ Prevent duplicate requests
    const existing = await ExamRequest.findOne({ 
      where: { 
        examCode, 
        studentId: studentIdInt 
      } 
    });

    if (existing) {
      if (existing.status === 'pending') {
        return res.status(400).json({ 
          message: 'Request already submitted and pending approval',
          status: 'pending'
        });
      }
      if (existing.status === 'approved') {
        return res.status(400).json({ 
          message: 'You already have approved access to this exam',
          status: 'approved'
        });
      }
      if (existing.status === 'denied') {
        // Allow re-request if previously denied
        await existing.update({ status: 'pending' });
        return res.status(200).json({ 
          message: 'Request resubmitted successfully',
          request: existing
        });
      }
    }

    const request = await ExamRequest.create({
      examCode,
      studentId: studentIdInt,
      status: 'pending',
    });

    res.status(201).json({ 
      message: 'Request submitted successfully',
      request: {
        id: request.id,
        examCode: request.examCode,
        status: request.status
      }
    });
  } catch (error) {
    console.error('Error submitting exam request:', error);
    res.status(500).json({ message: 'Server error while submitting request' });
  }
};



// GET /Question/student/:studentId/requests
export const getStudentRequests = async (req, res) => {
  try {
    const { studentId } = req.params;

    const requests = await ExamRequest.findAll({ 
      where: { studentId: parseInt(studentId) } 
    });

    return res.status(200).json({ requests });
  } catch (error) {
    console.error("Error fetching student requests:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

export const getStudentExamStatus = async (req, res) => {
  try {
    const { studentId, examCode } = req.params;

    const studentExam = await StudentExamReport.findOne({ 
      where: { 
        studentId: parseInt(studentId), 
        examCode 
      } 
    });

    if (!studentExam) {
      return res.status(200).json({ status: "not_started" });
    }

    let status = studentExam.status;

    // Fallback: if started but not marked completed
    if (!status && studentExam.startTime && !studentExam.endTime) {
      status = "in_progress";
    }

    return res.status(200).json({
      status: status,
      result: studentExam.result || 0,
      correctAnswers: studentExam.correctAnswers || 0,
      wrongAnswers: studentExam.wrongAnswers || 0,
      startTime: studentExam.startTime,
      endTime: studentExam.endTime,
    });

  } catch (error) {
    console.error("Error checking exam status:", error);
    return res.status(500).json({ message: "Server error" });
  }
};





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


export const getStudentExamResult = async (req, res) => {
  const { studentId, examCode } = req.params;

  try {
    const studentExam = await StudentExamReport.findOne({ 
      where: { 
        studentId: parseInt(studentId), 
        examCode 
      } 
    });

    if (!studentExam) {
      return res.status(404).json({ message: 'Result not found.' });
    }

    const { correctAnswers, wrongAnswers, result, status } = studentExam;

    return res.status(200).json({
      result,
      correctAnswers,
      wrongAnswers,
      total: correctAnswers + wrongAnswers,
      status,
    });
  } catch (error) {
    console.error('Error fetching exam result:', error);
    return res.status(500).json({ message: 'Server error while fetching result.' });
  }
};


export const StudentUpdate = async(req,res)=>{
  const {User}  = req.params;

try{
const updatestudent = await Student.findByPk(User);
    if (!updatestudent) {
      return res.status(404).json({ message: 'Student not found' });
    }

await updatestudent.update(req.body);
      return res.status(200).json({ message: 'Updated Successful',updatestudent });

}
catch(error){
  console.error(error);
  return res.status(500).json({ message: 'Server error', error: error.message });
}
}



export const StudentDeleteById =async(req,res)=>{
  try{
const studentId = req.params.id;

const user = await Student.findByPk(studentId)
if(!user){
      return res.status(404).json({ message: 'user not found' });

}

await user.destroy();
      return res.status(200).json({ message: 'Delete User', user });

  }
  catch(error){
    console.error(error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
}
// GET /api/student-reports
export const getStudentExamReports = async (req, res) => {
  try {
    const reports = await StudentExamReport.findAll({
      include: [{
        model: Student,
        as: 'student',
        attributes: ['id', 'name', 'email']
      }]
    });

    const formatted = reports.map((report) => ({
      studentName: report.student?.name || 'N/A',
      email: report.student?.email || 'N/A',
      examCode: report.examCode,
      startTime: report.startTime,
      endTime: report.endTime,
      correctAnswers: report.correctAnswers,
      wrongAnswers: report.wrongAnswers,
      score: report.result,
      status: report.status,
    }));

    res.status(200).json(formatted);
  } catch (error) {
    console.error('Error fetching student exam reports:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

