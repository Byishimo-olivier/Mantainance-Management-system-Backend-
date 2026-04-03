const aiService = require("./ai.service");
const { PrismaClient } = require("@prisma/client");
const assetModel = require("../asset/asset.model");
const issueService = require("../issue/issue.service");
const internalTechnicianModel = require("../internalTechnician/internalTechnician.model");
const maintenanceScheduleModel = require("../maintenanceSchedule/maintenanceSchedule.model");
const meterService = require("../meter/meter.service");
const deviceService = require("../device/device.service");
const propertyModel = require("../property/property.model");
const prisma = new PrismaClient();
const GLOBAL_SUPERADMIN_SCOPE = "__all__";

const normalizeText = (value) => String(value || '').trim().toLowerCase();

const TABLE_ENTITY_CONFIG = [
    {
        key: 'assignedRequests',
        aliases: ['issues assigned', 'assigned issues', 'assigned requests', 'issues assigned requests', 'issues assigned (requests)', 'requests assigned'],
        title: 'Assigned Requests',
    },
    {
        key: 'requests',
        aliases: ['issues requests', 'issue requests', 'issues (requests)', 'requests', 'issues'],
        title: 'Requests',
    },
    {
        key: 'technicians',
        aliases: ['technicians', 'technician', 'techs', 'tech'],
        title: 'Technicians',
    },
    {
        key: 'workorders',
        aliases: ['workorder', 'work order', 'workorders', 'work orders'],
        title: 'Work Orders',
    },
    {
        key: 'assets',
        aliases: ['assets', 'asset'],
        title: 'Assets',
    },
    {
        key: 'locations',
        aliases: ['locations', 'location', 'properties', 'property', 'sites', 'site'],
        title: 'Locations',
    },
    {
        key: 'preventive',
        aliases: ['preventive', 'preventive maintenance', 'pm'],
        title: 'Preventive',
    },
    {
        key: 'schedules',
        aliases: ['schedules', 'schedule', 'maintenance schedules', 'maintenance schedule'],
        title: 'Schedules',
    },
    {
        key: 'meters',
        aliases: ['meters', 'meter'],
        title: 'Meters',
    },
    {
        key: 'edge',
        aliases: ['edge', 'edge devices', 'edge device', 'devices', 'device'],
        title: 'Edge Devices',
    }
];

const getValue = (record, selectors = []) => {
    for (const selector of selectors) {
        if (typeof selector === 'function') {
            const value = selector(record);
            if (value !== undefined && value !== null && String(value).trim() !== '') return value;
            continue;
        }
        const path = String(selector || '').split('.');
        let current = record;
        for (const segment of path) {
            if (current === null || current === undefined) {
                current = undefined;
                break;
            }
            current = current[segment];
        }
        if (current !== undefined && current !== null && String(current).trim() !== '') return current;
    }
    return '';
};

const toDisplayValue = (value) => {
    if (value === null || value === undefined || value === '') return '-';
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (Array.isArray(value)) return value.length ? value.map(toDisplayValue).join(', ') : '-';
    if (typeof value === 'object') {
        if (value.name) return String(value.name);
        if (value.title) return String(value.title);
        if (value.id || value._id) return String(value.id || value._id);
        return JSON.stringify(value);
    }
    const text = String(value).replace(/\r?\n/g, ' ').trim();
    return text.length > 48 ? `${text.slice(0, 45)}...` : text;
};

const makeMarkdownTable = (title, rows = [], columns = []) => {
    if (!Array.isArray(rows) || rows.length === 0) {
        return `No ${title.toLowerCase()} found for your company.`;
    }

    const header = `Here is the ${title.toLowerCase()} table list (${rows.length} record${rows.length === 1 ? '' : 's'}):`;
    const tableHeader = `| ${columns.map((column) => column.label).join(' | ')} |`;
    const divider = `| ${columns.map(() => '---').join(' | ')} |`;
    const body = rows.map((row) => (
        `| ${columns.map((column) => toDisplayValue(getValue(row, column.selectors))).join(' | ')} |`
    ));

    return [header, '', tableHeader, divider, ...body].join('\n');
};

const matchesAlias = (text, alias) => {
    const normalizedAlias = normalizeText(alias);
    return text === normalizedAlias || text.includes(normalizedAlias);
};

