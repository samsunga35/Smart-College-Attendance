// server.js - Main Express Server for Smart College Attendance Portal
const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const multer = require('multer');
const xlsx = require('xlsx');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure uploads folder exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure Multer for Excel file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// Core Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Express Session Middleware
app.use(session({
  secret: 'smart_college_attendance_secret_key_2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// -------------------------------------------------------------
// Authentication Middlewares & Helper Functions
// -------------------------------------------------------------
function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ success: false, message: 'Please login first.' });
  }
  next();
}

function requireStudent(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'student') {
    return res.status(403).json({ success: false, message: 'Access denied. Student role required.' });
  }
  next();
}

function requireTeacher(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'teacher') {
    return res.status(403).json({ success: false, message: 'Access denied. Teacher role required.' });
  }
  next();
}

// -------------------------------------------------------------
// AUTHENTICATION ROUTES
// -------------------------------------------------------------

// POST /api/login - Authenticate Student or Teacher
app.post('/api/login', async (req, res) => {
  const { username, password, role } = req.body;

  if (!username || !password || !role) {
    return res.status(400).json({ success: false, message: 'Please enter username, password, and select a role.' });
  }

  try {
    if (role === 'student') {
      // Find student by roll_no or email
      const [rows] = await db.query(
        'SELECT * FROM students WHERE roll_no = ? OR email = ? LIMIT 1',
        [username.trim(), username.trim()]
      );

      if (rows.length === 0) {
        return res.status(401).json({ success: false, message: 'Invalid username or password.' });
      }

      const student = rows[0];
      const match = await bcrypt.compare(password, student.password).catch(() => false);
      const isPlainMatch = (password === student.password);

      if (!match && !isPlainMatch) {
        return res.status(401).json({ success: false, message: 'Invalid username or password.' });
      }

      req.session.user = {
        id: student.student_id,
        roll_no: student.roll_no,
        name: student.name,
        email: student.email,
        role: 'student'
      };

      return res.json({ success: true, redirect: '/student.html' });

    } else if (role === 'teacher') {
      // Find teacher by username
      const [rows] = await db.query(
        'SELECT * FROM teachers WHERE username = ? LIMIT 1',
        [username.trim()]
      );

      if (rows.length === 0) {
        return res.status(401).json({ success: false, message: 'Invalid username or password.' });
      }

      const teacher = rows[0];
      const match = await bcrypt.compare(password, teacher.password).catch(() => false);
      const isPlainMatch = (password === teacher.password);

      if (!match && !isPlainMatch) {
        return res.status(401).json({ success: false, message: 'Invalid username or password.' });
      }

      req.session.user = {
        id: teacher.teacher_id,
        username: teacher.username,
        name: teacher.name,
        role: 'teacher'
      };

      return res.json({ success: true, redirect: '/teacher.html' });

    } else {
      return res.status(400).json({ success: false, message: 'Invalid role selected.' });
    }
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ success: false, message: 'Database error occurred during login.' });
  }
});

// GET /api/me - Current user session info
app.get('/api/me', (req, res) => {
  if (req.session.user) {
    return res.json({ loggedIn: true, user: req.session.user });
  }
  return res.json({ loggedIn: false, user: null });
});

// POST /api/logout - End user session
app.post('/api/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Logout failed.' });
    }
    res.clearCookie('connect.sid');
    return res.json({ success: true, message: 'Logged out successfully.' });
  });
});

// -------------------------------------------------------------
// STUDENT ROUTES
// -------------------------------------------------------------

// GET /api/student/profile - Personal Information
app.get('/api/student/profile', requireStudent, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT student_id, roll_no, name, email FROM students WHERE student_id = ?',
      [req.session.user.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Student not found.' });
    }
    return res.json({ success: true, student: rows[0] });
  } catch (err) {
    console.error('Student profile error:', err);
    return res.status(500).json({ success: false, message: 'Error fetching profile.' });
  }
});

