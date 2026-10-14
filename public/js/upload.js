// upload.js - Excel Attendance Upload Handler
document.addEventListener('DOMContentLoaded', async () => {

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

  const uploadForm = document.getElementById('upload-form');
  const uploadSubject = document.getElementById('upload-subject');
  const uploadDate = document.getElementById('upload-date');
  const uploadFile = document.getElementById('upload-file');
  const uploadReplace = document.getElementById('upload-replace');
  const uploadStatusBox = document.getElementById('upload-status-box');
  const btnUpload = document.getElementById('btn-upload');

  // Set default date
  const today = new Date().toISOString().split('T')[0];
  uploadDate.value = today;

  // Load Assigned Subjects
  try {
    const res = await fetch('/api/teacher/subjects');
    const data = await res.json();
    if (data.success) {
      data.subjects.forEach(sub => {
        const opt = document.createElement('option');
        opt.value = sub.subject_id;
        opt.textContent = `${sub.subject_name} (${sub.subject_code})`;
        uploadSubject.appendChild(opt);
      });

      // Pre-select if passed in URL
      const urlParams = new URLSearchParams(window.location.search);
      const paramSubId = urlParams.get('subject_id');
      if (paramSubId) {
        uploadSubject.value = paramSubId;
      }
    }
  } catch (err) {
    console.error('Failed to load teacher subjects:', err);
  }

  // Form Submit
  uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    uploadStatusBox.style.display = 'none';

    const subjectId = uploadSubject.value;
    const dateVal = uploadDate.value;
    const file = uploadFile.files[0];

    if (!subjectId) {
      showError('Please select a subject.');
      return;
    }
    if (!dateVal) {
      showError('Please select a date.');
      return;
    }
    if (!file) {
      showError('Please select an Excel file.');
      return;
    }

    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xls') && !fileName.endsWith('.csv')) {
      showError('Excel file format is invalid. Please select a valid .xlsx or .xls file.');
      return;
    }

    const formData = new FormData();
    formData.append('subject_id', subjectId);
    formData.append('date', dateVal);
    formData.append('replace', uploadReplace.checked ? 'true' : 'false');
    formData.append('excel_file', file);

    try {
      btnUpload.disabled = true;
      btnUpload.textContent = 'Uploading...';

      const response = await fetch('/api/teacher/upload', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();
      btnUpload.disabled = false;
      btnUpload.textContent = 'Upload Attendance';

      if (response.ok && result.success) {
        uploadStatusBox.className = 'alert alert-success';
        uploadStatusBox.innerHTML = `
          <strong>${result.message}</strong><br>
          Total Students Processed: <strong>${result.total}</strong> | 
          Present: <span class="status-present">${result.present}</span> | 
          Absent: <span class="status-absent">${result.absent}</span>
        `;
        uploadStatusBox.style.display = 'block';
        uploadForm.reset();
        uploadDate.value = today;
        uploadSubject.value = subjectId;
      } else if (result.duplicate) {
        uploadStatusBox.className = 'alert alert-warning';
        uploadStatusBox.innerHTML = `
          <strong>${result.message}</strong><br>
          To overwrite these records, please check <em>"Replace existing attendance"</em> above and click Upload again.
        `;
        uploadStatusBox.style.display = 'block';
      } else {
        showError(result.message || 'Excel file format is invalid.');
      }
    } catch (err) {
      btnUpload.disabled = false;
      btnUpload.textContent = 'Upload Attendance';
      showError('Connection error uploading Excel file.');
    }
  });

  function showError(msg) {
    uploadStatusBox.className = 'alert alert-danger';
    uploadStatusBox.textContent = msg;
    uploadStatusBox.style.display = 'block';
  }

});
