require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const csrfProtection = require('./middleware/csrf');
const authRoutes = require('./routes/auth');

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
  next();
});

app.use(csrfProtection);

app.use('/', authRoutes);

app.use((req, res) => {
  res.status(404).render('error', { title: 'Page not found', message: "That page doesn't exist." });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', { title: 'Something went wrong', message: 'Please try again later.' });
});

module.exports = app;
