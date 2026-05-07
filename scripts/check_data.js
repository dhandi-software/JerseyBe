const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const users = await prisma.user.findMany({
            include: { customer: true, staff: true }
        });
        const messages = await prisma.message.findMany({ take: 10 });
        const orders = await prisma.jerseyOrder.findMany({ take: 10 });
        
        console.log('--- USERS ---');
        console.log(JSON.stringify(users, null, 2));
        console.log('--- MESSAGES ---');
        console.log(JSON.stringify(messages, null, 2));
        console.log('--- ORDERS ---');
        console.log(JSON.stringify(orders, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await prisma.$disconnect();
    }
}

main();
