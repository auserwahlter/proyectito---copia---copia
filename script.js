const showLogin = document.getElementById('show-login');
const showRegister = document.getElementById('show-register');
const wizardSection = document.getElementById('wizard-section');
const wizardTitle = document.getElementById('wizard-title');
const wizardDescription = document.getElementById('wizard-description');
const wizardBadge = document.getElementById('wizard-badge');
const roleStep = document.getElementById('role-step');
const detailsStep = document.getElementById('details-step');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const roleOptions = document.querySelectorAll('.role-option');
const stepPills = document.querySelectorAll('.step-pill');
const closeForm = document.getElementById('close-form');
const loginSubmit = document.getElementById('login-submit');
const registerSubmit = document.getElementById('register-submit');
const welcomeSection = document.getElementById('welcome-section');
const welcomeHeading = document.getElementById('welcome-heading');
const welcomeText = document.getElementById('welcome-text');
const welcomeMeta = document.getElementById('welcome-meta');
const resetButton = document.getElementById('reset');
const selectedRoleTitle = document.getElementById('selected-role-title');
const selectedRoleCopy = document.getElementById('selected-role-copy');
const selectedRoleTag = document.getElementById('selected-role-tag');
const rankField = document.getElementById('rank-field');
const rankSelect = document.getElementById('rank-select');
const backToHome = document.getElementById('back-to-home');
const teacherPendingPanel = document.getElementById('teacher-pending-panel');

// ── Clave de sesión unificada (igual en todos los dashboards) ──
const SESSION_KEY = 'lutaedanca_user';

const persistSession = (user, token) => {
  const serializedUser = JSON.stringify(user);
  localStorage.setItem(SESSION_KEY, serializedUser);
  localStorage.setItem('currentUser', serializedUser);
  localStorage.setItem('le_user', serializedUser);
  if (token) localStorage.setItem('le_token', token);
};

const redirectToProfesorDashboard = (user, token) => {
  persistSession(user, token);
  window.location.assign('profesor-dashboard.html');
};

const redirectToStudentDashboard = (user, token) => {
  persistSession(user, token);
  window.location.assign('student-dashboard.html');
};
const redirectToModeratorDashboard = (user, token) => {
  persistSession(user, token);
  window.location.assign('moderador-dashboard.html');
}
const apiRequest = async (endpoint, payload) => {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (err) {
    // Respuesta no JSON (por ejemplo Forbidden o un error HTML)
  }

  if (!response.ok) {
    const message = data?.message || data?.error || text || 'Error del servidor';
    throw new Error(message);
  }

  return data;
};

const roleContent = {
  alumno: {
    label: 'Alumno',
    title: 'Alumno',
    copy: 'Entrena técnicas, recibe feedback y avanza en tu camino de grappling con clases guiadas.',
    accent: 'Entrenamiento'
  }
};

let selectedRole = 'alumno';

function resetSteps() {
  roleStep.classList.remove('hidden');
  detailsStep.classList.add('hidden');
  loginForm.classList.add('hidden');
  registerForm.classList.add('hidden');
  rankField.classList.add('hidden');
  rankSelect.value = '';
  stepPills.forEach(pill => pill.classList.remove('active'));
  document.querySelector('[data-step="role"]').classList.add('active');
  roleOptions.forEach(btn => btn.classList.remove('active'));
  selectedRole = 'alumno';
  updateRoleSelection(selectedRole);
}

function showStudentDetails() {
  detailsStep.classList.remove('hidden');
  registerForm.classList.remove('hidden');
  loginForm.classList.add('hidden');

  rankField.classList.remove('hidden');
  wizardTitle.textContent = 'Cuenta alumno';
  wizardDescription.textContent = 'Elige tu faixa, completa tus datos y crea tu cuenta de alumno. Podrás solicitar el cambio a profesor desde tu perfil.';

  wizardBadge.textContent = 'Datos del perfil';
  stepPills.forEach(pill => pill.classList.remove('active'));
  document.querySelector('[data-step="details"]').classList.add('active');
}

function updateRoleSelection(role) {
  selectedRole = role;
  const content = roleContent[role];
  selectedRoleTitle.textContent = content.title;
  selectedRoleCopy.textContent = content.copy;
  selectedRoleTag.textContent = content.label;
  roleOptions.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.role === role);
  });
}

function setStep(step, mode = 'register') {
  roleStep.classList.add('hidden');
  detailsStep.classList.add('hidden');
  stepPills.forEach(pill => pill.classList.remove('active'));
  document.querySelector(`[data-step="${step}"]`).classList.add('active');

  if (step === 'role') {
    roleStep.classList.remove('hidden');
    wizardTitle.textContent = 'Elige tu camino';
    wizardDescription.textContent = 'Comenzarás como alumno. Puedes solicitar el cambio a profesor desde tu perfil.';
    wizardBadge.textContent = 'Crea tu cuenta';
  }

  if (step === 'details') {
    detailsStep.classList.remove('hidden');
    if (mode === 'login') {
      loginForm.classList.remove('hidden');
      registerForm.classList.add('hidden');
      wizardTitle.textContent = 'Iniciar sesión';
      wizardDescription.textContent = 'Accede a tu espacio de entrenamiento con tu email y contraseña.';
      wizardBadge.textContent = 'Acceso rápido';
    } else {
      showStudentDetails();
    }
  }

}

