// Minimal CSRF protection (synchronizer token pattern).
// A random token is stored in the session and embedded in every form;
// POST requests without the matching token are rejected.
const crypto = require('crypto');

function csrfProtection(req, res, next) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;

  if (req.method === 'POST') {
    const sent = String((req.body && req.body._csrf) || '');
    const expected = req.session.csrfToken;
    const ok =
      sent.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(expected));
    if (!ok) {
      return res.status(403).render('error', {
        title: 'Session expired',
        message: 'Your form session expired. Please go back, refresh the page and try again.',
      });
    }
  }
  return next();
}

module.exports = csrfProtection;
