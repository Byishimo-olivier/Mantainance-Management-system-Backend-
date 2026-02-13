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

const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
