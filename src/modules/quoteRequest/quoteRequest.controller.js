const QuoteRequest = require('./quoteRequest.model');
const User = require('../user/user.model');
const notificationService = require('../notification/notification.service');
const emailService = require('../emailService/email.service');

const canManageQuoteRequests = (user = {}) => {
  const role = String(user.role || '').toLowerCase();
  return ['superadmin', 'super-admin', 'admin', 'manager'].includes(role);
};

exports.create = async (req, res) => {
  try {
    const requesterName = String(req.body?.requesterName || req.user?.name || '').trim();
    const requesterEmail = String(req.body?.requesterEmail || req.user?.email || '').trim().toLowerCase();
    const companyName = String(req.body?.companyName || req.user?.companyName || '').trim();
    const plan = String(req.body?.plan || 'premium').trim().toLowerCase();
    const message = String(req.body?.message || '').trim();
    const userId = String(req.user?.userId || req.user?.id || '').trim();

    if (!requesterEmail) {
      return res.status(400).json({ error: 'Requester email is required' });
    }

    if (!companyName) {
      return res.status(400).json({ error: 'Company name is required' });
    }

    const quoteRequest = await QuoteRequest.create({
      requesterName,
      requesterEmail,
      companyName,
      plan,
      message,
      userId,
      status: 'pending',
    });

    const superadmins = await User.find({
      role: 'superadmin',
      status: 'active',
    }).select('_id email name').lean();

    await Promise.all(
      superadmins.map((recipient) => notificationService.createNotification({
        userId: String(recipient._id),
        title: 'New Quote Request',
        message: `${companyName} requested a ${plan} quotation${requesterName ? ` from ${requesterName}` : ''}.`,
        type: 'info',
        link: '/manager-dashboard?tab=sales-requests',
      }))
    );

    const dashboardUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/manager-dashboard?tab=sales-requests`;
    const recipientEmails = superadmins.map((recipient) => recipient.email).filter(Boolean);

    if (recipientEmails.length) {
      const subject = `New ${plan.charAt(0).toUpperCase() + plan.slice(1)} quotation request from ${companyName}`;
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 680px; margin: 0 auto; color: #111827;">
          <h2 style="color: #2563eb;">New Quote Request</h2>
          <div style="background: #f8fafc; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <p><strong>Company:</strong> ${companyName}</p>
            <p><strong>Requested Plan:</strong> ${plan}</p>
            <p><strong>Requester:</strong> ${requesterName || 'Unknown'}</p>
            <p><strong>Email:</strong> ${requesterEmail}</p>
            <p><strong>Message:</strong> ${message || 'No additional message provided.'}</p>
            <p><strong>Submitted On:</strong> ${new Date().toLocaleString()}</p>
          </div>
          <p>Please review this quote request from the superadmin dashboard.</p>
          <a href="${dashboardUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold;">
            Open Superadmin Dashboard
          </a>
        </div>
      `;

      try {
        await emailService.sendEmail({
          to: recipientEmails.join(','),
          subject,
          html,
          text: `New quote request from ${companyName}\nPlan: ${plan}\nRequester: ${requesterName || 'Unknown'}\nEmail: ${requesterEmail}\nMessage: ${message || 'No additional message provided.'}\nDashboard: ${dashboardUrl}`,
        });
      } catch (emailError) {
        console.error('Error sending quote request email:', emailError.message || emailError);
      }
    }

    res.status(201).json({
      message: 'Quote request submitted successfully',
      data: quoteRequest,
    });
  } catch (error) {
    console.error('Error creating quote request:', error);
    res.status(500).json({ error: error.message || 'Failed to create quote request' });
  }
};

exports.getAll = async (req, res) => {
  try {
    if (!canManageQuoteRequests(req.user)) {
      return res.status(403).json({ error: 'Forbidden: insufficient role' });
    }

    const { status, plan, search } = req.query;
    const query = {};
    if (status) query.status = String(status).trim();
    if (plan) query.plan = String(plan).trim().toLowerCase();
    if (search) {
      const pattern = new RegExp(String(search).trim(), 'i');
      query.$or = [
        { requesterName: pattern },
        { requesterEmail: pattern },
        { companyName: pattern },
        { plan: pattern },
      ];
    }

    const requests = await QuoteRequest.find(query).sort({ createdAt: -1 }).lean();
    res.json({
      success: true,
      count: requests.length,
      data: requests,
    });
  } catch (error) {
    console.error('Error fetching quote requests:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch quote requests' });
  }
};

exports.updateStatus = async (req, res) => {
  try {
    if (!canManageQuoteRequests(req.user)) {
      return res.status(403).json({ error: 'Forbidden: insufficient role' });
    }

    const { id } = req.params;
    const status = String(req.body?.status || '').trim().toLowerCase();
    const notes = String(req.body?.notes || '').trim();
    const validStatuses = ['pending', 'contacted', 'quoted', 'won', 'lost', 'cancelled'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    const request = await QuoteRequest.findByIdAndUpdate(
      id,
      {
        status,
        ...(notes ? { notes } : {}),
      },
      { new: true }
    ).lean();

    if (!request) {
      return res.status(404).json({ error: 'Quote request not found' });
    }

    res.json({
      success: true,
      message: 'Quote request status updated',
      data: request,
    });
  } catch (error) {
    console.error('Error updating quote request:', error);
    res.status(500).json({ error: error.message || 'Failed to update quote request' });
  }
};
