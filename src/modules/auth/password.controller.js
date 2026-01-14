import User from '../user/user.model.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import nodemailer from 'nodemailer';

// In-memory store for reset tokens (replace with DB in production)
const resetTokens = {};

export const forgotPassword = async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.status(404).json({ error: 'User not found' });
  const token = crypto.randomBytes(32).toString('hex');
  resetTokens[token] = { userId: user._id, expires: Date.now() + 3600000 };
  // Send email (console log for now)
  // TODO: Replace with real email sending
  console.log(`Reset link: http://localhost:5000/api/auth/reset-password/${token}`);
  res.json({ message: 'Password reset link sent to email (check console in dev)' });
};

export const resetPassword = async (req, res) => {
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
