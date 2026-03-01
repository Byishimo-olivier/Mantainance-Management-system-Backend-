const service = require('./subscription.service');
const { normalizeExtendedJSON } = require('../../utils/normalize');

exports.createSubscription = async (req, res) => {
  try {
    const { userId, email, plan, billingCycle, clientId, secretId, paymentMethod, metadata } = req.body;

    // Validate required fields
    if (!userId || !email || !clientId || !secretId) {
      return res.status(400).json({
        error: 'Missing required fields: userId, email, clientId, secretId',
      });
    }

    const subscription = await service.createSubscription({
      userId,
      email,
      plan,
      billingCycle,
      clientId,
      secretId,
      paymentMethod,
      metadata,
    });

    res.status(201).json({
      message: 'Subscription created successfully',
      data: normalizeExtendedJSON(subscription),
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.getSubscriptionByClientId = async (req, res) => {
  try {
    const { clientId } = req.params;

    if (!clientId) {
      return res.status(400).json({ error: 'clientId is required' });
    }

    const subscription = await service.getSubscriptionByClientId(clientId);

    if (!subscription) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    res.json({
      message: 'Subscription retrieved successfully',
      data: normalizeExtendedJSON(subscription),
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.getSubscriptionById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'Subscription ID is required' });
    }

    const subscription = await service.getSubscriptionById(id);

    if (!subscription) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    res.json({
      message: 'Subscription retrieved successfully',
      data: normalizeExtendedJSON(subscription),
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.getAllSubscriptions = async (req, res) => {
  try {
    const { status, plan } = req.query;
    const subscriptions = await service.getAllSubscriptions({ status, plan });

    res.json({
      message: 'Subscriptions retrieved successfully',
      count: subscriptions.length,
      data: normalizeExtendedJSON(subscriptions),
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.updateSubscription = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'Subscription ID is required' });
    }

    // verify role: only client and admin can update subscriptions
    const requester = req.user || {};
    const allowedRoles = ['client', 'admin'];
    if (!allowedRoles.includes(requester.role)) {
      return res.status(403).json({ error: 'Forbidden: only client and admin can edit subscriptions' });
    }

    const isAdmin = requester.role === 'admin';

    // fetch existing subscription for ownership check
    const existing = await service.getSubscriptionById(id);
    if (!existing) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    // client users can only edit their own subscription
    if (!isAdmin) {
      const requesterId = requester.userId || requester.id || requester._id;
      if (!requesterId || requesterId !== existing.userId) {
        return res.status(403).json({ error: 'Forbidden: you can only edit your own subscription' });
      }
    }

    // build allowed update payload
    const payload = {};
    // always allow these basic fields
    if (req.body.plan) payload.plan = req.body.plan;
    if (req.body.billingCycle) payload.billingCycle = req.body.billingCycle;
    if (req.body.email) payload.email = req.body.email;
    if (req.body.paymentMethod) payload.paymentMethod = req.body.paymentMethod;
    if (req.body.phoneNumber) payload.phoneNumber = req.body.phoneNumber;
    // Note: propertyId updates temporarily disabled due to schema sync issue on Render

    // admin users may modify status or metadata
    if (isAdmin) {
      if (req.body.status) payload.status = req.body.status;
      if (req.body.metadata) payload.metadata = req.body.metadata;
    }

    const subscription = await service.updateSubscription(id, payload);

    res.json({
      message: 'Subscription updated successfully',
      data: normalizeExtendedJSON(subscription),
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.cancelSubscription = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'Subscription ID is required' });
    }

    const subscription = await service.cancelSubscription(id);

    res.json({
      message: 'Subscription cancelled successfully',
      data: normalizeExtendedJSON(subscription),
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.deleteSubscription = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'Subscription ID is required' });
    }

    await service.deleteSubscription(id);

    res.status(204).end();
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.getAnalytics = async (req, res) => {
  try {
    const analytics = await service.getSubscriptionAnalytics();

    res.json({
      message: 'Analytics retrieved successfully',
      data: normalizeExtendedJSON(analytics),
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.upgradeSubscription = async (req, res) => {
  try {
    const { id } = req.params;
    const { plan } = req.body;

    if (!id || !plan) {
      return res.status(400).json({ error: 'Subscription ID and plan are required' });
    }

    const subscription = await service.upgradeSubscription(id, plan);

    res.json({
      message: 'Subscription upgraded successfully',
      data: normalizeExtendedJSON(subscription),
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.verifyActive = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'Subscription ID is required' });
    }

    const isActive = await service.verifySubscriptionActive(id);

    res.json({
      message: 'Verification completed',
      isActive,
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.changeBillingCycle = async (req, res) => {
  try {
    const { id } = req.params;
    const { billingCycle } = req.body;

    if (!id || !billingCycle) {
      return res.status(400).json({
        error: 'Subscription ID and billingCycle are required',
      });
    }

    const subscription = await service.changeBillingCycle(id, billingCycle);

    res.json({
      message: 'Billing cycle changed successfully',
      data: normalizeExtendedJSON(subscription),
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.getPricing = async (req, res) => {
  try {
    const pricing = service.getPricing();

    res.json({
      message: 'Pricing retrieved successfully',
      data: pricing,
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};
exports.getAllSubscriptions = async (req, res) => {
  try {
    const { status, plan, billingCycle, paymentStatus } = req.query;

    const subscriptions = await service.getAllSubscriptions({
      status,
      plan,
      billingCycle,
      paymentStatus,
    });

    res.json({
      message: 'Subscriptions retrieved successfully',
      count: subscriptions.length,
      data: normalizeExtendedJSON(subscriptions),
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.getAnalytics = async (req, res) => {
  try {
    const analytics = await service.getAnalytics();

    res.json({
      message: 'Analytics retrieved successfully',
      data: normalizeExtendedJSON(analytics),
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.verifyActive = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'Subscription ID is required' });
    }

    const isActive = await service.verifySubscriptionActive(id);

    res.json({
      message: 'Subscription verification complete',
      data: { isActive },
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.changeBillingCycle = async (req, res) => {
  try {
    const { id } = req.params;
    const { billingCycle } = req.body;

    if (!id || !billingCycle) {
      return res.status(400).json({
        error: 'Missing required fields: id, billingCycle',
      });
    }

    const subscription = await service.changeBillingCycle(id, billingCycle);

    res.json({
      message: 'Billing cycle changed successfully',
      data: normalizeExtendedJSON(subscription),
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.updateSubscription = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'Subscription ID is required' });
    }

    const subscription = await service.updateSubscription(id, req.body);

    res.json({
      message: 'Subscription updated successfully',
      data: normalizeExtendedJSON(subscription),
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.upgradeSubscription = async (req, res) => {
  try {
    const { id } = req.params;
    const { plan } = req.body;

    if (!id || !plan) {
      return res.status(400).json({
        error: 'Missing required fields: id, plan',
      });
    }

    const subscription = await service.upgradeSubscription(id, plan);

    res.json({
      message: 'Subscription upgraded successfully',
      data: normalizeExtendedJSON(subscription),
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.cancelSubscription = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'Subscription ID is required' });
    }

    const subscription = await service.cancelSubscription(id);

    res.json({
      message: 'Subscription cancelled successfully',
      data: normalizeExtendedJSON(subscription),
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.deleteSubscription = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'Subscription ID is required' });
    }

    const result = await service.deleteSubscription(id);

    res.json({
      message: 'Subscription deleted successfully',
      data: result,
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.getSubscriptionProperty = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'Subscription ID is required' });
    }

    const property = await service.getSubscriptionProperty(id);

    if (!property) {
      return res.status(404).json({ error: 'No property associated with this subscription' });
    }

    res.json({
      message: 'Property retrieved successfully',
      data: normalizeExtendedJSON(property),
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};