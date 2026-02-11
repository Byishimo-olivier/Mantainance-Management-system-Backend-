// Script to assign properties to clients
// Run with: node scripts/assign-properties-to-clients.js

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    console.log('Fetching all clients...');
    const clients = await prisma.user.findMany({
      where: { role: 'client' },
      select: { id: true, name: true, email: true }
    });

    console.log(`Found ${clients.length} clients`);
    
    if (clients.length === 0) {
      console.log('No clients found in the database');
      return;
    }

    console.log('\nClients:');
    clients.forEach((c, i) => {
      console.log(`${i + 1}. ${c.name} (${c.email}) - ID: ${c.id}`);
    });

    // For now, assign all properties to the first client (you can modify this logic)
    if (clients.length > 0) {
      const firstClientId = clients[0].id;
      console.log(`\nAssigning all properties to first client: ${clients[0].name} (${firstClientId})`);
      
      const result = await prisma.property.updateMany({
        where: {
          clientId: null // Update only properties without clientId
        },
        data: {
          clientId: firstClientId
        }
      });

      console.log(`Updated ${result.count} properties with clientId: ${firstClientId}`);
    }

    console.log('\nProperties after update:');
    const properties = await prisma.property.findMany({
      select: { id: true, name: true, clientId: true }
    });

    properties.forEach(p => {
      console.log(`- ${p.name}: clientId = ${p.clientId || 'null'}`);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
