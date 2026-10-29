// Server-side validation. Never trust the browser: the same rules also run
// client-side (public/js/validation.js) only for a faster user experience.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NAME_RE = /^[A-Za-z][A-Za-z .'-]{1,49}$/;

function validatePassword(password) {
  const errors = [];
  if (password.length < 8) errors.push('at least 8 characters');
  if (password.length > 72) errors.push('no more than 72 characters');
  if (!/[a-z]/.test(password)) errors.push('a lowercase letter');
  if (!/[A-Z]/.test(password)) errors.push('an uppercase letter');
  if (!/\d/.test(password)) errors.push('a number');
  if (!/[^A-Za-z0-9]/.test(password)) errors.push('a special character');
  return errors.length ? `Password must contain ${errors.join(', ')}.` : null;
}

function validateRegistration(body = {}) {
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const confirmPassword = String(body.confirmPassword || '');
  const errors = {};

  if (!name) errors.name = 'Name is required.';
  else if (!NAME_RE.test(name)) errors.name = 'Name must be 2–50 letters (spaces, . \' - allowed).';

  if (!email) errors.email = 'Email is required.';
  else if (!EMAIL_RE.test(email) || email.length > 254) errors.email = 'Enter a valid email address.';

  if (!password) errors.password = 'Password is required.';
  else {
    const pwError = validatePassword(password);
    if (pwError) errors.password = pwError;
  }

  if (!confirmPassword) errors.confirmPassword = 'Please confirm your password.';
  else if (password !== confirmPassword) errors.confirmPassword = 'Passwords do not match.';

  return { errors, values: { name, email, password } };
}

function validateLogin(body = {}) {
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const errors = {};
  if (!email) errors.email = 'Email is required.';
  else if (!EMAIL_RE.test(email)) errors.email = 'Enter a valid email address.';
  if (!password) errors.password = 'Password is required.';
  return { errors, values: { email, password } };
}

function validateEmailOnly(body = {}) {
  const email = String(body.email || '').trim().toLowerCase();
  const errors = {};
  if (!email) errors.email = 'Email is required.';
  else if (!EMAIL_RE.test(email)) errors.email = 'Enter a valid email address.';
  return { errors, values: { email } };
}

function validateNewPassword(body = {}) {
  const password = String(body.password || '');
  const confirmPassword = String(body.confirmPassword || '');
  const errors = {};
  if (!password) errors.password = 'Password is required.';
  else {
    const pwError = validatePassword(password);
    if (pwError) errors.password = pwError;
  }
  if (!confirmPassword) errors.confirmPassword = 'Please confirm your password.';
  else if (password !== confirmPassword) errors.confirmPassword = 'Passwords do not match.';
  return { errors, values: { password } };
}

module.exports = {
  validateRegistration,
  validateLogin,
  validatePassword,
  validateEmailOnly,
  validateNewPassword,
};
