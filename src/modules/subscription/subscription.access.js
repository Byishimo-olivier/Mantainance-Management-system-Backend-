// Ownership checks for subscription routes: a subscription can only be read or
// changed by its own company (or the email it was created for). Superadmins can
// access every subscription.
const { PrismaClient } = require('@prisma/client');
const { isSuperAdmin } = require('../../utils/tenantScope');

const prisma = new PrismaClient();

const canAccessSubscription = async (user, subscription) => {
  if (!subscription) return false;
  if (isSuperAdmin(user)) return true;

  const email = String(user?.email || '').trim().toLowerCase();
  if (email && String(subscription.email || '').trim().toLowerCase() === email) return true;

  const companyName = String(user?.companyName || '').trim().toLowerCase();
  if (!companyName || !subscription.companyId) return false;
  const company = await prisma.company
    .findUnique({ where: { id: String(subscription.companyId) }, select: { name: true } })
    .catch(() => null);
  return Boolean(company) && String(company.name || '').trim().toLowerCase() === companyName;
};

// Route middleware for /:id routes. Unknown or foreign subscriptions both answer 404,
// so callers cannot probe which IDs exist.
const requireSubscriptionAccess = async (req, res, next) => {
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { id: String(req.params.id || '') },
      select: { id: true, email: true, companyId: true },
    });
    if (!(await canAccessSubscription(req.user, subscription))) {
      return res.status(404).json({ error: 'Subscription not found' });
    }
    return next();
  } catch (err) {
    return res.status(404).json({ error: 'Subscription not found' });
  }
};

module.exports = { canAccessSubscription, requireSubscriptionAccess };
