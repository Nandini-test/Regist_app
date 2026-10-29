// Route guards
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) return next();
  req.session.flash = { type: 'error', message: 'Please log in to continue.' };
  return res.redirect('/login');
}

function redirectIfAuthenticated(req, res, next) {
  if (req.session && req.session.userId) return res.redirect('/dashboard');
  return next();
}

module.exports = { requireAuth, redirectIfAuthenticated };
