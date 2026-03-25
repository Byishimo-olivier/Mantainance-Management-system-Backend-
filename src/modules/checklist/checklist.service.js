const mongoose = require('mongoose');

const collectionName = 'Checklist';
const { ObjectId } = require('mongodb');

const checklistTypeOptions = ['Status', 'Text', 'Number', 'Inspection', 'Multiple Choice', 'Meter', 'Signature', 'Checkbox', 'Warning', 'Multiselect'];

const parseCsvText = (text) => {
  if (!text) return [];
  const lines = String(text).replace(/\r/g, '').split('\n').filter((line) => line.trim().length > 0);
  if (!lines.length) return [];

  const parseLine = (line) => {
    const out = [];
    let cur = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        out.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }

    out.push(cur);
    return out.map((value) => value.trim());
  };

  const headers = parseLine(lines[0]).map((header) => String(header || '').toLowerCase());
  return lines.slice(1).map((line) => {
    const values = parseLine(line);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? '';
    });
    return row;
  }).filter((row) => Object.values(row).some((value) => String(value || '').trim().length > 0));
};

const normalizeChecklistType = (value) => {
  const raw = String(value || 'Status').trim().toLowerCase();
  return checklistTypeOptions.find((option) => option.toLowerCase() === raw) || 'Status';
};

const normalizeChecklistItem = (item, index = 0) => ({
  id: item?.id || `item-${Date.now()}-${index}`,
  text: String(item?.text || item?.label || item?.task || item?.name || item?.title || '').trim(),
  type: normalizeChecklistType(item?.type || item?.kind || item?.fieldType || item?.itemType),
  meter: String(item?.meter || item?.meterName || item?.reading || '').trim(),
  required: typeof item?.required === 'string'
    ? ['true', 'yes', '1', 'required'].includes(String(item.required).trim().toLowerCase())
    : !!item?.required,
});

const normalizeChecklistDoc = (doc = {}) => {
  const items = Array.isArray(doc.items)
    ? doc.items
    : (Array.isArray(doc.checklist) ? doc.checklist : []);

  return {
    name: String(doc.name || doc.title || 'Checklist').trim(),
    title: String(doc.title || doc.name || 'Checklist').trim(),
    description: String(doc.description || '').trim(),
    companyName: doc.companyName ? String(doc.companyName).trim() : '',
    tags: Array.isArray(doc.tags) ? doc.tags.map((tag) => String(tag || '').trim()).filter(Boolean) : [],
    items: items.map(normalizeChecklistItem).filter((item) => item.text),
  };
};

const withClientId = (doc) => ({
  ...doc,
  id: doc._id?.toString?.() || doc.id,
});

const buildChecklistItemsFromCsv = (csvText) => parseCsvText(csvText)
  .map((row, index) => normalizeChecklistItem({
    text: row.text || row.task || row.name || row.label || row.title,
    type: row.type || row.kind || row.fieldtype || row.itemtype,
    meter: row.meter || row.metername || row.reading,
    required: row.required || row.mandatory || row.isrequired,
  }, index))
  .filter((item) => item.text);

module.exports = {
  parseCsvText,
  buildChecklistItemsFromCsv,
  findAll: async (companyName = null, options = {}) => {
    const db = mongoose.connection.db;
    const filter = companyName
      ? { companyName: String(companyName).trim() }
      : {};
    const docs = await db.collection(collectionName).find(filter).sort({ updatedAt: -1, createdAt: -1 }).toArray();
    const search = String(options.search || '').trim().toLowerCase();
    const tag = String(options.tag || '').trim().toLowerCase();
    const filteredDocs = docs.filter((doc) => {
      const matchesSearch = !search || [
        doc?.name,
        doc?.title,
        doc?.description,
        Array.isArray(doc?.tags) ? doc.tags.join(' ') : '',
      ].join(' ').toLowerCase().includes(search);
      const matchesTag = !tag || (Array.isArray(doc?.tags) && doc.tags.some((entry) => String(entry || '').trim().toLowerCase() === tag));
      return matchesSearch && matchesTag;
    });
    return filteredDocs.map(withClientId);
  },
  findById: async (id, companyName = null) => {
    const db = mongoose.connection.db;
    const filter = { _id: new ObjectId(id) };
    if (companyName) filter.companyName = String(companyName).trim();
    const doc = await db.collection(collectionName).findOne(filter);
    return doc ? withClientId(doc) : null;
  },
  create: async (data) => {
    const db = mongoose.connection.db;
    const now = new Date();
    const normalized = normalizeChecklistDoc(data);
    const doc = { ...normalized, checklist: normalized.items, createdAt: now, updatedAt: now };
    const res = await db.collection(collectionName).insertOne(doc);
    return { ...doc, id: res.insertedId.toString() };
  },
  bulkCreate: async (items = [], companyName = '') => {
    const db = mongoose.connection.db;
    const now = new Date();
    const docs = items
      .map((item) => normalizeChecklistDoc({ ...item, companyName: item.companyName || companyName }))
      .filter((doc) => doc.name && doc.companyName && Array.isArray(doc.items) && doc.items.length > 0)
      .map((doc) => ({ ...doc, checklist: doc.items, createdAt: now, updatedAt: now }));

    if (!docs.length) return [];

    const res = await db.collection(collectionName).insertMany(docs);
    return docs.map((doc, index) => ({
      ...doc,
      id: res.insertedIds[index]?.toString?.() || doc.id,
    }));
  },
  importCsv: async ({ csvText, name, title, description, companyName, tags, saveToLibrary = true }) => {
    const items = buildChecklistItemsFromCsv(csvText);
    if (!items.length) {
      throw new Error('No valid checklist items found in the CSV');
    }

    const normalized = normalizeChecklistDoc({
      name: name || title || 'Imported Checklist',
      title: title || name || 'Imported Checklist',
      description,
      companyName,
      tags,
      items,
    });

    if (!saveToLibrary) {
      return {
        ...normalized,
        checklist: normalized.items,
        itemCount: normalized.items.length,
      };
    }

    return module.exports.create(normalized);
  },
  update: async (id, data, companyName = null) => {
    const db = mongoose.connection.db;
    const normalized = normalizeChecklistDoc(data);
    const payload = { ...normalized, checklist: normalized.items, updatedAt: new Date() };
    const filter = { _id: new ObjectId(id) };
    if (companyName) filter.companyName = String(companyName).trim();
    await db.collection(collectionName).updateOne(filter, { $set: payload });
    const doc = await db.collection(collectionName).findOne(filter);
    return doc ? withClientId(doc) : null;
  },
  delete: async (id, companyName = null) => {
    const db = mongoose.connection.db;
    const filter = { _id: new ObjectId(id) };
    if (companyName) filter.companyName = String(companyName).trim();
    await db.collection(collectionName).deleteOne(filter);
    return { success: true };
  }
};
