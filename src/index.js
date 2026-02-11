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

// CORS configuration - allow requests from frontend
const frontendUrl = process.env.FRONTEND_URL || '*';
app.use(cors({
  origin: frontendUrl,
  credentials: true
}));
app.use(express.json());
// Serve uploaded files statically
app.use('/uploads', express.static(require('path').join(__dirname, '../uploads')));

// Connect to MongoDB (no deprecated options)
mongoose.connect(process.env.DATABASE_URL)
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.error('MongoDB connection error:', err));

app.get('/', (req, res) => {
  res.send('Maintenance Management System API');
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
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
