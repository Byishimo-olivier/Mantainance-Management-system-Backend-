const { normalizeExtendedJSON } = require('../../utils/normalize');
const service = require('./auditLog.service');
const settingsService = require('../systemSettings/systemSettings.service');
const emailService = require('../emailService/email.service');
const User = require('../user/user.model');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

exports.getAuditLogs = async (req, res) => {
  try {
    const logs = await service.getLogs({
      limit: req.query?.limit,
      action: req.query?.action,
      actorRole: req.query?.actorRole,
      success: req.query?.success === undefined ? undefined : String(req.query.success).toLowerCase() === 'true',
      search: req.query?.search,
    });
    const summary = await service.getSummary();
    res.json({
      data: normalizeExtendedJSON(logs),
      summary,
      count: logs.length,
    });
  } catch (err) {
    console.error('[auditLog.getAuditLogs]', err);
    res.status(500).json({ error: err.message });
  }
};

exports.applySecurityAction = async (req, res) => {
  try {
    const actionType = String(req.body?.actionType || '').trim();
    const normalizedEmail = String(req.body?.email || '').trim().toLowerCase();
    const normalizedIp = String(req.body?.ipAddress || '').trim();
    const settings = await settingsService.getSettings();

    const nextBlockedIps = new Set((settings?.security?.blockedIpAddresses || []).map((entry) => String(entry).trim()).filter(Boolean));
    const nextBlockedAccounts = new Set((settings?.security?.blockedAccountEmails || []).map((entry) => String(entry).trim().toLowerCase()).filter(Boolean));

    if (actionType === 'block_ip') {
      if (!normalizedIp) return res.status(400).json({ error: 'ipAddress is required' });
      nextBlockedIps.add(normalizedIp);
    } else if (actionType === 'unblock_ip') {
      if (!normalizedIp) return res.status(400).json({ error: 'ipAddress is required' });
      nextBlockedIps.delete(normalizedIp);
    } else if (actionType === 'lock_account') {
      if (!normalizedEmail) return res.status(400).json({ error: 'email is required' });
      nextBlockedAccounts.add(normalizedEmail);
      await User.updateOne({ email: normalizedEmail }, { $set: { status: 'locked' } }).catch(() => null);
      await prisma.technician.updateMany({
        where: { email: normalizedEmail },
        data: { status: 'Locked' },
      }).catch(() => null);
      await emailService.sendAccountLockedNotice({
        email: normalizedEmail,
        appName: settings?.platform?.appName,
        supportEmail: settings?.platform?.supportEmail,
      });
    } else if (actionType === 'unlock_account') {
      if (!normalizedEmail) return res.status(400).json({ error: 'email is required' });
      nextBlockedAccounts.delete(normalizedEmail);
      await User.updateOne({ email: normalizedEmail }, { $set: { status: 'active' } }).catch(() => null);
      await prisma.technician.updateMany({
        where: { email: normalizedEmail },
        data: { status: 'Active' },
      }).catch(() => null);
    } else {
      return res.status(400).json({ error: 'Unsupported actionType' });
    }

    const updatedSettings = await settingsService.updateSettings({
      security: {
        blockedIpAddresses: Array.from(nextBlockedIps),
        blockedAccountEmails: Array.from(nextBlockedAccounts),
      },
    });

    await service.logEvent({
      actorId: req.user?.userId,
      actorRole: req.user?.role,
      companyName: req.user?.companyName,
      action: `security.${actionType}`,
      entityType: 'security_action',
      success: true,
      severity: 'critical',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: {
        email: normalizedEmail || null,
        ipAddress: normalizedIp || null,
      },
    });

    res.json({
      success: true,
      message: 'Security action applied successfully.',
      data: normalizeExtendedJSON(updatedSettings),
    });
  } catch (err) {
    console.error('[auditLog.applySecurityAction]', err);
    res.status(500).json({ error: err.message });
  }
};
