// Client-side validation for instant feedback.
// The server re-validates everything (src/utils/validators.js).
(function () {
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const NAME_RE = /^[A-Za-z][A-Za-z .'-]{1,49}$/;
  const RULES = {
    length: (p) => p.length >= 8,
    lower: (p) => /[a-z]/.test(p),
    upper: (p) => /[A-Z]/.test(p),
    digit: (p) => /\d/.test(p),
    special: (p) => /[^A-Za-z0-9]/.test(p),
  };

  // Show / hide password buttons
  document.querySelectorAll('.toggle-pw').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = btn.previousElementSibling;
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.textContent = show ? 'Hide' : 'Show';
      btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });
  });

  const form = document.querySelector('form[data-validate]');
  if (!form) return;
  const mode = form.dataset.validate;

  function setError(name, message) {
    const input = form.elements[name];
    const msg = form.querySelector(`.error-msg[data-for="${name}"]`);
    if (!input || !msg) return;
    msg.textContent = message || '';
    input.closest('.field').classList.toggle('has-error', Boolean(message));
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
  }

  function validators() {
    const v = (n) => (form.elements[n] ? form.elements[n].value : '');
    const strongPassword = mode === 'register' || mode === 'reset';
    const checks = {};

    if (mode !== 'reset') {
      checks.email = () => {
        const e = v('email').trim();
        if (!e) return 'Email is required.';
        if (!EMAIL_RE.test(e)) return 'Enter a valid email address.';
        return '';
      };
    }
    if (mode !== 'forgot') {
      checks.password = () => {
        const p = v('password');
        if (!p) return 'Password is required.';
        if (strongPassword) {
          const failed = Object.keys(RULES).filter((k) => !RULES[k](p));
          if (failed.length) return 'Password does not meet all requirements.';
        }
        return '';
      };
    }
    if (mode === 'register') {
      checks.name = () => {
        const n = v('name').trim();
        if (!n) return 'Name is required.';
        if (!NAME_RE.test(n)) return "Name must be 2–50 letters (spaces, . ' - allowed).";
        return '';
      };
    }
    if (strongPassword) {
      checks.confirmPassword = () => {
        const c = v('confirmPassword');
        if (!c) return 'Please confirm your password.';
        if (c !== v('password')) return 'Passwords do not match.';
        return '';
      };
    }
    return checks;
  }

  const checks = validators();

  // Validate a field when the user leaves it, and live once it's been flagged
  Object.keys(checks).forEach((name) => {
    const input = form.elements[name];
    input.addEventListener('blur', () => setError(name, checks[name]()));
    input.addEventListener('input', () => {
      if (input.closest('.field').classList.contains('has-error')) setError(name, checks[name]());
    });
  });

  // Live password rule checklist
  const rulesList = form.querySelector('.pw-rules');
  if (rulesList) {
    form.elements.password.addEventListener('input', (e) => {
      Object.entries(RULES).forEach(([key, test]) => {
        rulesList.querySelector(`[data-rule="${key}"]`).classList.toggle('ok', test(e.target.value));
      });
    });
  }

  form.addEventListener('submit', (e) => {
    let firstInvalid = null;
    Object.keys(checks).forEach((name) => {
      const message = checks[name]();
      setError(name, message);
      if (message && !firstInvalid) firstInvalid = form.elements[name];
    });
    if (firstInvalid) {
      e.preventDefault();
      firstInvalid.focus();
    }
  });
})();
