const nodeCron = require('node-cron');
const emailService = require('../emailService/email.service');
const MongooseUser = require('../user/user.model');

class DailyReportService {
  constructor() {
    this.isScheduled = false;
    this.prisma = null;
  }

  /**
   * Set the Prisma client instance
   */
  setPrismaClient(prisma) {
    this.prisma = prisma;
  }

  /**
   * Ensure Prisma is initialized
   */
  async ensurePrisma() {
    if (!this.prisma) {
      try {
        const { PrismaClient } = require('@prisma/client');
        this.prisma = new PrismaClient();
        console.log('✅ [Daily Report] Prisma client initialized via fallback');
      } catch (error) {
        console.error('❌ [Daily Report] Failed to initialize Prisma client in fallback:', error.message);
      }
    }
    return this.prisma;
  }

  /**
   * Initialize and schedule daily report - runs every 1 minute for testing
   */
  async initializeScheduler() {
    if (this.isScheduled) {
      console.log('📅 [Daily Report] Scheduler already initialized');
      return;
    }

    // PRODUCTION: Daily at 9:00 PM (21:00)
    nodeCron.schedule('0 21 * * *', async () => {
      console.log('📊 [Daily Report] Starting scheduled daily reports...');
      try {
        await this.sendDailyReports();
      } catch (error) {
        console.error('❌ [Daily Report] Error in scheduled task:', error.message);
      }
    });

    this.isScheduled = true;
    console.log('✅ [Daily Report] Scheduler initialized - Reports will be sent daily at 9:00 PM');
    console.log('⚠️  [Daily Report] Remember to change cron to "0 6 * * *" for production (6 AM UTC daily)');
  }

  /**
   * Send daily reports to all admins and technicians
   */
  async sendDailyReports() {
    const prisma = await this.ensurePrisma();
    if (!prisma) {
      console.error('❌ [Daily Report] Prisma client not initialized and failed fallback');
      return;
    }

    try {
      let companies = [];

      // Check if company model exists in client
      if (this.prisma.company) {
        // Preferred method: Use Company model
        companies = await this.prisma.company.findMany({
          select: {
            id: true,
            name: true,
            adminId: true,
            email: true,
            users: {
              select: {
                id: true,
                email: true,
                name: true,
                role: true,
              },
            },
          },
        });
      }

      // Fallback: If Prisma results are empty or model is missing, use Mongoose grouping
      if (companies.length === 0) {
        console.warn('⚠️ [Daily Report] No companies found via Prisma. Using Mongoose/companyName fallback...');
        
        // Use Mongoose to find unique company names and their users
        const companyNames = await MongooseUser.distinct('companyName', { companyName: { $ne: null } });
        console.log(`📈 [Daily Report] Found ${companyNames.length} unique company names from Mongoose`);

        for (const companyName of companyNames) {
          const users = await MongooseUser.find({ companyName }).select('id email name role');
          companies.push({
            id: companyName, // Use name as ID for fallback
            name: companyName,
            email: null,
            users: users.map(u => ({
              id: u.id,
              email: u.email,
              name: u.name,
              role: u.role
            }))
          });
        }
      }

      console.log(`📈 [Daily Report] Found ${companies.length} companies to process`);

      for (const company of companies) {
        await this.sendCompanyReports(company);
      }

      console.log('✅ [Daily Report] Daily reports sent successfully');
    } catch (error) {
      console.error('❌ [Daily Report] Error sending daily reports:', error.message);
    }
  }

  /**
   * Send reports for a specific company to its admins and technicians
   */
  async sendCompanyReports(company) {
    try {
      const { id: companyId, name: companyName, email: companyEmail, users } = company;

      // Get metrics for this company
      const metrics = await this.getCompanyMetrics(companyId);

      // Send to admin/manager users
      const adminUsers = users.filter(u => ['admin', 'manager', 'coordinator'].includes(u.role?.toLowerCase()));
      
      for (const admin of adminUsers) {
        if (admin.email) {
          await this.sendAdminReport(admin, company, metrics);
        }
      }

      // Send to technicians
      const technicians = users.filter(u => u.role?.toLowerCase() === 'technician');
      
      for (const technician of technicians) {
        if (technician.email) {
          await this.sendTechnicianReport(technician, company, metrics);
        }
      }

      console.log(`✅ Sent reports for company: ${companyName}`);
    } catch (error) {
      console.error(`❌ Error sending reports for company ${company.name}:`, error.message);
    }
  }

