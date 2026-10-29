// Route guards
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) return next();
  // Remember where the user was going (e.g. checkout) and send them back after login.
  if (req.method === 'GET') req.session.returnTo = req.originalUrl;
  req.session.flash = { type: 'error', message: 'Please log in to continue.' };
  return res.redirect('/login');
}

function redirectIfAuthenticated(req, res, next) {
  if (req.session && req.session.userId) return res.redirect('/dashboard');
  return next();
}

// Kitchen (admin) access: emails listed in ADMIN_EMAILS, comma-separated, in .env / Render.
function adminEmails() {
  return String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function isAdminEmail(email) {
  return Boolean(email) && adminEmails().includes(String(email).toLowerCase());
}

function requireAdmin(req, res, next) {
  if (!req.session.userId) return requireAuth(req, res, next);
  if (res.locals.isAdmin) return next();
  return res.status(403).render('error', {
    title: 'Kitchen only',
    message: 'This page is only for the Happy Yummy kitchen team.',
  });
}

module.exports = { requireAuth, redirectIfAuthenticated, requireAdmin, isAdminEmail };
