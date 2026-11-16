// Per-record company ownership check for routes with an :id parameter.
//
// A signed-in user may only act on a record that belongs to their company:
//   - the record carries their companyName, or
//   - it was created by / assigned to them or a colleague, or
//   - it is attached to one of their company's locations (Property).
// Superadmins can act on every record. Records from other companies answer 404
// so their existence is not revealed.
const mongoose = require('mongoose');
const { ObjectId } = require('mongodb');
const { isSuperAdmin } = require('../utils/tenantScope');

const lc = (value) => String(value ?? '').trim().toLowerCase();
const str = (value) => (value === null || value === undefined ? '' : String(value));
const toObjectIds = (ids) => ids.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
const caseInsensitive = { locale: 'en', strength: 2 };

// Ids of the company's users and of the locations they (or this user) own.
const loadCompanyContext = async (user) => {
  const db = mongoose.connection.db;
  const companyName = String(user.companyName || '').trim();
  const userIds = new Set([str(user.userId)].filter(Boolean));

  if (companyName) {
    const users = await db.collection('users')
      .find({ companyName }, { projection: { _id: 1 }, collation: caseInsensitive })
      .toArray();
    users.forEach((u) => userIds.add(str(u._id)));
  }

  const ownerIds = toObjectIds([...userIds]);
  const properties = ownerIds.length
    ? await db.collection('Property')
      .find({ $or: [{ userId: { $in: ownerIds } }, { clientId: { $in: ownerIds } }] }, { projection: { _id: 1 } })
      .toArray()
    : [];

  return { userIds, propertyIds: new Set(properties.map((p) => str(p._id))) };
};

const belongsToUserCompany = (record, user, ctx) => {
  const uid = str(user.userId);
  const people = [record.userId, record.clientId, record.requestorId, record.assignedTo, record.technicianId, record.createdBy]
    .map(str)
    .filter(Boolean);

  // Directly theirs: created by, requested by or assigned to this user.
  if (uid && people.includes(uid)) return true;
  if (uid && Array.isArray(record.assignees)
    && record.assignees.some((a) => [a?.id, a?._id, a?.userId, a].map(str).includes(uid))) {
    return true;
  }

  const company = lc(user.companyName);
  if (company && [record.companyName, record.company, record.identifiers?.companyName].some((v) => lc(v) === company)) {
    return true;
  }
  if (people.some((id) => ctx.userIds.has(id))) return true;
  if (record.propertyId && ctx.propertyIds.has(str(record.propertyId))) return true;
  return false;
};

// collectionName: MongoDB collection holding the record.
// allowAnonymous: keep the route usable without signing in (public views).
const requireCompanyRecord = (collectionName, { allowAnonymous = false } = {}) => async (req, res, next) => {
  try {
    if (!req.user) {
      return allowAnonymous ? next() : res.status(401).json({ error: 'Unauthorized' });
    }
    if (isSuperAdmin(req.user)) return next();

    const id = String(req.params.id || '');
    if (!ObjectId.isValid(id)) return res.status(404).json({ error: 'Not found' });

    const record = await mongoose.connection.db.collection(collectionName).findOne({ _id: new ObjectId(id) });
    if (!record) return next(); // let the handler answer its usual "not found"

    const ctx = await loadCompanyContext(req.user);
    if (belongsToUserCompany(record, req.user, ctx)) return next();
    return res.status(404).json({ error: 'Not found' });
  } catch (err) {
    console.error('[companyOwnership]', collectionName, err.message);
    return res.status(500).json({ error: 'Failed to verify access' });
  }
};

module.exports = { requireCompanyRecord, belongsToUserCompany };
