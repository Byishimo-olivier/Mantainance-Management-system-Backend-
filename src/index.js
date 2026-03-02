const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
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
const emailRoutes = require('./modules/emailService/email.routes');
const materialRequestRoutes = require('./modules/materialRequest/materialRequest.routes');
const aiRoutes = require('./modules/ai/ai.routes');
const notificationRoutes = require('./modules/notification/notification.routes');
const subscriptionRoutes = require('./modules/subscription/subscription.routes');
const meterRoutes = require('./modules/meter/meter.routes');
const deviceRoutes = require('./modules/device/device.routes');
const peopleRoutes = require('./modules/people/people.routes');
const teamRoutes = require('./modules/team/team.routes');
const checklistRoutes = require('./modules/checklist/checklist.routes');
const fileRoutes = require('./modules/file/file.routes');

const app = express();

// CORS configuration
const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  process.env.FRONTEND_URL,
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
      origin.endsWith('.now.sh');

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

app.use(express.json());
// Serve uploaded files statically
app.use('/uploads', express.static(require('path').join(__dirname, '../uploads')));

// Connect to MongoDB (no deprecated options)
mongoose.connect(process.env.DATABASE_URL)
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.error('MongoDB connection error:', err));

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
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/meters', meterRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/people', peopleRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/checklists', checklistRoutes);
app.use('/api/files', fileRoutes);

const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
