// Script to set userId for all existing issues in MongoDB
// Set userId to a specific value (replace below)

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const USER_ID = 'REPLACE_WITH_USER_ID'; // Set this to the correct user id

async function main() {
  const issues = await prisma.issue.findMany();
  for (const issue of issues) {
    await prisma.issue.update({
      where: { id: issue.id },
      data: { userId: USER_ID },
    });
    console.log(`Updated issue ${issue.id} with userId: ${USER_ID}`);
  }
  console.log('Done updating all issues.');
  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
