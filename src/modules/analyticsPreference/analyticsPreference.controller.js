const AnalyticsPreference = require('./analyticsPreference.model');

const DEFAULT_PINNED = ['team-performance', 'cost-of-maintenance', 'asset-downtime'];

const sanitizePinnedDashboardIds = (items = []) => {
  const unique = Array.from(new Set(
    (Array.isArray(items) ? items : [])
      .map((item) => String(item || '').trim())
      .filter(Boolean)
  ));
  return unique.slice(0, 3);
};

const sanitizeCustomDashboards = (items = []) => {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => ({
      id: String(item?.id || '').trim(),
      name: String(item?.name || '').trim(),
      basedOn: String(item?.basedOn || '').trim() || 'team-performance',
      widgets: Array.isArray(item?.widgets)
        ? item.widgets.map((widget) => String(widget || '').trim()).filter(Boolean).slice(0, 40)
        : [],
      settings: {
        timezoneMode: String(item?.settings?.timezoneMode || 'tile').trim() || 'tile',
        runOnLoad: item?.settings?.runOnLoad !== false,
        allowFullscreen: item?.settings?.allowFullscreen !== false,
        defaultFiltersView: String(item?.settings?.defaultFiltersView || 'expanded').trim() || 'expanded',
        filtersLocation: String(item?.settings?.filtersLocation || 'top').trim() || 'top',
      },
      createdAt: item?.createdAt ? new Date(item.createdAt) : new Date(),
    }))
    .filter((item) => item.id && item.name)
    .slice(0, 50);
};

exports.getPreferences = async (req, res) => {
  try {
    const userId = String(req.user?.userId || '').trim();
    if (!userId) {
      return res.status(400).json({ error: 'Missing authenticated user' });
    }

    const scope = String(req.query.scope || 'client-dashboard').trim() || 'client-dashboard';
    const preference = await AnalyticsPreference.findOne({ userId, scope }).lean();

    return res.json({
      scope,
      pinnedDashboardIds: preference?.pinnedDashboardIds?.length ? preference.pinnedDashboardIds : DEFAULT_PINNED,
      customDashboards: preference?.customDashboards || [],
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to load analytics preferences' });
  }
};

exports.updatePreferences = async (req, res) => {
  try {
    const userId = String(req.user?.userId || '').trim();
    if (!userId) {
      return res.status(400).json({ error: 'Missing authenticated user' });
    }

    const scope = String(req.body?.scope || req.query?.scope || 'client-dashboard').trim() || 'client-dashboard';
    const pinnedDashboardIds = sanitizePinnedDashboardIds(req.body?.pinnedDashboardIds);
    const customDashboards = sanitizeCustomDashboards(req.body?.customDashboards);

    const updated = await AnalyticsPreference.findOneAndUpdate(
      { userId, scope },
      {
        $set: {
          companyName: req.user?.companyName || '',
          pinnedDashboardIds: pinnedDashboardIds.length ? pinnedDashboardIds : DEFAULT_PINNED,
          customDashboards,
        },
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      }
    ).lean();

    return res.json({
      scope,
      pinnedDashboardIds: updated?.pinnedDashboardIds || DEFAULT_PINNED,
      customDashboards: updated?.customDashboards || [],
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to save analytics preferences' });
  }
};
