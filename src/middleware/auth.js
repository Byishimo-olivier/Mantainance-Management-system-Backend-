const jwt = require('jsonwebtoken');
const User = require('../modules/user/user.model.js');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const hydrateAuthUser = async (decoded = {}) => {
  const authUser = {
    userId: decoded.userId,
    role: decoded.role,
    companyName: decoded.companyName || null,
    name: decoded.name || null,
    email: decoded.email || null,
  };

  if (!authUser.userId) return authUser;

  try {
    const mongoUser = await User.findById(authUser.userId).select('companyName name email');
    if (mongoUser) {
      authUser.companyName = authUser.companyName || mongoUser.companyName || null;
      authUser.name = authUser.name || mongoUser.name || null;
      authUser.email = authUser.email || mongoUser.email || null;
      return authUser;
    }
  } catch (err) {
    // ignore and try technician lookup
  }

  try {
    const technician = await prisma.technician.findUnique({
      where: { id: String(authUser.userId) },
      select: { companyName: true, name: true, email: true }
    });
    if (technician) {
      authUser.companyName = authUser.companyName || technician.companyName || null;
      authUser.name = authUser.name || technician.name || null;
      authUser.email = authUser.email || technician.email || null;
    }
  } catch (err) {
    // ignore
  }

  return authUser;
};

const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  (async () => {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await hydrateAuthUser(decoded);
      next();
    } catch (err) {
      res.status(401).json({ error: 'Invalid token' });
    }
  })();
};

// Optional authenticate: if Authorization header present, verify and set req.user;
// if absent, continue as anonymous (req.user remains undefined).
const optionalAuthenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.split(' ')[1];
  (async () => {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await hydrateAuthUser(decoded);
      next();
    } catch (err) {
      return res.status(401).json({ error: 'Invalid token' });
    }
  })();
};

const authorizeRoles = (...roles) => (req, res, next) => {
  if (req.user?.role === 'superadmin') {
    return next();
  }
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden: insufficient role' });
  }
  next();
};

module.exports = { authenticate, authorizeRoles, optionalAuthenticate };
