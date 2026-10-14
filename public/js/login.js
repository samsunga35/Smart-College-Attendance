// login.js - Student and Teacher Login Handler
document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login-form');
  const errorBox = document.getElementById('login-error');

  // If already logged in, redirect to respective dashboard
  fetch('/api/me')
    .then(res => res.json())
    .then(data => {
      if (data.loggedIn && data.user) {
        if (data.user.role === 'student') {
          window.location.href = 'student.html';
        } else if (data.user.role === 'teacher') {
          window.location.href = 'teacher.html';
        }
      }
    })
    .catch(() => {});

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const username = document.getElementById('username').value.trim();
      const password = document.getElementById('password').value;
      const role = document.getElementById('role').value;

      errorBox.style.display = 'none';
      errorBox.textContent = '';

      if (!username || !password) {
        errorBox.textContent = 'Please enter both username and password.';
        errorBox.style.display = 'block';
        return;
      }

      try {
        const response = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password, role })
        });

        const data = await response.json();

        if (response.ok && data.success) {
          window.location.href = data.redirect;
        } else {
          errorBox.textContent = data.message || 'Invalid username or password.';
          errorBox.style.display = 'block';
        }
      } catch (err) {
        errorBox.textContent = 'Unable to connect to server. Please try again.';
        errorBox.style.display = 'block';
      }
    });
  }
});