// GET /api/student/attendance - Subject-wise Attendance & Percentage
app.get('/api/student/attendance', requireStudent, async (req, res) => {
  const studentId = req.session.user.id;
  try {
    const query = `
      SELECT 
        s.subject_id,
        s.subject_code,
        s.subject_name,
        t.name AS teacher_name,
        COALESCE(SUM(CASE WHEN a.status = 'Present' THEN 1 ELSE 0 END), 0) AS present,
        COALESCE(SUM(CASE WHEN a.status = 'Absent' THEN 1 ELSE 0 END), 0) AS absent,
        COALESCE(COUNT(a.attendance_id), 0) AS total
      FROM subjects s
      LEFT JOIN teachers t ON s.teacher_id = t.teacher_id
      LEFT JOIN attendance a ON s.subject_id = a.subject_id AND a.student_id = ?
      GROUP BY s.subject_id, s.subject_code, s.subject_name, t.name
      ORDER BY s.subject_id ASC
    `;
    const [rows] = await db.query(query, [studentId]);

    // Format output with percentage
    const summary = rows.map(item => {
      const present = Number(item.present);
      const absent = Number(item.absent);
      const total = Number(item.total);
      const percentage = total > 0 ? ((present / total) * 100).toFixed(2) : '0.00';
      return {
        subject_id: item.subject_id,
        subject_code: item.subject_code,
        subject_name: item.subject_name,
        teacher_name: item.teacher_name,
        present,
        absent,
        total,
        percentage: parseFloat(percentage)
      };
    });

    return res.json({ success: true, attendance: summary });
  } catch (err) {
    console.error('Student attendance error:', err);
    return res.status(500).json({ success: false, message: 'Error fetching attendance data.' });
  }
});

// GET /api/student/history - Date-wise Attendance History
app.get('/api/student/history', requireStudent, async (req, res) => {
  const studentId = req.session.user.id;
  const { subject_id, date } = req.query;

  try {
    let query = `
      SELECT 
        a.attendance_id,
        DATE_FORMAT(a.date, '%Y-%m-%d') AS date_raw,
        DATE_FORMAT(a.date, '%d/%m/%Y') AS date_formatted,
        s.subject_id,
        s.subject_code,
        s.subject_name,
        a.status
      FROM attendance a
      JOIN subjects s ON a.subject_id = s.subject_id
      WHERE a.student_id = ?
    `;
    const params = [studentId];

    if (subject_id) {
      query += ' AND a.subject_id = ?';
      params.push(subject_id);
    }
    if (date) {
      query += ' AND a.date = ?';
      params.push(date);
    }

    query += ' ORDER BY a.date DESC, s.subject_code ASC';

    const [rows] = await db.query(query, params);
    return res.json({ success: true, history: rows });
  } catch (err) {
    console.error('Student history error:', err);
    return res.status(500).json({ success: false, message: 'Error fetching attendance history.' });
  }
});

// -------------------------------------------------------------
// TEACHER ROUTES
// -------------------------------------------------------------

// GET /api/teacher/subjects - Assigned Subjects
app.get('/api/teacher/subjects', requireTeacher, async (req, res) => {
  const teacherId = req.session.user.id;
  try {
    const [rows] = await db.query(
      'SELECT subject_id, subject_code, subject_name FROM subjects WHERE teacher_id = ? ORDER BY subject_code ASC',
      [teacherId]
    );
    return res.json({ success: true, subjects: rows });
  } catch (err) {
    console.error('Teacher subjects error:', err);
    return res.status(500).json({ success: false, message: 'Error fetching assigned subjects.' });
  }
});

// GET /api/teacher/students - All Students List
app.get('/api/teacher/students', requireTeacher, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT student_id, roll_no, name, email FROM students ORDER BY roll_no ASC'
    );
    return res.json({ success: true, students: rows });
  } catch (err) {
    console.error('Students list error:', err);
    return res.status(500).json({ success: false, message: 'Error fetching students list.' });
  }
});

// GET /api/teacher/attendance-check - Check Duplicate / Load Existing Attendance
app.get('/api/teacher/attendance-check', requireTeacher, async (req, res) => {
  const teacherId = req.session.user.id;
  const { subject_id, date } = req.query;

  if (!subject_id || !date) {
    return res.status(400).json({ success: false, message: 'Subject and date are required.' });
  }

  try {
    // Verify subject belongs to this teacher
    const [subj] = await db.query(
      'SELECT subject_id FROM subjects WHERE subject_id = ? AND teacher_id = ?',
      [subject_id, teacherId]
    );
    if (subj.length === 0) {
      return res.status(403).json({ success: false, message: 'You are not assigned to this subject.' });
    }

    // Query existing attendance records for subject & date
    const query = `
      SELECT 
        s.student_id,
        s.roll_no,
        s.name,
        COALESCE(a.status, 'Present') AS status,
        CASE WHEN a.attendance_id IS NOT NULL THEN 1 ELSE 0 END AS has_record
      FROM students s
      LEFT JOIN attendance a ON s.student_id = a.student_id AND a.subject_id = ? AND a.date = ?
      ORDER BY s.roll_no ASC
    `;
    const [records] = await db.query(query, [subject_id, date]);

    const existsCount = records.filter(r => r.has_record === 1).length;
    const exists = existsCount > 0;

    return res.json({
      success: true,
      exists,
      count: existsCount,
      records: records.map(r => ({
        student_id: r.student_id,
        roll_no: r.roll_no,
        name: r.name,
        status: r.has_record ? r.status : 'Present'
      }))
    });
  } catch (err) {
    console.error('Attendance check error:', err);
    return res.status(500).json({ success: false, message: 'Error checking attendance.' });
  }
});

