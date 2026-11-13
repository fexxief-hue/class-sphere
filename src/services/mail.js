const nodemailer = require('nodemailer');

function isConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_FROM);
}

function createTransport() {
  if (!isConfigured()) {
    const error = new Error('Email delivery is not configured.');
    error.code = 'MAIL_NOT_CONFIGURED';
    throw error;
  }
  const options = {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
  };
  if (process.env.SMTP_USER) {
    options.auth = { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD || '' };
  }
  return nodemailer.createTransport(options);
}

async function sendVerificationEmail(to, token) {
  const baseUrl = process.env.APP_BASE_URL;
  if (!baseUrl) {
    const error = new Error('Application base URL is not configured.');
    error.code = 'MAIL_NOT_CONFIGURED';
    throw error;
  }
  const link = baseUrl.replace(/\/$/, '') + '/verify.html?token=' + encodeURIComponent(token);
  const transport = createTransport();
  return transport.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject: 'Verify your CLASS SPHERE email',
    text: 'Verify your email for CLASS SPHERE by opening this link: ' + link + '\nThis link expires in 30 minutes.',
    html: '<p>Verify your email for CLASS SPHERE.</p><p><a href="' + link + '">Verify email</a></p><p>This link expires in 30 minutes.</p>',
  });
}


async function sendPasswordResetEmail(to, token) {
  const baseUrl = process.env.APP_BASE_URL;
  if (!baseUrl) { const error = new Error('Application base URL is not configured.'); error.code = 'MAIL_NOT_CONFIGURED'; throw error; }
  const link = baseUrl.replace(/\/$/, '') + '/reset-password.html?token=' + encodeURIComponent(token);
  return createTransport().sendMail({ from: process.env.SMTP_FROM, to, subject: 'Reset your CLASS SPHERE password', text: 'Reset your password using this link: ' + link + '\nThis link expires in 30 minutes.', html: '<p>Reset your CLASS SPHERE password.</p><p><a href="' + link + '">Reset password</a></p><p>This link expires in 30 minutes.</p>' });
}

module.exports = { isConfigured, createTransport, sendVerificationEmail, sendPasswordResetEmail };
