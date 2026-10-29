// Parses the admin "Edit dish" form (multipart, with photos).
// It runs before the CSRF check so the _csrf field can be read from the form,
// but only for admins; files stay in memory until the route has validated them.
const multer = require('multer');
const { MAX_PHOTOS } = require('../models/dishStore');

const MAX_PHOTO_BYTES = 2 * 1024 * 1024; // 2 MB per photo

const parser = multer({
  storage: multer.memoryStorage(),
  limits: { files: MAX_PHOTOS, fileSize: MAX_PHOTO_BYTES, fields: 20, fieldSize: 10 * 1024 },
}).array('photos', MAX_PHOTOS);

const LIMIT_MESSAGES = {
  LIMIT_FILE_SIZE: 'Each photo must be 2 MB or smaller.',
  LIMIT_FILE_COUNT: `You can upload at most ${MAX_PHOTOS} photos per dish.`,
  LIMIT_UNEXPECTED_FILE: `You can upload at most ${MAX_PHOTOS} photos per dish.`,
};

function parseDishPhotos(req, res, next) {
  if (!res.locals.isAdmin || !req.is('multipart/form-data')) return next();
  return parser(req, res, (err) => {
    if (err) {
      // Show a friendly message from the route instead of a crash page.
      req.uploadError = LIMIT_MESSAGES[err.code] || 'The photos could not be uploaded. Please try again.';
      req.files = [];
    }
    next();
  });
}

// Identify the real image type from the file's first bytes (the browser-sent type can't be trusted).
function detectImageType(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.toString('ascii', 0, 4) === 'GIF8') return 'gif';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

module.exports = { parseDishPhotos, detectImageType, MAX_PHOTO_BYTES };
