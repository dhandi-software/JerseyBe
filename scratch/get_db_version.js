const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  try {
    const version = await prisma.$queryRaw`SELECT version()`;
    console.log("DB_VERSION:", version[0].version);
  } catch (err) {
    console.error("Error fetching version:", err);
  } finally {
    await prisma.$disconnect();
  }
}
main();
