const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const { sendDueMonthlyReports } = require('../src/modules/report/monthlyReport.service');

(async function run() {
  try {
    await mongoose.connect(process.env.DATABASE_URL);
    console.log('[monthly-report] MongoDB connected');

    const results = await sendDueMonthlyReports(new Date());
    const sent = results.filter((entry) => entry.sent);
    const skipped = results.filter((entry) => entry.skipped);
    const failed = results.filter((entry) => entry.error);

    console.log(`[monthly-report] Sent: ${sent.length}, Skipped: ${skipped.length}, Failed: ${failed.length}`);
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('[monthly-report] Failed:', error);
    try {
      await mongoose.disconnect();
    } catch (disconnectError) {
      console.error('[monthly-report] Disconnect failed:', disconnectError);
    }
    process.exit(1);
  }
})();
