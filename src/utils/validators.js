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

// ---------- Checkout ----------
const PHONE_RE = /^[6-9]\d{9}$/; // Indian mobile number, 10 digits

function validateCheckout(body = {}) {
  const phone = String(body.phone || '').replace(/[\s-]/g, '').replace(/^\+?91(?=\d{10}$)/, '');
  const fulfilment = body.fulfilment === 'pickup' ? 'pickup' : 'delivery';
  const address = String(body.address || '').trim();
  const date = String(body.date || '');
  const slot = String(body.slot || '');
  const payment = ['upi', 'cash'].includes(body.payment) ? body.payment : '';
  const notes = String(body.notes || '').trim();
  const errors = {};

  if (!phone) errors.phone = 'Phone number is required.';
  else if (!PHONE_RE.test(phone)) errors.phone = 'Enter a valid 10-digit mobile number.';

  if (fulfilment === 'delivery') {
    if (!address) errors.address = 'Delivery address is required.';
    else if (address.length < 10) errors.address = 'Please enter the full address (house no., street, area).';
    else if (address.length > 300) errors.address = 'Address is too long (max 300 characters).';
  }
  if (!payment) errors.payment = 'Choose a payment method.';
  if (notes.length > 300) errors.notes = 'Notes are too long (max 300 characters).';

  return { errors, values: { phone, fulfilment, address, date, slot, payment, notes } };
}

module.exports.validateCheckout = validateCheckout;

// ---------- New dish (admin) ----------
const MAX_DISH_DESCRIPTION = 100;

function validateNewDish(body = {}, categoryIds = []) {
  const clean = (v) => String(v || '').replace(/\s+/g, ' ').trim();
  const category = categoryIds.includes(body.category) ? body.category : '';
  const name = clean(body.name);
  const priceText = clean(body.price);
  const price = Number(priceText);
  const unit = clean(body.unit) || '1 plate';
  const description = clean(body.description);
  const nonVeg = body.nonVeg === 'on';
  const errors = {};

  if (!category) errors.category = 'Choose a menu section.';
  if (!name) errors.name = 'Dish name is required.';
  else if (name.length < 2 || name.length > 40) errors.name = 'Dish name must be 2–40 characters.';
  if (!priceText) errors.price = 'Price is required.';
  else if (!Number.isInteger(price) || price < 1 || price > 10000) errors.price = 'Enter a whole price from ₹1 to ₹10,000.';
  if (unit.length > 30) errors.unit = 'Portion size is too long (max 30 characters).';
  if (!description) errors.description = 'Add a short description.';
  else if (Array.from(description).length > MAX_DISH_DESCRIPTION) {
    errors.description = `Description can be at most ${MAX_DISH_DESCRIPTION} letters.`;
  }

  return { errors, values: { category, name, price: priceText, unit: clean(body.unit), description, nonVeg } };
}

module.exports.validateNewDish = validateNewDish;
