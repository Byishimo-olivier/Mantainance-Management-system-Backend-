const demoRequestService = require('./demoRequest.service');

exports.createDemoRequest = async (req, res) => {
  try {
    const { firstName, lastName, email, companyName, phone, jobTitle, industry, companySize, maintenanceChallenge } = req.body;

    // Validate required fields
    if (!firstName || !lastName || !email || !companyName || !phone) {
      return res.status(400).json({
        error: 'Missing required fields: firstName, lastName, email, companyName, phone'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        error: 'Invalid email format'
      });
    }

    // Get client IP address
    const ipAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];

    // Create demo request
    const { demoRequest, emailDelivery } = await demoRequestService.createDemoRequest(
      {
        firstName,
        lastName,
        email,
        companyName,
        phone,
        jobTitle,
        industry,
        companySize,
        maintenanceChallenge
      },
      ipAddress,
      userAgent
    );

    res.status(201).json({
      success: true,
      message: 'Demo request submitted successfully',
      demoRequestId: demoRequest._id,
      email: demoRequest.email,
      emailDelivery
    });
  } catch (error) {
    console.error('Error creating demo request:', error);
    res.status(500).json({
      error: 'Failed to submit demo request',
      message: error.message
    });
  }
};

exports.getDemoRequests = async (req, res) => {
  try {
    const { status, email } = req.query;
    const filters = {};
    if (status) filters.status = status;
    if (email) filters.email = email;

    const requests = await demoRequestService.getDemoRequests(filters);

    res.status(200).json({
      success: true,
      count: requests.length,
      data: requests
    });
  } catch (error) {
    console.error('Error fetching demo requests:', error);
    res.status(500).json({
      error: 'Failed to fetch demo requests',
      message: error.message
    });
  }
};

exports.updateDemoRequestStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    if (!status) {
      return res.status(400).json({
        error: 'Status is required'
      });
    }

    const validStatuses = ['pending', 'scheduled', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    const demoRequest = await demoRequestService.updateDemoRequestStatus(id, status, notes);

    if (!demoRequest) {
      return res.status(404).json({
        error: 'Demo request not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Demo request updated successfully',
      data: demoRequest
    });
  } catch (error) {
    console.error('Error updating demo request:', error);
    res.status(500).json({
      error: 'Failed to update demo request',
      message: error.message
    });
  }
};