// POST /api/teacher/attendance-save - Save / Edit / Replace Attendance
app.post('/api/teacher/attendance-save', requireTeacher, async (req, res) => {
  const teacherId = req.session.user.id;
  const { subject_id, date, records, mode } = req.body;

  if (!subject_id) {
    return res.status(400).json({ success: false, message: 'Please select a subject.' });
  }
  if (!date) {
    return res.status(400).json({ success: false, message: 'Please select a date.' });
  }
  if (!records || !Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ success: false, message: 'No student records provided.' });
  }

  try {
    // Verify subject ownership
    const [subj] = await db.query(
      'SELECT subject_id FROM subjects WHERE subject_id = ? AND teacher_id = ?',
      [subject_id, teacherId]
    );
    if (subj.length === 0) {
      return res.status(403).json({ success: false, message: 'You are not assigned to this subject.' });
    }

    // Check duplicate if mode is create
    if (mode === 'create') {
      const [existing] = await db.query(
        'SELECT COUNT(*) AS total FROM attendance WHERE subject_id = ? AND date = ?',
        [subject_id, date]
      );
      if (existing[0].total > 0) {
        return res.status(409).json({
          success: false,
          duplicate: true,
          message: 'Attendance already exists for this subject and date.'
        });
      }
    }

    // If replace mode, remove existing records first
    if (mode === 'replace') {
      await db.query(
        'DELETE FROM attendance WHERE subject_id = ? AND date = ?',
        [subject_id, date]
      );
    }

    // Insert or Update records
    for (const item of records) {
      const status = (item.status === 'Absent') ? 'Absent' : 'Present';
      await db.query(
        `INSERT INTO attendance (student_id, subject_id, date, status)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE status = VALUES(status)`,
        [item.student_id, subject_id, date, status]
      );
    }

    return res.json({ success: true, message: 'Attendance saved successfully.' });
  } catch (err) {
    console.error('Attendance save error:', err);
    return res.status(500).json({ success: false, message: 'Error saving attendance.' });
  }
});

// GET /api/teacher/history - Teacher Attendance Sessions History
app.get('/api/teacher/history', requireTeacher, async (req, res) => {
  const teacherId = req.session.user.id;
  const { subject_id, date } = req.query;

  try {
    let query = `
      SELECT 
        DATE_FORMAT(a.date, '%Y-%m-%d') AS date_raw,
        DATE_FORMAT(a.date, '%d/%m/%Y') AS date_formatted,
        s.subject_id,
        s.subject_code,
        s.subject_name,
        SUM(CASE WHEN a.status = 'Present' THEN 1 ELSE 0 END) AS present_count,
        SUM(CASE WHEN a.status = 'Absent' THEN 1 ELSE 0 END) AS absent_count,
        COUNT(a.attendance_id) AS total_count
      FROM attendance a
      JOIN subjects s ON a.subject_id = s.subject_id
      WHERE s.teacher_id = ?
    `;
    const params = [teacherId];

    if (subject_id) {
      query += ' AND s.subject_id = ?';
      params.push(subject_id);
    }
    if (date) {
      query += ' AND a.date = ?';
      params.push(date);
    }

    query += ' GROUP BY a.date, s.subject_id, s.subject_code, s.subject_name ORDER BY a.date DESC';

    const [rows] = await db.query(query, params);
    return res.json({ success: true, sessions: rows });
  } catch (err) {
    console.error('Teacher history error:', err);
    return res.status(500).json({ success: false, message: 'Error fetching attendance history.' });
  }
});

// GET /api/teacher/template - Download Sample Excel Template
app.get('/api/teacher/template', requireTeacher, async (req, res) => {
  try {
    const [students] = await db.query(
      'SELECT roll_no, name FROM students ORDER BY roll_no ASC'
    );

    const data = students.map(s => ({
      'Roll No': s.roll_no,
      'Name': s.name,
      'Status': 'P'
    }));

    const worksheet = xlsx.utils.json_to_sheet(data);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Attendance');

    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', 'attachment; filename="attendance_sample.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return res.send(buffer);
  } catch (err) {
    console.error('Template generation error:', err);
    return res.status(500).json({ success: false, message: 'Could not generate template.' });
  }
});

