// Script to print all users and their IDs
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany();
  users.forEach(user => {
    console.log(`User: ${user.name}, Email: ${user.email}, ID: ${user.id}`);
  });
  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
