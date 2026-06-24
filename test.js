const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
    const histories = await prisma.bahanBajuHistory.findMany();
    for(const h of histories) {
        if(h.id === 30 || h.jumlah === 2000) {
            console.log(h);
        }
    }
}
main().catch(console.error).finally(() => prisma.$disconnect());
