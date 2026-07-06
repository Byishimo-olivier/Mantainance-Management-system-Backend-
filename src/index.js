const path = require('path');
const os = require('os');
const dotenv = require('dotenv');

[
  { path: path.join(os.homedir(), '.env'), override: false },
  { path: path.resolve(__dirname, '../.env'), override: true }
].forEach((envFile) => {
  const result = dotenv.config({
    path: envFile.path,
    override: envFile.override
  });

  if (result.error && result.error.code !== 'ENOENT') {
    console.warn(`[env] Failed to load ${envFile.path}: ${result.error.message}`);
  }
});

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const userRoutes = require('./modules/user/user.routes.js');
const authRoutes = require('./modules/auth/auth.routes.js');
const passwordRoutes = require('./modules/auth/password.routes.js');
const technicianRoutes = require('./modules/technician/technician.routes.js');
const issueRoutes = require('./modules/issue/issue.routes.js');

const feedbackRoutes = require('./modules/feedback/feedback.routes.js');
const managerRoutes = require('./modules/manager/manager.routes.js');

const propertyRoutes = require('./modules/property/property.routes');
const assetRoutes = require('./modules/asset/asset.routes');
const internalTechnicianRoutes = require('./modules/internalTechnician/internalTechnician.routes');
const maintenanceTemplateRoutes = require('./modules/maintenanceTemplate/maintenanceTemplate.routes');
const maintenanceScheduleRoutes = require('./modules/maintenanceSchedule/maintenanceSchedule.routes');
const maintenanceReminderService = require('./modules/maintenanceSchedule/maintenanceReminder.service');
const pmAutoGenerationService = require('./modules/maintenanceSchedule/pmAutoGeneration.service');
const cronService = require('./services/cron.service');
const emailRoutes = require('./modules/emailService/email.routes');
const materialRequestRoutes = require('./modules/materialRequest/materialRequest.routes');
const aiRoutes = require('./modules/ai/ai.routes');
const notificationRoutes = require('./modules/notification/notification.routes');
const privateNoteRoutes = require('./modules/privateNote/privateNote.routes');
const subscriptionRoutes = require('./modules/subscription/subscription.routes');
const meterRoutes = require('./modules/meter/meter.routes');
const deviceRoutes = require('./modules/device/device.routes');
const edgeIngestionService = require('./modules/device/edgeIngestion.service');
const peopleRoutes = require('./modules/people/people.routes');
const teamRoutes = require('./modules/team/team.routes');
const checklistRoutes = require('./modules/checklist/checklist.routes');
const fileRoutes = require('./modules/file/file.routes');
const partRoutes = require('./modules/part/part.routes');
const partRequestRoutes = require('./modules/partRequest/partRequest.routes');
const inventorySetRoutes = require('./modules/inventorySet/inventorySet.routes');
const cycleCountRoutes = require('./modules/cycleCount/cycleCount.routes');
const vendorRoutes = require('./modules/vendor/vendor.routes');
const clientRoutes = require('./modules/client/client.routes');
const purchaseOrderRoutes = require('./modules/purchaseOrder/purchaseOrder.routes');
const auditLogRoutes = require('./modules/auditLog/auditLog.routes');
const systemSettingsRoutes = require('./modules/systemSettings/systemSettings.routes');
const requestSettingsRoutes = require('./modules/requestSettings/requestSettings.routes');
const analyticsPreferenceRoutes = require('./modules/analyticsPreference/analyticsPreference.routes');
const integrationRoutes = require('./modules/integration/integration.routes');
const taskRoutes = require('./modules/task/task.routes');
const dailyReportRoutes = require('./modules/reports/dailyReport.routes');
const quoteRequestRoutes = require('./modules/quoteRequest/quoteRequest.routes');
const contactMessageRoutes = require('./modules/contactMessage/contactMessage.routes');
const demoRequestRoutes = require('./modules/demoRequest/demoRequest.routes');
const dailyReportService = require('./modules/reports/dailyReport.service');
const systemSettingsService = require('./modules/systemSettings/systemSettings.service');
const paymentService = require('./modules/subscription/payment.service');
const { startMonthlyReportScheduler } = require('./modules/report/monthlyReport.service');
const { ensureSuperadmin } = require('./bootstrap/superadmin');
const { auditRequests } = require('./middleware/audit');

const app = express();