const looksLikeListRequest = (text) => {
    if (!text) return false;
    return (
        /\b(list|show|table|display|view|give me|provide|open)\b/.test(text) ||
        text.split(/\s+/).filter(Boolean).length <= 4
    );
};

const detectTableEntity = (message = '') => {
    const text = normalizeText(message);
    if (!text) return null;

    for (const entity of TABLE_ENTITY_CONFIG) {
        if (entity.aliases.some((alias) => matchesAlias(text, alias))) {
            if (looksLikeListRequest(text) || text === normalizeText(entity.aliases[0]) || text === normalizeText(entity.title)) {
                return entity.key;
            }
        }
    }

    return null;
};

const hasAssignee = (issue) => Boolean(
    getIssueAssigneeId(issue) ||
    (typeof issue?.assignedTo === 'string' && issue.assignedTo.trim()) ||
    (Array.isArray(issue?.internalTechnicians) && issue.internalTechnicians.length)
);

const isPreventiveRecord = (record) => {
    const tokens = [
        record?.category,
        record?.issueType,
        record?.type,
        record?.name,
        record?.title,
        ...(Array.isArray(record?.tags) ? record.tags : []),
    ].map(normalizeText);

    return tokens.some((token) => token.includes('preventive') || token === 'pm');
};

const extractRecordPropertyId = (record) => String(
    record?.propertyId ||
    record?.property?.id ||
    record?.property?._id ||
    record?.locationId ||
    record?.location?.id ||
    record?.location?._id ||
    record?.assetsRows?.[0]?.propertyId ||
    record?.assetsRows?.[0]?.locationId ||
    ''
).trim();

const extractRecordUserId = (record) => String(
    record?.userId ||
    record?.clientId ||
    record?.requestorId ||
    record?.createdBy ||
    record?.ownerId ||
    ''
).trim();

const extractRecordCompanyName = (record) => normalizeText(
    record?.companyName ||
    record?.company ||
    record?.clientCompanyName ||
    ''
);

const scopeRecordsToCompany = (records = [], companyName, userIds = [], propertyIds = []) => {
    const normalizedCompany = normalizeText(companyName);
    const userSet = new Set((userIds || []).map(String));
    const propertySet = new Set((propertyIds || []).map(String));

    return (Array.isArray(records) ? records : []).filter((record) => {
        const recordCompany = extractRecordCompanyName(record);
        const recordUserId = extractRecordUserId(record);
        const recordPropertyId = extractRecordPropertyId(record);

        if (normalizedCompany && recordCompany && recordCompany === normalizedCompany) return true;
        if (recordUserId && userSet.has(recordUserId)) return true;
        if (recordPropertyId && propertySet.has(recordPropertyId)) return true;
        return false;
    });
};

const scopeOrFallbackAll = (records = [], companyName, userIds = [], propertyIds = []) => {
    const allRecords = Array.isArray(records) ? records : [];
    const scoped = scopeRecordsToCompany(allRecords, companyName, userIds, propertyIds);
    return scoped.length > 0 ? scoped : allRecords;
};

