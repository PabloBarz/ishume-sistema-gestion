import { signIn } from '../auth.js';

export function initLoginView({ onSuccess }) {
  const form = document.getElementById('loginForm');
  const username = document.getElementById('loginUsername');
  const password = document.getElementById('loginPassword');
  const message = document.getElementById('loginMessage');
  const submit = document.getElementById('loginSubmit');
  const toggle = document.getElementById('togglePassword');
  const usernameError = document.getElementById('loginUsernameError');
  const passwordError = document.getElementById('loginPasswordError');

  toggle.addEventListener('click', () => {
    const visible = password.type === 'password';
    password.type = visible ? 'text' : 'password';
    toggle.setAttribute('aria-pressed', String(visible));
    toggle.setAttribute('aria-label', visible ? 'Ocultar contraseña' : 'Mostrar contraseña');
    toggle.querySelector('i').className = `bi ${visible ? 'bi-eye-slash' : 'bi-eye'}`;
    password.focus();
  });

  [username, password].forEach((input) => {
    input.addEventListener('input', () => {
      input.removeAttribute('aria-invalid');
      if (input === username) usernameError.textContent = '';
      else passwordError.textContent = '';
      message.hidden = true;
      message.textContent = '';
    });
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    usernameError.textContent = '';
    passwordError.textContent = '';
    message.hidden = true;
    message.textContent = '';
    const normalizedUsername = username.value.trim();
    let valid = true;

    if (!normalizedUsername) {
      usernameError.textContent = 'Ingresa tu usuario.';
      username.setAttribute('aria-invalid', 'true');
      valid = false;
    }
    if (!password.value) {
      passwordError.textContent = 'Ingresa tu contraseña.';
      password.setAttribute('aria-invalid', 'true');
      valid = false;
    }
    if (!valid) return;

    submit.disabled = true;
    submit.classList.add('is-loading');
    submit.querySelector('.login-submit-label').textContent = 'Verificando…';
    try {
      await signIn(normalizedUsername, password.value);
      password.value = '';
      onSuccess();
    } catch (error) {
      message.textContent = error.message || 'No se pudo iniciar sesión. Inténtalo nuevamente.';
      message.hidden = false;
      if (error.status === 401) {
        password.setAttribute('aria-invalid', 'true');
        password.focus();
      }
    } finally {
      submit.disabled = false;
      submit.classList.remove('is-loading');
      submit.querySelector('.login-submit-label').textContent = 'Iniciar sesión';
    }
  });

  username.focus();
}
