const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
    await prisma.bahanBajuHistory.update({
        where: { id: 30 },
        data: {
            jumlah: 200,
            stokAkhir: 200,
            totalNilai: 200 * 20000
        }
    });
    
    await prisma.bahanBaju.update({
        where: { id: 14 },
        data: {
            kuantitasKg: 200
        }
    });
    console.log("Updated id 30 to 200 KG");
}
main().catch(console.error).finally(() => prisma.$disconnect());