const buildTableResponse = async (entityKey, context) => {
    const {
        issues = [],
        properties = [],
        assets = [],
        technicians = [],
        companyName,
        userIds = [],
        propertyIds = [],
    } = context || {};

    if (entityKey === 'requests') {
        const rows = issues.slice(0, 12);
        return makeMarkdownTable('Requests', rows, [
            { label: 'Title', selectors: ['title'] },
            { label: 'Status', selectors: ['status'] },
            { label: 'Priority', selectors: ['priority'] },
            { label: 'Location', selectors: [(row) => getIssuePropertyLabel(row)] },
            { label: 'Created', selectors: ['createdAt', 'date'] },
        ]);
    }

    if (entityKey === 'assignedRequests') {
        const rows = issues.filter(hasAssignee).slice(0, 12);
        return makeMarkdownTable('Assigned Requests', rows, [
            { label: 'Title', selectors: ['title'] },
            { label: 'Assignee', selectors: [(row) => getIssueAssigneeName(row)] },
            { label: 'Status', selectors: ['status'] },
            { label: 'Priority', selectors: ['priority'] },
            { label: 'Location', selectors: [(row) => getIssuePropertyLabel(row)] },
        ]);
    }

    if (entityKey === 'technicians') {
        const rows = technicians.slice(0, 12);
        return makeMarkdownTable('Technicians', rows, [
            { label: 'Name', selectors: ['name'] },
            { label: 'Email', selectors: ['email'] },
            { label: 'Phone', selectors: ['phone'] },
            { label: 'Status', selectors: ['status'] },
            { label: 'Location', selectors: ['property.name', 'propertyName', 'location'] },
        ]);
    }

    if (entityKey === 'workorders') {
        const rows = issues.slice(0, 12);
        return makeMarkdownTable('Work Orders', rows, [
            { label: 'Title', selectors: ['title'] },
            { label: 'Status', selectors: ['status'] },
            { label: 'Priority', selectors: ['priority'] },
            { label: 'Assignee', selectors: [(row) => getIssueAssigneeName(row)] },
            { label: 'Deadline', selectors: ['fixDeadline', 'dueDate'] },
        ]);
    }

    if (entityKey === 'assets') {
        const rows = assets.slice(0, 12);
        return makeMarkdownTable('Assets', rows, [
            { label: 'Name', selectors: ['name', 'title', 'assetName'] },
            { label: 'Type', selectors: ['type', 'category'] },
            { label: 'Status', selectors: ['status'] },
            { label: 'Location', selectors: ['property.name', 'location', 'propertyName'] },
            { label: 'Model', selectors: ['model'] },
        ]);
    }

    if (entityKey === 'locations') {
        const rows = properties.slice(0, 12);
        return makeMarkdownTable('Locations', rows, [
            { label: 'Name', selectors: ['name', 'title'] },
            { label: 'Type', selectors: ['type', 'category'] },
            { label: 'Address', selectors: ['address', 'location'] },
            { label: 'City', selectors: ['city'] },
            { label: 'Status', selectors: ['status'] },
        ]);
    }

    if (entityKey === 'preventive') {
        const scheduleRows = (await maintenanceScheduleModel.findAll()).filter((row) => isPreventiveRecord(row));
        const scopedScheduleRows = scopeRecordsToCompany(scheduleRows, companyName, userIds, propertyIds);
        const issueRows = issues.filter((row) => isPreventiveRecord(row));
        const rows = [...scopedScheduleRows, ...issueRows].slice(0, 12);
        return makeMarkdownTable('Preventive', rows, [
            { label: 'Name', selectors: ['name', 'title'] },
            { label: 'Status', selectors: ['status'] },
            { label: 'Frequency', selectors: ['frequency', 'routineType'] },
            { label: 'Next Date', selectors: ['nextDate', 'date'] },
            { label: 'Location', selectors: ['location', 'property.name', 'propertyName'] },
        ]);
    }

    if (entityKey === 'schedules') {
        const allSchedules = await maintenanceScheduleModel.findAll();
        const rows = scopeRecordsToCompany(allSchedules, companyName, userIds, propertyIds).slice(0, 12);
        return makeMarkdownTable('Schedules', rows, [
            { label: 'Name', selectors: ['name', 'workOrderTitle', 'title'] },
            { label: 'Status', selectors: ['status'] },
            { label: 'Frequency', selectors: ['frequency'] },
            { label: 'Next Date', selectors: ['nextDate', 'date'] },
            { label: 'Location', selectors: ['location', 'block'] },
        ]);
    }

    if (entityKey === 'meters') {
        const allMeters = await meterService.findAll();
        const rows = scopeOrFallbackAll(allMeters, companyName, userIds, propertyIds).slice(0, 12);
        return makeMarkdownTable('Meters', rows, [
            { label: 'Name', selectors: ['name'] },
            { label: 'Type', selectors: ['type'] },
            { label: 'Reading', selectors: ['reading'] },
            { label: 'Unit', selectors: ['unit'] },
            { label: 'Status', selectors: ['status'] },
        ]);
    }

    if (entityKey === 'edge') {
        const allDevices = await deviceService.findAll();
        const rows = scopeOrFallbackAll(allDevices, companyName, userIds, propertyIds).slice(0, 12);
        return makeMarkdownTable('Edge Devices', rows, [
            { label: 'Name', selectors: ['name'] },
            { label: 'Status', selectors: ['status'] },
            { label: 'Firmware', selectors: ['firmware'] },
            { label: 'Location', selectors: ['location', 'property.name', 'propertyName'] },
            { label: 'Last Action', selectors: ['lastActionAt', 'updatedAt'] },
        ]);
    }

    return null;
};

