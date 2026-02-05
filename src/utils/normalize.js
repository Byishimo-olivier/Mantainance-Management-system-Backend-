function normalizeExtendedJSON(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(normalizeExtendedJSON);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object') {
    if (value.$oid) return String(value.$oid);
    if (value.$date) {
      if (typeof value.$date === 'string') return value.$date;
      if (typeof value.$date === 'number') return new Date(value.$date).toISOString();
      if (value.$date.$numberLong) return new Date(Number(value.$date.$numberLong)).toISOString();
    }
    if (value._bsontype === 'ObjectID' && typeof value.toHexString === 'function') return value.toHexString();
    const out = {};
    for (const k of Object.keys(value)) out[k] = normalizeExtendedJSON(value[k]);
    return out;
  }
  return value;
}

module.exports = { normalizeExtendedJSON };
