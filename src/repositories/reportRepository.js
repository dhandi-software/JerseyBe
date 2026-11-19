const prisma = require('../config/prisma');

const countStaffAndAdmin = async () => {
    const [totalStaff, totalAdmin] = await Promise.all([
        prisma.user.count({ where: { role: { in: ['desain', 'gudang', 'manager'] } } }),
        prisma.user.count({ where: { role: 'admin' } })
    ]);
    return { totalStaff, totalAdmin };
};

const findOrdersForReporting = async ({ start, end } = {}) => {
    const where = {
        status: { notIn: ['DITOLAK', 'BATAL'] },
        NOT: {
            orderId: { startsWith: 'SEED-' }
        }
    };

    if (start && end) {
        where.createdAt = { gte: start, lte: end };
    }

    return prisma.jerseyOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        select: {
            id: true,
            orderId: true,
            customerId: true,
            customerName: true,
            status: true,
            paymentType: true,
            paymentUrl: true,
            totalAmount: true,
            paidAmount: true,
            remainingAmount: true,
            createdAt: true,
            details: {
                select: {
                    id: true,
                    productTitle: true
                }
            }
        }
    });
};

const findOrderUsersByIds = async (userIds = []) => {
    if (!Array.isArray(userIds) || userIds.length === 0) return [];
    return prisma.user.findMany({
        where: { id: { in: userIds } },
        select: {
            id: true,
            username: true,
            email: true,
            role: true,
            customer: {
                select: {
                    id: true,
                    nama: true,
                    category: true
                }
            }
        }
    });
};

const findBahanPurchaseHistories = async ({ start, end } = {}) => {
    const where = {
        aksi: { in: ['BUAT', 'TAMBAH', 'TAMBAH_STOK'] },
        totalNilai: { gt: 0 }
    };

    if (start && end) {
        where.createdAt = { gte: start, lte: end };
    }

    return prisma.bahanBajuHistory.findMany({
        where,
        include: {
            bahan: {
                select: {
                    id: true,
                    nama: true,
                    buktiNotaUrl: true,
                    hargaBeli: true,
                    harga: true,
                    kuantitasKg: true,
                    imageUrl: true
                }
            }
        },
        orderBy: { createdAt: 'desc' }
    });
};

const findAllBahanWithHistories = async ({ start, end } = {}) => {
    const historyWhere = start && end ? { createdAt: { gte: start, lte: end } } : {};
    return prisma.bahanBaju.findMany({
        include: {
            histories: {
                where: historyWhere
            }
        }
    });
};

module.exports = {
    countStaffAndAdmin,
    findOrdersForReporting,
    findOrderUsersByIds,
    findBahanPurchaseHistories,
    findAllBahanWithHistories
};
