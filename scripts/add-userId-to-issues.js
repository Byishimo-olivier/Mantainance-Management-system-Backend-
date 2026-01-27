// Script to add userId field to all Issue documents in MongoDB
// Set userId to an empty string or a default value as needed

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const issues = await prisma.issue.findMany();
  for (const issue of issues) {
    if (!issue.userId) {
      // Set to empty string or a default userId
      await prisma.issue.update({
        where: { id: issue.id },
        data: { userId: '' },
      });
      console.log(`Updated issue ${issue.id} with userId: ''`);
    }
  }
  console.log('Done updating all issues.');
  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
