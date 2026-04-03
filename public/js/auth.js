// ==================== AUTH PAGE LOGIC ====================

const API_URL = '';

// Check if already logged in
(function checkAuth() {
  const token = localStorage.getItem('chatterbox_token');
  if (token) {
    window.location.href = '/chat.html';
  }
})();

// ==================== PARTICLES ====================
function createParticles() {
  const container = document.getElementById('particles');
  if (!container) return;
  for (let i = 0; i < 30; i++) {
    const particle = document.createElement('div');
    particle.className = 'particle';
    particle.style.left = Math.random() * 100 + '%';
    particle.style.animationDuration = (8 + Math.random() * 15) + 's';
    particle.style.animationDelay = (Math.random() * 10) + 's';
    particle.style.width = (2 + Math.random() * 3) + 'px';
    particle.style.height = particle.style.width;
    const colors = ['rgba(124,77,255,0.4)', 'rgba(255,107,203,0.3)', 'rgba(0,229,255,0.3)'];
    particle.style.background = colors[Math.floor(Math.random() * colors.length)];
    container.appendChild(particle);
  }
}
createParticles();

// ==================== TAB SWITCHING ====================
function switchTab(tab) {
  const loginTab = document.getElementById('loginTab');
  const registerTab = document.getElementById('registerTab');
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const authError = document.getElementById('authError');
  const authSuccess = document.getElementById('authSuccess');

  // Hide messages
  authError.classList.remove('visible');
  authSuccess.classList.remove('visible');

  if (tab === 'login') {
    loginTab.classList.add('active');
    registerTab.classList.remove('active');
    loginForm.classList.remove('hidden');
    registerForm.classList.add('hidden');
  } else {
    registerTab.classList.add('active');
    loginTab.classList.remove('active');
    registerForm.classList.remove('hidden');
    loginForm.classList.add('hidden');
  }
}

// ==================== SHOW ERROR/SUCCESS ====================
function showError(msg) {
  const el = document.getElementById('authError');
  el.textContent = msg;
  el.classList.add('visible');
  document.getElementById('authSuccess').classList.remove('visible');
}

function showSuccess(msg) {
  const el = document.getElementById('authSuccess');
  el.textContent = msg;
  el.classList.add('visible');
  document.getElementById('authError').classList.remove('visible');
}

// ==================== REGISTER ====================
async function handleRegister(e) {
  e.preventDefault();
  const btn = document.getElementById('registerBtn');
  const username = document.getElementById('registerUsername').value.trim();
  const email = document.getElementById('registerEmail').value.trim();
  const password = document.getElementById('registerPassword').value;

  if (!username || !email || !password) {
    return showError('Please fill in all fields');
  }

  if (password.length < 6) {
    return showError('Password must be at least 6 characters');
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Creating account...';

  try {
    const res = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Registration failed');
    }

    // Save token and user data
    localStorage.setItem('chatterbox_token', data.token);
    localStorage.setItem('chatterbox_user', JSON.stringify(data.user));

    showSuccess(`Welcome, ${data.user.username}! Your ID is ${data.user.uniqueId}. Redirecting...`);

    setTimeout(() => {
      window.location.href = '/chat.html';
    }, 1500);

  } catch (error) {
    showError(error.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Create Account';
  }
}

// ==================== LOGIN ====================
async function handleLogin(e) {
  e.preventDefault();
  const btn = document.getElementById('loginBtn');
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  if (!email || !password) {
    return showError('Please fill in all fields');
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Signing in...';

  try {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Login failed');
    }

    // Save token and user data
    localStorage.setItem('chatterbox_token', data.token);
    localStorage.setItem('chatterbox_user', JSON.stringify(data.user));

    showSuccess(`Welcome back, ${data.user.username}! Redirecting...`);

    setTimeout(() => {
      window.location.href = '/chat.html';
    }, 1000);

  } catch (error) {
    showError(error.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Sign In';
  }
}

// ==================== ENTER KEY SUPPORT ====================
document.querySelectorAll('.form-input').forEach(input => {
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.target.closest('form').dispatchEvent(new Event('submit'));
    }
  });
});
