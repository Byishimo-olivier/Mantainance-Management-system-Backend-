// /**
//  * Migration script to fix subscriptions by populating companyId from metadata
//  * This ensures all subscriptions are properly linked to their companies
//  */

// const { PrismaClient } = require('@prisma/client');
// const prisma = new PrismaClient();

// async function fixSubscriptionCompanyIds() {
//   try {
//     console.log('🔍 Scanning for subscriptions with missing companyId...\n');

//     // Find all subscriptions where companyId is null but metadata has companyId
//     const subscriptionsToFix = await prisma.subscription.findMany({
//       where: {
//         companyId: null,
//       },
//     });

//     // Filter to only those with companyId in metadata
//     const subscriptionsWithMetadataCompanyId = subscriptionsToFix.filter(
//       sub => sub.metadata && sub.metadata.companyId
//     );

//     if (subscriptionsWithMetadataCompanyId.length === 0) {
//       console.log('✅ No subscriptions need fixing. All subscriptions have proper companyId links.');
//       await prisma.$disconnect();
//       return;
//     }

//     console.log(`Found ${subscriptionsWithMetadataCompanyId.length} subscriptions to fix:\n`);

//     let fixed = 0;
//     let errors = 0;

//     for (const sub of subscriptionsWithMetadataCompanyId) {
//       try {
//         const companyIdFromMetadata = sub.metadata?.companyId;
        
//         if (!companyIdFromMetadata) {
//           console.log(`⚠️  Subscription ${sub.id}: No companyId in metadata`);
//           errors++;
//           continue;
//         }

//         const updated = await prisma.subscription.update({
//           where: { id: sub.id },
//           data: {
//             companyId: companyIdFromMetadata,
//           },
//           include: { company: true },
//         });

//         console.log(`✅ Fixed ${sub.id}: Linked to company ${updated.company?.name || companyIdFromMetadata}`);
//         fixed++;
//       } catch (err) {
//         console.error(`❌ Error fixing subscription ${sub.id}:`, err.message);
//         errors++;
//       }
//     }

//     console.log(`\n📊 Migration Summary:`);
//     console.log(`   Fixed: ${fixed}`);
//     console.log(`   Errors: ${errors}`);
//     console.log(`   Total: ${fixed + errors}`);

//     if (fixed > 0) {
//       console.log(`\n✨ Successfully fixed ${fixed} subscription(s)!`);
//     }
//   } catch (error) {
//     console.error('Fatal error during migration:', error);
//     process.exit(1);
//   } finally {
//     await prisma.$disconnect();
//   }
// }

// fixSubscriptionCompanyIds();