const parseOriginList = (value = '') => String(value)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// CORS configuration
const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'https://fixnest.rw',
  'https://www.fixnest.rw',
  'https://api.fixnest.rw',
  process.env.FRONTEND_URL,
  process.env.BACKEND_URL,
  ...parseOriginList(process.env.CORS_ORIGIN),
  'https://mms-frontend.vercel.app',
].filter(Boolean);

console.log('Allowed Origins:', allowedOrigins);

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    const isAllowed = allowedOrigins.includes(origin) ||
      (process.env.NODE_ENV !== 'production') ||
      origin.endsWith('.vercel.app') ||
      origin.endsWith('.now.sh') ||
      origin.endsWith('.rw');

    if (isAllowed) {
      callback(null, true);
    } else {
      console.error('[CORS Blocked] Origin:', origin);
      console.log('[CORS Allowed] Origins:', allowedOrigins);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(auditRequests);
// Serve uploaded files statically
app.use('/uploads', express.static(require('path').join(__dirname, '../uploads')));

// Connect to MongoDB (no deprecated options)
mongoose.connect(process.env.DATABASE_URL)
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.error('MongoDB connection error:', err));

// Function to repair user collection indexes for multi-company support
async function repairUserIndexes() {
  try {
    const db = mongoose.connection.db;
    if (!db) return;
    
    const collection = db.collection('users');
    
    console.log('[Index Repair] Starting user collection index repair...');
    
    // Get all existing indexes
    const indexes = await collection.listIndexes().toArray();
    console.log('[Index Repair] Current indexes:', indexes.map(i => ({ name: i.name, unique: i.unique, sparse: i.sparse })));
    
    // Drop all problematic unique indexes (they need to be recreated as sparse)
    const indexesToDrop = [
      'email_1',
      'phone_1',
      'email_1_companyName_1',
      'phone_1_companyName_1',
      'email_1_companyId_1',
      'phone_1_companyId_1',
      'users_email_companyId_key',
      'users_phone_companyId_key'
    ];
    
    for (const index of indexes) {
      if (index.name === '_id_') continue;
      if (indexesToDrop.includes(index.name)) {
        try {
          console.log(`[Index Repair] Dropping index: ${index.name}...`);
          await collection.dropIndex(index.name);
          console.log(`[Index Repair] ✓ Dropped: ${index.name}`);
        } catch (dropErr) {
          console.warn(`[Index Repair] Could not drop ${index.name}:`, dropErr.message);
        }
      }
    }
    
    // Create new sparse compound indexes using companyName
    console.log('[Index Repair] Creating new sparse compound indexes...');
    
    try {
      await collection.createIndex(
        { email: 1, companyName: 1 },
        { unique: true, sparse: true, name: 'email_1_companyName_1_sparse' }
      );
      console.log('[Index Repair] ✓ Created sparse index: {email: 1, companyName: 1}');
    } catch (createErr) {
      console.warn('[Index Repair] Could not create email index:', createErr.message);
    }
    
    try {
      await collection.createIndex(
        { phone: 1, companyName: 1 },
        { unique: true, sparse: true, name: 'phone_1_companyName_1_sparse' }
      );
      console.log('[Index Repair] ✓ Created sparse index: {phone: 1, companyName: 1}');
    } catch (createErr) {
      console.warn('[Index Repair] Could not create phone index:', createErr.message);
    }
    
    console.log('[Index Repair] ✓ User collection indexes repaired successfully');
  } catch (err) {
    console.error('[Index Repair] Error repairing indexes:', err.message);
  }
}

// Function to repair technician collection indexes
async function repairTechnicianIndexes() {
  try {
    const db = mongoose.connection.db;
    if (!db) return;
    
    const collection = db.collection('technicians');
    const indexes = await collection.listIndexes().toArray();
    const indexNames = indexes.map(idx => idx.name);
    
    // Drop old unique constraint on email+companyName to allow same email in different companies
    if (indexNames.includes('email_1_companyName_1')) {
      console.log('[Index Repair] Dropping old unique index: email_1_companyName_1...');
      await collection.dropIndex('email_1_companyName_1');
      console.log('[Index Repair] ✓ Technician email+companyName unique constraint removed');
    }
  } catch (err) {
    // Silently ignore errors if collection doesn't exist yet (normal during first run)
    if (err.message && err.message.includes('ns does not exist')) {
      console.log('[Index Repair] Technician collection not yet created, skipping index repair');
    } else {
      console.error('[Index Repair] Error repairing technician indexes:', err.message);
    }
  }
}

