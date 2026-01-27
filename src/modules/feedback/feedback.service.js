const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getFeedbackForClient = async (clientId) => {
  return await prisma.feedback.findMany({
    where: { clientId },
    orderBy: { date: 'desc' },
  });
};

exports.createFeedback = async (data) => {
  return await prisma.feedback.create({ data });
};

exports.getAllFeedback = async () => {
  return await prisma.feedback.findMany({ orderBy: { date: 'desc' } });
};