const resolveCompanyName = async (req) => {
    if (String(req.user?.role || "").trim().toLowerCase() === "superadmin") {
        return GLOBAL_SUPERADMIN_SCOPE;
    }

    const direct = req.user?.companyName || req.body?.companyName || null;
    if (direct) return String(direct).trim();

    const userId = req.user?.userId;
    if (!userId) return null;

    try {
        const userService = require("../user/user.service");
        const user = await userService.findUserById(userId);
        if (user?.companyName) return String(user.companyName).trim();
    } catch (err) {
        // ignore and return null
    }

    return null;
};

const getCompanyPropertyIds = async (companyName) => {
    if (!companyName) return [];
    if (companyName === GLOBAL_SUPERADMIN_SCOPE) {
        try {
            const properties = await propertyModel.findAll();
            return properties.map((property) => String(property.id || property._id || "")).filter(Boolean);
        } catch (err) {
            console.error("AI Controller Error (Global Properties):", err);
            return [];
        }
    }

    try {
        const userService = require("../user/user.service");
        const users = await userService.getAllUsers({ companyName });
        const companyUserIds = users.map((user) => String(user.id || user._id || user.userId || '')).filter(Boolean);
        if (!companyUserIds.length) return [];

        const properties = await propertyModel.findAll({
            OR: [
                { userId: { in: companyUserIds } },
                { clientId: { in: companyUserIds } },
                { requestorId: { in: companyUserIds } }
            ]
        });

        return properties.map((property) => String(property.id || property._id || '')).filter(Boolean);
    } catch (err) {
        console.error("AI Controller Error (Company Properties):", err);
        return [];
    }
};

const getCompanyUserIds = async (companyName) => {
    if (!companyName) return [];
    if (companyName === GLOBAL_SUPERADMIN_SCOPE) {
        try {
            const userService = require("../user/user.service");
            const users = await userService.getAllUsers({});
            return users.map((user) => String(user.id || user._id || user.userId || "")).filter(Boolean);
        } catch (err) {
            console.error("AI Controller Error (Global Users):", err);
            return [];
        }
    }

    try {
        const userService = require("../user/user.service");
        const users = await userService.getAllUsers({ companyName });
        return users.map((user) => String(user.id || user._id || user.userId || '')).filter(Boolean);
    } catch (err) {
        console.error("AI Controller Error (Company Users):", err);
        return [];
    }
};

const getCompanyScopedData = async (companyName) => {
    if (!companyName) {
        return {
            companyName: null,
            userIds: [],
            propertyIds: [],
            issues: [],
            properties: [],
            assets: [],
            technicians: [],
            companyUsers: [],
        };
    }

    if (companyName === GLOBAL_SUPERADMIN_SCOPE) {
        const userService = require("../user/user.service");
        const [issues, properties, assets, technicians, companyUsers] = await Promise.all([
            getSafeIssues(null),
            propertyModel.findAll(),
            assetModel.findAll(),
            internalTechnicianModel.findAll({ status: "Active" }),
            userService.getAllUsers({}),
        ]);

        return {
            companyName: "All Companies",
            userIds: (Array.isArray(companyUsers) ? companyUsers : []).map((user) => String(user.id || user._id || user.userId || "")).filter(Boolean),
            propertyIds: (Array.isArray(properties) ? properties : []).map((property) => String(property.id || property._id || "")).filter(Boolean),
            issues: Array.isArray(issues) ? issues : [],
            properties: Array.isArray(properties) ? properties : [],
            assets: Array.isArray(assets) ? assets : [],
            technicians: Array.isArray(technicians) ? technicians : [],
            companyUsers: Array.isArray(companyUsers) ? companyUsers : [],
        };
    }

    const userIds = await getCompanyUserIds(companyName);
    const propertyIds = await getCompanyPropertyIds(companyName);
    const userService = require("../user/user.service");

    const [issues, properties, assets, technicians, companyUsers] = await Promise.all([
        getSafeIssues(companyName),
        propertyIds.length
            ? propertyModel.findAll({ id: { in: propertyIds } })
            : [],
        (propertyIds.length || userIds.length)
            ? assetModel.findAll({
                OR: [
                    propertyIds.length ? { propertyId: { in: propertyIds } } : null,
                    userIds.length ? { userId: { in: userIds } } : null,
                ].filter(Boolean)
            })
            : [],
        propertyIds.length
            ? internalTechnicianModel.findAll({ propertyId: { in: propertyIds }, status: 'Active' })
            : [],
        userService.getAllUsers({ companyName }),
    ]);

    return {
        companyName,
        userIds,
        propertyIds,
        issues: Array.isArray(issues) ? issues : [],
        properties: Array.isArray(properties) ? properties : [],
        assets: Array.isArray(assets) ? assets : [],
        technicians: Array.isArray(technicians) ? technicians : [],
        companyUsers: Array.isArray(companyUsers) ? companyUsers : [],
    };
};

