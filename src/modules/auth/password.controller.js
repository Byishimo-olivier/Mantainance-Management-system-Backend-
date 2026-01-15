const User = require('../user/user.model.js');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

// In-memory store for reset tokens (replace with DB in production)
const resetTokens = {};

const forgotPassword = async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.status(404).json({ error: 'User not found' });
  const token = crypto.randomBytes(32).toString('hex');
  resetTokens[token] = { userId: user._id, expires: Date.now() + 3600000 };

  // Build reset link for frontend
  const resetUrl = `${process.env.RESET_PASSWORD_URL}/${token}`;

  // Configure nodemailer transporter
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const mailOptions = {
    from: `"MMS Support" <${process.env.EMAIL_USER}>`,
    to: user.email,
    subject: 'Password Reset Request',
    html: `<p>You requested a password reset.</p><p>Click <a href="${resetUrl}">here</a> to reset your password. This link will expire in 1 hour.</p>`
  };

  try {
    await transporter.sendMail(mailOptions);
    res.json({ message: 'Password reset link sent to your email.' });
  } catch (err) {
    console.error('Error sending email:', err);
    res.status(500).json({ error: 'Failed to send reset email.' });
  }
};

const resetPassword = async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;
  const data = resetTokens[token];
  if (!data || data.expires < Date.now()) return res.status(400).json({ error: 'Invalid or expired token' });
  const user = await User.findById(data.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  user.password = await bcrypt.hash(password, 10);
  await user.save();
  delete resetTokens[token];
  res.json({ message: 'Password reset successful' });
};

module.exports = {
  forgotPassword,
  resetPassword,
};
