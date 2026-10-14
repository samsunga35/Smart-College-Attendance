// student.js - Student Dashboard, Attendance Calculation, Predictor & History
async function initStudent() {
  let studentAttendanceData = [];

  // Check Session
  try {
    const res = await fetch('/api/me');
    const authData = await res.json();
    if (!authData.loggedIn || authData.user.role !== 'student') {
      window.location.href = 'index.html';
      return;
    }

    // Set User Header Details
    const headerName = document.getElementById('header-user-name');
    const headerRoll = document.getElementById('header-roll-no');
    if (headerName) headerName.textContent = authData.user.name;
    if (headerRoll) headerRoll.textContent = authData.user.roll_no;

    // Load Student Profile if elements exist (student.html)
    const nameElem = document.getElementById('student-name');
    const rollElem = document.getElementById('student-roll');
    const emailElem = document.getElementById('student-email');
    if (nameElem) nameElem.textContent = authData.user.name;
    if (rollElem) rollElem.textContent = authData.user.roll_no;
    if (emailElem) emailElem.textContent = authData.user.email;

    // If on student.html, load attendance & predictor
    if (document.getElementById('attendance-tbody')) {
      loadStudentAttendance();
    }

    // If on history.html, load student history
    if (document.getElementById('student-history-tbody')) {
      loadStudentHistory();
    }

  } catch (err) {
    console.error('Session check failed:', err);
    window.location.href = 'index.html';
  }

  // Setup Logout
  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await fetch('/api/logout', { method: 'POST' });
      window.location.href = 'index.html';
    });
  }

  // -------------------------------------------------------------
  // Load Attendance Summary
  // -------------------------------------------------------------
  async function loadStudentAttendance() {
    try {
      const res = await fetch('/api/student/attendance');
      const data = await res.json();

      if (!data.success) {
        alert(data.message || 'Error loading attendance.');
        return;
      }

      studentAttendanceData = data.attendance;
      const tbody = document.getElementById('attendance-tbody');
      tbody.innerHTML = '';

      const predictorSelect = document.getElementById('predictor-subject-select');
      if (predictorSelect) {
        predictorSelect.innerHTML = '<option value="">-- Choose Subject --</option>';
      }

      if (studentAttendanceData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center">No attendance records found.</td></tr>';
        return;
      }

      studentAttendanceData.forEach(item => {
        const tr = document.createElement('tr');
        const pct = item.percentage;
        const isSafe = pct >= 75.0;

        tr.innerHTML = `
          <td><strong>${item.subject_code}</strong></td>
          <td>${item.subject_name}</td>
          <td>${item.teacher_name || 'N/A'}</td>
          <td class="text-center status-present">${item.present}</td>
          <td class="text-center status-absent">${item.absent}</td>
          <td class="text-center"><strong>${item.total}</strong></td>
          <td class="text-center">
            <strong style="color: ${isSafe ? '#166534' : '#b91c1c'};">${pct}%</strong>
          </td>
          <td class="text-center">
            <span class="${isSafe ? 'status-present' : 'status-absent'}">
              ${isSafe ? 'Eligible' : 'Shortage'}
            </span>
          </td>
        `;
        tbody.appendChild(tr);

        // Populate Predictor dropdown
        if (predictorSelect) {
          const opt = document.createElement('option');
          opt.value = item.subject_id;
          opt.textContent = `${item.subject_name} (${item.percentage}%)`;
          predictorSelect.appendChild(opt);
        }
      });

      // Predictor selection listener
      if (predictorSelect) {
        predictorSelect.addEventListener('change', () => {
          const subjectId = parseInt(predictorSelect.value);
          calculatePredictor(subjectId);
        });
      }

    } catch (err) {
      console.error('Error fetching attendance:', err);
    }
  }

  // -------------------------------------------------------------
  // 75% Attendance Predictor Logic
  // -------------------------------------------------------------
  function calculatePredictor(subjectId) {
    const container = document.getElementById('predictor-output');
    const detailsBox = document.getElementById('predictor-details');
    const recBox = document.getElementById('predictor-recommendation');

    if (!subjectId) {
      container.style.display = 'none';
      return;
    }

    const sub = studentAttendanceData.find(s => s.subject_id === subjectId);
    if (!sub) return;

    const present = sub.present;
    const total = sub.total;
    const percentage = sub.percentage;

    detailsBox.innerHTML = `
      <table class="info-table" style="margin-bottom: 5px;">
        <tr>
          <td class="label-col">Subject:</td>
          <td class="val-col"><strong>${sub.subject_name} (${sub.subject_code})</strong></td>
          <td class="label-col">Current Attendance:</td>
          <td class="val-col"><strong>${percentage}%</strong> (${present} / ${total} classes)</td>
        </tr>
      </table>
    `;

    if (total === 0) {
      recBox.className = 'predictor-result-box';
      recBox.innerHTML = 'No classes conducted yet for this subject.';
      container.style.display = 'block';
      return;
    }

    if (percentage < 75.0) {
      // Below 75%: ceil((0.75 * Total - Present) / 0.25)
      const needed = Math.ceil((0.75 * total - present) / 0.25);
      recBox.className = 'predictor-result-box predictor-shortage';
      recBox.innerHTML = `
        <strong>Current Attendance: ${percentage}%</strong><br>
        <strong>Required Attendance: 75%</strong><br><br>
        You need to attend the next <strong>${needed}</strong> consecutive classes to reach 75%.
      `;
    } else {
      // 75% or above: floor(Present / 0.75 - Total)
      const canSkip = Math.floor((present / 0.75) - total);
      recBox.className = 'predictor-result-box predictor-safe';
      recBox.innerHTML = `
        <strong>Current Attendance: ${percentage}%</strong><br><br>
        You can miss <strong>${canSkip}</strong> more classes and remain above 75%.
      `;
    }

    container.style.display = 'block';
  }

  // -------------------------------------------------------------
  // Load Student History (for history.html)
  // -------------------------------------------------------------
  async function loadStudentHistory() {
    const filterSubject = document.getElementById('history-subject-filter');
    const filterDate = document.getElementById('history-date-filter');
    const tbody = document.getElementById('student-history-tbody');
    const statsBox = document.getElementById('history-stats');

    // Populate subject filter options
    try {
      const attRes = await fetch('/api/student/attendance');
      const attData = await attRes.json();
      if (attData.success && filterSubject) {
        filterSubject.innerHTML = '<option value="">-- All Subjects --</option>';
        attData.attendance.forEach(sub => {
          const opt = document.createElement('option');
          opt.value = sub.subject_id;
          opt.textContent = `${sub.subject_name} (${sub.subject_code})`;
          filterSubject.appendChild(opt);
        });
      }
    } catch (e) {}

    async function fetchHistory() {
      tbody.innerHTML = '<tr><td colspan="4" class="text-center">Loading history...</td></tr>';
      let url = '/api/student/history?';
      if (filterSubject && filterSubject.value) url += `subject_id=${filterSubject.value}&`;
      if (filterDate && filterDate.value) url += `date=${filterDate.value}&`;

      try {
        const res = await fetch(url);
        const data = await res.json();
        if (!data.success) {
          tbody.innerHTML = '<tr><td colspan="4" class="text-center">Unable to load attendance history.</td></tr>';
          console.error('API error fetching student history:', data.message);
          return;
        }

        const list = data.history;
        if (list.length === 0) {
          tbody.innerHTML = '<tr><td colspan="4" class="text-center">No records found for selected filter.</td></tr>';
          if (statsBox) statsBox.style.display = 'none';
          return;
        }

        let presentCount = 0;
        let absentCount = 0;

        tbody.innerHTML = '';
        list.forEach(row => {
          if (row.status === 'Present') presentCount++;
          else absentCount++;

          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${row.date_formatted || row.date_raw}</td>
            <td><strong>${row.subject_code}</strong></td>
            <td>${row.subject_name}</td>
            <td class="text-center ${row.status === 'Present' ? 'status-present' : 'status-absent'}">
              ${row.status}
            </td>
          `;
          tbody.appendChild(tr);
        });

        // Update summary box
        if (statsBox) {
          const total = list.length;
          const pct = total > 0 ? ((presentCount / total) * 100).toFixed(2) : '0.00';
          statsBox.style.display = 'block';
          statsBox.innerHTML = `
            <strong>Total Records:</strong> ${total} &nbsp;|&nbsp;
            <strong>Present:</strong> <span class="status-present">${presentCount}</span> &nbsp;|&nbsp;
            <strong>Absent:</strong> <span class="status-absent">${absentCount}</span> &nbsp;|&nbsp;
            <strong>Attendance:</strong> ${pct}%
          `;
        }
      } catch (err) {
        console.error('Network or technical error fetching student history:', err);
        tbody.innerHTML = '<tr><td colspan="4" class="text-center">Unable to load attendance history.</td></tr>';
      }
    }

    if (filterSubject) filterSubject.addEventListener('change', fetchHistory);
    if (filterDate) filterDate.addEventListener('change', fetchHistory);

    const btnReset = document.getElementById('btn-reset-history');
    if (btnReset) {
      btnReset.addEventListener('click', () => {
        if (filterSubject) filterSubject.value = '';
        if (filterDate) filterDate.value = '';
        fetchHistory();
      });
    }

    fetchHistory();
  }

}

// Support both static script tag and dynamic script injection after DOMContentLoaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initStudent);
} else {
  initStudent();
}
