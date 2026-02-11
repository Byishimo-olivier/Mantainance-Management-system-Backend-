// Script to assign properties to a specific client
// Run with: node scripts/setup-client-with-properties.js <clientUserId>

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    // Get client ID from command line argument or use default
    const clientIdArg = process.argv[2];
    
    let clientId;

    if (clientIdArg) {
      // Use provided client ID
      clientId = clientIdArg;
      console.log(`Using provided client ID: ${clientId}`);
      
      const client = await prisma.user.findUnique({
        where: { id: clientId }
      });
      
      if (!client) {
        console.error(`❌ Client with ID ${clientId} not found`);
        return;
      }
      
      console.log(`✅ Found client: ${client.name} (${client.email})`);
    } else {
      // Find or create default test client
      const existingClient = await prisma.user.findUnique({
        where: { email: 'client@test.com' }
      });

      if (existingClient) {
        clientId = existingClient.id;
        console.log(`Using existing test client: ${existingClient.name} (${existingClient.email})`);
      } else {
        const bcrypt = require('bcryptjs');
        const hashedPassword = await bcrypt.hash('password123', 10);
        const newClient = await prisma.user.create({
          data: {
            name: 'Test Client',
            email: 'client@test.com',
            phone: '+1-234-567-8900',
            password: hashedPassword,
            role: 'client',
            status: 'Active'
          }
        });
        
        clientId = newClient.id;
        console.log(`Created new test client: ${newClient.name} (${newClient.email})`);
      }
    }

    // Assign all properties to this client
    console.log(`\nAssigning all properties to client (${clientId})...`);
    const result = await prisma.property.updateMany({
      where: {},
      data: {
        clientId: clientId
      }
    });

    console.log(`✅ Updated ${result.count} properties with clientId: ${clientId}`);

    // List all properties and their assignments
    console.log('\nAll properties:');
    const properties = await prisma.property.findMany({
      select: { id: true, name: true, address: true, clientId: true }
    });

    if (properties.length === 0) {
      console.log('No properties found in database');
    } else {
      properties.forEach(p => {
        const assigned = p.clientId === clientId ? '✓ (assigned to this client)' : `(assigned to: ${p.clientId})`;
        console.log(`- ${p.name} (${p.address}): ${assigned}`);
      });
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