// POST /api/teacher/upload - Upload Excel Attendance
app.post('/api/teacher/upload', requireTeacher, upload.single('excel_file'), async (req, res) => {
  const teacherId = req.session.user.id;
  const { subject_id, date, replace } = req.body;

  if (!req.file) {
    return res.status(400).json({ success: false, message: 'Please select an Excel file.' });
  }
  if (!subject_id) {
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    return res.status(400).json({ success: false, message: 'Please select a subject.' });
  }
  if (!date) {
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    return res.status(400).json({ success: false, message: 'Please select a date.' });
  }

  try {
    // Verify subject ownership
    const [subj] = await db.query(
      'SELECT subject_id FROM subjects WHERE subject_id = ? AND teacher_id = ?',
      [subject_id, teacherId]
    );
    if (subj.length === 0) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(403).json({ success: false, message: 'You are not assigned to this subject.' });
    }

    // Check duplicate attendance
    const [existing] = await db.query(
      'SELECT COUNT(*) AS total FROM attendance WHERE subject_id = ? AND date = ?',
      [subject_id, date]
    );
    const hasExisting = existing[0].total > 0;

    if (hasExisting && replace !== 'true') {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(409).json({
        success: false,
        duplicate: true,
        message: 'Attendance already exists for this subject and date.'
      });
    }

    // Parse Excel File
    const workbook = xlsx.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({ success: false, message: 'Excel file format is invalid.' });
    }

    const sheet = workbook.Sheets[sheetName];
    const rawRows = xlsx.utils.sheet_to_json(sheet, { defval: '' });

    if (!rawRows || rawRows.length === 0) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({ success: false, message: 'Excel file format is invalid.' });
    }

    // Fetch all student roll numbers from DB
    const [allStudents] = await db.query('SELECT student_id, roll_no FROM students');
    const studentMap = {};
    allStudents.forEach(s => {
      studentMap[s.roll_no.trim().toUpperCase()] = s.student_id;
    });

    const parsedRecords = [];
    let presentCount = 0;
    let absentCount = 0;

    for (const row of rawRows) {
      // Find Roll No column
      const rollKey = Object.keys(row).find(k => k.trim().toLowerCase().includes('roll'));
      const statusKey = Object.keys(row).find(k => k.trim().toLowerCase().includes('status'));

      if (!rollKey || !statusKey) {
        continue;
      }

      const rollVal = String(row[rollKey]).trim().toUpperCase();
      const statusVal = String(row[statusKey]).trim().toUpperCase();

      if (!rollVal) continue;

      const studentId = studentMap[rollVal];
      if (!studentId) {
        // Skip unknown roll numbers or invalid header rows
        continue;
      }

      let finalStatus = 'Present';
      if (statusVal === 'A' || statusVal === 'ABSENT' || statusVal === '0') {
        finalStatus = 'Absent';
        absentCount++;
      } else if (statusVal === 'P' || statusVal === 'PRESENT' || statusVal === '1') {
        finalStatus = 'Present';
        presentCount++;
      } else {
        // Default to present if unparseable
        finalStatus = 'Present';
        presentCount++;
      }

      parsedRecords.push({ student_id: studentId, status: finalStatus });
    }

    if (parsedRecords.length === 0) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({
        success: false,
        message: 'Excel file format is invalid. Ensure columns "Roll No" and "Status" are present.'
      });
    }

    // If replace mode, delete old records for that day
    if (replace === 'true') {
      await db.query(
        'DELETE FROM attendance WHERE subject_id = ? AND date = ?',
        [subject_id, date]
      );
    }

    // Save records
    for (const r of parsedRecords) {
      await db.query(
        `INSERT INTO attendance (student_id, subject_id, date, status)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE status = VALUES(status)`,
        [r.student_id, subject_id, date, r.status]
      );
    }

    // Clean up temporary file
    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    return res.json({
      success: true,
      message: 'Attendance uploaded successfully.',
      total: parsedRecords.length,
      present: presentCount,
      absent: absentCount
    });

  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    console.error('Excel upload error:', err);
    return res.status(500).json({ success: false, message: 'Excel file format is invalid.' });
  }
});

// Start Express Server
app.listen(PORT, () => {
  console.log(`Smart College Attendance Portal running on http://localhost:${PORT}`);
});
