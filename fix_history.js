const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixHistory() {
    const histories = await prisma.bahanBajuHistory.findMany({
        where: {
            aksi: { in: ['BUAT', 'TAMBAH'] },
            OR: [
                { totalNilai: null },
                { totalNilai: 0 }
            ]
        },
        include: { bahan: true }
    });

    console.log(`Found ${histories.length} histories with 0/null totalNilai`);

    for (let h of histories) {
        let hargaBeli = h.hargaBeli;
        if (!hargaBeli || hargaBeli === 0) {
            hargaBeli = h.bahan ? h.bahan.hargaBeli : 0;
        }

        const totalNilai = h.jumlah * (hargaBeli || 0);
        
        await prisma.bahanBajuHistory.update({
            where: { id: h.id },
            data: { totalNilai, hargaBeli }
        });
        console.log(`Updated history ${h.id} with totalNilai ${totalNilai}`);
    }

    console.log("Done");
}

fixHistory().catch(console.error).finally(() => prisma.$disconnect());
