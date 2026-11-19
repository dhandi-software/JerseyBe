const prisma = require('../config/prisma');

const SAFE_CREATOR_SELECT = {
    id: true,
    username: true,
    email: true,
    role: true,
    staff: {
        select: { nama: true }
    }
};

const create = async (data, tx = prisma) => {
    return tx.financeTransaction.create({
        data,
        include: {
            createdBy: { select: SAFE_CREATOR_SELECT }
        }
    });
};

const findMany = async ({ start, end, type, search } = {}, tx = prisma) => {
    const where = {};

    if (start && end) {
        where.transactionDate = { gte: start, lte: end };
    }

    if (type && type !== 'ALL') {
        where.type = String(type).toUpperCase();
    }

    if (search && String(search).trim()) {
        const q = String(search).trim();
        where.OR = [
            { title: { contains: q, mode: 'insensitive' } },
            { category: { contains: q, mode: 'insensitive' } },
            { description: { contains: q, mode: 'insensitive' } },
            { createdByName: { contains: q, mode: 'insensitive' } }
        ];
    }

    return tx.financeTransaction.findMany({
        where,
        orderBy: [{ transactionDate: 'desc' }, { id: 'desc' }],
        include: {
            createdBy: { select: SAFE_CREATOR_SELECT }
        }
    });
};

const findById = async (id, tx = prisma) => {
    return tx.financeTransaction.findUnique({
        where: { id },
        include: {
            createdBy: { select: SAFE_CREATOR_SELECT }
        }
    });
};

const update = async (id, data, tx = prisma) => {
    return tx.financeTransaction.update({
        where: { id },
        data,
        include: {
            createdBy: { select: SAFE_CREATOR_SELECT }
        }
    });
};

const deleteById = async (id, tx = prisma) => {
    return tx.financeTransaction.delete({
        where: { id }
    });
};

const countByReceiptUrl = async (buktiNotaUrl, excludeTransactionId = null, tx = prisma) => {
    if (!buktiNotaUrl) return 0;

    const txWhere = excludeTransactionId
        ? { buktiNotaUrl, id: { not: excludeTransactionId } }
        : { buktiNotaUrl };

    const [financeCount, bahanCount, historyCount] = await Promise.all([
        tx.financeTransaction.count({ where: txWhere }),
        tx.bahanBaju.count({ where: { buktiNotaUrl } }),
        tx.bahanBajuHistory.count({ where: { buktiNotaUrl } })
    ]);

    return financeCount + bahanCount + historyCount;
};

module.exports = {
    SAFE_CREATOR_SELECT,
    create,
    findMany,
    findById,
    update,
    deleteById,
    countByReceiptUrl
};
