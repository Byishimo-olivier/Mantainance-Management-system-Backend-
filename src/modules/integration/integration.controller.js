const dynamics365 = require('./dynamics365.service');
const { normalizeExtendedJSON } = require('../../utils/normalize');

const getCompanyName = (req) => (
  req.user?.companyName ||
  req.body?.companyName ||
  req.user?.userId ||
  req.user?.email ||
  ''
);

exports.getDynamics365Config = async (req, res) => {
  try {
    const config = await dynamics365.getConfig(getCompanyName(req));
    res.json(normalizeExtendedJSON(config));
  } catch (err) {
    console.error('[integration.dynamics365.getConfig]', err);
    res.status(500).json({ error: err.message });
  }
};

exports.saveDynamics365Config = async (req, res) => {
  try {
    const config = await dynamics365.saveConfig(getCompanyName(req), req.body || {});
    res.json(normalizeExtendedJSON(config));
  } catch (err) {
    console.error('[integration.dynamics365.saveConfig]', err);
    res.status(500).json({ error: err.message });
  }
};

exports.testDynamics365Connection = async (req, res) => {
  try {
    const result = await dynamics365.testConnection(getCompanyName(req));
    res.json(normalizeExtendedJSON(result));
  } catch (err) {
    console.error('[integration.dynamics365.test]', err?.response?.data || err);
    res.status(500).json({ error: err?.response?.data?.error_description || err.message });
  }
};

exports.syncDynamics365Preview = async (req, res) => {
  try {
    const result = await dynamics365.syncPreview(getCompanyName(req));
    res.json(normalizeExtendedJSON(result));
  } catch (err) {
    console.error('[integration.dynamics365.syncPreview]', err?.response?.data || err);
    res.status(500).json({ error: err?.response?.data?.error?.message || err?.response?.data?.error_description || err.message });
  }
};