  /**
   * Get company metrics for the last 24 hours
   */
  async getCompanyMetrics(companyIdOrName) {
    try {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      // Determine filter based on whether input is ObjectID or Name
      const whereFilter = { companyName: companyIdOrName };
      
      // Work order stats
      const totalWorkOrders = await this.prisma.issue.count({
        where: whereFilter,
      });

      const completedToday = await this.prisma.issue.count({
        where: {
          ...whereFilter,
          status: 'COMPLETED',
          updatedAt: { gte: yesterday },
        },
      });

      const openWorkOrders = await this.prisma.issue.count({
        where: {
          ...whereFilter,
          status: { in: ['OPEN', 'IN_PROGRESS', 'PENDING'] },
        },
      });

      const overdueWorkOrders = await this.prisma.issue.count({
        where: {
          ...whereFilter,
          fixDeadline: { lt: new Date() }, // Changed from dueDate to fixDeadline for stale schema
          status: { not: 'COMPLETED' }, // Changed from ne to not for Prisma compatibility
        },
      });

      // Asset stats
      const totalAssets = await this.prisma.asset.count({
        where: { property: { clientId: { not: null } } }, // Asset metrics via property relation 
      });

      const assetsNeedingMaintenance = await this.prisma.asset.count({
        where: {
          property: { clientId: { not: null } },
          status: { in: ['needs_maintenance', 'poor', 'faulty'] },
        },
      });

      const activeTechnicians = await this.prisma.internalTechnician.count({
        where: {
          status: 'ACTIVE',
        },
      });

      // Get top performers (technicians with most completed tasks today)
      const topTechnicians = await this.prisma.issue.groupBy({
        by: ['assignedTo'],
        where: {
          ...whereFilter,
          status: 'COMPLETED',
          updatedAt: { gte: yesterday },
        },
        _count: {
          id: true,
        },
        orderBy: {
          _count: { id: 'desc' },
        },
        take: 5,
      });

      // Get recent high-priority issues
      const highPriorityIssues = await this.prisma.issue.findMany({
        where: {
          ...whereFilter,
          priority: 'HIGH',
          status: { not: 'COMPLETED' },
        },
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          fixDeadline: true, // Changed from dueDate to fixDeadline
          assignedTo: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });

      return {
        totalWorkOrders,
        completedToday,
        openWorkOrders,
        overdueWorkOrders,
        totalAssets,
        assetsNeedingMaintenance,
        activeTechnicians,
        topTechnicians,
        highPriorityIssues,
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Error getting company metrics:', error.message);
      return null;
    }
  }

  /**
   * Send admin/manager daily report
   */
  async sendAdminReport(admin, company, metrics) {
    try {
      const { name, email } = admin;
      const { name: companyName } = company;

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
            .header h1 { margin: 0; font-size: 28px; }
            .header p { margin: 5px 0 0 0; opacity: 0.9; }
            .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 8px 8px; }
            .metric-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin: 20px 0; }
            .metric-box { background: white; padding: 20px; border-radius: 8px; border-left: 4px solid #667eea; }
            .metric-number { font-size: 32px; font-weight: bold; color: #667eea; }
            .metric-label { color: #666; font-size: 12px; text-transform: uppercase; margin-top: 5px; }
            .alert { background: #fff3cd; border: 1px solid #ffc107; padding: 15px; border-radius: 4px; margin: 15px 0; }
            .alert.danger { background: #f8d7da; border-color: #f5c6cb; color: #721c24; }
            .section { margin: 25px 0; }
            .section-title { font-size: 16px; font-weight: bold; color: #667eea; margin-bottom: 10px; border-bottom: 2px solid #667eea; padding-bottom: 5px; }
            .list-item { background: white; padding: 12px; margin: 8px 0; border-radius: 4px; border-left: 3px solid #667eea; }
            .priority-high { border-left-color: #dc3545; }
            .priority-high::before { content: '🔴 '; }
            .priority-medium { border-left-color: #ffc107; }
            .priority-medium::before { content: '🟡 '; }
            .footer { text-align: center; font-size: 12px; color: #999; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; }
            .cta-button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 4px; margin: 15px 0; }
            table { width: 100%; border-collapse: collapse; margin: 15px 0; }
            th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
            th { background: #f0f0f0; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>📊 Daily Maintenance Report</h1>
              <p>${companyName}</p>
            </div>
            
            <div class="content">
              <p>Hi ${name},</p>
              
              <p>Here's your daily maintenance summary for <strong>${new Date().toLocaleDateString()}</strong></p>

              <!-- Key Metrics -->
              <div class="metric-grid">
                <div class="metric-box">
                  <div class="metric-number">${metrics.completedToday}</div>
                  <div class="metric-label">Completed Today</div>
                </div>
                <div class="metric-box">
                  <div class="metric-number">${metrics.openWorkOrders}</div>
                  <div class="metric-label">Open Work Orders</div>
                </div>
                <div class="metric-box">
                  <div class="metric-number">${metrics.overdueWorkOrders}</div>
                  <div class="metric-label">Overdue Tasks</div>
                </div>
                <div class="metric-box">
                  <div class="metric-number">${metrics.assetsNeedingMaintenance}</div>
                  <div class="metric-label">Assets Need Care</div>
                </div>
              </div>

              <!-- Alerts -->
              ${metrics.overdueWorkOrders > 0 ? `
                <div class="alert danger">
                  ⚠️ <strong>${metrics.overdueWorkOrders} tasks are overdue!</strong> Review and reschedule immediately.
                </div>
              ` : ''}

              ${metrics.assetsNeedingMaintenance > 0 ? `
                <div class="alert">
                  🔧 <strong>${metrics.assetsNeedingMaintenance} assets</strong> need maintenance attention
                </div>
              ` : ''}

              <!-- High Priority Issues -->
              ${metrics.highPriorityIssues && metrics.highPriorityIssues.length > 0 ? `
                <div class="section">
                  <div class="section-title">🔴 High Priority Issues</div>
                  ${metrics.highPriorityIssues.slice(0, 5).map(issue => `
                    <div class="list-item priority-high">
                      <strong>${issue.title}</strong><br/>
                      <small>Status: ${issue.status} | Assigned: ${issue.assignedTo || 'Unassigned'}</small>
                    </div>
                  `).join('')}
                </div>
              ` : ''}

              <!-- Top Performers -->
              ${metrics.topTechnicians && metrics.topTechnicians.length > 0 ? `
                <div class="section">
                  <div class="section-title">⭐ Top Performers Today</div>
                  <table>
                    <tr>
                      <th>Technician</th>
                      <th>Tasks Completed</th>
                    </tr>
                    ${metrics.topTechnicians.slice(0, 5).map((tech, idx) => `
                      <tr>
                        <td>${idx + 1}. ${tech.assignedTo || 'Unassigned'}</td>
                        <td>${tech._count.id}</td>
                      </tr>
                    `).join('')}
                  </table>
                </div>
              ` : ''}

              <!-- Summary Stats -->
              <div class="section">
                <div class="section-title">📈 Summary</div>
                <table>
                  <tr>
                    <td><strong>Total Work Orders</strong></td>
                    <td>${metrics.totalWorkOrders}</td>
                  </tr>
                  <tr>
                    <td><strong>Total Assets</strong></td>
                    <td>${metrics.totalAssets}</td>
                  </tr>
                  <tr>
                    <td><strong>Active Technicians</strong></td>
                    <td>${metrics.activeTechnicians}</td>
                  </tr>
                  <tr>
                    <td><strong>Completion Rate Today</strong></td>
                    <td>${metrics.totalWorkOrders > 0 ? Math.round((metrics.completedToday / metrics.totalWorkOrders) * 100) : 0}%</td>
                  </tr>
                </table>
              </div>

              <a href="https://mms-frontend.vercel.app/dashboard" class="cta-button">View Full Dashboard</a>

              <div class="footer">
                <p>This is an automated daily report. Please do not reply to this email.</p>
                <p>${companyName} Maintenance Management System</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `;

      await emailService.sendEmail({
        to: email,
        subject: `[${companyName}] Daily Maintenance Report - ${new Date().toLocaleDateString()}`,
        html: htmlContent,
      });

      console.log(`✅ Admin report sent to ${email}`);
    } catch (error) {
      console.error(`Error sending admin report to ${admin.email}:`, error.message);
    }
  }

  /**
   * Send technician daily report
   */
  async sendTechnicianReport(technician, company, metrics) {
    try {
      const { name, email } = technician;
      const { name: companyName } = company;

      const whereFilter = { companyName };
      
      // Get this technician's work orders
      const myWorkOrders = await this.prisma.issue.findMany({
        where: {
          ...whereFilter,
          assignedTo: name,
        },
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          fixDeadline: true,
          assetName: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });

      const completedToday = myWorkOrders.filter(
        wo => wo.status === 'COMPLETED' && new Date(wo.updatedAt || Date.now()) > new Date(Date.now() - 24 * 60 * 60 * 1000)
      ).length;

      const pending = myWorkOrders.filter(wo => wo.status !== 'COMPLETED').length;
      const urgent = myWorkOrders.filter(wo => wo.priority === 'HIGH' && wo.status !== 'COMPLETED').length;

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
            .header h1 { margin: 0; font-size: 28px; }
            .header p { margin: 5px 0 0 0; opacity: 0.9; }
            .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 8px 8px; }
            .stat-box { background: white; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #f5576c; }
            .stat-number { font-size: 24px; font-weight: bold; color: #f5576c; }
            .stat-label { color: #666; font-size: 12px; text-transform: uppercase; }
            .task-item { background: white; padding: 15px; border-radius: 4px; margin: 10px 0; border-left: 4px solid #f5576c; }
            .task-item.completed { border-left-color: #28a745; }
            .task-item.urgent { border-left-color: #dc3545; }
            .task-status { display: inline-block; padding: 3px 8px; border-radius: 3px; font-size: 11px; font-weight: bold; margin-top: 8px; }
            .status-open { background: #cce5ff; color: #004085; }
            .status-in_progress { background: #fff3cd; color: #856404; }
            .status-completed { background: #d4edda; color: #155724; }
            .section-title { font-size: 16px; font-weight: bold; color: #f5576c; margin: 20px 0 10px 0; border-bottom: 2px solid #f5576c; padding-bottom: 5px; }
            .alert { background: #fff3cd; border: 1px solid #ffc107; padding: 15px; border-radius: 4px; margin: 15px 0; }
            .alert.danger { background: #f8d7da; border-color: #f5c6cb; color: #721c24; }
            .cta-button { display: inline-block; background: #f5576c; color: white; padding: 12px 30px; text-decoration: none; border-radius: 4px; margin: 15px 0; }
            .footer { text-align: center; font-size: 12px; color: #999; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>👷 Your Daily Work Summary</h1>
              <p>${companyName}</p>
            </div>
            
            <div class="content">
              <p>Hi ${name},</p>
              
              <p>Here's your work summary for today - <strong>${new Date().toLocaleDateString()}</strong></p>

              <!-- Key Stats -->
              <div class="stat-box">
                <div class="stat-number">${completedToday}</div>
                <div class="stat-label">Tasks Completed Today</div>
              </div>

              <div class="stat-box">
                <div class="stat-number">${pending}</div>
                <div class="stat-label">Tasks Pending</div>
              </div>

              ${urgent > 0 ? `
                <div class="alert danger">
                  🔴 <strong>You have ${urgent} urgent/high-priority tasks!</strong> Focus on these first.
                </div>
              ` : ''}

              <!-- Today's Tasks -->
              <div class="section-title">📋 Your Assigned Tasks</div>
              ${myWorkOrders.length > 0 ? `
                ${myWorkOrders.slice(0, 10).map(task => `
                  <div class="task-item ${task.status === 'COMPLETED' ? 'completed' : ''} ${task.priority === 'HIGH' ? 'urgent' : ''}">
                    <strong>${task.title}</strong><br/>
                    <small>Asset: ${task.assetName || 'N/A'}</small>
                    <span class="task-status status-${task.status?.toLowerCase().replace(' ', '_')}">${task.status || 'NEW'}</span>
                    ${task.dueDate ? `<br/><small>Due: ${new Date(task.dueDate).toLocaleDateString()}</small>` : ''}
                  </div>
                `).join('')}
                ${myWorkOrders.length > 10 ? `<p><em>... and ${myWorkOrders.length - 10} more tasks</em></p>` : ''}
              ` : `
                <p>No tasks assigned yet.</p>
              `}

              <a href="https://mms-frontend.vercel.app/dashboard" class="cta-button">View My Work Orders</a>

              <div class="footer">
                <p>This is an automated daily report. Please do not reply to this email.</p>
                <p>${companyName} Maintenance Management System</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `;

      await emailService.sendEmail({
        to: email,
        subject: `[${companyName}] Your Daily Work Summary - ${new Date().toLocaleDateString()}`,
        html: htmlContent,
      });

      console.log(`✅ Technician report sent to ${email}`);
    } catch (error) {
      console.error(`Error sending technician report to ${technician.email}:`, error.message);
    }
  }

  /**
   * Manually trigger daily reports (for testing/admin use)
   */
  async triggerReportsNow() {
    console.log('🚀 Manually triggering daily reports...');
    await this.sendDailyReports();
  }
}

module.exports = new DailyReportService();
