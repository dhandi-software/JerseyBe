const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const orders = await prisma.jerseyOrder.findMany();
  console.log(orders);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
