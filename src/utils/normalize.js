function normalizeExtendedJSON(value) {
  if (value === null || value === undefined) return value;

  // If it's a Mongoose document, convert to a plain object first
  if (value.toObject && typeof value.toObject === 'function') {
    value = value.toObject();
  } else if (value.toJSON && typeof value.toJSON === 'function') {
    value = value.toJSON();
  }

  if (Array.isArray(value)) return value.map(normalizeExtendedJSON);

  if (value instanceof Date) return value.toISOString();

  if (value && typeof value === 'object') {
    // 1. Handle standard MongoDB Extended JSON formats
    if (value.$oid) return String(value.$oid);
    if (value.$date) {
      if (typeof value.$date === 'string') return value.$date;
      if (typeof value.$date === 'number') return new Date(value.$date).toISOString();
      if (value.$date.$numberLong) return new Date(Number(value.$date.$numberLong)).toISOString();
    }

    // 2. Handle common BSON/Driver specific formats
    if (value._bsontype === 'ObjectID' && typeof value.toHexString === 'function') {
      return value.toHexString();
    }

    // 3. Recurse into plain objects
    const out = {};
    for (const k of Object.keys(value)) {
      out[k] = normalizeExtendedJSON(value[k]);
    }
    return out;
  }

  return value;
}

module.exports = { normalizeExtendedJSON };