mongoose.connection.once('open', () => {
  // Repair user indexes for multi-company support
  repairUserIndexes().catch((err) => {
    console.error('[bootstrap] Failed to repair user indexes:', err);
  });
  
  // Repair technician indexes
  repairTechnicianIndexes().catch((err) => {
    console.error('[bootstrap] Failed to repair technician indexes:', err);
  });
  
  startMonthlyReportScheduler();
  maintenanceReminderService.start();
  
  // Start PM Auto-Generation service
  try {
    pmAutoGenerationService.startPMAutoGenerationCron(cronService);
    console.log('[bootstrap] PM Auto-Generation service started');
  } catch (err) {
    console.error('[bootstrap] Failed to start PM Auto-Generation service:', err);
  }

  try {
    edgeIngestionService.startEdgeIngestionCron(cronService);
    console.log('[bootstrap] Edge ingestion worker started');
  } catch (err) {
    console.error('[bootstrap] Failed to start edge ingestion worker:', err);
  }
  
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  dailyReportService.setPrismaClient(prisma);
  dailyReportService.initializeScheduler();
  ensureSuperadmin().catch((err) => {
    console.error('[bootstrap] Failed to ensure superadmin:', err);
  });
  systemSettingsService.getSettings()
    .then((settings) => paymentService.setPricing(settings.pricing))
    .catch((err) => console.error('[bootstrap] Failed to load system settings:', err));
});

app.get('/', (req, res) => {
  res.send('Maintenance Management System API is running');
});

app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    environment: process.env.NODE_ENV,
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

// Debug: list registered routes when DEBUG_ROUTES=1 (safe to enable temporarily)
if (process.env.DEBUG_ROUTES === '1') {
  app.get('/api/_routes', (req, res) => {
    try {
      const routes = [];
      app._router.stack.forEach((middleware) => {
        if (middleware.route) {
          // routes registered directly on the app
          const methods = Object.keys(middleware.route.methods).map(m => m.toUpperCase());
          routes.push({ path: middleware.route.path, methods });
        } else if (middleware.name === 'router' && middleware.handle && middleware.handle.stack) {
          // router middleware
          middleware.handle.stack.forEach((handler) => {
            if (handler.route) {
              const methods = Object.keys(handler.route.methods).map(m => m.toUpperCase());
              routes.push({ path: handler.route.path, methods });
            }
          });
        }
      });
      res.json({ count: routes.length, routes });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

app.use('/api/users', userRoutes);
app.use('/api/auth', authRoutes);
app.use('/auth', authRoutes);
app.use('/api/auth', passwordRoutes);
app.use('/api/technicians', technicianRoutes);
app.use('/api/issues', issueRoutes);

app.use('/api/feedback', feedbackRoutes);
app.use('/api/managers', managerRoutes);

// New maintenance and asset management routes
app.use('/api/properties', propertyRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/internal-technicians', internalTechnicianRoutes);
app.use('/api/maintenance-templates', maintenanceTemplateRoutes);
app.use('/api/maintenance-schedules', maintenanceScheduleRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/material-requests', materialRequestRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/private-notes', privateNoteRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/meters', meterRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/people', peopleRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/checklists', checklistRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/parts', partRoutes);
app.use('/api/part-requests', partRequestRoutes);
app.use('/api/inventory-sets', inventorySetRoutes);
app.use('/api/cycle-counts', cycleCountRoutes);
app.use('/api/vendors', vendorRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/purchase-orders', purchaseOrderRoutes);
app.use('/api/audit-logs', auditLogRoutes);
app.use('/api/system-settings', systemSettingsRoutes);
app.use('/api/request-settings', requestSettingsRoutes);
app.use('/api/analytics-preferences', analyticsPreferenceRoutes);
app.use('/api/integrations', integrationRoutes);
app.use('/api/reports', dailyReportRoutes);
app.use('/api/quote-requests', quoteRequestRoutes);
app.use('/', demoRequestRoutes);
app.use('/', contactMessageRoutes);

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`[Google SSO] Redirect URI: ${process.env.GOOGLE_CALLBACK_URL || process.env.GOOGLE_REDIRECT_URI || `${process.env.BACKEND_URL || `http://localhost:${PORT}`}/api/auth/google/callback`}`);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`[startup] Port ${PORT} is already in use. Stop the existing backend process or set a different PORT in .env.`);
    process.exit(1);
  }

  console.error('[startup] Server failed to start:', error);
  process.exit(1);
});

module.exports = app;
