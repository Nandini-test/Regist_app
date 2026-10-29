const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const users = require('../models/userStore');
const orders = require('../models/orderStore');
const crypto = require('crypto');
const {
  validateRegistration,
  validateLogin,
  validateEmailOnly,
  validateNewPassword,
} = require('../utils/validators');
const { sendPasswordResetEmail } = require('../utils/mailer');
const { requireAuth, redirectIfAuthenticated } = require('../middleware/auth');

const router = express.Router();
const SALT_ROUNDS = 12;

// Used to keep login timing the same whether or not the email exists.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', SALT_ROUNDS);

// Slow down brute-force attempts on auth forms.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: process.env.NODE_ENV === 'test' ? 1000 : 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) =>
    res.status(429).render('error', {
      title: 'Too many attempts',
      message: 'Too many attempts from this device. Please wait 15 minutes and try again.',
    }),
});

router.get('/', (req, res) => res.redirect('/menu'));

// ---------- Registration ----------
router.get('/register', redirectIfAuthenticated, (req, res) => {
  res.render('register', { title: 'Create account', errors: {}, values: {} });
});

router.post('/register', authLimiter, redirectIfAuthenticated, async (req, res, next) => {
  try {
    const { errors, values } = validateRegistration(req.body);

    if (!errors.email && users.findByEmail(values.email)) {
      errors.email = 'An account with this email already exists.';
    }

    if (Object.keys(errors).length) {
      return res.status(400).render('register', {
        title: 'Create account',
        errors,
        values: { name: values.name, email: values.email }, // never echo passwords back
      });
    }

    const passwordHash = await bcrypt.hash(values.password, SALT_ROUNDS);
    users.create({ name: values.name, email: values.email, passwordHash });

    req.session.flash = { type: 'success', message: 'Account created! Please log in.' };
    return res.redirect('/login');
  } catch (err) {
    return next(err);
  }
});

// ---------- Login ----------
router.get('/login', redirectIfAuthenticated, (req, res) => {
  res.render('login', { title: 'Log in', errors: {}, values: {} });
});

router.post('/login', authLimiter, redirectIfAuthenticated, async (req, res, next) => {
  try {
    const { errors, values } = validateLogin(req.body);
    if (Object.keys(errors).length) {
      return res.status(400).render('login', {
        title: 'Log in',
        errors,
        values: { email: values.email },
      });
    }

    const user = users.findByEmail(values.email);
    const match = await bcrypt.compare(values.password, user ? user.passwordHash : DUMMY_HASH);

    if (!user || !match) {
      // Generic message: don't reveal which part was wrong.
      return res.status(401).render('login', {
        title: 'Log in',
        errors: { form: 'Invalid email or password.' },
        values: { email: values.email },
      });
    }

    // Keep the cart and the page they were heading to (e.g. checkout) across login.
    const { cart } = req.session;
    const returnTo = req.session.returnTo;
    const safeReturn = typeof returnTo === 'string' && /^\/(?!\/)/.test(returnTo) ? returnTo : '/dashboard';

    // Prevent session fixation: issue a fresh session ID on login.
    return req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.userId = user.id;
      if (cart) req.session.cart = cart;
      return res.redirect(safeReturn);
    });
  } catch (err) {
    return next(err);
  }
});

// ---------- Forgot / reset password ----------
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
const SENT_MESSAGE =
  'If an account exists for that email, a password reset link has been sent. It is valid for 30 minutes.';

function findUserByValidToken(token) {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const user = users.findByResetTokenHash(hashToken(token));
  if (!user || !user.resetTokenExpires || Date.now() > user.resetTokenExpires) return null;
  return user;
}

router.get('/forgot-password', redirectIfAuthenticated, (req, res) => {
  res.render('forgot-password', { title: 'Forgot password', errors: {}, values: {} });
});

router.post('/forgot-password', authLimiter, redirectIfAuthenticated, async (req, res, next) => {
  try {
    const { errors, values } = validateEmailOnly(req.body);
    if (Object.keys(errors).length) {
      return res.status(400).render('forgot-password', { title: 'Forgot password', errors, values });
    }

    const user = users.findByEmail(values.email);
    if (user) {
      // Only a hash of the token is stored, so a leaked data file can't be used to reset passwords.
      const token = crypto.randomBytes(32).toString('hex');
      users.update(user.id, {
        resetTokenHash: hashToken(token),
        resetTokenExpires: Date.now() + RESET_TOKEN_TTL_MS,
      });
      const link = `${req.protocol}://${req.get('host')}/reset-password/${token}`;
      await sendPasswordResetEmail(user.email, user.name, link);
    }

    // Same message whether or not the email exists, so accounts can't be discovered this way.
    req.session.flash = { type: 'success', message: SENT_MESSAGE };
    return res.redirect('/login');
  } catch (err) {
    return next(err);
  }
});

router.get('/reset-password/:token', redirectIfAuthenticated, (req, res) => {
  if (!findUserByValidToken(req.params.token)) {
    req.session.flash = { type: 'error', message: 'This reset link is invalid or has expired. Please request a new one.' };
    return res.redirect('/forgot-password');
  }
  return res.render('reset-password', { title: 'Reset password', errors: {}, token: req.params.token });
});

router.post('/reset-password/:token', authLimiter, redirectIfAuthenticated, async (req, res, next) => {
  try {
    const { token } = req.params;
    const user = findUserByValidToken(token);
    if (!user) {
      req.session.flash = { type: 'error', message: 'This reset link is invalid or has expired. Please request a new one.' };
      return res.redirect('/forgot-password');
    }

    const { errors, values } = validateNewPassword(req.body);
    if (Object.keys(errors).length) {
      return res.status(400).render('reset-password', { title: 'Reset password', errors, token });
    }

    const passwordHash = await bcrypt.hash(values.password, SALT_ROUNDS);
    // Save the new password and make the link single-use.
    users.update(user.id, { passwordHash, resetTokenHash: null, resetTokenExpires: null });

    req.session.flash = { type: 'success', message: 'Password updated. Please log in with your new password.' };
    return res.redirect('/login');
  } catch (err) {
    return next(err);
  }
});

// ---------- Protected area ----------
router.get('/dashboard', requireAuth, (req, res) => {
  const user = users.findById(req.session.userId);
  if (!user) {
    return req.session.destroy(() => res.redirect('/login'));
  }
  return res.render('dashboard', {
    title: 'My account',
    user: { name: user.name, email: user.email, createdAt: user.createdAt },
    orderCount: orders.findByUser(user.id).length,
  });
});

router.post('/logout', (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('sid');
    return res.redirect('/menu');
  });
});

module.exports = router;
