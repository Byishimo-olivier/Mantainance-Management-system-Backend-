const User = require('../user/user.model.js');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const isDev = process.env.NODE_ENV !== 'production';
const prisma = new PrismaClient();

// Mirror the same transporter config that email.service.js uses successfully
const createTransporter = () => {
  const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 465;
  const secure = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465;

  console.log(`[PASSWORD RESET] SMTP config: host=${process.env.SMTP_HOST}, port=${port}, secure=${secure}, user=${process.env.EMAIL_USER}`);

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port,
    secure,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    tls: {
      rejectUnauthorized: false,
      minVersion: 'TLSv1.2',
    },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 15000,
  });
};

const forgotPassword = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required.' });
  }

  // ── Step 1: Find user from Mongoose or Prisma ────────────────────────────────
  let user;
  let isFromPrisma = false;
  let userSource = null;
  
  try {
    console.log('[PASSWORD RESET] Looking up user:', email);
    
    // Check Mongoose first
    user = await User.findOne({ email: email.toLowerCase().trim() });
    if (user) {
      userSource = 'mongoose';
      console.log('[PASSWORD RESET] User found in Mongoose');
    } else {
      // Check Prisma if not in Mongoose
      user = await prisma.user.findFirst({ 
        where: { email: email.toLowerCase().trim() } 
      });
      if (user) {
        isFromPrisma = true;
        userSource = 'prisma';
        console.log('[PASSWORD RESET] User found in Prisma');
      }
    }
    console.log('[PASSWORD RESET] User found:', !!user);
  } catch (dbErr) {
    console.error('[PASSWORD RESET] DB lookup failed:', dbErr.message);
    return res.status(500).json({
      error: 'Database error. Please try again.',
      ...(isDev && { detail: dbErr.message }),
    });
  }

  // Return generic success even if user not found (prevents email enumeration)
  if (!user) {
    return res.json({ message: 'If that email exists, a reset link has been sent.' });
  }

  // ── Step 2: Generate and save token ─────────────────────────────────────────
  const rawToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiryTime = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  try {
    console.log('[PASSWORD RESET] Saving token to DB for user:', user.id || user._id);
    
    if (isFromPrisma) {
      // Save to Prisma
      await prisma.user.update({
        where: { id: user.id },
        data: {
          resetPasswordToken: hashedToken,
          resetPasswordExpires: expiryTime
        }
      });
    } else {
      // Save to Mongoose
      user.resetPasswordToken = hashedToken;
      user.resetPasswordExpires = expiryTime;
      await user.save();
    }
    
    console.log('[PASSWORD RESET] Token saved successfully.');
  } catch (saveErr) {
    console.error('[PASSWORD RESET] DB save failed:', saveErr.message);
    return res.status(500).json({
      error: 'Could not save reset token. Please try again.',
      ...(isDev && { detail: saveErr.message }),
    });
  }

  // ── Step 3: Send email ───────────────────────────────────────────────────────
  const baseUrl = (process.env.RESET_PASSWORD_URL || 'http://localhost:5173/reset-password').replace(/\/$/, '');
  const resetUrl = `${baseUrl}/${rawToken}`;

  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #f8f9fb; border-radius: 12px; overflow: hidden;">
      <div style="background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%); padding: 36px 40px; text-align: center;">
        <h1 style="color: #fff; margin: 0; font-size: 24px; font-weight: 700;">Fixnest</h1>
        <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px;">Maintenance Management System</p>
      </div>
      <div style="padding: 40px; background: #fff;">
        <h2 style="margin: 0 0 16px; color: #111827; font-size: 20px;">Reset your password</h2>
        <p style="color: #4b5563; line-height: 1.6; margin: 0 0 8px;">Hi <strong>${user.name}</strong>,</p>
        <p style="color: #4b5563; line-height: 1.6; margin: 0 0 28px;">
          We received a request to reset your Fixnest password. Click the button below — the link expires in <strong>1 hour</strong>.
        </p>
        <div style="text-align: center; margin-bottom: 28px;">
          <a href="${resetUrl}" style="display: inline-block; background: linear-gradient(135deg, #2563eb, #1e40af); color: #fff; text-decoration: none; font-weight: 600; font-size: 15px; padding: 14px 36px; border-radius: 8px;">
            Reset Password
          </a>
        </div>
        <p style="color: #6b7280; font-size: 13px; margin: 0 0 8px;">Or copy this link into your browser:</p>
        <p style="word-break: break-all; color: #2563eb; font-size: 12px; margin: 0 0 24px;">${resetUrl}</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="color: #9ca3af; font-size: 12px; margin: 0;">If you didn't request this, you can safely ignore this email.</p>
      </div>
      <div style="background: #f3f4f6; padding: 20px 40px; text-align: center;">
        <p style="color: #9ca3af; font-size: 12px; margin: 0;">© ${new Date().getFullYear()} Fixnest</p>
      </div>
    </div>
  `;

  try {
    console.log('[PASSWORD RESET] Sending email to:', user.email);
    await createTransporter().sendMail({
      from: `"Fixnest Support" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: 'Reset your Fixnest password',
      html,
    });
    console.log('[PASSWORD RESET] Email sent successfully.');
  } catch (mailErr) {
    console.error('[PASSWORD RESET] Email send failed:', mailErr.message);
    return res.status(500).json({
      error: 'Reset token saved, but failed to send email. Check SMTP credentials.',
      ...(isDev && { detail: mailErr.message, smtpCode: mailErr.code }),
    });
  }

  return res.json({ message: 'If that email exists, a reset link has been sent.' });
};

const resetPassword = async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  if (!token || !password) {
    return res.status(400).json({ error: 'Token and new password are required.' });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  try {
    // Hash the incoming raw token to compare with the stored hash
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // Check Mongoose first
    let user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: new Date() },
    });

    if (!user) {
      // Check Prisma if not in Mongoose
      user = await prisma.user.findFirst({
        where: {
          resetPasswordToken: hashedToken,
          resetPasswordExpires: { gt: new Date() }
        }
      });

      if (!user) {
        return res.status(400).json({ error: 'This reset link is invalid or has expired. Please request a new one.' });
      }

      // Update password in Prisma
      const hashedPassword = await bcrypt.hash(password, 10);
      await prisma.user.update({
        where: { id: user.id },
        data: {
          password: hashedPassword,
          resetPasswordToken: null,
          resetPasswordExpires: null
        }
      });

      console.log('[PASSWORD RESET] Password reset successful for:', user.email);
      return res.json({ message: 'Password reset successful. You can now log in with your new password.' });
    }

    // Update password in Mongoose
    user.password = await bcrypt.hash(password, 10);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    console.log('[PASSWORD RESET] Password reset successful for:', user.email);
    return res.json({ message: 'Password reset successful. You can now log in with your new password.' });
  } catch (err) {
    console.error('[PASSWORD RESET] resetPassword error:', err.message);
    return res.status(500).json({
      error: 'Failed to reset password. Please try again.',
      ...(isDev && { detail: err.message }),
    });
  }
};

module.exports = { forgotPassword, resetPassword };
