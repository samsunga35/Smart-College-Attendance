// teacher.js - Teacher Dashboard & Teacher History Handler
async function initTeacher() {

  // Verify Teacher Session
  try {
    const res = await fetch('/api/me');
    const authData = await res.json();

    if (!authData.loggedIn || authData.user.role !== 'teacher') {
      window.location.href = 'index.html';
      return;
    }

    // Set Header
    const headerName = document.getElementById('header-teacher-name');
    const headerUser = document.getElementById('header-teacher-username');
    if (headerName) headerName.textContent = authData.user.name;
    if (headerUser) headerUser.textContent = authData.user.username;

    // Set Profile in teacher.html
    const profName = document.getElementById('teacher-profile-name');
    const profUser = document.getElementById('teacher-profile-user');
    if (profName) profName.textContent = authData.user.name;
    if (profUser) profUser.textContent = authData.user.username;

    // Load Assigned Subjects in teacher.html
    if (document.getElementById('teacher-subjects-tbody')) {
      loadAssignedSubjects();
    }

    // Load Teacher History in history.html
    if (document.getElementById('teacher-history-tbody')) {
      loadTeacherHistory();
    }

  } catch (err) {
    console.error('Teacher session check failed:', err);
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
  // Load Assigned Subjects for Teacher Dashboard
  // -------------------------------------------------------------
  async function loadAssignedSubjects() {
    const tbody = document.getElementById('teacher-subjects-tbody');
    try {
      const res = await fetch('/api/teacher/subjects');
      const data = await res.json();

      if (!data.success) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center">Error loading subjects.</td></tr>';
        return;
      }

      if (data.subjects.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center">No subjects currently assigned.</td></tr>';
        return;
      }

      tbody.innerHTML = '';
      data.subjects.forEach(sub => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${sub.subject_code}</strong></td>
          <td>${sub.subject_name}</td>
          <td class="text-center">
            <a href="attendance.html?subject_id=${sub.subject_id}" class="btn btn-small">Mark / Edit</a>
            <a href="upload.html?subject_id=${sub.subject_id}" class="btn btn-small btn-secondary">Upload Excel</a>
            <a href="history.html?subject_id=${sub.subject_id}" class="btn btn-small btn-secondary">History</a>
          </td>
        `;
        tbody.appendChild(tr);
      });

    } catch (err) {
      console.error('Error fetching subjects:', err);
      tbody.innerHTML = '<tr><td colspan="3" class="text-center">Server error fetching subjects.</td></tr>';
    }
  }

  // -------------------------------------------------------------
  // Load Teacher History Sessions (for history.html)
  // -------------------------------------------------------------
  async function loadTeacherHistory() {
    const filterSubject = document.getElementById('teacher-history-subject-filter');
    const filterDate = document.getElementById('teacher-history-date-filter');
    const tbody = document.getElementById('teacher-history-tbody');
    const statsBox = document.getElementById('teacher-history-stats');

    // Check query params for initial subject filter
    const urlParams = new URLSearchParams(window.location.search);
    const preselectedSubject = urlParams.get('subject_id');

    // Populate Teacher Subjects in filter dropdown
    try {
      const subjRes = await fetch('/api/teacher/subjects');
      const subjData = await subjRes.json();
      if (subjData.success && filterSubject) {
        filterSubject.innerHTML = '<option value="">-- All Assigned Subjects --</option>';
        subjData.subjects.forEach(sub => {
          const opt = document.createElement('option');
          opt.value = sub.subject_id;
          opt.textContent = `${sub.subject_name} (${sub.subject_code})`;
          if (preselectedSubject && preselectedSubject == sub.subject_id) {
            opt.selected = true;
          }
          filterSubject.appendChild(opt);
        });
      }
    } catch (e) {}

    async function fetchTeacherSessions() {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center">Loading session history...</td></tr>';
      let url = '/api/teacher/history?';
      if (filterSubject && filterSubject.value) url += `subject_id=${filterSubject.value}&`;
      if (filterDate && filterDate.value) url += `date=${filterDate.value}&`;

      try {
        const res = await fetch(url);
        const data = await res.json();

        if (!data.success) {
          tbody.innerHTML = '<tr><td colspan="7" class="text-center">Unable to load attendance history.</td></tr>';
          console.error('API error fetching teacher sessions:', data.message);
          return;
        }

        const sessions = data.sessions;
        if (sessions.length === 0) {
          tbody.innerHTML = '<tr><td colspan="7" class="text-center">No attendance sessions recorded yet.</td></tr>';
          if (statsBox) statsBox.style.display = 'none';
          return;
        }

        let totalClasses = sessions.length;
        let totalPresent = 0;
        let totalAbsent = 0;

        tbody.innerHTML = '';
        sessions.forEach(sess => {
          totalPresent += Number(sess.present_count);
          totalAbsent += Number(sess.absent_count);

          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${sess.date_formatted || sess.date_raw}</td>
            <td><strong>${sess.subject_code}</strong></td>
            <td>${sess.subject_name}</td>
            <td class="text-center status-present">${sess.present_count}</td>
            <td class="text-center status-absent">${sess.absent_count}</td>
            <td class="text-center"><strong>${sess.total_count}</strong></td>
            <td class="text-center">
              <a href="attendance.html?subject_id=${sess.subject_id}&date=${sess.date_raw}" class="btn btn-small">Edit Session</a>
            </td>
          `;
          tbody.appendChild(tr);
        });

        if (statsBox) {
          statsBox.style.display = 'block';
          statsBox.innerHTML = `
            <strong>Total Conducted Sessions:</strong> ${totalClasses} &nbsp;|&nbsp;
            <strong>Total Marked Present:</strong> <span class="status-present">${totalPresent}</span> &nbsp;|&nbsp;
            <strong>Total Marked Absent:</strong> <span class="status-absent">${totalAbsent}</span>
          `;
        }
      } catch (err) {
        console.error('Network or technical error fetching teacher history:', err);
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">Unable to load attendance history.</td></tr>';
      }
    }

    if (filterSubject) filterSubject.addEventListener('change', fetchTeacherSessions);
    if (filterDate) filterDate.addEventListener('change', fetchTeacherSessions);

    const btnReset = document.getElementById('btn-reset-teacher-history');
    if (btnReset) {
      btnReset.addEventListener('click', () => {
        if (filterSubject) filterSubject.value = '';
        if (filterDate) filterDate.value = '';
        fetchTeacherSessions();
      });
    }

    fetchTeacherSessions();
  }

}

// Support both static script tag and dynamic script injection after DOMContentLoaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTeacher);
} else {
  initTeacher();
}
