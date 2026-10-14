// attendance.js - Teacher Attendance Marking & Editing
document.addEventListener('DOMContentLoaded', async () => {
  let currentMode = 'create'; // 'create', 'edit', or 'replace'
  let cachedRecords = [];

  // Check Teacher Session
  try {
    const res = await fetch('/api/me');
    const authData = await res.json();
    if (!authData.loggedIn || authData.user.role !== 'teacher') {
      window.location.href = 'index.html';
      return;
    }
    const headerName = document.getElementById('header-teacher-name');
    if (headerName) headerName.textContent = authData.user.name;
  } catch (err) {
    window.location.href = 'index.html';
    return;
  }

  // Setup Logout
  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await fetch('/api/logout', { method: 'POST' });
      window.location.href = 'index.html';
    });
  }

  // DOM Elements
  const selectSubject = document.getElementById('select-subject');
  const selectDate = document.getElementById('select-date');
  const selectForm = document.getElementById('attendance-select-form');
  const selectionAlert = document.getElementById('selection-alert');
  const duplicateBox = document.getElementById('duplicate-warning-box');
  const sheetPanel = document.getElementById('attendance-sheet-panel');
  const markingTbody = document.getElementById('marking-tbody');
  const sheetTitle = document.getElementById('sheet-title');
  const totalCountElem = document.getElementById('total-student-count');
  const saveStatusBox = document.getElementById('save-status-box');
  const btnSave = document.getElementById('btn-save-attendance');
  const btnMarkAllPresent = document.getElementById('btn-mark-all-present');
  const btnMarkAllAbsent = document.getElementById('btn-mark-all-absent');

  // Set default date to today
  const today = new Date().toISOString().split('T')[0];
  selectDate.value = today;

  // Load Assigned Subjects
  try {
    const res = await fetch('/api/teacher/subjects');
    const data = await res.json();
    if (data.success) {
      data.subjects.forEach(sub => {
        const opt = document.createElement('option');
        opt.value = sub.subject_id;
        opt.textContent = `${sub.subject_name} (${sub.subject_code})`;
        selectSubject.appendChild(opt);
      });

      // Check URL parameters for pre-selected subject or date
      const urlParams = new URLSearchParams(window.location.search);
      const paramSubId = urlParams.get('subject_id');
      const paramDate = urlParams.get('date');

      if (paramSubId) {
        selectSubject.value = paramSubId;
      }
      if (paramDate) {
        selectDate.value = paramDate;
      }

      if (paramSubId && paramDate) {
        loadAttendanceSheet();
      }
    }
  } catch (err) {
    console.error('Failed to load teacher subjects:', err);
  }

  // Handle Form Submission
  selectForm.addEventListener('submit', (e) => {
    e.preventDefault();
    loadAttendanceSheet();
  });

  // Load Attendance Sheet Logic
  async function loadAttendanceSheet() {
    selectionAlert.style.display = 'none';
    duplicateBox.style.display = 'none';
    saveStatusBox.style.display = 'none';

    const subjectId = selectSubject.value;
    const dateVal = selectDate.value;

    if (!subjectId) {
      selectionAlert.textContent = 'Please select a subject.';
      selectionAlert.style.display = 'block';
      return;
    }
    if (!dateVal) {
      selectionAlert.textContent = 'Please select a date.';
      selectionAlert.style.display = 'block';
      return;
    }

    try {
      const res = await fetch(`/api/teacher/attendance-check?subject_id=${subjectId}&date=${dateVal}`);
      const data = await res.json();

      if (!data.success) {
        selectionAlert.textContent = data.message || 'Error checking attendance.';
        selectionAlert.style.display = 'block';
        return;
      }

      cachedRecords = data.records;

      if (data.exists) {
        // Attendance already exists
        duplicateBox.style.display = 'block';
        sheetPanel.style.display = 'none';
      } else {
        // Fresh attendance marking
        currentMode = 'create';
        renderSheet(cachedRecords, 'create');
      }
    } catch (err) {
      selectionAlert.textContent = 'Network error checking attendance.';
      selectionAlert.style.display = 'block';
    }
  }

  // Duplicate Warning Handlers
  document.getElementById('btn-duplicate-edit').addEventListener('click', () => {
    duplicateBox.style.display = 'none';
    currentMode = 'edit';
    renderSheet(cachedRecords, 'edit');
  });

  document.getElementById('btn-duplicate-replace').addEventListener('click', () => {
    duplicateBox.style.display = 'none';
    currentMode = 'replace';
    // Reset all statuses to Present for fresh replacement
    const resetRecords = cachedRecords.map(r => ({ ...r, status: 'Present' }));
    renderSheet(resetRecords, 'replace');
  });

  document.getElementById('btn-duplicate-cancel').addEventListener('click', () => {
    duplicateBox.style.display = 'none';
    sheetPanel.style.display = 'none';
  });

  // Render Table Rows
  function renderSheet(records, mode) {
    markingTbody.innerHTML = '';
    totalCountElem.textContent = records.length;

    const subText = selectSubject.options[selectSubject.selectedIndex].text;
    const dateText = selectDate.value;

    if (mode === 'edit') {
      sheetTitle.textContent = `Edit Attendance: ${subText} (${dateText})`;
    } else if (mode === 'replace') {
      sheetTitle.textContent = `Replace Attendance: ${subText} (${dateText})`;
    } else {
      sheetTitle.textContent = `New Attendance: ${subText} (${dateText})`;
    }

    records.forEach(student => {
      const tr = document.createElement('tr');
      const isPresent = (student.status !== 'Absent');

      tr.innerHTML = `
        <td><strong>${student.roll_no}</strong></td>
        <td>${student.name}</td>
        <td class="text-center">
          <div class="status-radio-group" style="justify-content: center;">
            <label>
              <input type="radio" name="status_${student.student_id}" value="Present" ${isPresent ? 'checked' : ''}>
              <span class="status-present">Present</span>
            </label>
            <label>
              <input type="radio" name="status_${student.student_id}" value="Absent" ${!isPresent ? 'checked' : ''}>
              <span class="status-absent">Absent</span>
            </label>
          </div>
        </td>
      `;
      tr.dataset.studentId = student.student_id;
      markingTbody.appendChild(tr);
    });

    sheetPanel.style.display = 'block';
  }

  // Quick mark buttons
  btnMarkAllPresent.addEventListener('click', () => {
    const presentRadios = markingTbody.querySelectorAll('input[type="radio"][value="Present"]');
    presentRadios.forEach(r => r.checked = true);
  });

  btnMarkAllAbsent.addEventListener('click', () => {
    const absentRadios = markingTbody.querySelectorAll('input[type="radio"][value="Absent"]');
    absentRadios.forEach(r => r.checked = true);
  });

  // Save Attendance Handler
  btnSave.addEventListener('click', async () => {
    saveStatusBox.style.display = 'none';

    const subjectId = selectSubject.value;
    const dateVal = selectDate.value;

    if (!subjectId || !dateVal) {
      alert('Please select both subject and date.');
      return;
    }

    const rows = markingTbody.querySelectorAll('tr');
    if (rows.length === 0) {
      alert('No student records found to save.');
      return;
    }

    const records = [];
    rows.forEach(tr => {
      const studentId = tr.dataset.studentId;
      const selectedRadio = tr.querySelector(`input[name="status_${studentId}"]:checked`);
      const status = selectedRadio ? selectedRadio.value : 'Present';
      records.push({ student_id: studentId, status });
    });

    try {
      btnSave.disabled = true;
      btnSave.textContent = 'SAVING...';

      const response = await fetch('/api/teacher/attendance-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject_id: subjectId,
          date: dateVal,
          records,
          mode: currentMode
        })
      });

      const result = await response.json();
      btnSave.disabled = false;
      btnSave.textContent = 'SAVE ATTENDANCE';

      if (response.ok && result.success) {
        saveStatusBox.className = 'alert alert-success';
        saveStatusBox.textContent = result.message || 'Attendance saved successfully.';
        saveStatusBox.style.display = 'block';

        // Switch mode to edit for any subsequent immediate updates
        currentMode = 'edit';
      } else {
        saveStatusBox.className = 'alert alert-danger';
        saveStatusBox.textContent = result.message || 'Failed to save attendance.';
        saveStatusBox.style.display = 'block';
      }
    } catch (err) {
      btnSave.disabled = false;
      btnSave.textContent = 'SAVE ATTENDANCE';
      saveStatusBox.className = 'alert alert-danger';
      saveStatusBox.textContent = 'Connection error saving attendance.';
      saveStatusBox.style.display = 'block';
    }
  });

});
