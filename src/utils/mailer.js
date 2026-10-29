// Sends password-reset emails.
// - If SMTP settings are present in .env, a real email is sent (e.g. via Gmail).
// - Otherwise (development), the reset link is printed in the terminal instead.
const nodemailer = require('nodemailer');

const outbox = []; // used by automated tests to read the reset link

function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

async function sendPasswordResetEmail(to, name, link) {
  if (process.env.NODE_ENV === 'test') {
    outbox.push({ to, link });
    return;
  }

  if (!smtpConfigured()) {
    console.log('\n================ PASSWORD RESET (dev mode) ================');
    console.log(`To: ${to}`);
    console.log(`Open this link to reset the password (valid 30 minutes):\n${link}`);
    console.log('Set SMTP_* values in .env to send real emails instead.');
    console.log('===========================================================\n');
    return;
  }

  const port = Number(process.env.SMTP_PORT || 587);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  await transporter.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to,
    subject: 'Reset your Happy Yummy password',
    text:
      `Hi ${name},\n\nWe received a request to reset your password.\n` +
      `Open this link to choose a new one (valid for 30 minutes):\n${link}\n\n` +
      `If you didn't ask for this, you can ignore this email.`,
    html:
      `<p>Hi ${name},</p><p>We received a request to reset your password.</p>` +
      `<p><a href="${link}">Reset my password</a> (valid for 30 minutes)</p>` +
      `<p>If you didn't ask for this, you can ignore this email.</p>`,
  });
}

module.exports = { sendPasswordResetEmail, outbox };
