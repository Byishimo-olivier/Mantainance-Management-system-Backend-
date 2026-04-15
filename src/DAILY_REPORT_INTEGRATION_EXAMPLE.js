// Example: How to integrate Daily Report Scheduler into your main server file

/**
 * Add this to your main server/app initialization file (e.g., src/index.js or src/bootstrap/server.js)
 */

// ============================================
// 1. IMPORT THE SCHEDULER
// ============================================
const { initializeDailyReportSchedulerV2 } = require('./utils/dailyReportScheduler');

// ============================================
// 2. IMPORT THE ROUTES
// ============================================
const dailyReportRoutes = require('./modules/report/dailyReport.routes');

// ============================================
// 3. REGISTER ROUTES (in your Express app setup)
// ============================================
// Add this with your other route registrations:
app.use('/api/daily-reports', dailyReportRoutes);

// ============================================
// 4. INITIALIZE SCHEDULER (after DB connection)
// ============================================
async function startApplication() {
  try {
    // ... your existing code for connecting to database ...
    
    // Start Daily Report Scheduler
    console.log('[Startup] Initializing Daily Report Scheduler...');
    const reportScheduler = initializeDailyReportSchedulerV2();
    global.reportScheduler = reportScheduler; // Store globally for shutdown
    
    // Start your Express server
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`✅ Server running on port ${PORT}`);
    });
    
  } catch (error) {
    console.error('❌ Failed to start application:', error);
    process.exit(1);
  }
}

// ============================================
// 5. GRACEFUL SHUTDOWN (handle SIGTERM/SIGINT)
// ============================================
process.on('SIGTERM', () => {
  console.log('[Shutdown] SIGTERM received, shutting down gracefully...');
  
  if (global.reportScheduler && Array.isArray(global.reportScheduler)) {
    global.reportScheduler.forEach(job => job.stop());
    console.log('[Shutdown] Daily Report Scheduler stopped');
  }
  
  // Close database connections
  if (global.prisma) {
    global.prisma.$disconnect();
  }
  
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[Shutdown] SIGINT received, shutting down gracefully...');
  
  if (global.reportScheduler && Array.isArray(global.reportScheduler)) {
    global.reportScheduler.forEach(job => job.stop());
    console.log('[Shutdown] Daily Report Scheduler stopped');
  }
  
  process.exit(0);
});

// ============================================
// 6. COMPLETE EXAMPLE
// ============================================
/*
// Full example structure:

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { initializeDailyReportSchedulerV2 } = require('./utils/dailyReportScheduler');
const dailyReportRoutes = require('./modules/report/dailyReport.routes');

const app = express();
const prisma = new PrismaClient();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/daily-reports', dailyReportRoutes);
// ... other routes ...

// Start application
async function start() {
  try {
    // Connect to database
    console.log('Connecting to database...');
    // Your DB connection code here
    
    // Initialize scheduler
    console.log('Starting Daily Report Scheduler...');
    const reportScheduler = initializeDailyReportSchedulerV2();
    global.reportScheduler = reportScheduler;
    
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`✅ Application running on port ${PORT}`);
    });
    
  } catch (error) {
    console.error('❌ Application startup failed:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down gracefully...');
  if (global.reportScheduler) {
    global.reportScheduler.forEach(job => job.stop());
  }
  process.exit(0);
});

start();
*/

// ============================================
// 7. VERIFY SCHEDULER IS WORKING
// ============================================
/*
Check server logs for messages like:
  - "[Daily Report Scheduler V2] Initializing..."
  - "[Daily Report Scheduler V2] Started - will check hourly"
  - "[Daily Report Scheduler] Checking for reports to send at HH:MM"
  - "[Daily Report] Sending report for CompanyName at HH:MM"
  
If you don't see these messages, check:
  1. Is the scheduler being initialized?
  2. Are error logs available?
  3. Is the server running continuously?
*/

module.exports = { startApplication };
