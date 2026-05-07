const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const userCount = await prisma.user.count();
    const customerCount = await prisma.user.count({ where: { role: 'customer' } });
    const orderCount = await prisma.jerseyOrder.count();
    const accOrderCount = await prisma.jerseyOrder.count({ where: { status: { notIn: ['MENUNGGU', 'DITOLAK'] } } });
    
    console.log({ userCount, customerCount, orderCount, accOrderCount });
    process.exit(0);
}

main();
