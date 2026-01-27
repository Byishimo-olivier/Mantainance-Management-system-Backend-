// Script to update all Issue documents in MongoDB to add approved and approvedAt fields
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const issues = await prisma.issue.findMany();
  for (const issue of issues) {
    await prisma.issue.update({
      where: { id: issue.id },
      data: {
        approved: issue.approved !== undefined ? issue.approved : false,
        approvedAt: issue.approvedAt !== undefined ? issue.approvedAt : null,
      },
    });
  }
  console.log('All issues updated with approved and approvedAt fields.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
