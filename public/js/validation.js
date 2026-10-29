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

  // Checkout: hide the address box when "Pickup" is chosen
  const addressField = document.getElementById('address-field');
  document.querySelectorAll('input[name="fulfilment"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      if (addressField) addressField.hidden = radio.value === 'pickup' && radio.checked;
    });
  });

  // Menu: photo galleries (prev / next buttons + "1 / 3" counter)
  document.querySelectorAll('[data-gallery]').forEach((gallery) => {
    const track = gallery.querySelector('.gallery-track');
    const count = gallery.querySelector('[data-gallery-count]');
    const total = track.children.length;
    const go = (step) => track.scrollBy({ left: step * track.clientWidth, behavior: 'smooth' });
    const prev = gallery.querySelector('.prev');
    const next = gallery.querySelector('.next');
    if (prev) prev.addEventListener('click', () => go(-1));
    if (next) next.addEventListener('click', () => go(1));
    if (count) {
      track.addEventListener('scroll', () => {
        const index = Math.round(track.scrollLeft / track.clientWidth);
        count.textContent = `${Math.min(index + 1, total)} / ${total}`;
      });
    }
  });

  // Menu (admin): description letter counter and photo limit check
  document.querySelectorAll('form[data-edit-dish]').forEach((editForm) => {
    const textarea = editForm.querySelector('[data-counter]');
    const counter = editForm.querySelector('[data-count]');
    textarea.addEventListener('input', () => { counter.textContent = textarea.value.length; });

    const max = Number(editForm.dataset.maxPhotos);
    const photos = editForm.querySelector('[data-photos]');
    const photoError = editForm.querySelector('[data-photo-error]');
    const checkPhotos = () => {
      const kept = Number(photos.dataset.current) - editForm.querySelectorAll('[data-remove]:checked').length;
      const files = Array.from(photos.files);
      let message = '';
      if (kept + files.length > max) {
        message = kept
          ? `Max ${max} photos per dish: you can add ${Math.max(max - kept, 0)} more, or tick photos to remove.`
          : `You can upload at most ${max} photos per dish.`;
      } else if (files.some((f) => f.size > 2 * 1024 * 1024)) {
        message = 'Each photo must be 2 MB or smaller.';
      }
      photos.setCustomValidity(message);
      photoError.textContent = message;
      return !message;
    };
    // Small previews of the chosen photos next to the image icon
    const previews = editForm.querySelector('[data-previews]');
    const badge = editForm.querySelector('[data-photo-count]');
    const emptyHint = previews.innerHTML;
    const showPreviews = () => {
      previews.querySelectorAll('img').forEach((img) => URL.revokeObjectURL(img.src));
      const files = Array.from(photos.files);
      previews.innerHTML = files.length ? '' : emptyHint;
      files.forEach((file) => {
        const img = document.createElement('img');
        img.src = URL.createObjectURL(file);
        img.alt = file.name;
        previews.appendChild(img);
      });
      badge.hidden = !files.length;
      badge.textContent = files.length;
    };

    photos.addEventListener('change', () => {
      showPreviews();
      checkPhotos();
    });
    editForm.querySelectorAll('[data-remove]').forEach((box) => box.addEventListener('change', checkPhotos));
    editForm.addEventListener('submit', (e) => {
      if (!checkPhotos()) e.preventDefault();
    });
  });

  // Ask before destructive actions (e.g. deleting a dish)
  document.querySelectorAll('form[data-confirm]').forEach((f) => {
    f.addEventListener('submit', (e) => {
      if (!window.confirm(f.dataset.confirm)) e.preventDefault();
    });
  });

  // A rejected "Add new dish" form reopens: scroll it into view
  const openAdd = document.querySelector('.add-dish[open]');
  if (openAdd) openAdd.scrollIntoView({ block: 'center' });

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
