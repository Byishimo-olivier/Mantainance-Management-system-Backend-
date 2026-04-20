require('dotenv').config();
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
const emailRoutes = require('./modules/emailService/email.routes');
const materialRequestRoutes = require('./modules/materialRequest/materialRequest.routes');
const aiRoutes = require('./modules/ai/ai.routes');
const notificationRoutes = require('./modules/notification/notification.routes');
const privateNoteRoutes = require('./modules/privateNote/privateNote.routes');
const subscriptionRoutes = require('./modules/subscription/subscription.routes');
const meterRoutes = require('./modules/meter/meter.routes');
const deviceRoutes = require('./modules/device/device.routes');
const peopleRoutes = require('./modules/people/people.routes');
const teamRoutes = require('./modules/team/team.routes');
const checklistRoutes = require('./modules/checklist/checklist.routes');
const fileRoutes = require('./modules/file/file.routes');
const partRoutes = require('./modules/part/part.routes');
const inventorySetRoutes = require('./modules/inventorySet/inventorySet.routes');
const cycleCountRoutes = require('./modules/cycleCount/cycleCount.routes');
const vendorRoutes = require('./modules/vendor/vendor.routes');
const clientRoutes = require('./modules/client/client.routes');
const purchaseOrderRoutes = require('./modules/purchaseOrder/purchaseOrder.routes');
const auditLogRoutes = require('./modules/auditLog/auditLog.routes');
const systemSettingsRoutes = require('./modules/systemSettings/systemSettings.routes');
const requestSettingsRoutes = require('./modules/requestSettings/requestSettings.routes');
const analyticsPreferenceRoutes = require('./modules/analyticsPreference/analyticsPreference.routes');
const taskRoutes = require('./modules/task/task.routes');
const dailyReportRoutes = require('./modules/reports/dailyReport.routes');
const quoteRequestRoutes = require('./modules/quoteRequest/quoteRequest.routes');
const contactMessageRoutes = require('./modules/contactMessage/contactMessage.routes');
const dailyReportService = require('./modules/reports/dailyReport.service');
const systemSettingsService = require('./modules/systemSettings/systemSettings.service');
const paymentService = require('./modules/subscription/payment.service');
const { startMonthlyReportScheduler } = require('./modules/report/monthlyReport.service');
const { ensureSuperadmin } = require('./bootstrap/superadmin');
const { auditRequests } = require('./middleware/audit');

const app = express();

// CORS configuration
const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  process.env.FRONTEND_URL,
  'https://www.fixnest.rw',
  'https://mms-frontend.vercel.app',
].filter(Boolean);

console.log('Allowed Origins:', allowedOrigins);

app.use(cors({
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
  allowedHeaders: ['Content-Type', 'Authorization']
}));

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
    const indexes = await collection.listIndexes().toArray();
    const indexNames = indexes.map(idx => idx.name);
    
    let repaired = false;
    
    // Drop old global unique indexes if they exist
    if (indexNames.includes('email_1')) {
      console.log('[Index Repair] Dropping old email_1 index...');
      await collection.dropIndex('email_1');
      repaired = true;
    }
    
    if (indexNames.includes('phone_1')) {
      console.log('[Index Repair] Dropping old phone_1 index...');
      await collection.dropIndex('phone_1');
      repaired = true;
    }
    
    // Drop old compound indexes that might not have sparse option
    if (indexNames.includes('users_email_companyId_key')) {
      const indexInfo = await collection.listIndexes().toArray().then(idx => 
        idx.find(i => i.name === 'users_email_companyId_key')
      );
      if (!indexInfo?.sparse) {
        console.log('[Index Repair] Dropping old users_email_companyId_key (non-sparse)...');
        await collection.dropIndex('users_email_companyId_key');
        repaired = true;
      }
    }
    
    if (indexNames.includes('users_phone_companyId_key')) {
      const indexInfo = await collection.listIndexes().toArray().then(idx => 
        idx.find(i => i.name === 'users_phone_companyId_key')
      );
      if (!indexInfo?.sparse) {
        console.log('[Index Repair] Dropping old users_phone_companyId_key (non-sparse)...');
        await collection.dropIndex('users_phone_companyId_key');
        repaired = true;
      }
    }
    
    // Create new compound unique SPARSE indexes
    // SPARSE means: null values are ignored, allowing multiple nulls
    const newIndexes = (await collection.listIndexes().toArray()).map(idx => idx.name);
    
    if (!newIndexes.includes('users_email_companyId_key')) {
      console.log('[Index Repair] Creating sparse compound index: {email: 1, companyId: 1}');
      await collection.createIndex(
        { email: 1, companyId: 1 },
        { unique: true, sparse: true, name: 'users_email_companyId_key' }
      );
      repaired = true;
    }
    
    if (!newIndexes.includes('users_phone_companyId_key')) {
      console.log('[Index Repair] Creating sparse compound index: {phone: 1, companyId: 1}');
      await collection.createIndex(
        { phone: 1, companyId: 1 },
        { unique: true, sparse: true, name: 'users_phone_companyId_key' }
      );
      repaired = true;
    }
    
    if (repaired) {
      console.log('[Index Repair] ✓ User collection indexes repaired successfully (sparse mode enabled)');
    }
  } catch (err) {
    console.error('[Index Repair] Error repairing indexes:', err.message);
  }
}

mongoose.connection.once('open', () => {
  // Repair user indexes for multi-company support
  repairUserIndexes().catch((err) => {
    console.error('[bootstrap] Failed to repair user indexes:', err);
  });
  
  startMonthlyReportScheduler();
  maintenanceReminderService.start();
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
app.use('/api/inventory-sets', inventorySetRoutes);
app.use('/api/cycle-counts', cycleCountRoutes);
app.use('/api/vendors', vendorRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/purchase-orders', purchaseOrderRoutes);
app.use('/api/audit-logs', auditLogRoutes);
app.use('/api/system-settings', systemSettingsRoutes);
app.use('/api/request-settings', requestSettingsRoutes);
app.use('/api/analytics-preferences', analyticsPreferenceRoutes);
app.use('/api/reports', dailyReportRoutes);
app.use('/api/quote-requests', quoteRequestRoutes);
app.use('/', contactMessageRoutes);

const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
