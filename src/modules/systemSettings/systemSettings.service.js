const SystemSettings = require('./systemSettings.model');

const DEFAULT_KEY = 'global';

exports.getSettings = async () => {
  let settings = await SystemSettings.findOne({ key: DEFAULT_KEY });
  if (!settings) {
    settings = await SystemSettings.create({ key: DEFAULT_KEY });
  }
  return settings;
};

exports.updateSettings = async (payload = {}) => {
  const current = await exports.getSettings();
  const next = {
    pricing: {
      ...current.pricing?.toObject?.(),
      ...(payload.pricing || {}),
    },
    security: {
      ...current.security?.toObject?.(),
      ...(payload.security || {}),
    },
    platform: {
      ...current.platform?.toObject?.(),
      ...(payload.platform || {}),
    },
  };

  Object.assign(current, next);
  await current.save();
  return current;
};
