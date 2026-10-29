require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const csrfProtection = require('./middleware/csrf');
const authRoutes = require('./routes/auth');
const shopRoutes = require('./routes/shop');
const users = require('./models/userStore');
const cart = require('./utils/cart');
const { isAdminEmail } = require('./middleware/auth');
const { parseDishPhotos } = require('./middleware/upload');
const { UPLOADS_DIR } = require('./models/dishStore');

const app = express();
const isProd = process.env.NODE_ENV === 'production';

if (isProd && !process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET must be set in production.');
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
if (isProd) app.set('trust proxy', 1);

app.use(helmet()); // secure HTTP headers (CSP, no-sniff, frameguard...)
app.use(express.urlencoded({ extended: false, limit: '10kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '7d' })); // dish photos

app.use(
  session({
    name: 'sid',
    secret: process.env.SESSION_SECRET || 'dev-only-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true, // not readable from JavaScript
      sameSite: 'lax',
      secure: isProd, // HTTPS only in production
      maxAge: 1000 * 60 * 60 * 2, // 2 hours
    },
  })
);

// Flash messages (shown once, then removed) + template defaults
app.use((req, res, next) => {
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  res.locals.isAuthenticated = Boolean(req.session.userId);
  const user = req.session.userId ? users.findById(req.session.userId) : null;
  res.locals.currentUser = user ? { id: user.id, name: user.name, email: user.email } : null;
  res.locals.isAdmin = Boolean(user && isAdminEmail(user.email));
  res.locals.cartCount = cart.summarize(req.session).count;
  res.locals.wide = false;
  res.locals.currentPath = req.path; // used to highlight the active nav link
  next();
});

// Multipart dish forms (with photos): parse them so CSRF can read _csrf
app.post(['/menu/new', '/menu/:id/edit'], parseDishPhotos);
app.use(csrfProtection);

app.use('/', authRoutes);
app.use('/', shopRoutes);

app.use((req, res) => {
  res.status(404).render('error', { title: 'Page not found', message: "That page doesn't exist." });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', { title: 'Something went wrong', message: 'Please try again later.' });
});

module.exports = app;