function resetView() {
  wizardSection.classList.add('hidden');
  welcomeSection.classList.add('hidden');
  teacherPendingPanel?.classList.add('hidden');
  document.getElementById('register-name').value = '';
  document.getElementById('register-email').value = '';
  document.getElementById('register-password').value = '';
  document.getElementById('login-email').value = '';
  document.getElementById('login-password').value = '';
  rankSelect.value = '';
  resetSteps();
}

function showPendingPanel() {
  wizardSection.classList.remove('hidden');
  roleStep.classList.add('hidden');
  detailsStep.classList.remove('hidden');
  loginForm.classList.add('hidden');
  registerForm.classList.add('hidden');
  teacherPendingPanel?.classList.remove('hidden');
  stepPills.forEach(pill => pill.classList.remove('active'));
  document.querySelector('[data-step="details"]').classList.add('active');
  wizardTitle.textContent = 'Cuenta pendiente de aprobación';
  wizardDescription.textContent = 'Tu solicitud para ser profesor está en revisión. Recibirás una notificación cuando sea aprobada.';
  wizardBadge.textContent = 'Revisión en curso';
}

function showWizard(mode = 'register') {
  wizardSection.classList.remove('hidden');
  resetSteps();
  if (mode === 'login') {
    setStep('details', 'login');
  } else {
    setStep('role');
  }
  // Desplazar suavemente hacia la sección del asistente para una experiencia didáctica
  setTimeout(() => {
    wizardSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 60);
}

function showWelcome(role, name) {
  wizardSection.classList.add('hidden');
  welcomeSection.classList.remove('hidden');

  if (role === 'profesor') {
    welcomeHeading.textContent = `Bienvenido, ${name || 'profesor'}!`;
    welcomeText.textContent = 'Puedes guiar alumnos, compartir técnicas y construir una comunidad de entrenamiento fuerte.';
  } else if (role === 'moderator' || role === 'moderador') {
    welcomeHeading.textContent = `Bienvenido, ${name || 'moderador'}!`;
    welcomeText.textContent = 'Gracias por unirte como moderador. Tu rol es crucial para mantener una comunidad positiva y constructiva.';
  } else {
    welcomeHeading.textContent = `Bienvenido, ${name || 'alumno'}!`;
    welcomeText.textContent = 'Prepárate para entrenar, mejorar tus técnicas y avanzar en tu camino de grappling.';
  }

  const roleMetaLabel = roleContent[role]?.label || role;
  const chips = [`<span class="meta-chip">Rol: ${roleMetaLabel}</span>`];
  if (role === 'alumno' && rankSelect.value) {
    chips.push(`<span class="meta-chip">Rango: ${rankSelect.value}</span>`);
  }
  welcomeMeta.innerHTML = chips.join('');
}

// ── Listeners ──────────────────────────────────────────────────

showLogin.addEventListener('click', () => showWizard('login'));
showRegister.addEventListener('click', () => showWizard('register'));

roleOptions.forEach(option => {
  option.addEventListener('click', () => {
    updateRoleSelection(option.dataset.role);
    showStudentDetails();
  });
});

backToHome.addEventListener('click', () => resetView());
closeForm.addEventListener('click', resetView);

// ── LOGIN ───────────────────────────────────────────────────────
loginSubmit.addEventListener('click', async () => {
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value.trim();
  if (!email || !password) return;

  loginSubmit.disabled = true;
  try {
    const data = await apiRequest('/api/login', { email, password });
    const normalizedRole = data.user.rol === 'moderador' ? 'moderador' : data.user.rol;

    if (normalizedRole === 'alumno' || normalizedRole === 'miembro') {
      redirectToStudentDashboard(data.user, data.token);
      return;
    }

    if (normalizedRole === 'profesor') {
      persistSession(data.user, data.token);
      if (data.user.estado === 'pendiente') {
        showPendingPanel();
        return;
      }
      redirectToProfesorDashboard(data.user, data.token);
      return;
    }

    if (normalizedRole === 'moderador' || normalizedRole === 'moderator') {
      redirectToModeratorDashboard(data.user, data.token);
      return;
    }

    showWelcome(normalizedRole, data.user.nombre);
  } catch (error) {
    alert(error.message);
  } finally {
    loginSubmit.disabled = false;
  }
});

// ── REGISTER  ──────────────────
registerSubmit.addEventListener('click', async () => {
  const name     = document.getElementById('register-name').value.trim();
  const email    = document.getElementById('register-email').value.trim();
  const password = document.getElementById('register-password').value.trim();
  if (!name || !email || !password) return;
  if (selectedRole === 'alumno' && !rankSelect.value) { rankSelect.focus(); return; }

  registerSubmit.disabled = true;
  try {
    const data = await apiRequest('/api/register', {
      nombre: name,
      email,
      password,
      rol: 'alumno',
      rango: rankSelect.value
    });

    redirectToStudentDashboard(data.user, data.token);
  } catch (error) {
    alert(error.message);
  } finally {
    registerSubmit.disabled = false;
  }
});

resetButton.addEventListener('click', () => {
  welcomeSection.classList.add('hidden');
  resetView();
});

resetView();