const toDateValue = (value) => {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getSafeIssues = async (companyName = null) => {
    const issues = await issueService.getAll(companyName);
    return Array.isArray(issues) ? issues : [];
};

const hoursBetween = (start, end) => {
    const left = toDateValue(start);
    const right = toDateValue(end);
    if (!left || !right) return null;
    const diff = (right.getTime() - left.getTime()) / (1000 * 60 * 60);
    return Number.isFinite(diff) ? Math.max(0, Number(diff.toFixed(2))) : null;
};

const normalizeStatus = (value) => String(value || 'OPEN').trim().toUpperCase();
const isCompletedStatus = (value) => normalizeStatus(value).includes('COMPLETE') || normalizeStatus(value) === 'RESOLVED';

const getIssueResolvedAt = (issue) => (
    toDateValue(issue?.resolvedAt) ||
    toDateValue(issue?.completedAt) ||
    (isCompletedStatus(issue?.status) ? toDateValue(issue?.updatedAt) : null)
);

const getIssuePropertyLabel = (issue) => (
    issue?.property?.name ||
    issue?.propertyName ||
    issue?.location ||
    issue?.address ||
    'Unknown Property'
);

const getIssueAssigneeId = (issue) => String(
    issue?.assignedTo?.id ||
    issue?.assignedTo?._id ||
    issue?.assignedTo ||
    issue?.technicianId ||
    issue?.technician?.id ||
    issue?.technician?._id ||
    ''
).trim();

const getIssueAssigneeName = (issue) => (
    issue?.assignedTo?.name ||
    issue?.assignedTechnicianName ||
    issue?.technicianName ||
    issue?.technician?.name ||
    'Unassigned'
);

const isCompanyWorker = (user) => {
    const role = String(user?.role || '').trim().toLowerCase();
    return ['technician', 'manager', 'admin', 'staff'].includes(role);
};

const buildMaintenanceAnalytics = ({ issues = [], properties = [], assets = [], technicians = [], companyUsers = [], companyName = null }) => {
    const now = new Date();
    const normalizedIssues = (Array.isArray(issues) ? issues : []).map((issue) => {
        const createdAt = toDateValue(issue?.createdAt || issue?.date);
        const resolvedAt = getIssueResolvedAt(issue);
        const resolutionHours = hoursBetween(createdAt, resolvedAt);
        const deadline = toDateValue(issue?.fixDeadline || issue?.dueDate);
        const completed = isCompletedStatus(issue?.status);
        const slaBreached = deadline ? ((resolvedAt || now) > deadline && !Number.isNaN(deadline.getTime())) : Boolean(issue?.overdue);
        return {
            id: String(issue?.id || issue?._id || ''),
            title: issue?.title || 'Untitled issue',
            category: issue?.category || 'General',
            priority: String(issue?.priority || 'MEDIUM').toUpperCase(),
            status: normalizeStatus(issue?.status),
            property: getIssuePropertyLabel(issue),
            assetName: issue?.assetName || issue?.asset?.name || 'No asset',
            createdAt,
            resolvedAt,
            resolutionHours,
            deadline,
            slaBreached,
            completed,
            assigneeId: getIssueAssigneeId(issue),
            assigneeName: getIssueAssigneeName(issue),
        };
    });

    const totalIssues = normalizedIssues.length;
    const completedIssues = normalizedIssues.filter((issue) => issue.completed);
    const openIssues = normalizedIssues.filter((issue) => !issue.completed);
    const slaBreaches = normalizedIssues.filter((issue) => issue.slaBreached);
    const avgResolutionHours = completedIssues.length
        ? Number((completedIssues.reduce((sum, issue) => sum + (issue.resolutionHours || 0), 0) / completedIssues.length).toFixed(2))
        : null;

    const propertyCountMap = new Map();
    const categoryCountMap = new Map();
    const issuePatternMap = new Map();
    const technicianMap = new Map();

    normalizedIssues.forEach((issue) => {
        propertyCountMap.set(issue.property, (propertyCountMap.get(issue.property) || 0) + 1);
        categoryCountMap.set(issue.category, (categoryCountMap.get(issue.category) || 0) + 1);
        const patternKey = `${issue.category}::${issue.property}`;
        issuePatternMap.set(patternKey, {
            category: issue.category,
            property: issue.property,
            count: (issuePatternMap.get(patternKey)?.count || 0) + 1
        });

        const techKey = issue.assigneeId || issue.assigneeName;
        if (!techKey || techKey === 'Unassigned') return;
        const existing = technicianMap.get(techKey) || {
            technicianId: issue.assigneeId || '',
            technicianName: issue.assigneeName,
            assignedCount: 0,
            completedCount: 0,
            totalResolutionHours: 0,
            resolvedItems: 0
        };
        existing.assignedCount += 1;
        if (issue.completed) {
            existing.completedCount += 1;
            if (typeof issue.resolutionHours === 'number') {
                existing.totalResolutionHours += issue.resolutionHours;
                existing.resolvedItems += 1;
            }
        }
        technicianMap.set(techKey, existing);
    });

    const topProperties = Array.from(propertyCountMap.entries())
        .map(([property, count]) => ({ property, incidentCount: count }))
        .sort((a, b) => b.incidentCount - a.incidentCount)
        .slice(0, 5);

    const topIssueCategories = Array.from(categoryCountMap.entries())
        .map(([category, count]) => ({ category, incidentCount: count }))
        .sort((a, b) => b.incidentCount - a.incidentCount)
        .slice(0, 5);

    const recurringIssues = Array.from(issuePatternMap.values())
        .filter((entry) => entry.count >= 2)
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
        .map((entry) => ({
            ...entry,
            prediction: entry.count >= 5
                ? `High recurrence detected. Schedule preventive maintenance for ${entry.property}.`
                : `Watch this pattern closely and inspect root cause at ${entry.property}.`
        }));

    const technicianPerformance = Array.from(technicianMap.values())
        .map((entry) => ({
            technicianId: entry.technicianId,
            technicianName: entry.technicianName,
            assignedCount: entry.assignedCount,
            completedCount: entry.completedCount,
            averageResolutionHours: entry.resolvedItems
                ? Number((entry.totalResolutionHours / entry.resolvedItems).toFixed(2))
                : null
        }))
        .sort((a, b) => {
            const left = a.averageResolutionHours ?? Number.MAX_SAFE_INTEGER;
            const right = b.averageResolutionHours ?? Number.MAX_SAFE_INTEGER;
            return left - right;
        })
        .slice(0, 5);

    const highPriorityOpenIssues = openIssues
        .filter((issue) => issue.priority === 'HIGH' || issue.priority === 'URGENT')
        .sort((a, b) => {
            const left = a.deadline?.getTime() || Number.MAX_SAFE_INTEGER;
            const right = b.deadline?.getTime() || Number.MAX_SAFE_INTEGER;
            return left - right;
        })
        .slice(0, 5)
        .map((issue) => ({
            id: issue.id,
            title: issue.title,
            property: issue.property,
            priority: issue.priority,
            status: issue.status,
            deadline: issue.deadline ? issue.deadline.toISOString() : null
        }));

    const recommendations = [];
    if (slaBreaches.length > 0) {
        recommendations.push("Review overdue or breached work orders first and rebalance technician assignments.");
    }
    if (recurringIssues.some((entry) => entry.count >= 3)) {
        recommendations.push("Schedule preventive maintenance for recurring issue hotspots before more failures occur.");
    }
    if (avgResolutionHours && avgResolutionHours > 48) {
        recommendations.push("Average resolution time is high. Review parts availability and technician dispatch workflows.");
    }
    if (recommendations.length === 0) {
        recommendations.push("System looks stable. Continue preventive inspections and monitor recurring categories.");
    }

    const totalCompanyWorkers = (Array.isArray(companyUsers) ? companyUsers : []).filter(isCompanyWorker).length;

    return {
        companyName,
        generatedAt: new Date().toISOString(),
        metrics: {
            totalIssues,
            openIssues: openIssues.length,
            completedIssues: completedIssues.length,
            totalProperties: Array.isArray(properties) ? properties.length : 0,
            totalAssets: Array.isArray(assets) ? assets.length : 0,
            activeTechnicians: totalCompanyWorkers || (Array.isArray(technicians) ? technicians.length : 0),
            totalCompanyWorkers,
            avgResolutionHours,
            slaBreaches: slaBreaches.length,
        },
        topProperties,
        topIssueCategories,
        technicianPerformance,
        recurringIssues,
        highPriorityOpenIssues,
        recommendations,
        suggestedQuestions: [
            "Why do we have many electrical issues this month?",
            "Which property has the most incidents?",
            "What should we fix first?",
            "Which technician resolves issues fastest?",
            "Where are we breaching SLA most often?"
        ],
    };
};

class AIController {
    async getMaintenanceSummary(req, res) {
        try {
            const companyName = await resolveCompanyName(req);
            if (!companyName) {
                return res.status(401).json({ message: "Login is required to load company maintenance insights." });
            }

            const { issues, properties, assets, technicians, companyUsers } = await getCompanyScopedData(companyName);

            const summary = buildMaintenanceAnalytics({
                issues,
                properties,
                assets,
                technicians,
                companyUsers,
                companyName
            });

            res.json(summary);
        } catch (error) {
            console.error("AI Controller Error (Maintenance Summary):", error);
            res.status(500).json({ message: error.message });
        }
    }

    async generateChecklist(req, res) {
        try {
            const { assetId, extraInstructions, focus } = req.body || {};
            if (!assetId) {
                return res.status(400).json({ message: "assetId is required" });
            }

            const companyName = await resolveCompanyName(req);
            if (!companyName) {
                return res.status(400).json({ message: "Company context is required" });
            }

            const asset = await assetModel.findById(String(assetId));
            if (!asset) {
                return res.status(404).json({ message: "Asset not found" });
            }

            const companyPropertyIds = await getCompanyPropertyIds(companyName);
            const assetPropertyId = String(
                asset.propertyId ||
                asset.property?.id ||
                asset.property?._id ||
                ''
            );
            if (!assetPropertyId || !companyPropertyIds.includes(assetPropertyId)) {
                return res.status(403).json({ message: "This asset does not belong to your company" });
            }

            let recentIssues = [];
            try {
                recentIssues = await prisma.issue.findMany({
                    where: {
                        OR: [
                            { assetId: String(assetId) },
                            { assetName: asset.name || asset.title || undefined }
                        ].filter(Boolean)
                    },
                    take: 5,
                    orderBy: { createdAt: 'desc' },
                    select: { title: true, description: true, status: true }
                });
            } catch (err) {
                console.warn("AI Checklist: failed to load related issues", err.message);
            }

            const assetSummary = {
                id: asset.id || asset._id,
                name: asset.name || asset.title || asset.assetName,
                type: asset.type || asset.category || '',
                manufacturer: asset.manufacturer || '',
                model: asset.model || '',
                status: asset.status || '',
                location: asset.location || '',
                property: asset.property ? {
                    id: asset.property.id || asset.property._id,
                    name: asset.property.name || asset.property.title || ''
                } : null,
                recentIssues: recentIssues.map((issue) => ({
                    title: issue.title || '',
                    description: issue.description || '',
                    status: issue.status || ''
                }))
            };

            const checklist = await aiService.generateChecklist(assetSummary, { extraInstructions, focus });
            res.json(checklist);
        } catch (error) {
            console.error("AI Controller Error (Generate Checklist):", error);
            res.status(500).json({ message: error.message });
        }
    }

    /**
     * Predict maintenance for a specific asset
     */
    async getMaintenancePrediction(req, res) {
        try {
            const { assetId } = req.params;
            const asset = await prisma.asset.findUnique({
                where: { id: assetId },
                include: { issues: { take: 10, orderBy: { createdAt: 'desc' } } }
            });

            if (!asset) {
                return res.status(404).json({ message: "Asset not found" });
            }

            const prediction = await aiService.predictMaintenance(asset);
            res.json(prediction);
        } catch (error) {
            console.error("AI Controller Error (Prediction):", error);
            res.status(500).json({ message: error.message });
        }
    }

    /**
     * Triage a new issue
     */
    async triageIssue(req, res) {
        try {
            const { description } = req.body;
            if (!description) {
                return res.status(400).json({ message: "Description is required" });
            }

            const technicians = await prisma.internalTechnician.findMany({
                where: { status: "Active" }
            });

            const triageResults = await aiService.triageIssue(description, technicians);
            res.json(triageResults);
        } catch (error) {
            console.error("AI Controller Error (Triage):", error);
            res.status(500).json({ message: error.message });
        }
    }

    /**
     * Get sentiment summary for recent feedback
     */
    async getSentimentSummary(req, res) {
        try {
            let feedback = await prisma.feedback.findMany({
                take: 50,
                orderBy: { date: 'desc' }
            });

            let isFallback = false;
            // Fallback to issues if no feedback exists
            if (feedback.length === 0) {
                const issues = await prisma.issue.findMany({
                    take: 50,
                    orderBy: { createdAt: 'desc' },
                    select: { id: true, description: true, title: true }
                });

                if (issues.length === 0) {
                    return res.json({
                        overallSentiment: "Neutral",
                        summary: "No data available for analysis yet.",
                        urgentFeedbackIds: []
                    });
                }

                feedback = issues.map(i => ({ id: i.id, message: `${i.title}: ${i.description}` }));
                isFallback = true;
            }

            const sentiment = await aiService.analyzeSentiment(feedback.map(f => ({ id: f.id, message: f.message })), isFallback);
            res.json(sentiment);
        } catch (error) {
            console.error("AI Controller Error (Sentiment):", error);
            res.status(500).json({ message: error.message });
        }
    }

    /**
     * Get dynamic proactive recommendations for the dashboard
     */
    async getDashboardRecommendations(req, res) {
        try {
            const companyName = await resolveCompanyName(req);
            if (!companyName) {
                return res.status(401).json({ message: "Login is required to load company AI recommendations." });
            }

            const { issues, properties, assets, technicians: technicianStats, companyUsers } = await getCompanyScopedData(companyName);

            const analyticsSummary = buildMaintenanceAnalytics({
                issues,
                properties,
                assets,
                technicians: technicianStats,
                companyUsers,
                companyName
            });

            const recommendations = await aiService.getDashboardRecommendations(analyticsSummary);
            res.json(recommendations);
        } catch (error) {
            console.error("AI Controller Error (Recommendations):", error);
            res.status(500).json({ message: error.message });
        }
    }

    /**
     * Chat with the AI
     */
    async chat(req, res) {
        try {
            const { message, history } = req.body;
            if (!message) {
                return res.status(400).json({ message: "Message is required" });
            }

            // Resolve company name to see if we can provide personalized data
            const companyName = await resolveCompanyName(req).catch(() => null);
            
            let sanitizedHistory = (Array.isArray(history) ? history : [])
                .filter((entry) => entry && typeof entry.content === 'string' && entry.content.trim().length > 0)
                .map((entry) => ({
                    role: entry.role === 'user' ? 'user' : 'model',
                    content: entry.content.trim(),
                }))
                .filter((entry, index) => !(index === 0 && entry.role !== 'user'));

            let analyticsSummary = null;
            let scopedData = null;

            // Only attempt data retrieval if we have a company context (logged-in user)
            if (companyName) {
                try {
                    scopedData = await getCompanyScopedData(companyName);
                    if (scopedData) {
                        const { issues, properties, assets, technicians, companyUsers, userIds, propertyIds } = scopedData;

                        // Check for table entity request first (UI efficiency)
                        const requestedEntity = detectTableEntity(message);
                        if (requestedEntity) {
                            const tableResponse = await buildTableResponse(requestedEntity, {
                                issues,
                                properties,
                                assets,
                                technicians,
                                companyUsers,
                                companyName,
                                userIds,
                                propertyIds,
                            });
                            if (tableResponse) {
                                return res.json({ response: tableResponse });
                            }
                        }

                        // Build the analytics context for Gemini
                        analyticsSummary = buildMaintenanceAnalytics({
                            issues,
                            properties,
                            assets,
                            technicians,
                            companyUsers,
                            companyName
                        });
                    }
                } catch (dataErr) {
                    console.error("AI Controller: Skipping specialized context due to error", dataErr.message);
                }
            }

            // Call the AI Service (Gemini pipeline) with whatever context we gathered
            const response = await aiService.chat(message, sanitizedHistory, analyticsSummary);
            res.json({ response });
        } catch (error) {
            console.error("AI Controller Error (Chat Overall):", error);
            res.status(500).json({ 
                message: "I encountered an error while processing your request. Please try again.",
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
}

module.exports = new AIController();
