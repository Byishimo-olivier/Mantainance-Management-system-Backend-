
const User = require('./user.model.js');
const bcrypt = require('bcryptjs');

const slugifyCompanyName = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

const createUser = async (userData, options = {}) => {
  if (!userData || !userData.password) throw new Error('Password is required');
  const allowExistingCompany = options.allowExistingCompany === true;
  const requirePaymentBeforeActivation = options.requirePaymentBeforeActivation === true;

  const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS, 10) || 10;
  const hashedPassword = await bcrypt.hash(userData.password, saltRounds);

  // Normalize and validate role, default to 'client'
  let role = 'client';
  let accessLevel = String(userData.accessLevel || '').toLowerCase() === 'limited' ? 'limited' : 'full';
  if (userData.role) {
    const roleMap = {
      ADMIN: 'admin',
      MANAGER: 'manager',
      TECH: 'technician',
      TECHNICIAN: 'technician',
      CLIENT: 'client',
      REQUESTOR: 'requestor',
      STAFF: 'staff',
      SUPERADMIN: 'superadmin',
      // Legacy role variants: map to base role + accessLevel
      'LIMITED MANAGER': 'manager',
      'LIMITED TECHNICIAN': 'technician'
    };
    const normalizedRoleKey = String(userData.role).toUpperCase();
    role = roleMap[normalizedRoleKey] || String(userData.role).toLowerCase() || 'client';
    if (normalizedRoleKey.startsWith('LIMITED ')) accessLevel = 'limited';
  }

  const normalizedEmail = userData.email ? String(userData.email).toLowerCase().trim() : undefined;
  const normalizedCompany = String(userData.companyName || (role === 'superadmin' ? 'SYSTEM' : '')).trim();
  if (!normalizedCompany) throw new Error('Company name is required');
  const companyType = String(userData.companyType || 'main').trim().toLowerCase() === 'branch' ? 'branch' : 'main';
  const branchName = String(userData.branchName || '').trim();
  const branchDetails = String(userData.branchDetails || '').trim();
  const branchLocation = String(userData.branchLocation || '').trim();
  const branchLatitude = userData.branchLatitude === '' || userData.branchLatitude === undefined || userData.branchLatitude === null
    ? undefined
    : Number(userData.branchLatitude);
  const branchLongitude = userData.branchLongitude === '' || userData.branchLongitude === undefined || userData.branchLongitude === null
    ? undefined
    : Number(userData.branchLongitude);
  const branchEvidenceOne = String(userData.branchEvidenceOne || '').trim();
  const branchEvidenceTwo = String(userData.branchEvidenceTwo || '').trim();
  const branchImages = Array.isArray(userData.branchImages)
    ? userData.branchImages.map((item) => String(item || '').trim()).filter(Boolean)
    : [];

  if (companyType === 'branch') {
    if (!branchName) throw new Error('Branch name is required');
    if (!branchDetails) throw new Error('Branch details are required');
    if (!branchEvidenceOne || !branchEvidenceTwo) {
      throw new Error('Two branch evidence fields are required');
    }
  }

  // Block duplicate company names (public registration). Invites can create multiple users per company.
  if (!allowExistingCompany) {
    const existingCompany = await User.findOne({ companyName: normalizedCompany });
    if (companyType === 'branch' && !existingCompany) {
      throw new Error('Main company not found. Create the main company first before adding a branch.');
    }
    if (companyType !== 'branch' && existingCompany) {
      throw new Error('Company name already exists. Please choose another.');
    }
  }

  // Generate activation token if payment is required
  let activationToken = null;
  let activationTokenExpires = null;
  if (requirePaymentBeforeActivation) {
    activationToken = require('crypto').randomBytes(32).toString('hex');
    activationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
  }

  const user = new User({
    ...userData,
    email: normalizedEmail,
    companyName: normalizedCompany,
    companyType,
    branchName: companyType === 'branch' ? branchName : '',
    branchDetails: companyType === 'branch' ? branchDetails : '',
    branchLocation: companyType === 'branch' ? branchLocation : '',
    branchLatitude: companyType === 'branch' && !Number.isNaN(branchLatitude) ? branchLatitude : undefined,
    branchLongitude: companyType === 'branch' && !Number.isNaN(branchLongitude) ? branchLongitude : undefined,
    branchEvidenceOne: companyType === 'branch' ? branchEvidenceOne : '',
    branchEvidenceTwo: companyType === 'branch' ? branchEvidenceTwo : '',
    branchImages: companyType === 'branch' ? branchImages : [],
    password: hashedPassword,
    role,
    accessLevel,
    isActive: !requirePaymentBeforeActivation, // Set to false if payment required
    activationToken: activationToken,
    activationTokenExpires: activationTokenExpires,
    paymentPendingActivation: requirePaymentBeforeActivation
  });

  const saved = await user.save();
  const userObj = saved.toObject ? saved.toObject() : saved;
  if (userObj && userObj.password) delete userObj.password;
  if (userObj && userObj.activationToken) delete userObj.activationToken; // Don't return token in response
  return {
    ...userObj,
    _activationToken: activationToken // Return only for email sending
  };
};

const findUserByEmail = async (email) => {
  if (!email) return null;
  return await User.findOne({ email: String(email).toLowerCase().trim() });
};

const findUserById = async (id) => {
  return await User.findById(id);
};

const getAllUsers = async (filter = {}) => {
  return await User.find(filter).select('-password');
};

const getUsersByRoles = async (roles = [], filter = {}) => {
  if (!Array.isArray(roles) || roles.length === 0) {
    return [];
  }
  return await User.find({ role: { $in: roles }, ...filter }).select('-password');
};

const findCompanyBySlug = async (companySlug) => {
  const normalizedSlug = slugifyCompanyName(companySlug);
  if (!normalizedSlug) return null;

  const users = await User.find({ companyName: { $exists: true, $ne: null } }).select('-password');
  const matchingUser = users.find((user) => slugifyCompanyName(user.companyName) === normalizedSlug);

  if (!matchingUser) return null;

  const companyName = String(matchingUser.companyName || '').trim();
  const companyUsers = users.filter((user) => String(user.companyName || '').trim() === companyName);

  return {
    companyName,
    companySlug: normalizedSlug,
    users: companyUsers,
  };
};

module.exports = {
  createUser,
  findUserByEmail,
  findUserById,
  getAllUsers,
  getUsersByRoles,
  slugifyCompanyName,
  findCompanyBySlug,
};
