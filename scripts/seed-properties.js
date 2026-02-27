const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Seeding properties...');

  const properties = [
    {
      name: 'AUCA',
      type: 'Campus',
      address: 'Kigali, KICUKIRO',
      beds: 4,
      baths: 2,
      area: 1234,
      floors: 2,
      blocks: 1,
      block: 'Block A',
      rooms: 10,
      photos: ['/uploads/auca-1.jpg', '/uploads/auca-2.jpg']
    },
    {
      name: 'AUCABUILDING',
      type: 'Building',
      address: 'AUCA, KIGALI, RWANDA',
      beds: 4,
      baths: 2,
      area: null,
      floors: 2,
      blocks: 1,
      block: 'Block B',
      rooms: 8,
      photos: ['/uploads/aucabuilding-1.jpg']
    },
    {
      name: 'UNILAKCompus',
      type: 'Campus',
      address: 'UNILAK, Kigali, Rwanda',
      beds: 4,
      baths: 2,
      area: null,
      floors: 3,
      blocks: 2,
      block: 'Block C',
      rooms: 30,
      photos: ['/uploads/unilak-1.jpg', '/uploads/unilak-2.jpg']
    }
  ];

  for (const p of properties) {
    try {
      await prisma.property.create({ data: p });
      console.log('Created property', p.name);
    } catch (err) {
      console.error('Failed creating', p.name, err.message);
    }
  }
}

main()
  .catch((e) => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
